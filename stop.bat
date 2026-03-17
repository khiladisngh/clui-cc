@echo off
:: Clui CC — Stop all running instances
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
