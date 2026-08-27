# Guia Completo — Instalador .EXE + Sistema de Updates (Adobe CEP Plugins)

Documento de referência baseado no sistema real do DrawlapsePS (v5.2.14). Serve para replicar o mesmo mecanismo em qualquer outro plugin CEP para Adobe Photoshop.

Contém:
1. Como o instalador funciona (detalhado, baseado no código atual)
2. Como o ZIP é montado e embutido no EXE
3. Como o sistema de auto-update funciona
4. Como adaptar tudo para um novo plugin

---

## Parte 1 — Anatomia do Instalador

O instalador é um **executável Windows Forms escrito em C#**, compilado com o `csc.exe` do .NET Framework (não precisa de Visual Studio). O ZIP do plugin é **embutido dentro do próprio .exe** como recurso incorporado, então o installer é 100% autossuficiente — um único arquivo que o usuário baixa e roda.

### 1.1 Fluxo de execução

```
Usuário roda o .exe
   │
   ├─ 1. Verifica se é Administrador
   │      └─ Se não for: reexecuta a si mesmo com "runas" (UAC eleva)
   │
   ├─ 2. Abre a janela (Windows Forms, tema dark)
   │
   ├─ 3. Detecta instalações do Photoshop
   │      ├─ Varre Program Files / Program Files (x86) por "Adobe Photoshop*"
   │      ├─ Varre o Registro do Windows (HKLM\SOFTWARE\Adobe\Photoshop)
   │      └─ Remove duplicatas por caminho
   │
   ├─ 4. Usuário seleciona quais versões instalar (checklist)
   │
   ├─ 5. Ao clicar em Instalar (em background thread):
   │      ├─ Extrai o ZIP embutido para %TEMP%
   │      ├─ Habilita PlayerDebugMode no Registro (CSXS 6–15)
   │      ├─ Copia cep/  → pastas de extensões CEP
   │      ├─ Copia generator/ → pasta Plug-ins/Generator do Photoshop
   │      └─ Reporta progresso e log
   │
   └─ 6. Mostra changelog + instruções finais
```

### 1.2 Auto-elevação para Administrador

As pastas de destino ficam em `Program Files`, que exigem permissão de admin. O installer se auto-eleva:

```csharp
static void Main()
{
    if (!IsAdministrator())
    {
        var proc = new ProcessStartInfo {
            UseShellExecute = true,
            FileName = Application.ExecutablePath,
            Verb = "runas"        // dispara o prompt UAC
        };
        Process.Start(proc);
        return;                    // fecha a instância não-elevada
    }
    Application.EnableVisualStyles();
    Application.Run(new InstallerForm());
}

static bool IsAdministrator()
{
    var identity = WindowsIdentity.GetCurrent();
    var principal = new WindowsPrincipal(identity);
    return principal.IsInRole(WindowsBuiltInRole.Administrator);
}
```

### 1.3 Detecção do Photoshop (dupla estratégia)

**Estratégia A — Varredura de Program Files:**
```csharp
string[] programDirs = {
    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
};
// procura pastas "Adobe" → dentro delas "Adobe Photoshop*"
```

**Estratégia B — Registro do Windows** (pega instalações em locais não-padrão):
```csharp
ScanRegistry(@"SOFTWARE\Adobe\Photoshop", RegistryView.Registry64);
ScanRegistry(@"SOFTWARE\Adobe\Photoshop", RegistryView.Registry32);
// Lê ApplicationPath / Path / InstallPath de cada subchave de versão
```

Depois **deduplica** por caminho (case-insensitive):
```csharp
foundInstalls = foundInstalls
    .GroupBy(i => i.BasePath.ToLowerInvariant())
    .Select(g => g.First())
    .ToList();
```

Para cada instalação encontrada, calcula os caminhos-alvo:
```csharp
var genPath = Path.Combine(psDir, "Plug-ins", "Generator");
var cepPath = Path.Combine(psDir, "Required", "CEP", "extensions");
```

### 1.4 O ZIP embutido — como é lido

O ZIP é carregado como **manifest resource** do próprio assembly. O nome do recurso DEVE bater com o usado na compilação (`/resource:arquivo.zip,NOME`):

```csharp
const string RESOURCE_NAME = "drawlapseps_plugin.zip";

var asm = Assembly.GetExecutingAssembly();
Stream stream = asm.GetManifestResourceStream(RESOURCE_NAME);

// Fallback: se o nome exato não bater, procura qualquer recurso .zip
if (stream == null) {
    foreach (var resName in asm.GetManifestResourceNames()) {
        if (resName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) {
            stream = asm.GetManifestResourceStream(resName);
            break;
        }
    }
}

// Extrai para %TEMP%
var tmpPath = Path.Combine(Path.GetTempPath(), "drawlapseps_plugin_install.zip");
using (var fs = File.Create(tmpPath)) stream.CopyTo(fs);
```

