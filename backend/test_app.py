import importlib
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('AIR_STUDIO_DATA', str(tmp_path))
    from backend import app as module
    importlib.reload(module)
    with TestClient(module.app) as client:
        yield client, module


def payload(model='zhimi.airpurifier.mb3'):
    return {'name': 'Living room', 'ip': '192.168.1.42', 'token': 'a' * 32, 'model': model}


def fake_purifier():
    purifier = MagicMock()
    purifier.status.return_value = SimpleNamespace(power=True, aqi=12, temperature=24.6,
        humidity=48, filter_life_remaining=72, filter_hours_used=100, motor_speed=740,
        mode=None, favorite_level=5, child_lock=False, buzzer=True)
    purifier.on.return_value = [{'code': 0}]
    purifier.off.return_value = [{'code': 0}]
    purifier.set_mode.return_value = [{'code': 0}]
    return purifier


def test_credentials_are_private_and_persisted(api):
    client, module = api
    response = client.post('/api/devices', json=payload())
    assert response.status_code == 201
    device = response.json()
    assert 'token' not in device
    assert 'token' not in client.get('/api/devices').json()[0]
    with module.db() as connection:
        assert connection.execute('SELECT token FROM devices').fetchone()['token'] == 'a' * 32
    assert client.post('/api/devices', json=payload()).status_code == 409
    changed = payload(); changed['name'] = 'Bedroom'
    assert client.put(f"/api/devices/{device['id']}", json=changed).json()['name'] == 'Bedroom'
    assert client.delete(f"/api/devices/{device['id']}").status_code == 204
    assert client.get('/api/devices').json() == []


def test_discovery_add_uses_private_validated_token(api, monkeypatch):
    import time
    client, module = api
    discovery = module.standalone_adapter.network_discovery
    candidate = {'id': 'found', 'name': 'Xiaomi purifier', 'ip': '192.168.0.14',
                 'model': 'zhimi.airpurifier.ma2', 'token': 'c' * 32, 'expires': time.time() + 300}
    monkeypatch.setattr(discovery, 'scan', lambda saved: [] if saved else [dict(candidate)])
    monkeypatch.setattr(discovery, 'verified_model', lambda ip, token: 'zhimi.airpurifier.ma2')
    scan = client.post('/api/discovery')
    assert scan.status_code == 200
    assert 'token' not in scan.text
    assert client.get('/api/devices').json() == []
    result = client.post('/api/discovery/found', json={'name': 'Living room'})
    assert result.status_code == 201
    assert 'token' not in result.text
    with module.db() as connection:
        assert connection.execute('SELECT token FROM devices').fetchone()['token'] == 'c' * 32
    assert client.post('/api/discovery').json() == []


@pytest.mark.parametrize('field,bad', [('token', 'secret'), ('ip', '8.8.8.8'), ('ip', '127.0.0.1'), ('model', 'unknown'), ('name', '   ')])
def test_rejects_invalid_device_inputs(api, field, bad):
    client, _ = api
    data = payload(); data[field] = bad
    assert client.post('/api/devices', json=data).status_code == 422


@pytest.mark.parametrize('model,mode_class', [('zhimi.airpurifier.mb3', 'MiotMode'), ('zhimi.airpurifier.m1', 'LegacyMode')])
def test_controls_use_correct_protocol_enum_and_read_back(api, monkeypatch, model, mode_class):
    client, module = api
    purifier = fake_purifier()
    monkeypatch.setattr(module, 'client', lambda device: purifier)
    device_id = client.post('/api/devices', json=payload(model)).json()['id']
    response = client.post(f'/api/devices/{device_id}/commands', json={'action': 'mode', 'value': 'silent'})
    assert response.status_code == 200
    purifier.set_mode.assert_called_once_with(getattr(module, mode_class).Silent)
    assert response.json()['aqi'] == 12
    assert len(client.get(f'/api/devices/{device_id}/history').json()) == 1


@pytest.mark.parametrize('action,value', [('power', 'true'), ('mode', 'turbo'), ('favorite_level', True), ('favorite_level', 15), ('buzzer', 1), ('reset_filter', False), ('reset_filter', 1)])
def test_bad_commands_never_reach_hardware(api, monkeypatch, action, value):
    client, module = api
    device_id = client.post('/api/devices', json=payload()).json()['id']
    create_client = MagicMock()
    monkeypatch.setattr(module, 'client', create_client)
    assert client.post(f'/api/devices/{device_id}/commands', json={'action': action, 'value': value}).status_code == 422
    create_client.assert_not_called()


def test_errors_do_not_expose_tokens(api, monkeypatch):
    client, module = api
    purifier = fake_purifier(); purifier.status.side_effect = module.DeviceException('secret token: ' + 'a' * 32)
    monkeypatch.setattr(module, 'client', lambda device: purifier)
    device_id = client.post('/api/devices', json=payload()).json()['id']
    response = client.get(f'/api/devices/{device_id}/status')
    assert response.status_code == 502
    assert 'a' * 32 not in response.text


def test_optional_control_and_device_rejection(api, monkeypatch):
    client, module = api
    purifier = fake_purifier(); purifier.status.return_value.child_lock = None
    monkeypatch.setattr(module, 'client', lambda device: purifier)
    device_id = client.post('/api/devices', json=payload()).json()['id']
    assert client.post(f'/api/devices/{device_id}/commands', json={'action': 'child_lock', 'value': True}).status_code == 422
    purifier.set_child_lock.assert_not_called()
    purifier.on.return_value = [{'code': -4001}]
    assert client.post(f'/api/devices/{device_id}/commands', json={'action': 'power', 'value': True}).status_code == 502


def test_actual_library_clients_construct_for_both_protocols(api):
    _, module = api
    assert isinstance(module.client(payload()), module.AirPurifierMiot)
    assert isinstance(module.client(payload('zhimi.airpurifier.m1')), module.AirPurifier)


def test_filter_reset_uses_library_and_reads_back(api, monkeypatch):
    client, module = api
    purifier = fake_purifier()
    purifier.reset_filter.return_value = ['ok']
    monkeypatch.setattr(module, 'client', lambda device: purifier)
    device_id = client.post('/api/devices', json=payload('zhimi.airpurifier.ma2')).json()['id']
    path = f'/api/devices/{device_id}/commands'
    response = client.post(path, json={'action': 'reset_filter', 'value': True})
    assert response.status_code == 200
    purifier.reset_filter.assert_called_once_with()
    assert response.json()['filter_life_remaining'] == 72
    assert response.json()['filter_hours_used'] == 100
    assert 'reset_filter' in response.json()['capabilities']
    purifier.reset_filter.return_value = [{'code': -1}]
    assert client.post(path, json={'action': 'reset_filter', 'value': True}).status_code == 502
    purifier.reset_filter = None
    assert client.post(path, json={'action': 'reset_filter', 'value': True}).status_code == 422


def test_cross_site_and_rebinding_blocked(api):
    client, _ = api
    assert client.post('/api/devices', json=payload(), headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.get('/api/devices', headers={'Host': 'evil.example:8000'}).status_code == 403
    assert client.get('/api/health', headers={'Host': '127.0.0.1:8000'}).status_code == 200


def test_missing_device(api):
    client, _ = api
    assert client.get('/api/devices/missing/status').status_code == 404


def test_production_javascript_mime_type(api):
    client, module = api
    assets = list((module.ROOT / 'dist' / 'assets').glob('*.js'))
    if not assets:
        pytest.skip('Run npm run build to check production assets.')
    response = client.get('/assets/' + assets[0].name)
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/javascript')
