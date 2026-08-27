# Guia Completo — Sistema de Update e Geração de .EXE para Plugins CEP

Este documento descreve como implementar do zero o sistema de auto-atualização e build de installer usado no DrawlapsePS, adaptável para qualquer outro plugin Adobe CEP.

---

## Visão Geral da Arquitetura

```
[Plugin rodando no Photoshop]
        |
        | (checa periodicamente)
        v
[version.json no servidor] ─── versão nova? ───> [Mostra banner de update]
        |                                                    |
        |                                          (usuário clica)
        v                                                    v
[GitHub Releases]  <──────────────────────── [Download do .EXE installer]
        |
        | (contém)
        v
[DrawlapsePS_Setup.exe]
        |
        | (embutido como recurso)
        v
[plugin.zip] ──> extrai cep/ + generator/ para as pastas do Adobe
```

---

## 1. Estrutura de Pastas do Projeto

```
meu-plugin/
├── com.meuplugin.cep/          # Plugin CEP (painel)
│   ├── CSXS/manifest.xml
│   ├── js/
│   │   ├── panel.js            # Contém PLUGIN_VERSION e lógica de check update
│   │   ├── export.cjs          # Worker (se aplicável)
│   │   └── ...
│   ├── index.html
│   ├── index.css
│   ├── ffmpeg/                 # Binários (se aplicável)
│   ├── node_modules/           # Dependências
│   └── package.json
├── com.meuplugin.generator/    # Generator plugin (se aplicável)
│   ├── src/
│   ├── node_modules/
│   └── package.json
├── build_X.Y.Z/               # Pasta de build por versão
│   ├── make_zip.ps1
│   ├── build_installer.ps1
│   ├── MeuPluginInstaller.cs
│   ├── installer_icon.ico
│   ├── meuplugin.zip           # Gerado pelo make_zip.ps1
│   ├── MeuPlugin_Setup.exe     # Gerado pelo build_installer.ps1
│   └── notas.md
└── version.json                # Referência local (o real fica no servidor)
```

---

## 2. GitHub — Configuração do Repositório

### Criar repositório
```bash
gh repo create meu-usuario/meu-plugin --public --description "Meu Plugin para Adobe Photoshop"
```

### Convenção de releases
- Tags: `v{MAJOR}.{MINOR}.{PATCH}` (ex: `v1.0.0`, `v1.0.1`, `v1.1.0`)
- Cada release contém UM asset: `MeuPlugin_Setup.exe`
- URL permanente para download da última versão:
  ```
  https://github.com/meu-usuario/meu-plugin/releases/latest/download/MeuPlugin_Setup.exe
  ```

### Criar uma release
```bash
gh release create v1.0.0 "build_1.0.0/MeuPlugin_Setup.exe" \
  --repo meu-usuario/meu-plugin \
  --title "MeuPlugin v1.0.0" \
  --notes "Release inicial"
```

### Atualizar uma release (corrigir asset)
```bash
gh release delete v1.0.0 --repo meu-usuario/meu-plugin --yes
gh release create v1.0.0 "build_1.0.0/MeuPlugin_Setup.exe" \
  --repo meu-usuario/meu-plugin \
  --title "MeuPlugin v1.0.0" \
  --notes "Release corrigida"
```

---

## 3. version.json — Auto-Atualização

### Formato do arquivo

```json
{
  "version": "1.0.0",
  "downloadUrl": "https://github.com/meu-usuario/meu-plugin/releases/latest/download/MeuPlugin_Setup.exe",
  "changelog": "Descrição curta das mudanças desta versão"
}
```

### Onde hospedar

Opções (em ordem de praticidade):
1. **Servidor próprio via FTP/FileZilla** — ex: `https://meusite.com.br/meuplugin/version.json`
2. **GitHub Pages** — branch `gh-pages` com o arquivo na raiz
3. **Raw GitHub** — `https://raw.githubusercontent.com/meu-usuario/meu-plugin/main/version.json`

O importante é que a URL seja pública, retorne JSON puro e não mude.

### Quando atualizar

Após confirmar que a release no GitHub está correta (asset uploaded, tamanho OK), atualize o `version.json` no servidor. Só nesse momento os usuários verão a notificação.

---

## 4. Lógica de Check Update no Plugin (JavaScript)

Adicione no `panel.js` (ou equivalente) do plugin CEP:

