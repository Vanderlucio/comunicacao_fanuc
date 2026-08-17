@echo off
title Fanuc Industrial Server - Producao
cd /d "%~dp0"

set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%AppData%\npm;%LocalAppData%\Programs\node"

echo =============================================================
echo   FANUC INDUSTRIAL SERVER - VERSAO DE PRODUCAO
echo   IP CNC: 169.254.214.5 : 8193
echo =============================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema!
    echo Por favor, instale o Node.js em https://nodejs.org/ e tente novamente.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Instalando dependencias do Node.js...
    call npm install --no-audit --no-fund
)

echo.
echo Abrindo painel de controle no navegador...
start "" http://localhost:3000

echo.
echo Servidor de Producao rodando...
echo Pressione Ctrl+C para encerrar ou feche esta janela.
echo =============================================================
echo.

node src/server.js
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Servidor encerrou com codigo: %errorlevel%
)
pause
