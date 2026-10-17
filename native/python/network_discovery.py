"""The mDNS discovery used by miiocli discover, with private token validation."""
import ipaddress
import logging
import re
import time
from uuid import uuid4

from miio import AirPurifier, AirPurifierMiot, Device
from miio.discovery import DEVICE_MAP, Listener
from miio.miioprotocol import MiIOProtocol
from miio.integrations.airpurifier.zhimi.airpurifier import SUPPORTED_MODELS
from miio.integrations.airpurifier.zhimi.airpurifier_miot import _MAPPINGS
from zeroconf import IPVersion, ServiceBrowser, Zeroconf

# Ancestor logger.disabled does not stop child records propagating to root.
# Discovery logs contain tokens, so stop propagation even if root is in debug mode.
for name in ('miio', 'zeroconf'):
    logger = logging.getLogger(name)
    logger.addHandler(logging.NullHandler())
    logger.propagate = False
    logger.setLevel(logging.CRITICAL + 1)


class PurifierListener(Listener):
    def check_and_create_device(self, info, addr):
        # Keep callbacks free of network requests. Reuse the CLI's model map.
        for identifier, cls in DEVICE_MAP.items():
            if info.name.startswith(identifier) and cls in (AirPurifier, AirPurifierMiot):
                return cls(ip=addr)
        return None


def scan_mdns(interface=None):
    listener = PurifierListener()
    # python-miio 0.5.12's helper cancels its browser but leaves Zeroconf open.
    # Use the same listener and service while explicitly closing both resources.
    options = {'interfaces': [interface], 'ip_version': IPVersion.V4Only} if interface else {}
    with Zeroconf(**options) as zeroconf:
        browser = ServiceBrowser(zeroconf, '_miio._udp.local.', listener)
        try:
            time.sleep(5)
        finally:
            browser.cancel()
    return listener.found_devices


def verified_model(ip, token):
    device = Device(ip=ip, token=token, timeout=1)
    device.retry_count = 1
    model = device.info(skip_cache=True).model
    if model not in set(SUPPORTED_MODELS) | set(_MAPPINGS):
        raise ValueError('Unsupported purifier model')
    return model


def scan(saved, interface=None):
    if interface is not None:
        address = ipaddress.IPv4Address(interface)
        if not any(address in ipaddress.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')):
            raise ValueError('A private IPv4 interface is required')
    found = scan_mdns(interface) if interface else scan_mdns()
    candidates = []
    seen_ips = {d['ip'] for d in saved}
    seen_tokens = {d['token'].lower() for d in saved}
    for ip, device in found.items():
        if ip in seen_ips or not isinstance(device, (AirPurifier, AirPurifierMiot)):
            continue
        try:
            address = ipaddress.IPv4Address(ip)
            if not any(address in ipaddress.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')):
                continue
            token = device.token
            if token is None:
                handshake = MiIOProtocol.discover(addr=ip, timeout=1)
                token = handshake.checksum if handshake is not None else None
            token = token.hex() if isinstance(token, bytes) else token
            if not isinstance(token, str) or not re.fullmatch('[0-9a-fA-F]{32}', token):
                continue
            token = token.lower()
            if token in ('0' * 32, 'f' * 32) or token in seen_tokens:
                continue
            model = verified_model(str(address), token)
            candidates.append({'id': str(uuid4()), 'name': 'Xiaomi purifier',
                               'ip': str(address), 'model': model, 'token': token,
                               'expires': time.time() + 300})
            seen_ips.add(str(address))
            seen_tokens.add(token)
        except Exception:
            # Bad tokens and offline devices are omitted, never exposed as addable.
            continue
    return candidates