```javascript
var PLUGIN_VERSION = '1.0.0';
var UPDATE_CHECK_URL = 'https://meusite.com.br/meuplugin/version.json';

function checkForUpdate(showIfCurrent) {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', UPDATE_CHECK_URL + '?t=' + Date.now(), true);
        xhr.timeout = 8000;
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.version && compareVersions(data.version, PLUGIN_VERSION) > 0) {
                        showUpdateBanner(data);
                    } else if (showIfCurrent) {
                        showInfo('Você já está na versão mais recente (' + PLUGIN_VERSION + ')');
                    }
                } catch(e) {}
            }
        };
        xhr.send();
    } catch(e) {}
}

// Compara versões semver: retorna 1 se a > b, -1 se a < b, 0 se iguais
function compareVersions(a, b) {
    var pa = a.split('.').map(Number);
    var pb = b.split('.').map(Number);
    for (var i = 0; i < 3; i++) {
        var na = pa[i] || 0;
        var nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

function showUpdateBanner(data) {
    // Exemplo: cria um banner no topo do painel
    var banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = 'background:#de2246;color:#fff;padding:10px;text-align:center;cursor:pointer;border-radius:6px;margin:8px;';
    banner.innerHTML = 'Nova versão disponível: <strong>v' + data.version + '</strong> — Clique para baixar';
    banner.onclick = function() {
        // Abre o link de download no navegador padrão
        if (window.cep && window.cep.util) {
            window.cep.util.openURLInDefaultBrowser(data.downloadUrl);
        } else {
            window.open(data.downloadUrl);
        }
    };
    document.body.insertBefore(banner, document.body.firstChild);
}

// Checar ao iniciar (com delay para não bloquear carregamento)
setTimeout(function() { checkForUpdate(false); }, 5000);
```

---

## 5. make_zip.ps1 — Geração do ZIP

```powershell
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root    = "E:\caminho\para\meu-plugin"
$cepSrc  = Join-Path $root "com.meuplugin.cep"
$genSrc  = Join-Path $root "com.meuplugin.generator"  # Remover se não tiver generator
$zipPath = Join-Path $root "build_1.0.0\meuplugin.zip"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$fs  = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-Tree {
    param($SourceDir, $Prefix, $Archive)
    $base = (Resolve-Path $SourceDir).Path.TrimEnd('\')
    $count = 0
    Get-ChildItem -Path $base -Recurse -File -Force | ForEach-Object {
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

# Se tiver generator, descomente:
# $genCount = Add-Tree -SourceDir $genSrc -Prefix "generator" -Archive $zip

$zip.Dispose()
$fs.Dispose()

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Output "cep entries : $cepCount"
# Write-Output "generator entries : $genCount"
Write-Output "zip size    : $sizeMB MB"
Write-Output "zip path    : $zipPath"
```

### IMPORTANTE — Estrutura interna do ZIP:
```
meuplugin.zip
├── cep/
│   ├── CSXS/manifest.xml
│   ├── js/panel.js
│   ├── index.html
│   ├── ...
└── generator/          (opcional)
    ├── src/
    └── ...
```

O installer espera essas pastas raiz (`cep/`, `generator/`). Se o ZIP não tiver essa estrutura, a instalação vai falhar silenciosamente.

---

## 6. build_installer.ps1 — Compilação do EXE

```powershell
$ErrorActionPreference = 'Stop'
$csc      = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$buildDir = "E:\caminho\para\meu-plugin\build_1.0.0"
$outFile  = "$buildDir\MeuPlugin_Setup.exe"

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$cmdArgs = "/target:winexe /platform:anycpu /optimize+ " +
    "/win32icon:`"$buildDir\installer_icon.ico`" " +
    "/out:`"$outFile`" " +
    "/resource:`"$buildDir\meuplugin.zip`",meuplugin.zip " +
    "/r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll " +
    "/r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll " +
    "/r:Microsoft.CSharp.dll " +
    "`"$buildDir\MeuPluginInstaller.cs`""

$p = Start-Process -FilePath $csc -ArgumentList $cmdArgs -Wait -NoNewWindow -PassThru `
        -RedirectStandardOutput "$buildDir\_csc_out.txt" `
        -RedirectStandardError  "$buildDir\_csc_err.txt"

$report = @()
$report += "csc exit code: $($p.ExitCode)"
$report += ""
$report += "--- stdout ---"
$report += (Get-Content "$buildDir\_csc_out.txt" -ErrorAction SilentlyContinue)
$report += "--- stderr ---"
$report += (Get-Content "$buildDir\_csc_err.txt" -ErrorAction SilentlyContinue)
$report += ""
if (Test-Path $outFile) {
    $f = Get-Item $outFile
    $report += ("BUILT: {0}  ({1:N2} MB)" -f $f.Name, ($f.Length/1MB))
    $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($outFile)
    $report += "FileVersion    : $($vi.FileVersion)"
    $report += "ProductVersion : $($vi.ProductVersion)"
} else {
    $report += "BUILD FAILED - exe not produced"
}
$report | Out-File "$buildDir\_build.txt" -Encoding UTF8
```

