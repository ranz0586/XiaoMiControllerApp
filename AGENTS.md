# Contributor instructions

## Purpose

Build an Android application for monitoring and controlling Xiaomi air purifiers, using `D:\GitHub\XioamiApp` as the baseline. Work in `D:\GitHub\XiaoMiControllerApp`. Treat the original project as a reference; do not modify it, copy its saved credentials, or interrupt its services unless the user asks.

## Architecture

- Proposed first version: React + TypeScript packaged with Capacitor, using a separate FastAPI/python-miio backend.
- Standalone phone-to-purifier control is an alternative. Resolve and document the architecture choice before implementing the Android integration; follow the user's later preference.
- The current repository contains a web baseline. Do not claim that an Android app or APK already exists.
- Keep protocol logic in the backend adapter and configurable network transport separate from UI components.
- Verify current requirements in official Capacitor and Android documentation before choosing SDK, Gradle, or plugin versions.

## Preserve behavior

- Load configured purifiers at startup. Demo mode is for an empty configuration or explicit user selection.
- Display connection errors; never silently replace failed live readings with demo data.
- Preserve readings, history, filter care, power, modes, and supported optional controls.
- PM2.5 is a concentration in micrograms per cubic meter, not a regulatory AQI score.
- Disable unsupported controls and keep unknown device properties visibly unknown.
- Read back device state after commands; prevent stale polling responses from overwriting newer state.
- Plan Android pause/resume behavior, polling suspension, and reconnection.

## Network and credentials

- The inherited backend binds to localhost and checks hosts/origins. The phone's localhost is not the computer's backend address.
- Add explicit backend address configuration, authentication, transport security, and deliberate host/origin handling before enabling LAN access. Do not blindly allow all hosts/origins or expose an unauthenticated control API.
- Use appropriate Android secure storage for authentication secrets. Keep purifier tokens in the backend unless the chosen architecture explicitly changes this.
- Never log or commit tokens, passwords, databases, `.env` secrets, keystores, or signing credentials. Use fake values in examples and tests.
- The original user's legacy `miiocli airpurifier` integration is a working compatibility reference. Do not invent model mappings.
- A restricted agent sandbox can block purifier traffic despite a working CLI in a normal terminal. Check process network access before asking the user to replace working credentials.

## Implementation and validation

- Read relevant source and guidance before editing. Keep changes focused and reuse existing behavior where appropriate.
- Use `rg` for searches and workspace-local caches when required. Use `npm.cmd` when PowerShell policy blocks `npm.ps1`.
- Use a full Python runtime. The original backend was verified on Python 3.11; Python 3.14 remains unverified.
- Run checks appropriate to the change: frontend build/tests, backend tests, and browser flows. Android changes also need an APK build and emulator/phone checks.
- Automated tests must use fake hardware clients and temporary databases. Do not send real device control commands as tests without user authorization.
- Keep signing credentials outside version control; distinguish debug builds from release readiness.
- Document setup, start/stop commands, tested environments, and unresolved limitations.

## Progress

Maintain `GOALS.md` with status and acceptance evidence. Distinguish proposed, implemented, tested, and physically verified behavior. Do not mark Android or hardware goals complete from inherited source or mocks alone.

User instructions take precedence over this file. Routine reversible work within the requested scope does not require repeated confirmation.
