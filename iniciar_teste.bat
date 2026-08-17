@echo off
title Fanuc FOCAS - Versao Teste
cd /d "%~dp0versao_teste"

set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs"

:MENU
cls
echo =============================================================
echo   FANUC FOCAS / CLP (PMC) - VERSAO DE TESTES
echo   IP CNC: 169.254.214.5 : 8193
echo =============================================================
echo.
echo   [1] Iniciar Dashboard Web (http://localhost:3000)
echo   [2] Iniciar Console Interativo (CLI)
echo   [3] Executar Teste e Diagnostico de Comunicacao
echo   [4] Instalar / Atualizar Dependencias (npm install)
echo   [5] Sair
echo.
echo =============================================================
set /p OPTION="Digite a opcao [1-5] (Enter para 1): "
if "%OPTION%"=="" set OPTION=1
if "%OPTION%"=="1" goto START_SERVER
if "%OPTION%"=="2" goto START_CLI
if "%OPTION%"=="3" goto START_TEST
if "%OPTION%"=="4" goto INSTALL_DEPS
if "%OPTION%"=="5" goto END

echo Opcao invalida.
pause
goto MENU

:START_SERVER
cls
echo =============================================================
echo   INICIANDO SERVIDOR WEB E DASHBOARD FANUC FOCAS
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
    echo O servidor foi finalizado ou ocorreu um erro.
)
pause
goto MENU

:START_CLI
cls
echo =============================================================
echo   INICIANDO CONSOLE INTERATIVO (CLI)
echo =============================================================
echo.
node src/cli.js
pause
goto MENU

:START_TEST
cls
echo =============================================================
echo   EXECUTANDO TESTE DE COMUNICACAO COM CNC
echo =============================================================
echo.
node src/test_communication.js
pause
goto MENU

:INSTALL_DEPS
cls
echo =============================================================
echo   INSTALANDO DEPENDENCIAS DO PROJETO
echo =============================================================
echo.
call npm install
echo Concluido!
pause
goto MENU

:END
exit /b 0
