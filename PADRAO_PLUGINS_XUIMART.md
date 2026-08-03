# Padrão Xuimart para Plugins Adobe

Manual de referência para criar novos plugins mantendo a identidade e a arquitetura
estabelecidas no DrawlapsePS.

**Referência viva:** `com.drawlapseps.cep` (v5.2.7)
**Complementa:** `IDENTITY_GUIDE.md` (paleta, tipografia, componentes)

Este documento cobre o que o IDENTITY_GUIDE não cobre: assets, arquitetura,
pipeline de exportação, instalador, distribuição e convenções de código.

---

## 1. Marca e Dados Fixos

| Item | Valor |
|------|-------|
| Desenvolvedor | Xuimart |
| Site | https://www.xuimart.com.br |
| Suporte | {produto}suporte@xuimart.com.br |
| Mascote | Xuimzinho |

O email de suporte segue o padrão `{produto}suporte@xuimart.com.br`
(ex: `drawlapsesuporte@xuimart.com.br`) e usa FormSubmit.co no formulário do site.

---

## 2. Assets — Onde Ficam e Quais São

### Logo Xuimart

```
com.drawlapseps.cep/img/logo_xuimart_branca.png     15 KB   (rodapé do painel)
```

Versão branca, usada sobre fundo escuro no rodapé. É a única variante da logo
Xuimart embarcada no plugin — não criar variantes novas sem necessidade.

### Ícones do painel (obrigatórios pelo CEP)

```
com.drawlapseps.cep/icons/
  icon-normal.png          20 KB   estado normal
  icon-rollover.png        20 KB   hover
  icon-dark-normal.png     20 KB   tema escuro
  icon-dark-rollover.png   20 KB   tema escuro + hover
  icon-2x.png              20 KB   densidade dupla
  logo.png                 20 KB   logo do produto (raster)
  logo.svg                 36 KB   logo do produto (vetor, fonte da verdade)
  render_icon.html                 utilitário para gerar os PNGs a partir do SVG
```

**Regra:** o `logo.svg` é a fonte da verdade. Os PNGs são derivados. O
`render_icon.html` existe para regerar os rasters — mantenha esse fluxo em
novos plugins em vez de editar PNG na mão.

Os quatro ícones de estado são exigidos pelo `manifest.xml`. Sem eles o painel
aparece sem ícone na aba do Photoshop.

### Mascote Xuimzinho

```
com.drawlapseps.cep/img/
  xuim_falando_normal.png            2.6 MB   fala (boca aberta)
  xuim_falandoolhosfechados.png      2.8 MB   fala (olhos fechados) — alterna com a de cima
  xuim_pensando.png                  1.1 MB   processando / aguardando
  xuim_bravo.png                     323 KB   erro
  xuim_update.png                    7.6 KB   aviso de atualização
```

O par `falando_normal` + `falandoolhosfechados` é alternado em intervalo para
criar a animação de fala. As demais são estados pontuais.

**Atenção ao peso:** essas cinco imagens somam ~7 MB. Em novos plugins, otimize
antes de embarcar (elas são um resquício não otimizado do DrawlapsePS).

---

## 3. Estrutura de Pastas

```
{workspace}/
  com.{produto}.cep/              extensão CEP (painel)
    CSXS/manifest.xml             manifesto Adobe
    index.html                    UI
    index.css                     estilos
    init.jsx                      init ExtendScript
    package.json                  { "type": "commonjs" }
    .debug                        habilita debug remoto (ver seção 9)
    js/
      CSInterface.js              API Adobe (não editar)
      panel.js                    lógica da UI
      functions.js                ponte CEP <-> Node, spawn de workers
      export.cjs                  worker de exportação
      utils.js                    utilidades (escrita atômica)
    icons/                        ícones do painel
    img/                          logo + mascote
    ffmpeg/
      ffmpeg.exe                  encoder
      ffprobe.exe                 probe

  com.{produto}.generator/        plugin Generator (se precisar capturar frames)
    src/index.js                  entrada
    src/savePixmap.js             grava pixmap em disco
    src/mutex.js                  exclusão mútua

  build_X.Y.Z/                    um por release
    {Produto}Installer.cs         código do instalador
    installer_icon.ico            ícone do .exe
    drawlapseps_plugin.zip        payload embarcado
    {Produto}_Setup.exe           instalador compilado
    notas.md                      notas da release

  landing_page/                   blocos HTML do site
  .kiro/steering/                 guias operacionais
```

