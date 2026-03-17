@echo off
:: Clui CC — Windows launcher
:: Double-click this file or run from Command Prompt.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
if errorlevel 1 pause
