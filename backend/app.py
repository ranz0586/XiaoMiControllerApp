"""Local-only purifier API. Tokens never leave the backend in responses."""
from __future__ import annotations

import ipaddress
import json
import mimetypes
import os
import sqlite3
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator
from miio import AirPurifier, AirPurifierMiot, DeviceException
from miio.integrations.airpurifier.zhimi.airpurifier import OperationMode as LegacyMode, SUPPORTED_MODELS
from miio.integrations.airpurifier.zhimi.airpurifier_miot import OperationMode as MiotMode, _MAPPINGS
from native.python import purifier_adapter as standalone_adapter

ROOT = Path(__file__).resolve().parent.parent
# Windows registry associations can otherwise label .js as text/plain.
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('font/woff2', '.woff2')
DATA = Path(os.environ.get('AIR_STUDIO_DATA', ROOT / 'backend' / 'data'))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'devices.sqlite3'
app = FastAPI(title='Air Studio', version='1.0.0')
locks: dict[str, Lock] = {}
locks_guard = Lock()
discovery_lock = Lock()
discovery_candidates: list[dict] = []


def db():
    connection = sqlite3.connect(DB, timeout=15)
    connection.row_factory = sqlite3.Row
    return connection


with db() as connection:
    connection.executescript('''
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, ip TEXT NOT NULL UNIQUE,
          token TEXT NOT NULL, model TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS readings (
          device_id TEXT NOT NULL, timestamp TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS reading_device ON readings(device_id, timestamp);
    ''')


@app.middleware('http')
async def local_origin(request: Request, call_next):
    # Block cross-site requests to a local control service, including DNS rebinding.
    from urllib.parse import urlparse
    allowed_hosts = {'127.0.0.1', 'localhost', '[::1]', 'testserver'}
    host = request.headers.get('host', '').rsplit(':', 1)[0]
    if host not in allowed_hosts:
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Use localhost to access Air Studio.'}, status_code=403)
    origin = request.headers.get('origin')
    if origin and (urlparse(origin).hostname not in {'localhost', '127.0.0.1', '::1'}
                   or urlparse(origin).scheme not in {'http', 'https'}):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Cross-site requests are blocked.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store' if request.url.path.startswith('/api') else 'no-cache'
    return response


class DeviceInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=60)
    ip: str
    token: str = Field(pattern=r'^[0-9a-fA-F]{32}$')
    model: str

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError('Enter a device name.')
        return value.strip()

    @field_validator('ip')
    @classmethod
    def local_ip(cls, value):
        address = ipaddress.IPv4Address(value)
        if not any(address in ipaddress.ip_network(network) for network in
                   ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')):
            raise ValueError('Use the private IPv4 address of your purifier.')
        return str(address)

    @field_validator('model')
    @classmethod
    def supported_model(cls, value):
        if value not in SUPPORTED_MODELS and value not in _MAPPINGS:
            raise ValueError('This model is not supported by the installed python-miio version.')
        return value


class Command(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['power', 'mode', 'favorite_level', 'child_lock', 'buzzer', 'reset_filter']
    value: StrictBool | StrictInt | str


def get_device(device_id):
    with db() as connection:
        row = connection.execute('SELECT * FROM devices WHERE id=?', (device_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Device not found.')
    return dict(row)


def public(device):
    return {key: value for key, value in device.items() if key != 'token'}


def device_lock(device_id):
    with locks_guard:
        return locks.setdefault(device_id, Lock())


def client(device):
    cls = AirPurifierMiot if device['model'] in _MAPPINGS else AirPurifier
    return cls(ip=device['ip'], token=device['token'], model=device['model'], timeout=3)


def prop(status, name):
    try:
        raw = getattr(status, 'data', None)
        if isinstance(raw, dict) and name in raw and raw[name] is None:
            return None
        value = getattr(status, name, None)
        return value.name.lower() if isinstance(value, Enum) else value
    except (KeyError, ValueError, TypeError):
        return None


def snapshot(device, purifier):
    status = purifier.status()
    data = {name: prop(status, name) for name in (
        'aqi', 'temperature', 'humidity', 'filter_life_remaining', 'filter_hours_used',
        'motor_speed', 'mode', 'favorite_level', 'child_lock', 'buzzer')}
    power = prop(status, 'power')
    data['power'] = None if power is None else power is True or power == 'on'
    data['timestamp'] = datetime.now(timezone.utc).isoformat()
    # A missing property disables its corresponding optional control.
    data['capabilities'] = [name for name in ('favorite_level', 'child_lock', 'buzzer') if data[name] is not None]
    if callable(getattr(purifier, 'reset_filter', None)):
        data['capabilities'].append('reset_filter')
    data['modes'] = ['auto', 'silent', 'favorite']
    with db() as connection:
        connection.execute('INSERT INTO readings VALUES (?, ?, ?)', (device['id'], data['timestamp'], json.dumps(data)))
        connection.execute('DELETE FROM readings WHERE device_id=? AND rowid NOT IN '
                           '(SELECT rowid FROM readings WHERE device_id=? ORDER BY rowid DESC LIMIT 720)',
                           (device['id'], device['id']))
    return data


def unavailable():
    # Do not echo library exceptions: they may include secrets or wire data.
    return HTTPException(502, 'Purifier did not respond. Check its power, IP address, token, model, and that this computer is on the same network.')


@app.get('/api/health')
def health():
    return {'status': 'ok', 'library': 'python-miio', 'version': '0.5.12'}


@app.get('/api/models')
def models():
    return [{'model': model, 'protocol': 'miot' if model in _MAPPINGS else 'miio'}
            for model in sorted(set(SUPPORTED_MODELS) | set(_MAPPINGS))]


@app.get('/api/devices')
def list_devices():
    with db() as connection:
        return [public(dict(row)) for row in connection.execute('SELECT * FROM devices ORDER BY rowid')]


class DiscoveryName(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=60)


def discovery_request(path, body):
    with discovery_lock:
        with db() as connection:
            saved = [dict(row) for row in connection.execute('SELECT * FROM devices')]
        state = {'devices': saved, 'history': {}, 'discovery': list(discovery_candidates)}
        try:
            result = standalone_adapter.route(state, path, 'POST', body)
            if path != '/discovery':
                with db() as connection:
                    connection.execute('INSERT INTO devices VALUES (:id, :name, :ip, :token, :model)', state['devices'][-1])
        except standalone_adapter.AdapterError as exc:
            raise HTTPException(400, str(exc)) from None
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'This purifier is already saved.') from None
        except Exception:
            raise HTTPException(502, 'Network discovery failed. Check the local network and try again.') from None
        discovery_candidates[:] = state['discovery']
        return result


@app.post('/api/discovery')
def discover_purifiers():
    return discovery_request('/discovery', {})


@app.post('/api/discovery/{candidate_id}', status_code=201)
def add_discovered_purifier(candidate_id: str, payload: DiscoveryName):
    return discovery_request('/discovery/' + candidate_id, payload.model_dump())


@app.post('/api/devices', status_code=201)
def add_device(payload: DeviceInput):
    device = {'id': str(uuid4()), **payload.model_dump()}
    try:
        with db() as connection:
            connection.execute('INSERT INTO devices VALUES (:id, :name, :ip, :token, :model)', device)
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'A device with this IP address is already saved.')
    return public(device)


@app.put('/api/devices/{device_id}')
def update_device(device_id: str, payload: DeviceInput):
    with device_lock(device_id):
        get_device(device_id)
        device = {'id': device_id, **payload.model_dump()}
        try:
            with db() as connection:
                connection.execute('UPDATE devices SET name=:name, ip=:ip, token=:token, model=:model WHERE id=:id', device)
                connection.execute('DELETE FROM readings WHERE device_id=?', (device_id,))
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'A device with this IP address is already saved.')
    return public(device)


@app.delete('/api/devices/{device_id}', status_code=204)
def remove_device(device_id: str):
    with device_lock(device_id):
        get_device(device_id)
        with db() as connection:
            connection.execute('DELETE FROM devices WHERE id=?', (device_id,))
            connection.execute('DELETE FROM readings WHERE device_id=?', (device_id,))


@app.get('/api/devices/{device_id}/status')
def device_status(device_id: str):
    with device_lock(device_id):
        device = get_device(device_id)
        try:
            return snapshot(device, client(device))
        except (DeviceException, OSError, ValueError, KeyError):
            raise unavailable()


@app.get('/api/devices/{device_id}/history')
def history(device_id: str):
    get_device(device_id)
    with db() as connection:
        return [json.loads(row['payload']) for row in connection.execute(
            'SELECT payload FROM readings WHERE device_id=? ORDER BY rowid', (device_id,))]


@app.post('/api/devices/{device_id}/commands')
def control(device_id: str, command: Command):
    with device_lock(device_id):
        device = get_device(device_id)
        action, value = command.action, command.value
        if action == 'reset_filter' and value is not True:
            raise HTTPException(422, 'Confirm filter replacement before resetting.')
        if action in {'power', 'child_lock', 'buzzer'} and type(value) is not bool:
            raise HTTPException(422, 'This command requires a boolean value.')
        if action == 'favorite_level' and (type(value) is not int or not 0 <= value <= 14):
            raise HTTPException(422, 'Favorite level must be an integer from 0 to 14.')
        if action == 'mode' and value not in {'auto', 'silent', 'favorite'}:
            raise HTTPException(422, 'Choose auto, silent, or favorite mode.')
        purifier = client(device)
        try:
            if action == 'reset_filter':
                reset = getattr(purifier, 'reset_filter', None)
                if not callable(reset):
                    raise HTTPException(422, 'Filter reset is unavailable on this device.')
                result = reset()
            elif action == 'power':
                result = purifier.on() if value else purifier.off()
            elif action == 'mode':
                modes = MiotMode if device['model'] in _MAPPINGS else LegacyMode
                result = purifier.set_mode(modes[value.capitalize()])
            else:
                status = purifier.status()
                if prop(status, action) is None:
                    raise HTTPException(422, 'This control is unavailable on this device.')
                result = getattr(purifier, 'set_' + action)(value)
            items = result if isinstance(result, list) else [result]
            if any(isinstance(item, dict) and item.get('code', 0) != 0 for item in items):
                raise HTTPException(502, 'The purifier rejected this command.')
            # Read back actual hardware state; never report an optimistic state.
            return snapshot(device, purifier)
        except (DeviceException, OSError, ValueError, KeyError):
            raise unavailable()


# Serve the built React app from the same local origin.
if (ROOT / 'dist' / 'assets').exists():
    app.mount('/assets', StaticFiles(directory=ROOT / 'dist' / 'assets'), name='assets')


@app.get('/')
def index():
    if not (ROOT / 'dist' / 'index.html').exists():
        raise HTTPException(404, 'Build the frontend with npm run build, or use the Vite development server.')
    return FileResponse(ROOT / 'dist' / 'index.html')