---

## 4. Manifesto CEP — Modelo

```xml
<ExtensionManifest Version="6.0"
    ExtensionBundleId="com.{produto}"
    ExtensionBundleVersion="5.0.0"
    ExtensionBundleName="{Produto}">
  <ExtensionList>
    <Extension Id="com.{produto}.panel" Version="5.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="PHXS" Version="[19.0,99.9]" />
      <Host Name="PHSP" Version="[19.0,99.9]" />
    </HostList>
    <LocaleList><Locale Code="All" /></LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="8.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.{produto}.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./init.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle><AutoVisible>true</AutoVisible></Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>{Produto}</Menu>
          <Geometry>
            <Size><Height>380</Height><Width>325</Width></Size>
            <MinSize><Height>200</Height><Width>200</Width></MinSize>
            <MaxSize><Height>800</Height><Width>400</Width></MaxSize>
          </Geometry>
          <Icons>
            <Icon Type="Normal">./icons/icon-normal.png</Icon>
            <Icon Type="RollOver">./icons/icon-rollover.png</Icon>
            <Icon Type="DarkNormal">./icons/icon-dark-normal.png</Icon>
            <Icon Type="DarkRollOver">./icons/icon-dark-rollover.png</Icon>
          </Icons>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

**Pontos não negociáveis:**

- `--enable-nodejs` e `--mixed-context` são obrigatórios. Sem eles não há
  `require()` nem `child_process`, e todo o padrão de workers desmorona.
- `PHXS` + `PHSP` cobrem as duas variantes de host do Photoshop. Faltando uma, o
  painel não carrega em parte das instalações.
- Painel padrão **325x380**, mínimo **200x200**, máximo **400x800**.

**Dívida conhecida:** o `ExtensionBundleVersion` do DrawlapsePS está em `5.0.0`
mesmo na v5.2.7. Não quebra nada (o CEP usa só como versão do bundle), mas em
plugins novos mantenha sincronizado com a versão real.

---

## 5. Arquitetura em Camadas

```
index.html + index.css          apresentação
        |
     panel.js                   estado da UI, eventos, i18n
        |
   functions.js                 ponte: spawn de processos Node, IPC
        |
    export.cjs                  worker: trabalho pesado isolado
        |
     ffmpeg.exe                 processamento de mídia
