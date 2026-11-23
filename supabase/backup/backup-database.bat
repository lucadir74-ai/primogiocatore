@echo off
rem Primo Giocatore - copia di sicurezza del database (doppio clic)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-database.ps1"
echo.
pause
