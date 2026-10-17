# Standalone Android architecture

Selected on 2026-10-05 following the user's request: the phone talks directly to the purifier over UDP 54321. No running computer, HTTP server, or cloud login is required during use.

React/TypeScript is packaged by Capacitor 8. A local Java plugin runs python-miio 0.5.12 inside Python 3.11 using Chaquopy 17. Protocol and model selection stay in the Python adapter; UI components use a platform transport. The legacy AirPurifier implementation remains the compatibility reference. Model lists come from the installed library, never guessed mappings.

Device configuration and bounded history are stored in an AES-GCM encrypted private file, with a non-exportable Android Keystore key. Tokens are only entered during setup and never returned by the adapter. Backup is disabled. No localhost control server or LAN API is opened. The inherited FastAPI server remains available for desktop development only.

Polling runs while the activity is visible, stops on pause, and refreshes on resume. Native requests are serialized. Commands return a fresh hardware snapshot; UI revisions discard older polling responses. Failures retain the last reading with a visible error, without switching to demo data.

Build targets: API 36, minimum API 24, JDK 21, generated Capacitor Gradle versions, arm64-v8a phones and x86_64 emulators. Chaquopy supports the selected Android Gradle plugin and Python version. Python dependency packaging must be proven by an APK build before declaring this implemented architecture validated. A read-only physical purifier query and phone control session remain required acceptance evidence.

Official references checked before selecting versions:
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/updating/8-0
- https://chaquo.com/chaquopy/doc/current/versions.html
- https://chaquo.com/chaquopy/doc/current/android.html
- https://developer.android.com/privacy-and-security/keystore
- https://developer.android.com/privacy-and-security/local-network-permission

API 36 uses INTERNET for local networking. Targeting API 37 later requires the Android local-network runtime permission flow. Wi-Fi access-point scanning and cloud token extraction are not included. Manual setup accepts the private IPv4 address, exact supported model identifier, and existing 32-character miIO token.

Version 1.0.2 adds on-demand local device discovery. It reuses python-miio 0.5.12's mDNS service, Listener and DEVICE_MAP used by `miiocli discover`, with callbacks collecting supported purifier classes without blocking on device handshakes. Each new candidate then receives a unicast miIO handshake and an authenticated read-only `miIO.info` query to confirm token/model. The supported model comes from the device response and upstream model lists. Placeholder/invalid tokens, unsupported devices, and saved IP/token identities are excluded. There is no raw CLI-output parsing or logging of tokens.

Candidate credentials stay in the Android encrypted private state with a five-minute expiry. Only candidate ID, name, IP and model cross into the UI. Add rechecks the token and current saved devices before persisting it. The desktop development backend reuses the adapter path and keeps candidates in memory. Android declares CHANGE_WIFI_MULTICAST_STATE and holds a MulticastLock only for discovery; it releases the lock on completion, failure, pause or destruction. Polling/controls are suspended during the scan. See [Android MulticastLock](https://developer.android.com/reference/android/net/wifi/WifiManager.MulticastLock) and [the bundled CLI implementation](https://github.com/rytilahti/python-miio/blob/0.5.12/miio/cli.py).

Android also declares ACCESS_NETWORK_STATE to read Wi-Fi LinkProperties and supplies the local IPv4 address directly to Zeroconf. Discovery binds to that interface, avoiding default Python interface selection. No location or nearby-Wi-Fi scan permission is requested. A missing Wi-Fi IPv4 address yields an explicit error. The added normal permissions support local discovery only; existing direct device control is unchanged.
