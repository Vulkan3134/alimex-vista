@echo off
rem Inicia la plataforma en modo local (datos ficticios de demostracion).
rem Abre el servidor local y el navegador. Para salir, cierre esta ventana o use Ctrl + C.
setlocal
cd /d "%~dp0"
title Plataforma de inventario - servidor local
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 pause
endlocal