**Fallback secundário:** se não houver recurso embutido, procura um `.zip` solto na mesma pasta do .exe. Isso permite testar sem recompilar.

### 1.5 Extração e cópia

O installer lê o ZIP e separa as entradas por prefixo (`cep/` vs `generator/`):

```csharp
using (var archive = ZipFile.OpenRead(zipPath))
{
    foreach (var entry in archive.Entries)
    {
        var entryName = entry.FullName;
        if (entryName.EndsWith("/")) continue;   // pula pastas

        if (entryName.StartsWith("generator/")) {
            string sub = entryName.Substring("generator/".Length);
            string destPath = Path.Combine(genDest, sub);
            // cria diretório e extrai
        }
        else if (entryName.StartsWith("cep/")) {
            // extrai para cada alvo CEP
        }
    }
}
```

**Alvos CEP** (o plugin é copiado para TODOS estes locais para máxima compatibilidade):
```
%APPDATA%\Adobe\CEP\extensions\com.drawlapseps.cep
C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.drawlapseps.cep
C:\Program Files\Common Files\Adobe\CEP\extensions\com.drawlapseps.cep
<cada Photoshop>\Required\CEP\extensions\com.drawlapseps.cep
```

**Alvo Generator:**
```
<cada Photoshop>\Plug-ins\Generator\com.drawlapseps.generator
```

### 1.6 PlayerDebugMode (crítico para extensões não-assinadas)

Extensões CEP precisam de assinatura da Adobe OU do modo debug ativado. O installer ativa o `PlayerDebugMode` para todas as versões CSXS conhecidas:

```csharp
string[] csxsVersions = { "6","7","8","9","9.4","10","11","12","13","14","15" };
foreach (var ver in csxsVersions)
{
    string relKey = @"Software\Adobe\CSXS." + ver;
    // Escreve em HKCU, HKLM e WOW6432Node
    Registry.CurrentUser.CreateSubKey(relKey).SetValue("PlayerDebugMode","1",RegistryValueKind.String);
    Registry.LocalMachine.CreateSubKey(relKey).SetValue("PlayerDebugMode","1",RegistryValueKind.String);
    Registry.LocalMachine.CreateSubKey(@"Software\WOW6432Node\Adobe\CSXS."+ver).SetValue("PlayerDebugMode","1",RegistryValueKind.String);
}
```

> Se a sua extensão for **assinada** (via ZXPSignCmd), você pode omitir esse passo. Sem assinatura, ele é obrigatório para o painel aparecer.

### 1.7 Backup e restauração

Antes de sobrescrever, o installer faz backup da instalação anterior em uma pasta com timestamp, e oferece um botão de restaurar. Copia `generator/` e `cep/` para `backup/{timestamp}/`.

### 1.8 Metadados de versão do .exe

```csharp
[assembly: AssemblyTitle("DrawlapsePS Installer")]
[assembly: AssemblyDescription("Instalador do Plugin DrawlapsePS para Adobe Photoshop")]
[assembly: AssemblyVersion("5.2.14.0")]
```

Isso define o `FileVersion`/`ProductVersion` visíveis nas propriedades do .exe. **Sempre atualize antes de buildar.**

---

## Parte 2 — Montagem do ZIP e Build do EXE

### 2.1 Estrutura obrigatória do ZIP

```
plugin.zip
├── cep/               ← conteúdo de com.<plugin>.cep
│   ├── CSXS/manifest.xml
│   ├── js/panel.js
│   ├── index.html / index.css
│   ├── ffmpeg/ (se aplicável)
│   └── node_modules/
└── generator/         ← conteúdo de com.<plugin>.generator (se houver)
    ├── src/
    └── node_modules/
```

> ⚠️ **REGRA DE OURO:** o ZIP precisa dos prefixos `cep/` e `generator/`. Se você zipar só a pasta do CEP sem esses prefixos, o installer não encontra nada para instalar. E se esquecer o `generator/`, o EXE fica ~19 MB menor e o plugin não funciona.

### 2.2 make_zip.ps1

