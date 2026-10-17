param([switch]$SkipWebBuild)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (Test-Path .cache/jdk) {
    $localJdk = Get-ChildItem .cache/jdk -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
}
if (-not $env:ANDROID_HOME -and (Test-Path .cache/android-sdk)) { $env:ANDROID_HOME = (Resolve-Path .cache/android-sdk).Path }
if (-not $env:AIR_STUDIO_BUILD_PYTHON -and (Test-Path .venv/Scripts/python.exe)) { $env:AIR_STUDIO_BUILD_PYTHON = (Resolve-Path .venv/Scripts/python.exe).Path }
$env:GRADLE_USER_HOME = Join-Path (Get-Location) '.cache/gradle'
$env:ANDROID_USER_HOME = Join-Path (Get-Location) '.cache/android-user'
if (-not (Test-Path .cache/android-wheels/android_backup-0.2.0-py3-none-any.whl) -or -not (Test-Path .cache/android-wheels/micloud-0.6-py3-none-any.whl)) {
    if (-not $env:AIR_STUDIO_BUILD_PYTHON) { throw 'Set AIR_STUDIO_BUILD_PYTHON to a full Python 3.11 executable.' }
    & $env:AIR_STUDIO_BUILD_PYTHON -m pip wheel --no-deps --cache-dir .cache/pip --wheel-dir .cache/android-wheels android_backup==0.2.0 micloud==0.6
    if ($LASTEXITCODE) { throw 'Pure Python wheel preparation failed' }
}
if (-not $SkipWebBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE) { throw 'Frontend build failed' }
}
& node node_modules/@capacitor/cli/bin/capacitor sync android
if ($LASTEXITCODE) { throw 'Capacitor sync failed' }
Push-Location android
try {
    & .\gradlew.bat --no-daemon --console=plain assembleDebug
    if ($LASTEXITCODE) { throw 'Android build failed' }
} finally { Pop-Location }
New-Item -ItemType Directory -Force artifacts | Out-Null
Copy-Item android/app/build/outputs/apk/debug/app-debug.apk artifacts/air-studio-debug.apk -Force
$apkHash = (Get-FileHash artifacts/air-studio-debug.apk -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content artifacts/air-studio-debug.apk.sha256 "$apkHash  air-studio-debug.apk" -Encoding ASCII
Write-Output 'Debug APK: artifacts/air-studio-debug.apk'
