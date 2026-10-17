# Project goals

Objective: create a standalone Android app controlling supported Xiaomi air purifiers directly on the local network. User selected standalone phone control on 2026-10-05.

Overall status: complete for the requested standalone app, with user-reported manual acceptance on Android 16 / Xiaomi Air Purifier 2S China model. On 2026-10-07 the user confirmed all working features were manually verified and explicitly waived validation via a connected phone. Production release/distribution readiness is separate and is not claimed.

User observation: reports that the app is working on the phone and identifies the Google warning as **Unverified Developer**. Developer registration has not been completed for this locally built APK. Google's developer-verification notice concerns publisher identity; release signing alone does not complete that registration. See the installation guidance in README.

Additional user evidence on 2026-10-07: Android 16 and Xiaomi Air Purifier 2S China model. User explicitly confirmed live PM2.5 readings, power and mode changes, saved device after reopening, and reconnection after Wi-Fi restoration. Recorded in docs/PHONE_VALIDATION.md. Exact miIO identifier remains unspecified; no model mapping was inferred from the retail name.

Earlier blocked audits below are historical and superseded by the user's final manual acceptance and connected-phone validation waiver.

## G0 - Separate project

Status: complete.

Evidence: independent source, configuration, tests, dependencies and caches in this workspace. Only a full Python runtime was copied from the reference cache; saved credentials, databases, services and original source were not changed or copied.

## G1 - Standalone architecture

Status: implemented; user-reported physical operation on Android 16 / Xiaomi 2S China model.

Decision: React + Capacitor, local Java bridge, embedded Python 3.11 / Chaquopy 17 and python-miio 0.5.12. Native requests replace HTTP on Android. No computer or control server is required. Protocol/model selection uses upstream legacy/MIoT implementations. See docs/ARCHITECTURE.md.

Evidence: official Capacitor, Chaquopy and Android documentation checked before version selection. ARM64 and x86-64 Python dependencies packaged successfully in the APK build. User reports live PM2.5 readings and control on Android 16 / Xiaomi 2S China model. This is compatibility evidence for that reported setup, not all supported models.

## G2 - Baseline and automated behavior

Status: tested.

Evidence on 2026-10-05: frontend build and 5 transport tests pass; 19 inherited backend tests plus 17 standalone adapter tests pass (36 Python tests). Fake tests cover protocol selection, validation, command readback, unknown properties, unsupported controls, bounded history, private credentials and sanitized errors.

Final production browser suite: all 8 flows passed in the final production build, including offline saved readings and visibility pause/resume. Earlier development-server runs had intermittent cold page-load timeouts; production preview avoids compilation during tests.

## G3 - On-phone transport and credentials

Status: implemented; functional persistence manually accepted by user. Connected instrumentation waived; tamper rejection instrumentation was compiled but not executed.

Evidence: Android uses a local Capacitor plugin instead of HTTP. Tokens and history use an atomic AES-GCM file in no-backup storage with Android Keystore. Backup and framework logging are disabled. Public results exclude tokens. No open LAN API or relaxed host/origin handling was added. Native instrumentation test uses fake credentials, an isolated temporary file and a separate temporary key; it never reads or replaces saved purifier settings. It also checks authenticated decryption rejects tampering.

## G4 - Android package

Status: APK and native tests built; manual phone acceptance confirmed by user. Connected instrumentation waived.

Evidence: assembleDebug succeeded with JDK 21, Gradle 8.14.3, AGP 8.13.0, API 36/min API 24, ARM64 and x86-64. Package com.airstudio.purifier. Debug APK is artifacts/air-studio-debug.apk. Instrumentation APK compilation and Android lint passed (no errors; generated-template/dependency warnings remain).

This PC has no enabled Android hypervisor driver. The workspace-local Android 36 emulator remained offline in software mode; restarting with Vulkan disabled exited unsuccessfully. No OS driver or virtualization settings were changed. No connected test phone was available. Launch, keyboard, dialogs, back navigation, safe areas, encrypted storage and native imports require an online emulator or authorized phone; compilation alone is not runtime acceptance.

## G5 - Monitoring and physical control

Status: implemented, mock tested and manually accepted by user on the reported device.

Evidence: startup loads devices; demo only for empty configuration or explicit selection; errors remain visible; offline startup shows saved readings. Commands read back hardware; revision guards discard stale poll/manual refresh responses. Polling pauses on visibility/native activity pause and refreshes on resume. Native worker serializes requests and rejects queued work while paused. Android Back closes dialogs/removal confirmation before exiting.

Physical evidence: user confirmed live PM2.5 readings, power/mode changes, saved startup and Wi-Fi recovery on Android 16 / Xiaomi 2S China model, then confirmed manual verification of all working features. Detailed measurements and second-purifier coverage were not supplied. Automated tests sent no real device commands and used no original credentials.

