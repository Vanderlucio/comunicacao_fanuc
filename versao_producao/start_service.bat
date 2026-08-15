@echo off
title Fanuc Industrial Server - Producao
cd /d "%~dp0"
echo =============================================================
echo   INICIANDO SERVIDOR FANUC FOCAS / CLP (VERSAO PRODUCAO)
echo =============================================================
node src/server.js
pause