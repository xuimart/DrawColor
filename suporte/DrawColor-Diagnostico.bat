@echo off
REM ====================================================================
REM  DrawColor - Coletor de Diagnostico
REM  Gera um arquivo .TXT com informacoes do sistema e do plugin.
REM  Basta dar DOIS CLIQUES neste arquivo.
REM  Depois envie o .TXT para: drawcolorsuporte@xuimart.com.br
REM ====================================================================
title DrawColor - Diagnostico
echo.
echo   ===================================================
echo     DrawColor - Coletando informacoes...
echo   ===================================================
echo.
echo     Aguarde alguns segundos.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DrawColor-Diagnostico.txt';" ^
  "if (-not (Test-Path (Split-Path $out))) { $out = Join-Path $env:USERPROFILE 'DrawColor-Diagnostico.txt' };" ^
  "$L = New-Object System.Collections.ArrayList;" ^
  "function A($t){ [void]$L.Add($t) };" ^
  "A '==== DrawColor - Diagnostico do Sistema ====';" ^
  "A ('Gerado em: ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'));" ^
  "A '';" ^
  "A '---- Windows ----';" ^
  "$os = Get-CimInstance Win32_OperatingSystem;" ^
  "A ('SO          : ' + $os.Caption);" ^
  "A ('Versao      : ' + $os.Version);" ^
  "A ('Arquitetura : ' + $os.OSArchitecture);" ^
  "A '';" ^
  "A '---- Photoshop instalado ----';" ^
  "$psDirs = Get-ChildItem 'C:\Program Files\Adobe' -Directory -Filter 'Adobe Photoshop*';" ^
  "if (-not $psDirs) { A '(nenhuma pasta Adobe Photoshop encontrada em C:\Program Files\Adobe)' };" ^
  "foreach ($d in $psDirs) {" ^
  "  A ('Pasta: ' + $d.Name);" ^
  "  $exe = Join-Path $d.FullName 'Photoshop.exe';" ^
  "  if (Test-Path $exe) { A ('   versao do Photoshop.exe: ' + (Get-Item $exe).VersionInfo.ProductVersion) }" ^
  "};" ^
  "A '';" ^
  "A '---- Extensao CEP do DrawColor ----';" ^
  "$ext = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.drawcolor.colorwheel';" ^
  "if (Test-Path $ext) {" ^
  "  A ('Instalada em: ' + $ext);" ^
  "  $mani = Join-Path $ext 'CSXS\manifest.xml';" ^
  "  if (Test-Path $mani) { (Select-String -Path $mani -Pattern 'ExtensionBundleVersion').Line | ForEach-Object { A ('   ' + $_.Trim()) } }" ^
  "  foreach ($f in 'js\i18n.js','js\main.js','js\layout.js','styles.css') {" ^
  "    $p = Join-Path $ext $f;" ^
  "    if (Test-Path $p) { A ('   [OK] ' + $f) } else { A ('   [FALTANDO] ' + $f) }" ^
  "  }" ^
  "} else { A ('(NAO instalada em ' + $ext + ')') };" ^
  "A '';" ^
  "A '---- PlayerDebugMode (CSXS) ----';" ^
  "foreach ($n in 6..16) {" ^
  "  $v = (Get-ItemProperty ('HKCU:\Software\Adobe\CSXS.' + $n) -Name PlayerDebugMode).PlayerDebugMode;" ^
  "  if ($v -ne $null) { A ('CSXS.' + $n + ' PlayerDebugMode = ' + $v) }" ^
  "};" ^
  "A '';" ^
  "A '---- Log interno do plugin (gerado ao abrir o painel) ----';" ^
  "$diag = Join-Path $env:USERPROFILE 'DrawColor-Diag\drawcolor-diagnostico.txt';" ^
  "if (Test-Path $diag) {" ^
  "  A ('(encontrado em ' + $diag + ')');" ^
  "  A '-----------------------------------------------------------';" ^
  "  Get-Content $diag | ForEach-Object { A $_ };" ^
  "  A '-----------------------------------------------------------';" ^
  "} else {" ^
  "  A 'NAO encontrado.';" ^
  "  A 'IMPORTANTE: abra o Photoshop e o painel DrawColor UMA VEZ,';" ^
  "  A 'feche o Photoshop e rode este arquivo novamente.';" ^
  "};" ^
  "A '';" ^
  "A '==== fim ====';" ^
  "Set-Content -Path $out -Value $L -Encoding UTF8;" ^
  "Write-Host '';" ^
  "Write-Host ('   Arquivo gerado em: ' + $out);" ^
  "Start-Process notepad $out"

echo.
echo   ===================================================
echo     PRONTO!
echo.
echo     Foi aberto o Bloco de Notas com o relatorio.
echo     Envie esse arquivo .TXT para:
echo        drawcolorsuporte@xuimart.com.br
echo   ===================================================
echo.
echo   Pressione qualquer tecla para fechar...
pause >nul
