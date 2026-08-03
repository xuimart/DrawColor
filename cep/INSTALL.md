# Instalar a extensão CEP no Photoshop

Alvo: **Photoshop 21 a 25**. O CEP existe neste projeto por um único motivo — o
Photoshop 21 não suporta UXP. Para 22 em diante prefira o shell UXP, que é o
caminho suportado pela Adobe daqui para frente.

> **O CEP foi removido no Photoshop 26.** Em 26 ou superior esta extensão não
> aparece, e isso não é defeito. Nas versões instaladas nesta máquina (26.11,
> 27.5, 27.10) o CEP não funciona — use o shell UXP.

## Instalação

```
npm run build:cep
npm run install:cep
```

Reinicie o Photoshop e abra em **Janela → Extensões → DrawColor Color Wheel**.

Para remover:

```
npm run uninstall:cep
```

## O que o script faz

Duas coisas, ambas no escopo do usuário — sem administrador, sem alterar a
máquina inteira:

1. **Liga `PlayerDebugMode`** nas chaves `HKCU:\Software\Adobe\CSXS.9` a
   `CSXS.12`. Sem isso o Photoshop recusa extensões não assinadas. É a rota de
   desenvolvimento documentada pela Adobe. Cada versão do CEP lê a sua própria
   chave, por isso a faixa 9–12 (que corresponde ao Photoshop 21–25).
2. **Copia `dist/cep`** para `%APPDATA%\Adobe\CEP\extensions\com.drawcolor.colorwheel`.
   Se já houver uma instalação, ela é movida para `.bak-<timestamp>` antes.

O `-Uninstall` remove a pasta copiada mas **não** desliga `PlayerDebugMode`, de
propósito: outras extensões em desenvolvimento podem depender dele.

## Distribuir para outras pessoas

`PlayerDebugMode` serve para desenvolvimento. Para instalar em máquinas de
terceiros sem mexer no registro, é preciso empacotar como **ZXP assinado** com
`ZXPSignCmd` e um certificado. Isso está fora do escopo deste build.

## Por que o CEP exige tão pouca adaptação

O CEP roda em Chromium completo. `localStorage`, `ResizeObserver`, SVG,
`aspect-ratio` e `clip-path` todos funcionam, então `styles-cep.css` só ajusta o
enquadramento do painel — compare com `uxp/styles-uxp.css`, que precisa
substituir cada uma dessas propriedades.

A diferença real está na ponte de cor: o CEP fala com o Photoshop por
**ExtendScript** via `evalScript`, enquanto o UXP usa `batchPlay`. Os dois
caminhos ficam em `demo/js/ps-bridge.js` e são escolhidos pelo Platform Adapter.

## CSInterface

`cep/lib/CSInterface.js` é um **shim mínimo**, não a biblioteca oficial da
Adobe. O projeto usa apenas `evalScript` e `getHostEnvironment`, então o shim
fala direto com `__adobe_cep__`, a ponte que o runtime injeta. Se algum recurso
adicional do CEP for necessário, troque o arquivo pela CSInterface oficial — a
superfície usada aqui é a mesma.
