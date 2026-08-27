# make_zip.ps1 - monta o payload do instalador do DrawColor.
#
# O extrator do instalador so reconhece o prefixo 'cep/'. Qualquer entrada fora
# desse prefixo e ignorada em silencio, por isso a contagem e validada no final.
# O DrawColor nao tem Generator: um unico prefixo.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root     = "e:\DrawColor"
$cepSrc   = Join-Path $root "dist\cep"
$buildDir = Join-Path $root "build_1.0.0"
$zipPath  = Join-Path $buildDir "drawcolor_plugin.zip"

if (-not (Test-Path $cepSrc)) {
    throw "Pasta de origem nao encontrada: $cepSrc  (rode 'npm run build:cep' antes)"
}
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$fs  = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-Tree {
    param($SourceDir, $Prefix, $Archive)
    $base = (Resolve-Path $SourceDir).Path.TrimEnd('\')
    $count = 0
    Get-ChildItem -Path $base -Recurse -File -Force | Where-Object {
        # Nao empacotar arquivos de teste do plugin (mantem node_modules intactos)
        -not ($_.Name -like '*.test.js' -and $_.FullName -notlike '*node_modules*')
    } | ForEach-Object {
        $rel = $_.FullName.Substring($base.Length + 1) -replace '\\', '/'
        $entryName = "$Prefix/$rel"
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $Archive, $_.FullName, $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $count++
    }
    return $count
}

$cepCount = Add-Tree -SourceDir $cepSrc -Prefix "cep" -Archive $zip

$zip.Dispose()
$fs.Dispose()

# Validacao: reabrir o zip e conferir que 100% das entradas usam o prefixo 'cep/'
$check   = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$total   = $check.Entries.Count
$badList = @($check.Entries | Where-Object { -not $_.FullName.StartsWith('cep/') })
$check.Dispose()

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Output "cep entries       : $cepCount"
Write-Output "total entries     : $total"
Write-Output "fora do prefixo   : $($badList.Count)"
Write-Output "zip size          : $sizeMB MB"
Write-Output "zip path          : $zipPath"

if ($cepCount -eq 0) { throw "ZIP vazio - nenhuma entrada 'cep/' foi adicionada." }
if ($badList.Count -gt 0) {
    $badList | ForEach-Object { Write-Output "  IGNORADA: $($_.FullName)" }
    throw "Existem entradas fora do prefixo 'cep/' - o instalador as ignoraria em silencio."
}
Write-Output "OK: todas as entradas estao sob 'cep/'."