## G6 - Delivery and release

Status: debug delivery complete and manually accepted. Production release readiness remains a separate follow-up.

Evidence: installation, setup, start/stop, tests, supported models, storage and limitations documented in README. Build script copies the debug APK into artifacts. Credentials and caches are ignored. npm reports zero advisories after pinning CLI 8.4.3.

Final debug APK: 47904268 bytes. SHA-256: `4bc18a2547169b87db8241be9576d37bb89c2627b3effad64b4093b324c86bac`. APK archive integrity and Android signature verification passed. Final lint has zero errors and 15 non-blocking warnings. Native instrumentation APK compiles; its runtime execution remains pending.

Follow-ups for production release: private release signing, 16 KB native page-size validation, Google developer registration and release dependency/security review. Manual local-use acceptance is complete; connected instrumentation was waived. No production release claim.

## Runtime verification preparation

The latest continuation rebuilt the APK after isolating native tests from saved user configuration. Added scripts/verify-android.ps1 and docs/PHONE_VALIDATION.md. The helper was run with no connected device and correctly stopped before starting tests. A fresh adb check found zero devices; native runtime and physical purifier acceptance still require an authorized phone or online emulator. No real purifier traffic was sent.

## Completion and blocked audit - 2026-10-05

The original implementation turn and two subsequent goal continuations encountered the same missing test target. The latest authoritative `adb devices -l` output again contains no devices, and there is no running emulator process. APK and instrumentation APK files exist; the delivered APK checksum matches its recorded checksum. Source, builds, lint, browser flows and fake-hardware tests establish implementation and packaging, but cannot establish native execution or actual phone-to-purifier monitoring/control. No live Android test report or physical purifier acceptance record is available.

Required next external step: connect an authorized Android phone with USB debugging for `scripts/verify-android.ps1`, or install the APK manually and provide the observations in `docs/PHONE_VALIDATION.md`. Actual purifier control checks require owner authorization. Keep tokens on the phone; do not provide them in chat. No further code/build repetition can resolve these missing runtime and physical acceptance gates without a test target or user observations.

## Resumed acceptance audit - 2026-10-07

The delivered APK still has SHA-256 `4bc18a2547169b87db8241be9576d37bb89c2627b3effad64b4093b324c86bac`. A fresh successful `adb devices -l` query found no attached devices. The user has now provided broad phone-runtime evidence and the exact developer-verification warning; README and the phone acceptance record reflect those observations. Detailed live readings, commands/readback, saved startup and network/lifecycle checks remain unconfirmed. No hardware commands were sent. The goal remains pending while awaiting those observations or a connected test target.

Three consecutive resumed goal turns encountered the same missing acceptance evidence. The latest successful device query still lists no attached devices, no connected native runtime report is present, and the detailed phone observations remain unanswered. Marked blocked on final verification; implementation and the delivered APK remain available. Resume when the phone acceptance observations arrive or an authorized Android test device is connected.

## Physical acceptance update - 2026-10-07

The user subsequently confirmed all four requested main checks: live PM2.5, power/modes, saved device after reopening and Wi-Fi recovery. Earlier missing-evidence audits above are historical. Delivered APK checksum was checked again and matches the recorded value. Main standalone operation now has user-reported hardware evidence. Instrumentation execution, detailed UI, history, lifecycle and optional-control observations remain unverified, as listed in docs/PHONE_VALIDATION.md; full completion is not claimed from the narrower four-check report. No source or APK changes were made during this acceptance update.

The physical-report turn and two continuations reached the same remaining verification blocker: no attached Android test device or instrumentation report, and no extended phone observations. Fresh successful adb checks continued to list no devices. Goal blocked on the remaining acceptance evidence; the four passed main checks are retained. A pending question asks about history, resume refresh and Android UI behavior. Native storage/tamper tests can run with scripts/verify-android.ps1 when an authorized device is connected.

## Final acceptance - 2026-10-07

User instruction: "skip validation via connected phone. manually verified all working features". This supersedes the earlier pending connected-phone and manual-feature gates. Evidence consists of the built standalone APK, automated validation documented above, the four explicit hardware confirmations, and the user's final overall manual acceptance on Android 16 / Xiaomi 2S China model. APK SHA-256 was rechecked and matches the delivered artifact. No APK changes were made after that acceptance.

The requested standalone app is complete and accepted. Native instrumentation execution is waived, not represented as passed. Exact phone hardware/model identifier and per-feature measurements were not supplied; acceptance applies to the user's reported setup. Production signing, Google developer registration and broader device/release checks remain unclaimed follow-ups rather than blockers to the accepted local-use app.