### Como funciona
- O `csc.exe` compila o C# em um `.exe` Windows Forms
- O ZIP é embutido no EXE via `/resource:` — o installer extrai em runtime
- Não precisa de Visual Studio, apenas .NET Framework 4.x (já vem no Windows)

---

## 7. MeuPluginInstaller.cs — Esqueleto do Installer

O installer é um Windows Forms app em C# que:
1. Extrai o ZIP embutido para uma pasta temporária
2. Copia `cep/` para as pastas de extensões do Adobe
3. Copia `generator/` para a pasta de plugins do Photoshop (se aplicável)
4. Mostra progresso e changelog

### Pontos essenciais no .cs:

```csharp
using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyVersion("1.0.0.0")]

// Para extrair o ZIP embutido:
Stream zipStream = Assembly.GetExecutingAssembly()
    .GetManifestResourceStream("meuplugin.zip");

// Pastas destino para extensões CEP:
string[] cepTargets = {
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Adobe", "CEP", "extensions", "com.meuplugin.cep"),
    @"C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.meuplugin.cep",
    @"C:\Program Files\Common Files\Adobe\CEP\extensions\com.meuplugin.cep"
};

// Pastas destino para Generator (opcional):
string[] genTargets = {
    @"C:\Program Files\Adobe\Adobe Photoshop 2025\Plug-ins\Generator\com.meuplugin.generator",
    @"C:\Program Files\Adobe\Adobe Photoshop 2026\Plug-ins\Generator\com.meuplugin.generator"
};
```

Use o `DrawlapseInstaller.cs` existente como base completa — ele já tem:
- UI dark mode estilizada
- Barra de progresso
- Detecção automática das pastas do Photoshop instalado
- Diálogo de changelog
- Tratamento de erros
- Elevação de admin quando necessário

---

## 8. Checklist de Release (Copie e use)

```
[ ] Bumpar versão em panel.js (PLUGIN_VERSION)
[ ] Atualizar versão no .cs (AssemblyVersion, título, changelog, labels)
[ ] Rodar make_zip.ps1
[ ] Verificar tamanho do ZIP (deve bater com o esperado)
[ ] Rodar build_installer.ps1
[ ] Verificar tamanho do EXE (deve bater com o esperado)
[ ] Verificar FileVersion no _build.txt
[ ] Criar release: gh release create vX.Y.Z Setup.exe --repo user/repo
[ ] Confirmar upload: gh release view vX.Y.Z --repo user/repo
[ ] Atualizar version.json no servidor (FileZilla)
[ ] Testar: abrir plugin → deve mostrar banner de update
```

---

## 9. Troubleshooting

| Problema | Causa | Solução |
|---|---|---|
| EXE muito pequeno | ZIP não incluiu generator ou ffmpeg | Verificar make_zip.ps1, conferir tamanho |
| Update não aparece no plugin | version.json não atualizado ou URL errada | Testar URL no browser, verificar CORS |
| Installer não extrai | Nome do resource não bate | `/resource:"zip",meuplugin.zip` — o nome após a vírgula deve bater com `GetManifestResourceStream` |
| csc.exe não encontrado | Path errado | Usar `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` |
| Installer pede admin | Pastas em Program Files são protegidas | Normal — o installer deve solicitar elevação |
| Release com asset errado | Subiu antes de rebuildar | Deletar release (`gh release delete`) e recriar |

---

## 10. Resumo Rápido

```
make_zip.ps1          →  gera o ZIP com cep/ + generator/
build_installer.ps1   →  compila .cs + ZIP em um .exe standalone
gh release create     →  publica o .exe no GitHub
version.json          →  atualizar no servidor para notificar usuários
```

O fluxo é 100% offline e sem CI/CD. Tudo roda local via PowerShell + csc.exe + gh CLI.
