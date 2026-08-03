# Instalar o painel no Photoshop (UXP)

Alvo: **Photoshop 22.0 ou superior** (manifest v4). Testado no build contra 26.11 e 27.5.

Gere o pacote antes de qualquer coisa:

```
npm run build:uxp
```

Isso monta `dist/uxp/`, que é a pasta a ser carregada. Nunca aponte o Photoshop
para `demo/` — aquilo é a versão de navegador e não tem `manifest.json`.

## Rota recomendada: UXP Developer Tools

O UDT é o caminho suportado pela Adobe e é reversível: o plugin sai da lista
quando você descarrega.

1. Instale o **Adobe UXP Developer Tools** pelo app do Creative Cloud
   (aba Todos os aplicativos → procure "UXP Developer Tools").
2. Abra o Photoshop. Deixe aberto.
3. Abra o UDT. Em *Connected Applications* deve aparecer o Photoshop.
   Se não aparecer, o UDT não conseguiu conectar.
4. Clique em **Add Plugin** e selecione `dist/uxp/manifest.json`.
5. Na linha do plugin, use **Load**.
6. No Photoshop: menu **Plugins → DrawColor Color Wheel**.

Depois de qualquer alteração no código, rode `npm run build:uxp` de novo e use
**Reload** no UDT.

## Verificação rápida depois de carregar

Vale conferir estes pontos, em ordem:

1. O painel abre e a roda de cores desenha.
2. Escolher uma cor na roda muda o foreground do Photoshop.
3. Mudar o foreground pelo color picker nativo move o marcador no painel
   (leva até 400 ms — é o intervalo de polling).
4. O botão `⊞` no cabeçalho entra no modo de organização; arrastar um botão
   satélite o reposiciona.
5. Fechar e reabrir o painel preserva o layout arrastado. Isso exercita o
   Platform Adapter gravando em arquivo, já que o UXP não tem `localStorage`.

## Limitações conhecidas neste build

- **Sliders de Tamanho e Fluxo na aba Godê**: o UXP não renderiza
  `<input type="range">` em várias versões. O Platform Adapter detecta isso e
  troca por um slider de divs, mantendo `.value` e o evento `input`. Se os
  sliders aparecerem como campo de texto, o polyfill não disparou — vale
  reportar.
- **Separar aba em janela** está oculto no UXP: janelas flutuantes próprias não
  fazem sentido dentro de um painel do Photoshop.
- **Comparação nova/antiga** no swatch de foreground vira meia-lua vertical em
  vez de triângulo, porque o UXP não suporta `clip-path`.

## Onde o estado é gravado

O UXP não tem `localStorage`. O Platform Adapter grava tudo em um único JSON na
pasta privada do plugin, obtida por `getDataFolder()`:

```
%APPDATA%\Adobe\UXP\PluginsStorage\PHSP\<versão>\Developer\<id do plugin>\
```

Perfis de layout, paletas e posições de aba ficam todos em
`drawcolor-state.json`. Apagar esse arquivo reseta o painel ao padrão.