```powershell
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root    = "E:\caminho\meu-plugin"
$cepSrc  = Join-Path $root "com.meuplugin.cep"
$genSrc  = Join-Path $root "com.meuplugin.generator"   # remova se não tiver generator
$zipPath = Join-Path $root "build_1.0.0\meuplugin.zip"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$fs  = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-Tree {
    param($SourceDir, $Prefix, $Archive)
    $base = (Resolve-Path $SourceDir).Path.TrimEnd('\')
    $count = 0
    Get-ChildItem -Path $base -Recurse -File -Force | Where-Object {
        -not ($_.Name -like '*.test.js' -and $_.FullName -notlike '*node_modules*')
    } | ForEach-Object {
        $rel = $_.FullName.Substring($base.Length + 1) -replace '\\', '/'
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $Archive, $_.FullName, "$Prefix/$rel",
            [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $count++
    }
    return $count
}

$cepCount = Add-Tree -SourceDir $cepSrc -Prefix "cep" -Archive $zip
$genCount = Add-Tree -SourceDir $genSrc -Prefix "generator" -Archive $zip   # remova se não tiver

$zip.Dispose(); $fs.Dispose()
$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Output "cep entries       : $cepCount"
Write-Output "generator entries : $genCount"
Write-Output "zip size          : $sizeMB MB"
```

### 2.3 build_installer.ps1

```powershell
$ErrorActionPreference = 'Stop'
$csc      = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$buildDir = "E:\caminho\meu-plugin\build_1.0.0"
$outFile  = "$buildDir\MeuPlugin_Setup.exe"

if (Test-Path $outFile) { Remove-Item $outFile -Force }

$cmdArgs = "/target:winexe /platform:anycpu /optimize+ " +
    "/win32icon:`"$buildDir\installer_icon.ico`" " +
    "/out:`"$outFile`" " +
    "/resource:`"$buildDir\meuplugin.zip`",meuplugin.zip " +   # nome após vírgula = RESOURCE_NAME no .cs
    "/r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll " +
    "/r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll " +
    "/r:Microsoft.CSharp.dll " +
    "`"$buildDir\MeuPluginInstaller.cs`""

Start-Process -FilePath $csc -ArgumentList $cmdArgs -Wait -NoNewWindow

if (Test-Path $outFile) {
    $f = Get-Item $outFile
    $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($outFile)
    Write-Output ("BUILT: {0} ({1:N2} MB) — v{2}" -f $f.Name, ($f.Length/1MB), $vi.FileVersion)
}
```

> O valor após a vírgula em `/resource:arquivo.zip,NOME` é EXATAMENTE o que o `.cs` procura em `GetManifestResourceStream(NOME)`. Se não baterem, o installer usa o fallback (procura qualquer .zip) — mas é melhor manterem iguais.

### 2.4 Requisitos de ambiente

- **csc.exe**: `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (já vem no Windows com .NET Framework 4.x)
- **gh CLI**: para publicar releases (`winget install GitHub.cli`)
- Nenhum Visual Studio necessário

---

## Parte 3 — Sistema de Auto-Update

### 3.1 Como funciona

```
Plugin (panel.js)  ──GET──>  version.json (no servidor)
                                    │
             versão remota > local? │
                                    ▼
                           mostra banner de update
                                    │
                        usuário clica → abre downloadUrl no browser
                                    │
                                    ▼
                    GitHub Releases /latest/download/Setup.exe
```

### 3.2 version.json (hospedado no servidor)

```json
{
  "version": "1.0.0",
  "downloadUrl": "https://github.com/USUARIO/REPO/releases/latest/download/MeuPlugin_Setup.exe",
  "changelog": "Descrição curta das novidades"
}
```

**Onde hospedar** (qualquer URL pública que sirva JSON):
- Servidor próprio via FTP/FileZilla → `https://meusite.com/meuplugin/version.json`
- GitHub raw → `https://raw.githubusercontent.com/USUARIO/REPO/main/version.json`
- GitHub Pages

**Regra:** só atualize o `version.json` DEPOIS de confirmar que a release no GitHub está correta. É esse arquivo que dispara a notificação para todos os usuários.

### 3.3 Código de check no panel.js

```javascript
var PLUGIN_VERSION = '1.0.0';
var UPDATE_CHECK_URL = 'https://meusite.com/meuplugin/version.json';

function compareVersions(a, b) {
    var pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (var i = 0; i < 3; i++) {
        var na = pa[i] || 0, nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

function checkForUpdate(showIfCurrent) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', UPDATE_CHECK_URL + '?t=' + Date.now(), true);  // ?t= evita cache
    xhr.timeout = 8000;
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            try {
                var data = JSON.parse(xhr.responseText);
                if (data.version && compareVersions(data.version, PLUGIN_VERSION) > 0) {
                    showUpdateBanner(data);
                } else if (showIfCurrent) {
                    // opcional: avisar "já está atualizado"
                }
            } catch(e) {}
        }
    };
    xhr.send();
}

function showUpdateBanner(data) {
    var banner = document.createElement('div');
    banner.style.cssText = 'background:#de2246;color:#fff;padding:10px;text-align:center;cursor:pointer;';
    banner.innerHTML = 'Nova versão v' + data.version + ' disponível — clique para baixar';
    banner.onclick = function() {
        if (window.cep && window.cep.util) {
            window.cep.util.openURLInDefaultBrowser(data.downloadUrl);
        } else {
            window.open(data.downloadUrl);
        }
    };
    document.body.insertBefore(banner, document.body.firstChild);
}

// checa ao abrir (delay para não travar o load)
setTimeout(function() { checkForUpdate(false); }, 5000);
```

