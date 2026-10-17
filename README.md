# Air Studio - standalone Xiaomi purifier controller

An Android app based on Air Studio at `D:\GitHub\XioamiApp`. The Android version talks directly to supported purifiers over local Wi-Fi through embedded python-miio. No running computer, Raspberry Pi, or HTTP backend is needed during Android use.

Includes multiple saved devices, PM2.5 concentration (µg/m³), temperature, humidity, filter care, bounded history, power, Auto/Sleep/Favorite modes, favorite level, child lock, and buzzer where available. Unknown properties stay unknown and unsupported controls are disabled. Commands read back actual device state. Polling pauses in the background and refreshes on resume. Connection failures show an error and retain saved readings.

Favorite fan level applies automatically when the slider is released (or after keyboard adjustment), without an Apply button. The displayed level follows the device's readback; failures show an error and retain the last confirmed level.

Device → Filter care → Reset filter asks for confirmation after replacing the filter, then calls python-miio's `reset_filter()` and refreshes the actual filter counters. The button is disabled when the adapter lacks that method or the device is offline. Firmware may reject the command; an error is shown without inventing successful reset readings. Demo mode simulates the reset without hardware traffic.

## Install and connect

On phones, use the bottom navigation: **Overview** for current air readings and power, **Controls** for modes and optional settings, **History** for trends, and **Device** for filter care and device management. Text and inputs are enlarged, and cards use the full screen width. The phone layout also applies in landscape up to 900 px wide.

The generated debug APK is `artifacts/air-studio-debug.apk`. Transfer it to your phone and allow installation from the app you use to open it. It targets API 36 and supports Android 7.0 / API 24 or newer on ARM64 phones. This is a debug build, not a signed production release.

Google may show **Unverified Developer** for this locally built APK. Google developer registration has not been completed. Removing that publisher-verification notice for distribution requires the app owner to complete developer verification and register the package and signing key; a release build alone does not do this. See [Google's developer-verification FAQ](https://developer.android.com/developer-verification/guides/faq?hl=en). The notice alone does not establish that the APK contains malware. Record any different warning separately before changing the app or installation settings.

1. Connect the phone to the purifier's local network. Guest-network isolation and VPN routing can block UDP 54321.
2. Open Air Studio. Empty configuration opens the clearly labeled demo workspace; choose **Connect my devices** or **Add a purifier**.
3. Enter a room name, private IPv4 address, exact supported model identifier, and your existing 32-character miIO token. Find the IP in your router and use the original working integration's model/token. Enter the token on the phone, not in chat or source files.
4. Save and wait for a successful live reading before using controls. Saved purifiers load automatically on subsequent launches.

Configuration, tokens, and up to 720 readings per device are encrypted in the private no-backup directory using AES-GCM and Android Keystore. Tokens are never returned by the native adapter. Clearing app data or uninstalling removes configuration and history. Editing requires re-entering the token. Cloud sign-in and cloud token extraction are not included.

To find a purifier automatically, open **Device → Scan network**. This uses the mDNS discovery/model map behind `miiocli discover` and a miIO handshake. Only supported purifiers whose non-placeholder 32-character token passes a read-only `miIO.info` request appear. Saved devices are ignored by IP or token, including a saved purifier seen at a different IP with the same token. Choose a name and **Add purifier**; the token is verified again and saved privately without showing it. Scan results expire after five minutes. Devices which hide their token or do not advertise mDNS still need manual setup. See [upstream discovery guidance](https://github.com/rytilahti/python-miio/blob/master/docs/discovery.rst).

Supported models come from the legacy AirPurifier supported list and AirPurifierMiot mappings in python-miio 0.5.12; the setup dropdown shows them. No additional model mappings are inferred. Physical compatibility still requires checking the user's exact purifier.

## Build on Windows

Use Node.js 22+, full Python 3.11, JDK 21, and Android SDK API 36 with build tools 35.0.0 / 36.0.0. Android Studio 2025.2.1+ can install the SDK and JDK. See [architecture](docs/ARCHITECTURE.md) for official references.

```powershell
cd D:\GitHub\XiaoMiControllerApp
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --cache-dir .cache/pip -r backend/requirements.txt
npm.cmd ci
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:ANDROID_HOME = 'C:\path\to\Android\Sdk'
$env:AIR_STUDIO_BUILD_PYTHON = (Resolve-Path .venv/Scripts/python.exe).Path
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

The script prepares pure-Python wheels for two source-only dependencies, builds the dashboard, syncs Capacitor, runs Gradle and copies the APK to `artifacts`. Local SDK/JDK installations under `.cache` are used when present. Caches stay in this workspace; environment settings are not changed globally. A first build requires network access.

Install using an authorized USB-debugging phone:

```powershell
& "$env:ANDROID_HOME/platform-tools/adb.exe" install -r artifacts/air-studio-debug.apk
& "$env:ANDROID_HOME/platform-tools/adb.exe" shell am start -n com.airstudio.purifier/.MainActivity
```

Close the app normally; polling stops when backgrounded. There is no Android backend service to start or stop.

## Verify

```powershell
npm.cmd run build
npm.cmd test
.\.venv\Scripts\python.exe -m pytest backend native/tests -q
node node_modules/@playwright/test/cli.js test
$env:GRADLE_USER_HOME = Join-Path (Get-Location) '.cache/gradle'
.\android\gradlew.bat -p android --no-daemon :app:lintDebug :app:assembleDebugAndroidTest
# Requires an online emulator or authorized test phone:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-android.ps1
# For multiple connected devices, add -Serial YOUR_DEVICE_SERIAL.
```

Browser tests use the production build on isolated port 5178. Native instrumentation tests verify bundled Python imports, public token exclusion, Keystore persistence, model loading and tamper rejection with fake credentials in a separate temporary file/key; existing saved purifiers are untouched and no purifier traffic is sent. Python tests use fake hardware and temporary databases.

Tested build environment: Windows, Node 24.14.1, Python 3.11.15, JDK 21, Gradle 8.14.3, AGP 8.13.0, Chaquopy 17.0.0, Capacitor runtime 8.5.2 and CLI 8.4.3. The compatible CLI version avoids its reported development dependency advisory. See [GOALS.md](GOALS.md) for exact test evidence and remaining physical checks.

Use the [phone validation record](docs/PHONE_VALIDATION.md) for runtime and purifier acceptance. The initial live status check is read-only; physical control tests require the purifier owner's authorization.

## Desktop reference

The inherited localhost-only FastAPI backend remains available for browser development:

```powershell
.\run.cmd
# Or start the backend, then npm.cmd run dev for frontend development.
```

Open http://127.0.0.1:8000 and stop with Ctrl+C. The desktop path does not use the Android native transport or encrypted storage. Original credentials and services were not copied or modified.

## Release limitations

The user confirmed live PM2.5 readings, power/mode changes, saved device after reopening and Wi-Fi reconnection on Android 16 with a Xiaomi Air Purifier 2S China model. The user subsequently confirmed manual verification of all working features and waived connected-phone validation; see [phone acceptance](docs/PHONE_VALIDATION.md). Native instrumentation was compiled but not executed. Targeting API 37 later requires the Android local-network runtime permission flow; the current API 36 target uses INTERNET permission. There is no background monitoring or notification service. Python native binaries increase APK size. Release readiness requires supported-device tests, 16 KB native binary page-size validation, dependency review, and a private release signing key outside version control. Do not distribute this debug artifact as a Play Store release.
