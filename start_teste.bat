@echo off
title Fanuc FOCAS - Versao Teste
cd /d "%~dp0versao_teste"

set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs"

echo =============================================================
echo   INICIANDO SERVIDOR FANUC FOCAS / CLP (VERSAO TESTE)
echo   IP CNC: 169.254.214.5 : 8193
echo =============================================================
echo.
echo Abrindo navegador em http://localhost:3000 ...
start "" http://localhost:3000
echo.
echo Servidor rodando... Mantenha esta janela aberta!
echo.
node src/server.js
if %errorlevel% neq 0 (
    echo.
    echo Ocorreu uma falha ao iniciar o servidor. Codigo: %errorlevel%
)
pause
