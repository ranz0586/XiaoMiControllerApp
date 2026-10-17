import json
import time
from types import SimpleNamespace

import pytest

from native.python import network_discovery as discovery
from native.python import purifier_adapter as adapter


def fake(ip, token):
    device = discovery.AirPurifier(ip=ip, token='a' * 32)
    device.token = token
    return device


def test_scan_only_lists_verified_supported_new_purifiers(monkeypatch):
    saved = [{'ip': '192.168.0.14', 'token': 'b' * 32}]
    found = {
        '192.168.0.14': fake('192.168.0.14', bytes.fromhex('a' * 32)),
        '192.168.0.15': fake('192.168.0.15', bytes.fromhex('b' * 32)),
        '192.168.0.16': fake('192.168.0.16', bytes(16)),
        '192.168.0.17': fake('192.168.0.17', bytes.fromhex('f' * 32)),
        '192.168.0.18': fake('192.168.0.18', 'bad'),
        '192.168.0.19': fake('192.168.0.19', 'c' * 32),
        '192.168.0.20': fake('192.168.0.20', 'd' * 32),
        '192.168.0.21': fake('192.168.0.21', 'e' * 32),
        '8.8.8.8': fake('8.8.8.8', '1' * 32),
        '192.168.0.22': SimpleNamespace(token='2' * 32),
        '192.168.0.23': fake('192.168.0.23', 'e' * 32),
    }
    monkeypatch.setattr(discovery, 'scan_mdns', lambda: found)
    verified = []
    def verify(ip, token):
        verified.append(ip)
        if ip.endswith(('.19', '.20')):
            raise ValueError('invalid token=' + token)
        return 'zhimi.airpurifier.ma2'
    monkeypatch.setattr(discovery, 'verified_model', verify)
    candidates = discovery.scan(saved)
    assert [d['ip'] for d in candidates] == ['192.168.0.21']
    assert verified == ['192.168.0.19', '192.168.0.20', '192.168.0.21']


def test_token_must_authenticate_and_report_supported_model(monkeypatch):
    calls = []
    class Device:
        def __init__(self, **kwargs):
            calls.append(kwargs)
        def info(self, *, skip_cache):
            assert skip_cache and self.retry_count == 1
            return SimpleNamespace(model='chuangmi.plug.m1')
    monkeypatch.setattr(discovery, 'Device', Device)
    with pytest.raises(ValueError):
        discovery.verified_model('192.168.0.14', 'a' * 32)
    assert calls == [{'ip': '192.168.0.14', 'token': 'a' * 32, 'timeout': 1}]


