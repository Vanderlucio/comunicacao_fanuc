@echo off
chcp 65001 > nul
title Node-RED Fanuc CNC - Desenvolvido por Vanderlucio Lopes
echo ========================================================
echo   🤖 Node-RED - Comunicacao Fanuc CNC ^& CLP (PMC)
echo   Desenvolvido por Vanderlucio Lopes
echo ========================================================
echo.

echo Verificando integridade dos modulos...
call node test\test_nodes.js
if %errorlevel% neq 0 (
    echo [ERRO] Falha nos testes unitarios. Verifique o ambiente.
    pause
    exit /b %errorlevel%
)

echo.
echo Iniciando Node-RED com os nos Fanuc carregados...
echo Para instalar permanentemente no seu Node-RED:
echo   cd %%USERPROFILE%%\.node-red
echo   npm install "%~dp0"
echo.

where npx >nul 2>nul
if %errorlevel% equ 0 (
    npx node-red --userDir "%~dp0.node-red-data"
) else (
    echo [AVISO] Node-RED global nao encontrado. Execute: npm install -g node-red
    pause
)