```

### Por que worker separado

Trabalho pesado **nunca** roda no processo do painel — travaria a UI do
Photoshop. O padrão é `spawn` de um processo Node com canal IPC:

```javascript
var worker = spawn('node', [workerPath], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
});
worker.send(exportParams);
worker.on('message', function(msg) { /* progresso, sucesso, erro */ });
```

### Resolução de caminho do worker

Sempre com fallback, porque `__dirname` no CEP resolve para a pasta `js/`:

```javascript
var workerPath = path.join(__dirname, 'export.cjs');
if (!fs.existsSync(workerPath)) {
    workerPath = path.join(__dirname, '..', 'export.cjs');
}
```

**Armadilha real:** no DrawlapsePS existiu por muito tempo um `export.cjs` na
raiz da extensão além do de `js/`. O worker carregado é o de **`js/`**. Editar o
da raiz não surte efeito e gera horas de depuração perdida. Não duplique arquivos
de worker.

### Contrato IPC

Mensagens do worker para o painel, sempre com `type` e `data`:

```javascript
process.send({ type: "exportReplayProgress", data: { index, percent } });
process.send({ type: "exportReplaySuccess",  data: null });
process.send({ type: "exportReplayError",    data: error.message });
```

Progresso é limitado a um envio a cada 2 s (com flag `force` para marcos), para
não inundar o IPC:

```javascript
function postNowProgress(index, percent, force) {
    var now = Date.now();
    if (now - lastProgressTime >= 2000 || force) { /* envia */ }
}
```

---

## 6. Pipeline de Exportação — O Padrão

O fluxo do DrawlapsePS, replicável em qualquer plugin que gere vídeo.

### Etapas

```
1. Copiar/validar frames  ->  pasta temporária, renomeados 000001.jpg...
2. Calcular dimensões     ->  a partir dos frames reais, sempre pares
3. Vídeo principal        ->  mainVideo.ts
4. Vídeo de abertura      ->  startVideo.ts   (2 s, arte final, fade out)
5. Vídeo de encerramento  ->  endVideo.ts     (2 s, arte final, fade in)
6. Concatenar             ->  outputVideo.mp4
```

### Segmentos em MPEG-TS, não MP4

Cada segmento é gerado como `.ts`:

```javascript
baseFfmpeg.format('mpegts').outputOptions('-pix_fmt yuv420p')
```

Motivo: MPEG-TS permite concatenação por cópia de stream, sem recodificar:

```javascript
var concatInput = 'concat:' + input1 + '|' + input2 + '|' + input3;
ffmpeg().input(concatInput).videoCodec('copy').output(output);
```

Isso é ordens de magnitude mais rápido que recodificar e não perde qualidade.
MP4 não suporta esse tipo de concat direto.

### Validação de integridade dos frames

Frames corrompidos são descartados silenciosamente, sem interromper a exportação:

```javascript
function checkJPGIntegrity(filePath) {
    var buffer = fs.readFileSync(filePath);
    // header 0xFF 0xD8 e footer 0xFF 0xD9
}
```

### Dimensões sempre pares

`libx264` com `yuv420p` **exige** largura e altura divisíveis por 2. Toda
dimensão calculada passa por arredondamento:

```javascript
width  = Math.floor(width  / 2) * 2;
height = Math.floor(height / 2) * 2;
```

### Regra crítica do FFmpeg: `-vf` e `-filter_complex` não convivem

Nunca combine filtro complexo com `-vf` ou `.size()` no mesmo output. O FFmpeg
aborta com:

```
Filtergraph 'scale=w=744:h=576' was specified through the -vf/-af/-filter
option for output stream 0:0, which is fed from a complex filtergraph.
```

Esse foi um bug real corrigido na v5.2.7. Se houver marca d'água (que exige
`complexFilter` para o overlay), **todo** o dimensionamento tem que entrar na
cadeia complexa.

### Modos de enquadramento

| Modo | Cadeia de filtros |
|------|-------------------|
| `full` / `bars` | `scale=W:H:force_original_aspect_ratio=decrease` + `pad=W:H:(ow-iw)/2:(oh-ih)/2` |
| `crop` | `crop=w:h:x:y` + `scale=W:H` |
| `blur` | fundo: `scale increase` → `crop` → `gblur=sigma=80` → `eq=brightness=-0.5`; frente: `scale decrease`; `overlay=(W-w)/2:(H-h)/2` |

Marca d'água é sempre aplicada **depois** do composite:

```
[composed][wm]overlay=...
```

### Fila de exportação

Exportações são serializadas por um `QueueManager` (FIFO, um worker ativo por
vez), com:

- snapshot dos frames no enfileiramento (isola de alterações posteriores)
- persistência atômica do estado (sobrevive a fechar o painel)
- itens `"exportando"` voltam para `"pendente"` ao recarregar
- cancelamento com SIGTERM e SIGKILL após 10 s

Referência: `js/queue-manager.js` e `js/queue-persistence.js`.

---

## 7. Persistência e Escrita Atômica

### Locais

```
%APPDATA%\{Produto}\configData.json          configuração
%APPDATA%\{Produto}\documentValues\*.json    estado por sessão
{pasta configurável}\{sessão}\*.jpg          frames capturados
```

### Escrita atômica é obrigatória

Quando dois processos leem o mesmo arquivo (painel + Generator), escrita direta
causa leitura de arquivo pela metade. Isso gerou um bug grave no DrawlapsePS: o
plugin parecia "resetado", perdia a pasta configurada e o histórico.

Padrão correto:

```javascript
// escrever em temporário e renomear (rename é atômico no mesmo volume)
writeFileAtomic.sync(filePath, JSON.stringify(data, null, 2));
```

E na leitura:

- 3 tentativas antes de desistir
- **nunca** cair no padrão se o arquivo existe mas falhou o parse
- remover BOM antes do `JSON.parse` (arquivos com BOM quebram o parse)
- gravação read-modify-write: mesclar com o disco em vez de sobrescrever

---

## 8. Instalador (WinForms C#)

### Identidade visual

| Nome | Hex | Uso |
|------|-----|-----|
| BG_DARK | `#0e0e14` | fundo da janela |
| BG_CARD | `#181822` | cards internos |
| BG_PANEL | `#20202e` | painéis laterais |
| ACCENT | `#de2246` | botão instalar, separadores |
| SUCCESS | `#22c864` | sucesso |
| WARNING | `#fbbf24` | avisos |
| TEXT_MAIN | `#f0f0ff` | texto principal |
| TEXT_DIM | `#8c8ca5` | texto secundário |
| BORDER | `#37374b` | bordas |
| CYAN_BTN | `#00c8c8` | botão Pix |

