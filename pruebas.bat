@echo off
rem Ejecuta las pruebas funcionales (no requiere Node ni Python).
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pruebas.ps1"
echo.
pause
endlocal
