@echo off
setlocal
cd /d "%~dp0"
if exist ".venv311\Scripts\python.exe" (
  set "AIR_STUDIO_PYTHON=.venv311\Scripts\python.exe"
) else if exist ".venv\Scripts\python.exe" (
  set "AIR_STUDIO_PYTHON=.venv\Scripts\python.exe"
) else (
  echo Set up Python dependencies first. See README.md.
  exit /b 1
)
call npm.cmd --cache .cache/npm run build
if errorlevel 1 exit /b 1
echo Open http://127.0.0.1:8000 in your browser.
"%AIR_STUDIO_PYTHON%" -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
