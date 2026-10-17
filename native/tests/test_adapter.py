import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location('native.python.purifier_adapter', Path(__file__).parents[1] / 'python/purifier_adapter.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


@pytest.fixture
def state():
    return {'devices': [], 'history': {}}


def request(state, path, method='GET', body=None):
    return json.loads(adapter.dispatch(json.dumps(state), path, method, json.dumps(body or {})))


def add(state):
    response = request(state, '/devices', 'POST', {'name': ' Test ', 'ip': '192.168.1.10', 'model': 'zhimi.airpurifier.ma2', 'token': 'a' * 32})
    state.update(response['state'])
    return response['result']['id']


class FakePurifier:
    def __init__(self):
        self.power = False
        self.calls = []

    def status(self):
        self.calls.append('status')
        return SimpleNamespace(power=self.power, aqi=12, mode=adapter.LegacyMode.Auto)

    def on(self):
        self.calls.append('on')
        # Hardware reports OFF despite an accepted command. Readback must win.
        return ['ok']


def test_persistence_public_results_and_removal(state):
    device_id = add(state)
    assert state['devices'][0]['token'] == 'a' * 32
    response = request(state, '/devices')
    assert response['result'][0]['name'] == 'Test'
    assert 'token' not in response['result'][0]
    state['history'][device_id] = [{'aqi': 12}]
    response = request(state, '/devices/' + device_id, 'DELETE')
    assert response['result'] is None
    assert response['state'] == {'devices': [], 'history': {}}


@pytest.mark.parametrize('field,value', [('ip', '8.8.8.8'), ('ip', 'localhost'), ('token', 'secret'), ('model', 'made.up'), ('name', ' ')])
def test_validation_rejects_bad_config(state, field, value):
    body = {'name': 'Test', 'ip': '192.168.1.10', 'model': 'zhimi.airpurifier.ma2', 'token': 'a' * 32, field: value}
    assert 'error' in request(state, '/devices', 'POST', body)
    assert not state['devices']


def test_legacy_and_miot_use_upstream_classes(monkeypatch):
    calls = []
    monkeypatch.setattr(adapter, 'AirPurifier', lambda **kw: calls.append(('legacy', kw)))
    monkeypatch.setattr(adapter, 'AirPurifierMiot', lambda **kw: calls.append(('miot', kw)))
    base = {'ip': '192.168.1.10', 'token': 'a' * 32}
    adapter.client({**base, 'model': 'zhimi.airpurifier.ma2'})
    adapter.client({**base, 'model': next(iter(adapter._MAPPINGS))})
    assert [c[0] for c in calls] == ['legacy', 'miot']


def test_command_returns_real_readback_and_history(state, monkeypatch):
    device_id = add(state)
    fake = FakePurifier()
    monkeypatch.setattr(adapter, 'client', lambda device: fake)
    response = request(state, f'/devices/{device_id}/commands', 'POST', {'action': 'power', 'value': True})
    assert response['result']['power'] is False
    assert response['result']['temperature'] is None
    assert response['result']['capabilities'] == []
    assert fake.calls == ['on', 'status']
    assert response['state']['history'][device_id] == [response['result']]


@pytest.mark.parametrize('action,value', [('power', 1), ('favorite_level', True), ('favorite_level', 15), ('mode', 'invented'), ('unknown', True), ('reset_filter', False), ('reset_filter', 1)])
def test_invalid_commands_never_reach_hardware(state, monkeypatch, action, value):
    device_id = add(state)
    monkeypatch.setattr(adapter, 'client', lambda device: pytest.fail('Hardware accessed'))
    assert 'error' in request(state, f'/devices/{device_id}/commands', 'POST', {'action': action, 'value': value})


def test_unavailable_optional_control_is_not_sent(state, monkeypatch):
    device_id = add(state)
    fake = FakePurifier()
    monkeypatch.setattr(adapter, 'client', lambda device: fake)
    response = request(state, f'/devices/{device_id}/commands', 'POST', {'action': 'child_lock', 'value': True})
    assert 'unavailable' in response['error']
    assert fake.calls == ['status']


def test_filter_reset_support_rejection_and_authoritative_readback(state, monkeypatch):
    device_id = add(state)
    fake = FakePurifier()
    monkeypatch.setattr(adapter, 'client', lambda device: fake)
    path = f'/devices/{device_id}/commands'
    assert 'unavailable' in request(state, path, 'POST', {'action': 'reset_filter', 'value': True})['error']
    assert fake.calls == []
    fake.reset_filter = lambda: fake.calls.append('reset_filter') or ['ok']
    fake.status = lambda: fake.calls.append('status') or SimpleNamespace(filter_life_remaining=93, filter_hours_used=2)
    response = request(state, path, 'POST', {'action': 'reset_filter', 'value': True})
    assert fake.calls == ['reset_filter', 'status']
    assert response['result']['filter_life_remaining'] == 93
    assert response['result']['filter_hours_used'] == 2
    assert 'reset_filter' in response['result']['capabilities']
    assert response['state']['history'][device_id][-1] == response['result']
    fake.reset_filter = lambda: [{'code': -1}]
    assert 'rejected' in request(state, path, 'POST', {'action': 'reset_filter', 'value': True})['error']


def test_unknown_power_and_bounded_history(state, monkeypatch):
    device_id = add(state)
    state['history'][device_id] = [{'aqi': i} for i in range(720)]
    monkeypatch.setattr(adapter, 'client', lambda device: SimpleNamespace(status=lambda: SimpleNamespace()))
    response = request(state, f'/devices/{device_id}/status')
    assert response['result']['power'] is None
    assert len(response['state']['history'][device_id]) == 720


def test_library_boolean_conversions_do_not_hide_unknown_properties():
    from miio.integrations.airpurifier.zhimi.airpurifier import AirPurifierStatus
    from miio.integrations.airpurifier.zhimi.airpurifier_miot import AirPurifierMiotStatus
    assert adapter.prop(AirPurifierStatus({'child_lock': None}), 'child_lock') is None
    assert adapter.prop(AirPurifierMiotStatus({'power': None}, 'zhimi.airpurifier.mb3'), 'power') is None


def test_network_error_never_discloses_token_or_discards_saved_config(state, monkeypatch):
    device_id = add(state)
    def broken(device):
        raise OSError('token=' + device['token'])
    monkeypatch.setattr(adapter, 'client', broken)
    response = request(state, f'/devices/{device_id}/status')
    assert 'error' in response and 'state' not in response
    assert 'a' * 32 not in json.dumps(response)
    assert state['devices'][0]['id'] == device_id