## Readability and phone layout update - 2026-10-07

User feedback: the single screen was cluttered and the text too small. Version 1.0.1 (versionCode 2) separates phone content into Overview, Controls, History and Device views, with persistent bottom navigation, a compact purifier selector, full-width cards and a compact power panel. Body/control/input text is 16 px, secondary text at least 14 px, headings 20–28 px, and primary tap targets at least 48 px. The layouts apply to portrait and landscape up to 900 px. Android Back returns from a section to Overview after handling existing dialogs.

Evidence: frontend production build and all 5 transport tests passed. All 9 browser flows passed, including section visibility, mode commands, enlarged inputs/text, 320 px portrait, 844 px landscape, existing saved-startup/error/lifecycle/control flows and desktop layout. Screenshots were inspected. No protocol or credential-storage behavior changed. Prior physical acceptance applies to version 1.0; the updated UI has not been reported on the phone, and connected-phone validation remains explicitly waived.

Delivery: version 1.0.1 / versionCode 2 APK build succeeded. Current artifacts/air-studio-debug.apk is 47,810,007 bytes; SHA-256 `12680cd03334747421b21ebbe58ea6d7f696daaa4586fa99d915083fcb13de13`. Android signature verification, ZIP integrity, checksum sidecar and exact inclusion of the final built web assets passed. Earlier APK hashes above describe the previously accepted 1.0 artifact.

## Network discovery - 2026-10-07

User request: use miiocli discover to list supported purifiers only when their 32-character token is valid, ignoring saved devices. Implemented in version 1.0.2 / versionCode 3: Device → Scan network uses the CLI's mDNS listener/service and upstream device map, then a miIO handshake and authenticated read-only info request. Models are confirmed from device responses, never inferred. Placeholder/invalid tokens, non-purifiers, unsupported models and saved IP/token identities are omitted. Add revalidates the token and duplicate check. Tokens remain private; Android scan candidates use the encrypted store with five-minute expiry, and desktop candidates stay in memory.

Android selects its Wi-Fi IPv4 interface through LinkProperties, holds the multicast lock only during discovery, and releases it on completion/error/pause/destruction. Existing polling and controls pause during scans. Browser views remain separate. Normal ACCESS_NETWORK_STATE and CHANGE_WIFI_MULTICAST_STATE permissions were added; no Wi-Fi access-point scanning or cloud login was introduced.

Verification: frontend build, 5 transport tests, 46 Python tests (including fake discovery, placeholder/invalid tokens, authenticated model validation, duplicate IP/token exclusion, add/expiry/revalidation, resource cleanup, private results/log suppression and native interface selection), and all 11 browser flows passed. Discovery screenshots were inspected. A read-only PC scan returned zero eligible purifiers; no control commands were sent and no discovered credentials were printed. Positive live discovery on the phone remains unreported; connected-phone validation is still waived. Prior user acceptance covers original standalone features, not this new discovery feature.

Delivery: APK 1.0.2 / versionCode 3 built successfully. Current artifacts/air-studio-debug.apk is 47,810,811 bytes, SHA-256 `fa94e906e34194e9db5c5dd1a42a1884f1fac5c49dea5e23deee28fb55f7bb8a`. Signature verification, ZIP integrity, checksum sidecar, exact final web assets and packaged Python discovery/adapter modules passed. Earlier artifact hashes above are historical.

## Discovery PC network investigation and fix - 2026-10-07

User supplied a screenshot of miiocli detecting a supported AirPurifier at 192.168.0.14 with the token obscured. Repeated read-only checks compared the app scanner and upstream CLI mDNS: both detected that address, authenticated a non-placeholder token and confirmed zhimi.airpurifier.ma2. The earlier empty PC scan is not evidence of absent hardware.

Testing the explicit-interface path then exposed AttributeError: the code used nonexistent IPVersion.V4; both installed and bundled Zeroconf define V4Only. Corrected that enum and added a regression which executes the bound Zeroconf constructor options rather than mocking the scanner entry point. All 47 Python tests pass. Version 1.0.3 / versionCode 4 includes the correction.

Positive live evidence: the corrected scanner, bound to this PC's 192.168.0.17 interface, returned the verified purifier 192.168.0.14 / zhimi.airpurifier.ma2. A second live scan supplied with that purifier as saved returned zero candidates. Actual tokens stayed private in memory and were never printed or saved by the diagnostic. Queries were read-only; no power, mode or other control command was sent. This proves PC discovery/token validation/duplicate exclusion, not Android runtime discovery. Connected-phone validation remains waived.

