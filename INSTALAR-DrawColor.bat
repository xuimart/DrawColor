@echo off
chcp 65001 >nul
title DrawColor Wheel - Instalador
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   DrawColor Wheel - Instalador v1.0.0   ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Este instalador vai copiar o DrawColor para
echo  o Photoshop (21 a 27+).
echo.
echo  O Photoshop deve estar FECHADO.
echo.
pause

:: Detectar diretório do script
set "SCRIPT_DIR=%~dp0"
set "DIST_CEP=%SCRIPT_DIR%dist\cep"
set "BUNDLE_ID=com.drawcolor.colorwheel"
set "EXT_ROOT=%APPDATA%\Adobe\CEP\extensions"
set "TARGET=%EXT_ROOT%\%BUNDLE_ID%"

:: Verificar se o dist/cep existe
if not exist "%DIST_CEP%\CSXS\manifest.xml" (
    echo.
    echo  [ERRO] Arquivos do plugin nao encontrados em dist\cep
    echo  Execute "npm run build:cep" primeiro.
    echo.
    pause
    exit /b 1
)

:: Habilitar PlayerDebugMode (CSXS 6 a 16)
echo.
echo  [1/3] Habilitando PlayerDebugMode...
for /l %%n in (6,1,16) do (
    reg add "HKCU\Software\Adobe\CSXS.%%n" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)
echo        OK

:: Criar pasta de extensões se não existir
if not exist "%EXT_ROOT%" mkdir "%EXT_ROOT%"

:: Remover instalação anterior
if exist "%TARGET%" (
    echo  [2/3] Removendo versao anterior...
    rmdir /s /q "%TARGET%"
    echo        OK
) else (
    echo  [2/3] Nenhuma versao anterior encontrada.
)

:: Copiar nova versão
echo  [3/3] Instalando DrawColor Wheel...
xcopy "%DIST_CEP%" "%TARGET%" /e /i /q /y >nul
echo        OK

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         Instalacao concluida!            ║
echo  ╠══════════════════════════════════════════╣
echo  ║  Abra o Photoshop e va em:              ║
echo  ║  Janela ^> Extensoes ^> DrawColor Wheel   ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
