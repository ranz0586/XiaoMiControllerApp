# Phone and purifier acceptance record

Status: manually accepted by user on 2026-10-07. User confirmed all working features and instructed us to skip validation via a connected phone. Instrumentation execution is waived, not passed.

Version scope: that manual acceptance covers the original 1.0 APK. The subsequent 1.0.1 layout update has build/browser verification, including separate phone views, larger text, narrow portrait and landscape layouts; it has not yet been manually reported on the phone. Connected-phone validation remains waived by the user.

Version 1.0.2 introduced on-demand network discovery; version 1.0.3 corrects the explicit IPv4 interface enum. Fake-device/API tests cover scanning and adding. A repeated read-only PC scan bound to 192.168.0.17 detected and authenticated the purifier at 192.168.0.14 / zhimi.airpurifier.ma2; a second scan excluded it when supplied as saved. Successful live phone discovery has not yet been reported. Manual check: open Device → Scan network on the purifier Wi-Fi; saved purifiers should be absent, eligible unsaved purifiers should show model/IP and Token verified, and Add should save the chosen name without displaying the token. Devices that hide tokens still require manual setup. Connected testing remains waived.

User-reported evidence: the app is working on **Android 16** with a **Xiaomi Air Purifier 2S, China model**. The user confirmed live PM2.5 readings, power and mode changes, the saved device after reopening, and reconnection after Wi-Fi is restored. Google displays **Unverified Developer** for the APK. Phone hardware model and exact miIO model identifier remain unspecified. The retail name is recorded as supplied, without inferring a protocol model identifier. These are user observations, not agent-operated hardware tests.

Record the phone model, Android version, exact purifier model identifier, app APK checksum, date, and results below. Do not record the token, Wi-Fi password or account credentials.

## Native runtime checks

Optional future diagnostic procedure; not an outstanding acceptance gate after the user's waiver. Connect an authorized USB-debugging phone and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-android.ps1
```

If several devices are connected, add `-Serial YOUR_DEVICE_SERIAL`. The helper refuses offline/unauthorized devices. It runs native imports and Keystore checks using fake credentials, a temporary file and a separate temporary key. It sends no purifier traffic and does not replace saved purifier settings. Test reports appear under `android/app/build/reports/androidTests/connected/debug`.

## Manual app checks

1. Install `artifacts/air-studio-debug.apk`. Verify launch, system-bar clearance in portrait/landscape, readable controls, scrolling, keyboard input, dialog scrolling and Android Back closing dialogs before exiting.
2. Join the purifier's local network. Add its exact supported model, private IP and existing miIO token directly in the app. Confirm a live status response; record visible readings and any unknown properties. This initial check is read-only.
3. Close and reopen the app. Confirm automatic selection of the saved purifier, saved history and reconnection. Confirm the token is not displayed or returned in device details.
4. Leave the app in the background, return and confirm a fresh timestamp. Disconnect Wi-Fi and confirm a visible connection error, retained last readings and disabled controls. Reconnect and confirm recovery without selecting demo mode.
5. With the purifier owner's authorization, exercise power, Auto/Sleep/Favorite and each supported optional control. Record the original setting, requested setting and actual purifier/readback response. Restore the original settings. Confirm unknown/unsupported controls remain disabled. A failed command must show an error and require a refresh rather than claiming success.
6. If multiple purifiers are available, confirm selection and history remain separate. Remove only a deliberately added test device and confirm its settings/history are removed.

## Evidence

| Check | Result | Evidence / observation |
| --- | --- | --- |
| Native imports, Keystore roundtrip and tamper rejection | Connected tests waived | Instrumentation compiled, not executed. Manual functional use does not prove tamper rejection. |
| Launch and functional use | User-reported manual acceptance | App working on Android 16; user subsequently confirmed all working features. |
| Live PM2.5 readings | User-reported pass | User explicitly confirmed live readings on Xiaomi 2S China model. Other sensor properties not separately reported. |
| Saved device after reopening | User-reported pass | Explicit confirmation plus subsequent overall manual acceptance; per-feature measurements not supplied. |
| Wi-Fi recovery | User-reported pass | Explicit confirmation plus subsequent overall manual acceptance. |
| Power and mode changes | User-reported pass | Explicit confirmation plus subsequent overall manual acceptance. |
| Other working features | User-reported manual acceptance | User states all working features were manually verified; no individual optional-control results supplied. |
| Multiple-device hardware coverage | Not individually documented | Overall manual acceptance received; a second physical purifier was not specifically reported. |

Add results to `GOALS.md` only after observing them. An unavailable second purifier is a recorded limitation, not evidence of multiple-device physical verification.

The user's subsequent mobile screenshots document navigation covering Power/Notification sounds and a selector focus outline crossing its label. Version 1.0.4 addresses these with a separate content scroll area and an inset focus outline. Browser layout checks pass in portrait/landscape with simulated safe areas; connected-phone testing remains waived and physical confirmation of this UI correction is not yet reported.
