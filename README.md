# DrawColor Color Wheel

Painel de roda de cores para Photoshop, com editor de layout por arraste.
Roda em três ambientes a partir de um único núcleo.

## Qual shell usar

O Photoshop trocou de tecnologia de plugin no meio do caminho, e as duas não se
sobrepõem em todo o intervalo. Não existe um pacote único que cubra 21 a 26+.

| Photoshop | CEP | UXP | Use |
|---|---|---|---|
| 21 (2020) | sim | **não** | `dist/cep` |
| 22 – 25 | sim | sim | `dist/uxp` |
| 26+ | **não** | sim | `dist/uxp` |

O UXP [exige Photoshop 22.0 no mínimo](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/udt-walkthrough/);
para [21 ou anterior a Adobe indica CEP ou ExtendScript](https://developer.adobe.com/photoshop).
O CEP, por sua vez, foi removido no Photoshop 26. Conteúdo parafraseado das
fontes citadas para conformidade de licenciamento.

Instruções: [`uxp/INSTALL.md`](uxp/INSTALL.md) · [`cep/INSTALL.md`](cep/INSTALL.md)

## Comandos

```
npm test              # 59 testes: propriedades + integração dos 3 ambientes
npm run build         # monta dist/uxp e dist/cep
npm run build:uxp
npm run build:cep
npm run install:cep   # instala a extensão CEP (Photoshop 21-25)
```

A demo de navegador abre direto em `demo/index.html`, sem build.

## Arquitetura

Três camadas. A ideia é que a lógica não saiba em qual host está rodando.

```
        demo/index.html          uxp/manifest.json        cep/CSXS/manifest.xml
        (navegador)              (Photoshop 22+)          (Photoshop 21-25)
              \                        |                        /
               \_______________________|_______________________/
                                       |
                            demo/js/platform.js
                     Platform Adapter: storage, resize,
                     capacidades, polyfill de range
                                       |
                              núcleo compartilhado
              color · state · layout · snap · layout-store ·
              layout-serializer · layout-editor · wheel · panels
                                       |
                             demo/js/ps-bridge.js
                    batchPlay (UXP) | evalScript (CEP) | no-op (web)
```

**O núcleo é o mesmo arquivo nos três alvos.** `build/build.js` copia
`demo/js/` para cada `dist/` e transforma `demo/index.html` em vez de duplicá-lo,
então o DOM tem uma única fonte. `demo/index.html` carrega a mesma pilha dos
shells, para a demo exercitar o adapter em vez de um caminho paralelo.

### O que o Platform Adapter resolve

| Capacidade | web | CEP | UXP |
|---|---|---|---|
| storage | `localStorage` | `localStorage` | arquivo JSON via `getDataFolder()` |
| resize | `ResizeObserver` | `ResizeObserver` | polling de `clientWidth` |
| cor do host | — | `evalScript` | `batchPlay` |
| `input[type=range]` | nativo | nativo | polyfill de divs |
| SVG, `clip-path`, `aspect-ratio` | nativo | nativo | substituídos no CSS |

O caso mais delicado é o storage. **O UXP não tem `localStorage`** — só
`sessionStorage`, que morre ao fechar o painel, e um sistema de arquivos
assíncrono. Como `layout-store`, `palettes` e `docking` leem storage de forma
síncrona durante o init, o adapter carrega o JSON uma vez no boot e serve
leituras de um cache em memória, com flush debounced na escrita. Os call sites
não mudaram, e `main.js` espera `Platform.ready()` antes de inicializar.

## Testes

```
npm test
```

- **17 propriedades** (fast-check) sobre âncoras, escala, encaixe, perfis e
  serialização — validam os requisitos de `.kiro/specs/layout-parity-editor`.
- **Integração por ambiente**: `platform-uxp` e `platform-cep` simulam os
  módulos `uxp`/`photoshop` e a ponte `__adobe_cep__`; `platform-env` cobre a
  detecção de ambiente e o caminho de navegador.

Nada disso executa dentro do Photoshop de verdade. A ponte de cor e as
compensações de CSS estão validadas por mocks e inspeção estática, não em uso
real — a checklist de verificação manual está em cada `INSTALL.md`.

## Estrutura

```
demo/            núcleo compartilhado + demo de navegador
  js/            módulos IIFE (window.*), sem build step
uxp/             shell UXP: manifest v4, CSS de compensação
cep/             shell CEP: manifest.xml, shim de CSInterface, host.jsx
build/build.js   monta dist/uxp e dist/cep
tests/           propriedades + integração
dist/            gerado; não versionar
.kiro/specs/     requisitos, design e planos de tarefa
```