Janela fixa **780x540**. Fonte Segoe UI 9pt base, título 22pt Bold.

### Payload embutido no .exe

O ZIP do plugin é embarcado como recurso, então o instalador é um arquivo único:

```
/resource:"caminho\plugin.zip",drawlapseps_plugin.zip
```

E lido em runtime:

```csharp
const string RESOURCE_NAME = "drawlapseps_plugin.zip";
var asm = System.Reflection.Assembly.GetExecutingAssembly();
Stream stream = asm.GetManifestResourceStream(RESOURCE_NAME);
```

Há fallback: se o recurso não existir, procura o ZIP na pasta do .exe.

### Estrutura obrigatória do ZIP

O extrator só reconhece **dois prefixos**:

```
cep/...            -> vai para as pastas CEP extensions
generator/...      -> vai para Plug-ins\Generator
```

```csharp
if (entryName.StartsWith("generator/"))  { /* extrai no Generator */ }
else if (entryName.StartsWith("cep/"))   { /* extrai em cada alvo CEP */ }
```

**Qualquer entrada fora desses prefixos é ignorada em silêncio.** Ao gerar o ZIP,
sempre valide a contagem por prefixo — um erro aqui produz um instalador que roda
sem erro e instala nada.

### Detecção do Photoshop

Via registro, em `HKLM` (com view 32 e 64 bits), varrendo as chaves da Adobe. Para
cada instalação encontrada, monta:

```csharp
GenPath = Path.Combine(psDir, "Plug-ins", "Generator");
CepPath = Path.Combine(psDir, "Required", "CEP", "extensions");
```

Também há seleção manual de pasta, validando que exista a subpasta `Plug-ins`.

### PlayerDebugMode

Extensões não assinadas só carregam com `PlayerDebugMode`. O instalador escreve
em todas as versões de CSXS e em três escopos:

```csharp
string[] csxsVersions = { "6","7","8","9","9.4","10","11","12","13","14","15" };
// para cada: Software\Adobe\CSXS.{ver}  e  Software\WOW6432Node\Adobe\CSXS.{ver}
// em HKCU, HKLM e WOW6432Node
key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
```

Cobre Photoshop 2018 a 2027. É `String`, não DWORD.

### Backup e restauração

Antes de sobrescrever, o instalador copia a instalação atual para uma pasta de
backup (`generator/` e `cep/`), permitindo reverter.

### Changelog na primeira execução

`ShowChangelogOnce()` exibe as novidades da versão no `Load` da janela. Texto sem
acentuação (evita problema de encoding no WinForms).

### Aviso sobre o Generator

Se o plugin usa Generator, o instalador precisa instruir:

```
1. Vá em: Editar > Preferências > Plug-ins
2. Marque: Habilitar Generator
3. OK e reinicie o Photoshop
```

### Compilação

```powershell
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$args = "/target:winexe /platform:anycpu /optimize+ " +
  "/win32icon:`"$buildDir\installer_icon.ico`" " +
  "/out:`"$buildDir\{Produto}_Setup.exe`" " +
  "/resource:`"$buildDir\plugin.zip`",drawlapseps_plugin.zip " +
  "/r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll " +
  "/r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll " +
  "/r:Microsoft.CSharp.dll `"$buildDir\{Produto}Installer.cs`""
```

Não precisa de Visual Studio — o `csc.exe` do .NET Framework já vem no Windows.

---

## 9. Locais de Instalação

O plugin é instalado em **múltiplos** destinos, porque o Photoshop pode carregar
de qualquer um deles:

```
C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\        <- prioridade nesta máquina
C:\Program Files\Common Files\Adobe\CEP\extensions\
C:\Program Files\Adobe\Adobe Photoshop {ano}\Required\CEP\extensions\
%APPDATA%\Adobe\CEP\extensions\                                  <- não requer elevação
```

Generator (quando aplicável):

