"""Standalone protocol adapter. Called on a serialized Android worker; no HTTP server."""
import ipaddress
import json
import logging
import re
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4
import time

try:
    from . import network_discovery
except ImportError:  # Chaquopy imports the adapter as a top-level module.
    import network_discovery

from miio import AirPurifier, AirPurifierMiot
from miio.integrations.airpurifier.zhimi.airpurifier import OperationMode as LegacyMode, SUPPORTED_MODELS
from miio.integrations.airpurifier.zhimi.airpurifier_miot import OperationMode as MiotMode, _MAPPINGS

# Library debug output can contain tokens and raw packets. Never enable it in this app.
logging.getLogger('miio').disabled = True
logging.getLogger('miio').setLevel(logging.CRITICAL + 1)


class AdapterError(Exception):
    pass


def public(device):
    return {k: device[k] for k in ('id', 'name', 'ip', 'model')}


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
    except (KeyError, ValueError, TypeError, AttributeError):
        return None


def snapshot(device, purifier, state):
    status = purifier.status()
    data = {name: prop(status, name) for name in (
        'aqi', 'temperature', 'humidity', 'filter_life_remaining', 'filter_hours_used',
        'motor_speed', 'mode', 'favorite_level', 'child_lock', 'buzzer')}
    power = prop(status, 'power')
    data['power'] = None if power is None else power is True or power == 'on'
    data['timestamp'] = datetime.now(timezone.utc).isoformat()
    data['capabilities'] = [name for name in ('favorite_level', 'child_lock', 'buzzer') if data[name] is not None]
    if callable(getattr(purifier, 'reset_filter', None)):
        data['capabilities'].append('reset_filter')
    # These three modes are defined in both upstream protocol enums.
    modes = MiotMode if device['model'] in _MAPPINGS else LegacyMode
    data['modes'] = [m.name.lower() for m in modes if m.name in ('Auto', 'Silent', 'Favorite')]
    history = state['history'].setdefault(device['id'], [])
    history.append(data)
    state['history'][device['id']] = history[-720:]
    return data


