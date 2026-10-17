param([string]$Serial)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (Test-Path .cache/jdk) {
    $localJdk = Get-ChildItem .cache/jdk -Directory | Select-Object -First 1
    if ($localJdk) { $env:JAVA_HOME = $localJdk.FullName }
}
if (-not $env:ANDROID_HOME -and (Test-Path .cache/android-sdk)) { $env:ANDROID_HOME = (Resolve-Path .cache/android-sdk).Path }
if (-not $env:AIR_STUDIO_BUILD_PYTHON -and (Test-Path .venv/Scripts/python.exe)) { $env:AIR_STUDIO_BUILD_PYTHON = (Resolve-Path .venv/Scripts/python.exe).Path }
$env:GRADLE_USER_HOME = Join-Path (Get-Location) '.cache/gradle'
$env:ANDROID_USER_HOME = Join-Path (Get-Location) '.cache/android-user'
if (-not $env:ANDROID_HOME) { throw 'Set ANDROID_HOME to your Android SDK path.' }
$adb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$deviceOutput = & $adb devices
if ($LASTEXITCODE) { throw 'Unable to list Android devices.' }
$onlineDevices = @($deviceOutput | ForEach-Object {
    if ($_ -match '^([^\s]+)\s+device$') { $Matches[1] }
})
if ($Serial) {
    if ($Serial -notin $onlineDevices) { throw 'The selected device is not online. Unlock it and authorize USB debugging.' }
} elseif ($onlineDevices.Count -eq 1) {
    $Serial = $onlineDevices[0]
} else {
    throw 'Connect one authorized Android device, or pass -Serial to select an online device. No test was started.'
}
$env:ANDROID_SERIAL = $Serial
Write-Output "Testing Android device: $Serial"
& .\android\gradlew.bat -p android --no-daemon --console=plain :app:connectedDebugAndroidTest
if ($LASTEXITCODE) { throw 'Native runtime checks failed. Inspect android/app/build/reports/androidTests/connected/debug.' }
Write-Output 'Native imports, encrypted persistence, public credential exclusion and tamper rejection passed.'
Write-Output 'These tests use a separate temporary store and fake credentials. No purifier traffic was sent.'