```
C:\Program Files\Adobe\Adobe Photoshop {ano}\Plug-ins\Generator\com.{produto}.generator\
```

**Instalações duplicadas são um problema real:** cópias antigas em outras pastas
CEP fazem o Photoshop carregar um painel desatualizado. O instalador do
DrawlapsePS detecta e limpa duplicatas — replique isso.

### Recarga durante desenvolvimento

| Arquivo | Precisa reiniciar o Photoshop? |
|---------|-------------------------------|
| `js/export.cjs` (worker) | **Não** — é relido a cada spawn |
| `panel.js`, `index.html`, `index.css` | **Sim** |

Isso acelera muito o ciclo de desenvolvimento do pipeline de mídia.

### Arquivo `.debug`

Habilita depuração remota via Chrome DevTools. O DrawlapsePS embarca ele na
release. Em plugin novo, decida consciente: é útil para suporte, mas expõe porta
de debug.

---

## 10. Bilinguismo (PT / EN)

Dicionário em `panel.js`, aplicado por `applyLang()`:

```javascript
var LANG = {
    pt: { exportSuccess: 'Vídeo exportado com sucesso!', openFolder: 'Abrir Pasta', ... },
    en: { exportSuccess: 'Video exported successfully!',  openFolder: 'Open Folder', ... }
};
```

Elementos marcados com `class="lang-{chave}"` e substituídos em runtime. Opções de
`<select>` também são localizadas.

O idioma fica em `configData.language`. O mascote fala no idioma ativo.

**Regra:** toda string nova entra nos dois dicionários no mesmo commit. String
só em PT é dívida imediata.

---

## 11. Convenções de Código

### JavaScript

- **ES5** (`var`, `function`) — o CEF do CEP é antigo e o estilo do projeto é este
- CommonJS, sem módulos ES (`package.json` com `"type": "commonjs"`)
- Sem frameworks, sem build step: DOM puro
- Sem TypeScript

### Ícones

**SVG inline, nunca emoji.** ViewBox `0 0 24 24`, `stroke-width="2"`,
`currentColor` para herdar cor.

```html
<svg viewBox="0 0 24 24" width="14" height="14" fill="none"
     stroke="currentColor" stroke-width="2">
  <path d="..."/>
</svg>
```

### Comentários

Em português, explicando **por quê** e não o quê. Armadilhas e decisões
não óbvias merecem comentário — o histórico do DrawlapsePS mostra que sem isso
o mesmo bug volta.

---

## 12. Versionamento e Release

### SemVer

| Bump | Quando |
|------|--------|
| Major | reescrita, mudança de arquitetura, breaking change |
| Minor | feature nova |
| Patch | bugfix, ajuste visual, encoding |

Beta: sufixo `-beta` (ex: `5.3.0-beta`).

### Onde a versão aparece (bumpar em todos)

1. `panel.js`: `var {PRODUTO}_VERSION = 'X.Y.Z';`
2. `{Produto}Installer.cs`: `AssemblyVersion`, título da janela, label do rodapé,
   texto do changelog, título do MessageBox, log do plugin embutido
3. `CHANGELOG.md`
4. `version.json` no servidor
5. Idealmente `manifest.xml` (`ExtensionBundleVersion`)

### Nome do asset — regra crítica

O executável **tem** que se chamar `{Produto}_Setup.exe`, **sem versão no nome**.
Só assim o link permanente funciona:

```
https://github.com/xuimart/{repo}/releases/latest/download/{Produto}_Setup.exe
```

Esse link nunca muda e é o que vai no site. Colocar versão no nome quebra todos
os links de download já publicados.

### Publicação

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

gh release create vX.Y.Z "caminho\{Produto}_Setup.exe" `
   --repo xuimart/{repo} `
   --title "{Produto} vX.Y.Z" `
   --notes-file "caminho\notas.md"
```

### version.json (aviso de atualização)

Fica em `https://www.xuimart.com.br/{produto}/version.json`, subido por FTP
(FileZilla):

```json
{
  "version": "X.Y.Z",
  "downloadUrl": "https://github.com/xuimart/{repo}/releases/latest/download/{Produto}_Setup.exe",
  "changelog": "Descrição curta das novidades"
}
```

O plugin compara com sua versão ao abrir e mostra banner se houver atualização.
O `downloadUrl` **nunca** muda; só `version` e `changelog`.

