@echo off
setlocal
cd /d "%~dp0..\.."
set "RUNNER=%~dp0run.py"
set "PYTHON=%CD%\.venv\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo [FAIL] Project .venv\Scripts\python.exe was not found.
  echo Create a local virtual environment before running automated tests.
  set "RESULT=2"
  goto done
)
"%PYTHON%" "%RUNNER%"
set "RESULT=%ERRORLEVEL%"
:done
echo.
if "%RESULT%"=="0" (
  echo All PR #19 checks passed.
) else (
  echo PR #19 verification did not pass. Read the messages above.
)
if /I not "%~1"=="--no-pause" pause
exit /b %RESULT%
