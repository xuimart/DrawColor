<#
.SYNOPSIS
    Instala (ou remove) o plugin UXP do DrawColor no Photoshop.

.DESCRIPTION
    Copia dist/uxp para a pasta de plugins UXP do usuário. Espelha o que
    cep/install-cep.ps1 faz para o shell CEP, e existe pelo mesmo motivo: o
    Photoshop carrega uma CÓPIA INSTALADA, não os arquivos do repositório.
    Editar demo/ e rodar o build não muda nada no Photoshop até esta cópia
    acontecer — e foi assim que a instalação UXP ficou semanas atrás da CEP.

    Grava apenas em %APPDATA% — sem administrador, sem tocar na máquina inteira.

.PARAMETER Uninstall
    Remove a pasta instalada.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File uxp\install-uxp.ps1
    powershell -ExecutionPolicy Bypass -File uxp\install-uxp.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$PluginId = 'com.drawcolor.colorwheel'
$Root     = Join-Path $env:APPDATA 'Adobe\UXP\Plugins\External'
$Target   = Join-Path $Root $PluginId
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DistUxp  = Join-Path $RepoRoot 'dist\uxp'

function Write-Step($msg) { Write-Host "  $msg" }

if ($Uninstall) {
    Write-Host "Removendo o plugin UXP do DrawColor" -ForegroundColor Cyan
    if (Test-Path $Target) {
        Remove-Item $Target -Recurse -Force
        Write-Step "removido: $Target"
    } else {
        Write-Step "nada a remover em $Target"
    }
    Write-Host "Pronto." -ForegroundColor Green
    return
}

Write-Host "Instalando o plugin UXP do DrawColor" -ForegroundColor Cyan

# --- O build precisa existir ---------------------------------------------
if (-not (Test-Path (Join-Path $DistUxp 'manifest.json'))) {
    Write-Host "dist/uxp nao encontrado. Rode primeiro:" -ForegroundColor Red
    Write-Host "    npm run build:uxp" -ForegroundColor Yellow
    exit 1
}

# --- Backup da instalacao anterior ---------------------------------------
# Fora da pasta de plugins: o UXP varre esse diretorio, e um backup ali viraria
# um segundo plugin com o mesmo id competindo com a instalacao boa.
if (Test-Path $Target) {
    $backupRoot = Join-Path $env:LOCALAPPDATA 'DrawColor\uxp-backups'
    if (-not (Test-Path $backupRoot)) {
        New-Item -Path $backupRoot -ItemType Directory -Force | Out-Null
    }
    $backup = Join-Path $backupRoot "$PluginId-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Move-Item $Target $backup
    Write-Step "instalacao anterior movida para $backup"

    # Mantem so os 3 backups mais recentes.
    Get-ChildItem $backupRoot -Directory |
        Sort-Object Name -Descending |
        Select-Object -Skip 3 |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
}

if (-not (Test-Path $Root)) {
    New-Item -Path $Root -ItemType Directory -Force | Out-Null
}

Copy-Item $DistUxp $Target -Recurse -Force
$fileCount = (Get-ChildItem $Target -Recurse -File | Measure-Object).Count
Write-Step "copiados $fileCount arquivos para $Target"

Write-Host ""
Write-Host "Instalado." -ForegroundColor Green
Write-Host "Reinicie o Photoshop e abra em: Plugins > DrawColor Color Wheel"
Write-Host "Para remover: uxp\install-uxp.ps1 -Uninstall"