### Checklist antes de publicar

- [ ] versão bumpada em todos os locais da seção acima
- [ ] CHANGELOG atualizado
- [ ] ZIP com prefixos `cep/` e `generator/`, zero entradas fora
- [ ] arquivos de teste (`*.test.js`) fora do ZIP
- [ ] instalador compila sem erro
- [ ] recurso embutido abre e extrai (validar lendo do próprio .exe)
- [ ] versão dentro do `panel.js` empacotado confere
- [ ] asset nomeado `{Produto}_Setup.exe`
- [ ] SHA256 do asset publicado igual ao local
- [ ] link `/latest/download/` responde 200
- [ ] `version.json` atualizado no FTP

---

## 13. Tom de Voz

| Contexto | Estilo |
|----------|--------|
| Labels | direto e curto ("Resolução", "Qualidade") |
| Tooltips | explicativo, informal, com exemplo prático |
| Erros | o que falhou **e** como resolver |
| Mascote | amigável, brincalhão, primeira pessoa |
| Sucesso | celebrativo mas breve |

Mensagem de erro sem caminho de solução é considerada incompleta.

---

## 14. Armadilhas Conhecidas

Erros que já custaram tempo no DrawlapsePS. Verifique em qualquer plugin novo.

**Worker duplicado.** Dois `export.cjs` (raiz e `js/`) — só o de `js/` roda.
Não duplique.

**`-vf` com `filter_complex`.** Aborta a exportação. Com marca d'água, todo
dimensionamento vai na cadeia complexa.

**Escrita não atômica de config.** Leitura pela metade faz o plugin parecer
resetado. Sempre temp + rename, com retentativas e sem fallback silencioso.

**Entradas fora dos prefixos do ZIP.** O instalador ignora sem avisar. Valide a
contagem por prefixo.

**Título de janela do Photoshop é volátil.** Muda com documento, zoom, layer e
estado de salvamento (`Untitled-1 @ 45,4% (Layer 1, RGB/8) *`). Nunca use como
identificador estável.

**`getDocumentPixmap` é caro.** Medido em 95 sessões reais: teto de ~1,6 frames/s,
sustentado ~0,5 frames/s. Não serve para captura de movimento. O gargalo é o
custo da geração do pixmap, e o mutex de slot único descarta eventos enquanto
um pixmap está sendo gerado.

**`WDA_EXCLUDEFROMCAPTURE` não funciona com `gdigrab`.** Testado: a chamada
retorna sucesso mas os pixels vêm idênticos. Essa API atua na captura via DWM, e
o `gdigrab` lê o contexto GDI já composto.

**Dimensões ímpares.** `libx264` + `yuv420p` exigem pares. Arredonde sempre.

**`ExtensionBundleVersion` esquecido.** Fica defasado silenciosamente.

---

## 15. Ao Criar um Plugin Novo

1. Copie a estrutura de `com.drawlapseps.cep` como esqueleto
2. Renomeie para `com.{produto}.cep`, ajuste `manifest.xml` (bundle id, extension
   id, menu, geometria)
3. Gere os ícones a partir de um `logo.svg` novo usando `render_icon.html`
4. Mantenha `logo_xuimart_branca.png` no rodapé
5. Reaproveite sem alterar: `CSInterface.js`, `utils.js`, o padrão de
   `functions.js` e o `QueueManager` se houver exportação
6. Adapte `IDENTITY_GUIDE.md` — a paleta e os componentes são compartilhados
7. Derive o instalador de `{Produto}Installer.cs`, trocando nomes e changelog
8. Configure o repositório `xuimart/{repo}` e o `version.json` no site
9. Ajuste os dois dicionários de idioma antes da primeira release

---

## Referências no Repositório

| Arquivo | Conteúdo |
|---------|----------|
| `IDENTITY_GUIDE.md` | paleta, tipografia, componentes UI, espaçamento |
| `CHANGELOG.md` | histórico de versões |
| `.kiro/steering/github-release-guide.md` | processo operacional de release |
| `com.drawlapseps.cep/js/export.cjs` | pipeline de mídia de referência |
| `com.drawlapseps.cep/js/queue-manager.js` | fila de exportação de referência |
| `build_5.2.7/DrawlapseInstaller.cs` | instalador de referência |
| `_arquivado_gravacao_tela/` | investigação de gravação de tela (arquivada) |