### 3.4 GitHub — comandos de release

```bash
# criar repositório (uma vez)
gh repo create USUARIO/REPO --public

# publicar release
gh release create v1.0.0 "build_1.0.0/MeuPlugin_Setup.exe" \
  --repo USUARIO/REPO \
  --title "MeuPlugin v1.0.0" \
  --notes "Changelog aqui"

# corrigir asset errado
gh release delete v1.0.0 --repo USUARIO/REPO --yes
gh release create v1.0.0 "build_1.0.0/MeuPlugin_Setup.exe" --repo USUARIO/REPO --title "..." --notes "..."

# verificar o asset publicado (nome, tamanho, estado)
gh release view v1.0.0 --repo USUARIO/REPO --json assets
```

**URL permanente da última versão** (nunca muda, sempre aponta pro release mais novo):
```
https://github.com/USUARIO/REPO/releases/latest/download/MeuPlugin_Setup.exe
```

---

## Parte 4 — Adaptando para um Novo Plugin

### Passo a passo

1. **Renomeie os identificadores** em todo lugar:
   - `com.drawlapseps.cep` → `com.meuplugin.cep`
   - `com.drawlapseps.generator` → `com.meuplugin.generator`
   - `drawlapseps_plugin.zip` → `meuplugin.zip`
   - `DrawlapsePS_Setup.exe` → `MeuPlugin_Setup.exe`

2. **No manifest.xml** (`com.meuplugin.cep/CSXS/manifest.xml`): defina um `ExtensionBundleId` único, ex: `com.meuplugin.cep`.

3. **Copie e ajuste os 3 arquivos de build:**
   - `MeuPluginInstaller.cs` (base: `DrawlapseInstaller.cs`)
     - Atualize `RESOURCE_NAME`, os nomes de pasta (`com.meuplugin.cep`, `com.meuplugin.generator`), `AssemblyVersion`, títulos e changelog
   - `make_zip.ps1` (troque paths e nome do zip)
   - `build_installer.ps1` (troque paths, nome do zip e do exe)

4. **Adicione o check de update no panel.js** (código da Parte 3.3) com sua `PLUGIN_VERSION` e `UPDATE_CHECK_URL`.

5. **Crie o repositório** e **hospede o version.json**.

6. **Se NÃO tiver generator:** remova as linhas de `generator/` do `make_zip.ps1` e do `.cs`. O installer só lidará com `cep/`.

### Checklist de release (para cada versão nova)

```
[ ] Bumpar PLUGIN_VERSION no panel.js
[ ] Atualizar AssemblyVersion + título + changelog no .cs
[ ] Rodar make_zip.ps1 e conferir o tamanho do ZIP (não pode faltar generator)
[ ] Rodar build_installer.ps1 e conferir tamanho + FileVersion do EXE
[ ] gh release create vX.Y.Z Setup.exe
[ ] gh release view — confirmar asset uploaded com tamanho correto
[ ] Atualizar version.json no servidor
[ ] Testar: abrir plugin → banner de update deve aparecer
```

---

## Parte 5 — Troubleshooting

| Sintoma | Causa provável | Correção |
|---|---|---|
| EXE muito pequeno | ZIP sem `generator/` ou sem `ffmpeg/` | Revisar `make_zip.ps1`, conferir tamanho antes de buildar |
| Installer "instala" mas painel não aparece | ZIP sem prefixos `cep/`/`generator/`, ou PlayerDebugMode não ativado | Verificar estrutura do ZIP; conferir chaves CSXS no Registro |
| Update não aparece | version.json desatualizado, URL errada ou cache | Testar URL no browser; usar `?t=timestamp` |
| Installer não extrai | `RESOURCE_NAME` diferente do nome no `/resource:` | Alinhar os dois nomes |
| csc.exe não encontrado | Caminho errado | `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` |
| Photoshop não detectado | Instalação em local não-padrão | O scan de Registro cobre isso; senão, botão "Procurar" manual |
| Release com .exe antigo | Publicou antes de rebuildar | `gh release delete` + recriar |

---

## Resumo em uma linha

```
make_zip.ps1  →  ZIP (cep/ + generator/)
build_installer.ps1  →  csc.exe compila .cs + embute ZIP  →  Setup.exe autossuficiente
gh release create  →  publica no GitHub
version.json (servidor)  →  dispara a notificação de update no plugin
```

Todo o pipeline roda local: PowerShell + csc.exe (.NET Framework) + gh CLI. Sem CI/CD, sem dependências externas de build.