Delivery: corrected APK 1.0.3 / versionCode 4 built successfully. Current artifacts/air-studio-debug.apk is 47,810,547 bytes, SHA-256 `defd1dd132af7c97f7f4f983483dcb844e7a7340865bc83c6342c4275634356d`. Signature, ZIP integrity, checksum sidecar, final web assets and the packaged V4Only fix verified. Replace the previous 1.0.2 APK with this build for Android discovery.

## Mobile overlap correction - 2026-10-07

User phone screenshots show Power and Notification sounds covered by bottom navigation, and the room selector's focus outline crossing the Purifier label. Version 1.0.4 / versionCode 5 gives mobile content its own scroll area above navigation. Navigation occupies normal layout space including the bottom safe area; changing sections resets the content scroll. Safe-area rules no longer override mobile layout spacing. The selector retains a visible focus outline inside its field, with spacing below the label.

Verification: the new regression failed against the previous build because content extended behind navigation. Frontend production build, all 5 transport tests and all 12 browser flows now pass. The regression checks 390 px and 320 px portrait, 844 px landscape, simulated 24 px top/bottom safe areas, section scroll reset, Power/Notification sounds geometry and hit testing, and selector focus clearance. Screenshots inspected. Protocol and credential behavior unchanged. Connected-phone testing remains waived; physical confirmation of this correction is unreported.

Delivery: APK 1.0.4 / versionCode 5 built successfully. Current artifacts/air-studio-debug.apk is 47,810,631 bytes, SHA-256 `f1b80c888c1f66a00312745ae03ace2280ce096cb6d024bdb292b3ccc33ee7bd`. Signature verification, ZIP integrity, checksum sidecar, version metadata and exact inclusion of all final web assets passed. Earlier artifact hashes above are historical.

## Automatic fan level adjustment - 2026-10-07

User request: apply fan level automatically without pressing Apply level. Version 1.0.5 / versionCode 6 removes that button. The slider previews adjustments locally, then sends the final value on pointer release, keyboard adjustment completion or focus loss. Unchanged values are skipped; the existing pending-command guard prevents duplicate sends. Device readback replaces the preview even when the confirmed value is unchanged; errors restore the last confirmed level and retain existing visible-error/disabled-control behavior. Existing capability, connectivity, lifecycle and busy guards remain in effect. No automatic mode change was introduced.

Evidence: frontend production build and all 5 transport tests passed. All 13 browser flows passed, including a new fake-device regression verifying no requests for intermediate slider values, automatic touch pointer release, removal of the Apply button, keyboard adjustment, no duplicate on blur, authoritative unchanged readback, command failure, restored level and disabled offline control. No real device commands were sent. Connected-phone validation remains waived; physical confirmation of this change is unreported.

Delivery: APK 1.0.5 / versionCode 6 built successfully. Current artifacts/air-studio-debug.apk is 47,811,103 bytes, SHA-256 `21ce1d10f927ed2d59e889062b578381d7ed3f48dc90fd60d41ec02e28a54f7f`. Signature verification, ZIP integrity, checksum sidecar, version metadata, exact final web assets and packaged auto-apply handlers/button removal passed. Earlier artifact hashes above are historical. This requested change is implemented and automatically verified; connected-phone validation remains waived.

## Filter reset - 2026-10-07

User requested filter reset. Version 1.0.6 / versionCode 7 adds Device → Filter care → Reset filter with an explicit replacement/counter-reset confirmation and Cancel. Android and desktop adapters expose the capability only when their library client implements reset_filter; unsupported/offline/busy controls stay disabled. Confirm calls the upstream method without changing model mappings, then reads back and saves actual counters. Reset requires boolean true; malformed requests never reach hardware. Device rejection is visible and never produces optimistic counters. Confirmation closes on device/lifecycle/demo/section changes and Android Back. Demo mode simulates a reset without hardware traffic.

Evidence: frontend production build, all 5 transport tests, all 53 Python tests and all 14 browser flows passed. Fake-hardware tests cover unsupported reset, invalid confirmation, correct method invocation, device rejection, readback/history, UI confirmation/cancellation, retained readings after failure, and disabled unsupported/offline controls. No real purifier reset or control command was sent. Connected-phone validation remains waived; successful reset on the user's purifier firmware is not physically verified.

Delivery: APK 1.0.6 / versionCode 7 built successfully. Current artifacts/air-studio-debug.apk is 47,811,463 bytes, SHA-256 `128c46d5c642325777059ec800804ac7dd7652f0f8ce88734f887322b3eee1bb`. Signature verification, ZIP integrity, checksum sidecar, version metadata, exact final web assets and packaged Python reset capability/command code passed. Mobile confirmation screenshot inspected. Earlier artifact hashes above are historical.