def validate_device(body):
    if set(body) != {'name', 'ip', 'token', 'model'}:
        raise AdapterError('Enter name, private IPv4 address, model, and token.')
    if not isinstance(body['name'], str) or not 1 <= len(body['name'].strip()) <= 60:
        raise AdapterError('Enter a device name of up to 60 characters.')
    try:
        address = ipaddress.IPv4Address(body['ip'])
    except (ValueError, TypeError):
        raise AdapterError('Enter the private IPv4 address of your purifier.') from None
    if not any(address in ipaddress.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')):
        raise AdapterError('Use a private IPv4 address on your local network.')
    if not isinstance(body['token'], str) or not re.fullmatch('[0-9a-fA-F]{32}', body['token']):
        raise AdapterError('The miIO token must contain 32 hexadecimal characters.')
    if body['model'] not in set(SUPPORTED_MODELS) | set(_MAPPINGS):
        raise AdapterError('This model is unsupported by the bundled python-miio library.')
    return {**body, 'name': body['name'].strip(), 'ip': str(address)}


def control(device, body, state):
    if set(body) != {'action', 'value'}:
        raise AdapterError('Invalid command.')
    action, value = body['action'], body['value']
    if action not in ('power', 'mode', 'favorite_level', 'child_lock', 'buzzer', 'reset_filter'):
        raise AdapterError('Unsupported command.')
    if action == 'reset_filter' and value is not True:
        raise AdapterError('Confirm filter replacement before resetting.')
    if action in ('power', 'child_lock', 'buzzer') and type(value) is not bool:
        raise AdapterError('This command requires a boolean value.')
    if action == 'favorite_level' and (type(value) is not int or not 0 <= value <= 14):
        raise AdapterError('Favorite level must be an integer from 0 to 14.')
    if action == 'mode' and value not in ('auto', 'silent', 'favorite'):
        raise AdapterError('Choose auto, silent, or favorite mode.')
    purifier = client(device)
    if action == 'reset_filter':
        reset = getattr(purifier, 'reset_filter', None)
        if not callable(reset):
            raise AdapterError('Filter reset is unavailable on this device.')
        result = reset()
    elif action == 'power':
        result = purifier.on() if value else purifier.off()
    elif action == 'mode':
        modes = MiotMode if device['model'] in _MAPPINGS else LegacyMode
        result = purifier.set_mode(modes[value.capitalize()])
    else:
        if prop(purifier.status(), action) is None:
            raise AdapterError('This control is unavailable on this device.')
        result = getattr(purifier, 'set_' + action)(value)
    items = result if isinstance(result, list) else [result]
    if any(isinstance(item, dict) and item.get('code', 0) != 0 for item in items):
        raise AdapterError('The purifier rejected this command.')
    return snapshot(device, purifier, state)


def route(state, path, method, body):
    if 'discovery' in state:
        state['discovery'] = [d for d in state['discovery'] if d['expires'] > time.time()]
    if path == '/discovery' and method == 'POST':
        if set(body) - {'interface'}:
            raise AdapterError('Invalid discovery request.')
        try:
            state['discovery'] = network_discovery.scan(state['devices'], **body)
        except Exception:
            raise AdapterError('Network discovery failed. Check that your phone is on the purifier Wi-Fi network, then try again.') from None
        return [public(d) for d in state['discovery']]
    if path.startswith('/discovery/') and method == 'POST':
        if set(body) != {'name'}:
            raise AdapterError('Enter a name for the discovered purifier.')
        candidate = next((d for d in state.get('discovery', []) if d['id'] == path.split('/')[-1]), None)
        if candidate is None:
            raise AdapterError('Discovery result expired. Scan the network again.')
        if any(d['ip'] == candidate['ip'] or d['token'].lower() == candidate['token'] for d in state['devices']):
            raise AdapterError('This purifier is already saved.')
        device = validate_device({**{k: candidate[k] for k in ('ip', 'model', 'token')}, 'name': body['name']})
        try:
            if network_discovery.verified_model(device['ip'], device['token']) != device['model']:
                raise ValueError()
        except Exception:
            raise AdapterError('The discovered token could not be verified. Scan again or add the purifier manually.') from None
        device['id'] = str(uuid4())
        state['devices'].append(device)
        state['discovery'].remove(candidate)
        return public(device)
    if path == '/models' and method == 'GET':
        return [{'model': m, 'protocol': 'miot' if m in _MAPPINGS else 'miio'} for m in sorted(set(SUPPORTED_MODELS) | set(_MAPPINGS))]
    if path == '/devices':
        if method == 'GET':
            return [public(d) for d in state['devices']]
        if method == 'POST':
            device = validate_device(body)
            if any(d['ip'] == device['ip'] for d in state['devices']):
                raise AdapterError('A device with this IP address is already saved.')
            device['id'] = str(uuid4())
            state['devices'].append(device)
            return public(device)
    parts = path.strip('/').split('/')
    if len(parts) not in (2, 3) or parts[0] != 'devices':
        raise AdapterError('Unsupported request.')
    device = next((d for d in state['devices'] if d['id'] == parts[1]), None)
    if device is None:
        raise AdapterError('Device not found.')
    if len(parts) == 2:
        if method == 'DELETE':
            state['devices'].remove(device)
            state['history'].pop(device['id'], None)
            return None
        if method == 'PUT':
            replacement = validate_device(body)
            if any(d['id'] != device['id'] and d['ip'] == replacement['ip'] for d in state['devices']):
                raise AdapterError('A device with this IP address is already saved.')
            device.update(replacement)
            state['history'].pop(device['id'], None)
            return public(device)
    if len(parts) == 3:
        if parts[2] == 'status' and method == 'GET':
            return snapshot(device, client(device), state)
        if parts[2] == 'history' and method == 'GET':
            return state['history'].get(device['id'], [])
        if parts[2] == 'commands' and method == 'POST':
            return control(device, body, state)
    raise AdapterError('Unsupported request.')


def dispatch(state_json, path, method, body_json):
    """State is private native data. Only result crosses into the WebView."""
    try:
        state = json.loads(state_json)
        result = route(state, path, method, json.loads(body_json))
        return json.dumps({'result': result, 'state': state}, allow_nan=False)
    except AdapterError as exc:
        return json.dumps({'error': str(exc)})
    except Exception:
        # Never echo exceptions from library, credentials, wire packets or storage.
        return json.dumps({'error': 'Purifier did not respond. Check power, IP, model, token, and that your phone shares its Wi-Fi network. Commands may have applied; refresh to verify.'})