def test_cli_model_map_and_handshake_token_are_used(monkeypatch):
    listener = discovery.PurifierListener()
    device = listener.check_and_create_device(SimpleNamespace(name='zhimi-airpurifier-ma2_abcd._miio._udp.local.'), '192.168.0.14')
    assert isinstance(device, discovery.AirPurifier)
    assert listener.check_and_create_device(SimpleNamespace(name='chuangmi-plug-m1_abcd._miio._udp.local.'), '192.168.0.15') is None
    monkeypatch.setattr(discovery, 'scan_mdns', lambda: {'192.168.0.14': device})
    calls = []
    def handshake(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(checksum=bytes.fromhex('c' * 32))
    monkeypatch.setattr(discovery.MiIOProtocol, 'discover', handshake)
    monkeypatch.setattr(discovery, 'verified_model', lambda ip, token: 'zhimi.airpurifier.ma2')
    assert discovery.scan([])[0]['token'] == 'c' * 32
    assert calls == [{'addr': '192.168.0.14', 'timeout': 1}]


def test_scan_add_private_token_and_expiry(monkeypatch):
    candidate = {'id': 'candidate', 'name': 'Xiaomi purifier', 'ip': '192.168.0.14',
                 'token': 'a' * 32, 'model': 'zhimi.airpurifier.ma2', 'expires': time.time() + 300}
    monkeypatch.setattr(discovery, 'scan', lambda saved: [dict(candidate)])
    monkeypatch.setattr(discovery, 'verified_model', lambda ip, token: 'zhimi.airpurifier.ma2')
    state = {'devices': [], 'history': {}}
    scanned = json.loads(adapter.dispatch(json.dumps(state), '/discovery', 'POST', '{}'))
    assert 'token' not in json.dumps(scanned['result'])
    assert not scanned['state']['devices']
    added = json.loads(adapter.dispatch(json.dumps(scanned['state']), '/discovery/candidate', 'POST', '{"name":"Living room"}'))
    assert added['result']['name'] == 'Living room'
    assert 'token' not in json.dumps(added['result'])
    assert added['state']['devices'][0]['token'] == 'a' * 32
    assert added['state']['discovery'] == []
    state['discovery'] = [{**candidate, 'expires': 0}]
    response = json.loads(adapter.dispatch(json.dumps(state), '/discovery/candidate', 'POST', '{"name":"Test"}'))
    assert 'expired' in response['error']


def test_add_rechecks_token_and_saved_devices(monkeypatch):
    candidate = {'id': 'candidate', 'name': 'Test', 'ip': '192.168.0.14', 'token': 'a' * 32,
                 'model': 'zhimi.airpurifier.ma2', 'expires': time.time() + 300}
    state = {'devices': [{**candidate, 'id': 'saved'}], 'history': {}, 'discovery': [candidate]}
    with pytest.raises(adapter.AdapterError, match='already saved'):
        adapter.route(state, '/discovery/candidate', 'POST', {'name': 'Test'})
    state['devices'] = []
    def broken(ip, token):
        raise OSError('private token=' + token)
    monkeypatch.setattr(discovery, 'verified_model', broken)
    response = json.loads(adapter.dispatch(json.dumps(state), '/discovery/candidate', 'POST', '{"name":"Test"}'))
    assert 'could not be verified' in response['error']
    assert 'a' * 32 not in json.dumps(response)
    assert not state['devices']


def test_discovery_failure_is_sanitized(monkeypatch):
    def broken():
        raise OSError('token=' + 'a' * 32)
    monkeypatch.setattr(discovery, 'scan_mdns', broken)
    result = json.loads(adapter.dispatch('{"devices":[],"history":{}}', '/discovery', 'POST', '{}'))
    assert 'Network discovery failed' in result['error']
    assert 'a' * 32 not in json.dumps(result)


def test_library_token_logs_never_propagate_to_root(caplog):
    import logging
    with caplog.at_level(logging.DEBUG):
        logging.getLogger('miio.discovery').warning('token=' + 'a' * 32)
    assert 'a' * 32 not in caplog.text


def test_mdns_browser_and_sockets_close(monkeypatch):
    events = []
    class Zeroconf:
        def __enter__(self): return self
        def __exit__(self, *args): events.append('close')
    class Browser:
        def __init__(self, zc, service, listener):
            assert service == '_miio._udp.local.'
        def cancel(self): events.append('cancel')
    monkeypatch.setattr(discovery, 'Zeroconf', Zeroconf)
    monkeypatch.setattr(discovery, 'ServiceBrowser', Browser)
    monkeypatch.setattr(discovery.time, 'sleep', lambda seconds: events.append(seconds))
    assert discovery.scan_mdns() == {}
    assert events == [5, 'cancel', 'close']


def test_native_scan_binds_to_wifi_interface(monkeypatch):
    calls = []
    monkeypatch.setattr(discovery, 'scan_mdns', lambda interface: calls.append(interface) or {})
    assert discovery.scan([], interface='192.168.0.5') == []
    assert calls == ['192.168.0.5']
    with pytest.raises(ValueError):
        discovery.scan([], interface='8.8.8.8')


def test_bound_mdns_uses_real_supported_ip_version(monkeypatch):
    options = []
    class Zeroconf:
        def __init__(self, **kwargs): options.append(kwargs)
        def __enter__(self): return self
        def __exit__(self, *args): pass
    class Browser:
        def __init__(self, *args): pass
        def cancel(self): pass
    monkeypatch.setattr(discovery, 'Zeroconf', Zeroconf)
    monkeypatch.setattr(discovery, 'ServiceBrowser', Browser)
    monkeypatch.setattr(discovery.time, 'sleep', lambda seconds: None)
    assert discovery.scan_mdns('192.168.0.17') == {}
    assert options == [{'interfaces': ['192.168.0.17'], 'ip_version': discovery.IPVersion.V4Only}]
