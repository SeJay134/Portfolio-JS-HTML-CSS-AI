@echo off
setlocal
cd /d "%~dp0..\.."
set "PYTHON=%CD%\.venv\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo [FAIL] Project .venv Python is missing.
  echo Please use the existing local virtual environment.
  set "RESULT=2"
  goto done
)
"%PYTHON%" "%~dp0run.py"
set "RESULT=%ERRORLEVEL%"
:done
echo.
if "%RESULT%"=="0" (echo PR16 deterministic baseline passed.) else (echo PR16 failed or needs review. See local report.)
if /I not "%~1"=="--no-pause" pause
exit /b %RESULT%
