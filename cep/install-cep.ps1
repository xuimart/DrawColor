<#
.SYNOPSIS
    Instala (ou remove) a extensão CEP do DrawColor no Photoshop 21+.

.DESCRIPTION
    Faz duas coisas, ambas reversíveis:

    1. Liga PlayerDebugMode nas chaves CSXS do usuário (CSXS.6 a CSXS.16).
       Sem isso o Photoshop recusa extensões não assinadas.
    2. Copia dist/cep para a pasta de extensões CEP do usuário.

    Grava em HKEY_CURRENT_USER e em %APPDATA% — nada de máquina inteira, nada
    que exija administrador.

    Funciona no Photoshop 21 a 26+ (CEP continua operacional via legado).

.PARAMETER Uninstall
    Remove a extensão copiada. Não desliga PlayerDebugMode, porque outras
    extensões em desenvolvimento podem depender dele.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File cep\install-cep.ps1
    powershell -ExecutionPolicy Bypass -File cep\install-cep.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$BundleId  = 'com.drawcolor.colorwheel'
$ExtRoot   = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$Target    = Join-Path $ExtRoot $BundleId
$RepoRoot  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DistCep   = Join-Path $RepoRoot 'dist\cep'

function Write-Step($msg) { Write-Host "  $msg" }

if ($Uninstall) {
    Write-Host "Removendo a extensao CEP do DrawColor" -ForegroundColor Cyan
    if (Test-Path $Target) {
        Remove-Item $Target -Recurse -Force
        Write-Step "removido: $Target"
    } else {
        Write-Step "nada a remover em $Target"
    }
    Write-Host "Pronto. PlayerDebugMode foi deixado como estava, de proposito." -ForegroundColor Green
    return
}

Write-Host "Instalando a extensao CEP do DrawColor" -ForegroundColor Cyan

# --- 0. O build precisa existir -------------------------------------------
if (-not (Test-Path (Join-Path $DistCep 'CSXS\manifest.xml'))) {
    Write-Host "dist/cep nao encontrado. Rode primeiro:" -ForegroundColor Red
    Write-Host "    npm run build:cep" -ForegroundColor Yellow
    exit 1
}

# --- 1. Detecta Photoshop instalado ----------------------------------------
$compat = @()
Get-ChildItem 'C:\Program Files\Adobe' -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'Adobe Photoshop*' } |
    ForEach-Object {
        $exe = Join-Path $_.FullName 'Photoshop.exe'
        if (Test-Path $exe) {
            $ver = [version]((Get-Item $exe).VersionInfo.ProductVersion -split ' ')[0]
            if ($ver.Major -ge 21) { $compat += "$($_.Name) ($ver)" }
        }
    }

if ($compat.Count -eq 0) {
    Write-Host ""
    Write-Host "AVISO: nenhum Photoshop 21+ encontrado nesta maquina." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Step "Photoshop detectado: $($compat -join ', ')"
}

# --- 2. PlayerDebugMode ---------------------------------------------------
# Cobre CSXS.6 a CSXS.16 para garantir compatibilidade com todas as versoes.
$csxsVersions = 6..16
foreach ($n in $csxsVersions) {
    $key = "HKCU:\Software\Adobe\CSXS.$n"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    $current = (Get-ItemProperty -Path $key -Name 'PlayerDebugMode' -ErrorAction SilentlyContinue).PlayerDebugMode
    if ($current -ne '1') {
        Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
        Write-Step "PlayerDebugMode ligado em CSXS.$n"
    } else {
        Write-Step "PlayerDebugMode ja estava ligado em CSXS.$n"
    }
}

# --- 3. Copia a extensao -------------------------------------------------
if (-not (Test-Path $ExtRoot)) {
    New-Item -Path $ExtRoot -ItemType Directory -Force | Out-Null
}

# O backup vai para FORA de Adobe\CEP\extensions. Dentro dali o CEP varre
# toda subpasta, e cada backup viraria um bundle com o mesmo ExtensionBundleId
# competindo com a instalacao boa.
if (Test-Path $Target) {
    $backupRoot = Join-Path $env:LOCALAPPDATA 'DrawColor\cep-backups'
    if (-not (Test-Path $backupRoot)) {
        New-Item -Path $backupRoot -ItemType Directory -Force | Out-Null
    }
    $backup = Join-Path $backupRoot "$BundleId-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Move-Item $Target $backup
    Write-Step "instalacao anterior movida para $backup"

    # Mantem so os 3 backups mais recentes.
    Get-ChildItem $backupRoot -Directory |
        Sort-Object Name -Descending |
        Select-Object -Skip 3 |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
}

# Limpa backups de versoes antigas do instalador, que ficavam na pasta errada.
Get-ChildItem $ExtRoot -Directory -Filter "$BundleId.bak-*" -ErrorAction SilentlyContinue |
    ForEach-Object {
        Remove-Item $_.FullName -Recurse -Force
        Write-Step "backup antigo removido de dentro do CEP: $($_.Name)"
    }

Copy-Item $DistCep $Target -Recurse -Force
$fileCount = (Get-ChildItem $Target -Recurse -File | Measure-Object).Count
Write-Step "copiados $fileCount arquivos para $Target"

Write-Host ""
Write-Host "Instalado." -ForegroundColor Green
Write-Host "Reinicie o Photoshop e abra: Janela > Extensoes > DrawColor Wheel"
Write-Host "Para remover: cep\install-cep.ps1 -Uninstall"
