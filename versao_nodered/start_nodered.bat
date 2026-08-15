@echo off
title Fanuc Node-RED Industrial Bridge
cd /d "%~dp0"
echo =============================================================
echo   INICIANDO INTEGRACAO NODE-RED FANUC FOCAS / OPC UA
echo   Interface do Node-RED: http://localhost:1880
echo   Dashboard UI:          http://localhost:1880/ui
echo =============================================================
npx -y node-red -s settings.js -u . flows.json
pause
