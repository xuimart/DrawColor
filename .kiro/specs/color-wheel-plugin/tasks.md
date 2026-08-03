# Implementation Plan: Color Wheel Plugin

## Overview

A estratégia é de **portabilidade, não reescrita**: `color.js`, `state.js`, `wheel.js`, `layout.js` (sem a parte de editor), `panels.js`, `palettes.js` e `gode.js` são copiados de `demo/js/` para `color-wheel-plugin/js/` mantendo a lógica intacta (mesmo estilo IIFE em `window`, comentários em pt-BR, sem build step). Só `js/ps-bridge.js` é código novo. `docking.js` não é portado. As tarefas abaixo seguem a ordem: (1) esqueleto do plugin e infraestrutura de teste, (2) camada de lógica pura (`color.js`, `state.js`), (3) camada de UI em canvas (`wheel.js`, `layout.js`, `palettes.js`, `gode.js`), (4) `ps-bridge.js` novo, (5) `panels.js` (depende de `ps-bridge` existir para os fluxos de commit), (6) wiring final em `main.js`.

Cada módulo de lógica pura ganha suas tarefas de teste de propriedade (fast-check) imediatamente após a tarefa de porte correspondente, para capturar regressões de round-trip o mais perto possível da implementação. Testes de propriedade são anotados com `Feature: color-wheel-plugin, Property N: {texto da propriedade}` e executados com `numRuns: 100` no mínimo, conforme a Testing Strategy do design.md.

## Tasks

- [ ] 1. Estrutura do plugin UXP e infraestrutura de testes
  - [ ] 1.1 Criar `color-wheel-plugin/manifest.json`
    - Declarar `id`, `name`, `version`, `main`, `host` (PS, minVersion 24.0.0), `entrypoints` com um item `type: "panel"` (`minimumSize`/`maximumSize`/`preferredDockedSize` casando com `MIN_EFFECTIVE_WIDTH`/`MAX_EFFECTIVE_WIDTH` de `layout.js`), `requiredPermissions` e `manifestVersion: 5`, conforme o exemplo do design.md
    - _Requirements: 13.1_
  - [ ] 1.2 Criar `color-wheel-plugin/index.html` a partir de `demo/index.html`
    - Copiar toda a marcação do painel (roda, triângulo/satélites, tabs, sliders, mixer, paletas, godê, barra de status)
    - Remover o botão `#detachBtn` e a linha `<script src="js/docking.js">`
    - Trocar a ordem de `<script>` para: `color.js`, `state.js`, `layout.js`, `wheel.js`, `panels.js`, `palettes.js`, `gode.js`, `ps-bridge.js`, `main.js`
    - _Requirements: 13.2, 13.5, 13.6_
  - [ ] 1.3 Criar `color-wheel-plugin/styles.css` a partir de `demo/styles.css`
    - Portar os 16 Theme_Tokens como variáveis CSS customizadas em `:root`/`.panel` com os mesmos valores hexadecimais
    - Manter as regras de layout fixo (sem o CSS de arraste/edição do Modo_De_Organização, fora de escopo)
    - _Requirements: 13.5_
  - [ ] 1.4 Criar `color-wheel-plugin/icons/icon.png`
    - Ícone 23×23 (ou múltiplo) referenciado em `manifest.json.entrypoints[0].icons`
    - _Requirements: 13.1_
  - [ ] 1.5 Configurar infraestrutura de testes de propriedade
    - Criar `color-wheel-plugin/package.json` com `fast-check` como devDependency (versão fixada) e script `"test": "node --test tests/"`
    - Criar `color-wheel-plugin/tests/` vazio, pronto para receber os arquivos de teste das tarefas seguintes
    - _Requirements: Testing Strategy do design.md (biblioteca fast-check, mínimo 100 execuções por propriedade)_

- [ ] 2. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Portar `color.js` — conversões entre espaços de cor
  - [ ] 3.1 Criar `color-wheel-plugin/js/color.js`
    - Copiar de `demo/js/color.js` sem alterar a lógica: `hsvToRgbFloat`/`hsvToRgb`/`rgbToHsv`, `rgbToHex`/`hexToRgb`, `rgbToLab`/`labToRgb`, `rgbToCmyk`/`cmykToRgb`, `isOutOfGamut`/`clipToGamut`/`deltaE`, `toGray`, `mixRgb`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.9, 6.4, 6.6, 8.3, 5.4_
  - [ ]* 3.2 Escrever teste de propriedade para round trip HSV → RGB → HSV
    - **Property 1: Round trip HSV → RGB → HSV**
    - **Validates: Requirements 11.2**
    - Arquivo `tests/property-01-hsv-roundtrip.test.js`, usando `hsvToRgbFloat` (precisão contínua) e comparando H por menor distância circular
  - [ ]* 3.3 Escrever teste de propriedade para round trip RGB → LAB → RGB
    - **Property 2: Round trip RGB → LAB → RGB**
    - **Validates: Requirements 11.3**
    - Arquivo `tests/property-02-lab-roundtrip.test.js`
  - [ ]* 3.4 Escrever teste de propriedade para round trip RGB → CMYK → RGB
    - **Property 3: Round trip RGB → CMYK → RGB**
    - **Validates: Requirements 11.1**
    - Arquivo `tests/property-03-cmyk-roundtrip.test.js`
  - [ ]* 3.5 Escrever teste de propriedade para round trip e validação do Hex_Display
    - **Property 4: Round trip e validação do Hex_Display**
    - **Validates: Requirements 6.4, 6.5, 6.6**
    - Arquivo `tests/property-04-hex-roundtrip.test.js`; gerar tanto RGB válidos (round trip via `rgbToHex`/`hexToRgb`) quanto strings arbitrárias (`hexToRgb` deve retornar `null` quando não há exatamente 6 dígitos hex com `#` opcional)
  - [ ]* 3.6 Escrever teste de propriedade para clipping de gamut idempotente
    - **Property 11: Clipping de gamut é idempotente e sempre resulta dentro do gamut**
    - **Validates: Requirements 8.3, 11.9**
    - Arquivo `tests/property-11-gamut-clip-idempotent.test.js`

- [ ] 4. Portar `state.js` — estado, harmonia, histórico, limitador de cor, rampa B/W
  - [ ] 4.1 Criar `color-wheel-plugin/js/state.js`
    - Copiar de `demo/js/state.js` sem alterar a lógica: estado central (`hsv`, `background`, `scheme`, `harmonyOffsets`, `sliderMode`, `tempOffset`, `wheelRotation`, `shape`, `lumLock`/`lockedL`, `gamut`, `limit`, `bwSteps`, `valueCheck`, `history`/`historyIndex`), `subscribe`/`emit`, `quantizeHue`/`quantizeLevel`/`applyLimit`/`setLimit`/`getLimitedPalette`, `setBwSteps`/`getBwRamp`, `getHsv`/`getRgb`/`getHex`/`setHsv`/`setRgb`/`setHex`, `pushHistory`/`canUndo`/`canRedo`/`undo`/`redo`/`sameColor`, `getScheme`/`setScheme`/`getHarmonyOffsets`/`setHarmonyOffset`/`resetHarmony`/`getHarmonyHues`, `setWheelRotation`/`nudgeWheelRotation`/`resetWheelRotation`, `setShape`, geometria de máscara de gamut (`insideMask`/`clampToMask`/`setGamut`/`resetGamut`), travamento de luminosidade (`luminosityOf`/`setLuminosityLock`/`applyLuminosityLock`), `setTempOffset`, `swapForeground`
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 14.12, 14.16, 14.17, 15.2, 15.3, 15.4, 15.5, 15.6_
  - [ ] 4.2 Adicionar persistência local de Color_Limiter e BW_Ramp em `js/state.js`
    - Ler/escrever `colorWheelPlugin.limiter.v1` (`{ enabled, hueSteps, rotationOffset }`) e `colorWheelPlugin.bwSteps.v1` (`{ steps }`) via `localStorage`, restaurando no carregamento do módulo
    - _Requirements: 14.18, 15.13_
  - [ ]* 4.3 Escrever teste de propriedade para matizes secundários de harmonia
    - **Property 6: Matizes secundários de harmonia**
    - **Validates: Requirements 3.1, 3.2, 3.7**
    - Arquivo `tests/property-06-harmony-offsets.test.js`
  - [ ]* 4.4 Escrever teste de propriedade para limite e descarte do histórico
    - **Property 12: Histórico nunca excede o limite e descarta o mais antigo**
    - **Validates: Requirements 9.1**
    - Arquivo `tests/property-12-history-limit.test.js`
  - [ ]* 4.5 Escrever teste de propriedade para deduplicação consecutiva do histórico
    - **Property 13: Histórico não aceita duplicata consecutiva**
    - **Validates: Requirements 9.8**
    - Arquivo `tests/property-13-history-no-duplicate.test.js`
  - [ ]* 4.6 Escrever teste de propriedade para undo/redo inversos e descarte de redo
    - **Property 14: Undo/redo são inversos e nova seleção descarta o ramo de redo**
    - **Validates: Requirements 9.2, 9.3, 9.4**
    - Arquivo `tests/property-14-undo-redo-inverse.test.js`
  - [ ]* 4.7 Escrever teste de propriedade para quantização de matiz com tie-break
    - **Property 15: Quantização de matiz do Color_Limiter escolhe o setor mais próximo com tie-break de menor índice**
    - **Validates: Requirements 14.6, 14.7, 14.8**
    - Arquivo `tests/property-15-hue-quantize-tiebreak.test.js`
  - [ ]* 4.8 Escrever teste de propriedade para limites de N e Rotation_Offset
    - **Property 16: N e Rotation_Offset do Color_Limiter permanecem nos intervalos válidos**
    - **Validates: Requirements 14.4, 14.5, 14.9, 14.10, 14.11, 14.12**
    - Arquivo `tests/property-16-limiter-bounds.test.js`
  - [ ]* 4.9 Escrever teste de propriedade para distribuição de L* do BW_Ramp
    - **Property 17: Distribuição de L* do BW_Ramp é exata e monotônica**
    - **Validates: Requirements 15.4, 15.5, 15.6**
    - Arquivo `tests/property-17-bwramp-distribution.test.js`
  - [ ]* 4.10 Escrever teste de propriedade para destaque do degrau do BW_Ramp
    - **Property 18: Degrau destacado do BW_Ramp é o de menor diferença de L* com tie-break de menor índice**
    - **Validates: Requirements 15.8, 15.9**
    - Arquivo `tests/property-18-bwramp-highlight-tiebreak.test.js`
  - [ ]* 4.11 Escrever testes unitários de persistência do limitador e da rampa B/W
    - Cobrir round trip salvar/recarregar de `colorWheelPlugin.limiter.v1` e `colorWheelPlugin.bwSteps.v1`, e o caso de `localStorage` indisponível
    - Arquivo `tests/unit-persistence-limiter-bw.test.js`
    - _Requirements: 14.18, 15.13_

- [ ] 5. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Portar `wheel.js` — roda, seletor triangular/quadrado/disco e marcadores de harmonia
  - [ ] 6.1 Criar `color-wheel-plugin/js/wheel.js`
    - Copiar de `demo/js/wheel.js` sem alterar a lógica: geometria das três formas (`SHAPES.triangle`/`square`/`disc` com `pointToHsv`/`hsvToPoint`/`inside`/`clamp`/`trace`/`bounds`/`drivenBy`), `buildRing`, `hueMarkerPos`/`screenAngle`/`applyRing`, `applySv`, desenho de marcadores de harmonia e da máscara de gamut, `render`/`requestRender`/`invalidateCaches`, handlers `onPointerDown`/`onPointerMove`/`onPointerUp`
    - Garantir que os handlers de ponteiro usam `pointerdown`/`pointermove`/`pointerup` (compatíveis nativamente com o WebView UXP, sem adaptação adicional)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 3.4, 12.1, 12.4, 14.3, 14.9, 14.10, 14.13, 14.14_
  - [ ]* 6.2 Escrever teste de propriedade para clamp geométrico do seletor
    - **Property 5: Clamp geométrico do seletor é não-destrutivo e idempotente**
    - **Validates: Requirements 1.6, 2.5**
    - Arquivo `tests/property-05-shape-clamp-idempotent.test.js`, exercitando as três formas (`triangle`, `square`, `disc`)

- [ ] 7. Portar `layout.js` sem o editor de arranjo
  - [ ] 7.1 Criar `color-wheel-plugin/js/layout.js`
    - Copiar de `demo/js/layout.js` apenas `REFERENCE`, `ANCHORS`, `ADJACENT`, `anchorToPoint`/`pointToAnchor`, `computeScale`/`scale`/`centerPx` (Scale_Controller) e `applyLayout`/`schedule`/`init`
    - Não portar nenhum código de edição por arraste, Modo_De_Organização, Snap_Engine, Layout_Store ou Layout_Serializer (Requisitos 8-12 de `layout-parity-editor`, fora de escopo deste plugin)
    - _Requirements: 1.4 (redimensionamento do painel mantendo forma/tamanho mínimo); geometria fixa adotada de `layout-parity-editor` Requisitos 1-7 (ver design.md — Fixed Layout Geometry)_
  - [ ]* 7.2 Escrever testes unitários de `layout.js`
    - Cobrir `anchorToPoint`/`pointToAnchor` como inversos exatos para qualquer âncora e escala, e `computeScale` restringindo a largura disponível a `MIN_EFFECTIVE_WIDTH`–`MAX_EFFECTIVE_WIDTH`
    - Arquivo `tests/unit-layout-anchors.test.js`
    - _Requirements: 1.4_

- [ ] 8. Portar `palettes.js` e `gode.js` — módulos extras do demo
  - [ ] 8.1 Criar `color-wheel-plugin/js/palettes.js`
    - Copiar de `demo/js/palettes.js` sem alterar a lógica: persistência em `colorWheelPlugin.palettes.v1`, `createPalette`/`deletePalette`/`renameActive`/`addCurrentColor`/`removeColor`, `fillFromLimit`/`fillFromBwRamp`, `exportActive`, `render`/`init`
    - _Requirements: Glossary — Palette_Manager, Saved_Palette, Swatch (ver design.md Architecture; módulo portado como recurso adicional, sem requisito numerado dedicado neste documento)_
  - [ ] 8.2 Criar `color-wheel-plugin/js/gode.js`
    - Copiar de `demo/js/gode.js` sem alterar a lógica: `sampleArea`/`stamp`/`strokeBetween`, `applyBrush`/`applySmudge`/`applyPick`, `saveSnapshot`/`undoCanvas`/`redoCanvas`, handlers de ponteiro, `clear`/`loadPalette`/`setTool`/`init`
    - _Requirements: Glossary — Mixing_Canvas, Blend_Strength, Eyedropper (ver design.md Architecture; módulo portado como recurso adicional, sem requisito numerado dedicado neste documento)_

- [ ] 9. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Construir `js/ps-bridge.js` — integração bidirecional com o Photoshop (novo)
  - [ ] 10.1 Implementar `init()`, `pullForeground()` e `isConnected()`
    - `init()` carrega a cor de foreground atual do Photoshop via `pullForeground()` e chama `AppState.setRgb(...)`; `isConnected()` reflete o sucesso da última chamada à API UXP
    - Importar o módulo host via `const { app, core, action } = require('photoshop')`
    - _Requirements: 10.3, 10.4, 10.6_
  - [ ] 10.2 Implementar `pushForeground(rgb)`/`pushBackground(rgb)` com debounce via sinal de commit
    - Assinar `AppState.subscribe` e usar o mesmo sinal `commit: true/false` já emitido por `setHsv`/`setRgb` (usado por `wireSliderTrack`/dials/wheel) para agendar a escrita ao Photoshop: durante `commit: false` agenda via `setTimeout` de 50ms, cancelando e reagendando a cada novo evento, e força o envio imediato em `commit: true`
    - Arredondar para inteiros 0-255 antes de atribuir a `photoshop.app.foregroundColor`/`backgroundColor` (fronteira de saída, Requisito 11.4); `pushBackground` é usado por `swapForeground()` do `state.js`
    - _Requirements: 10.1, 11.4_
  - [ ] 10.3 Implementar `onExternalColorChange(callback)`
    - Assinar `action.addNotificationListener(['set'], handler)` filtrando notificações que afetem `foregroundColor`/`backgroundColor`, e `action.addNotificationListener(['select'], handler)` filtrado para troca de documento ativo, entregando a nova cor em RGB ao `callback`
    - _Requirements: 10.2, 10.5_
  - [ ] 10.4 Implementar `getCmykProfile()`
    - Ler `app.activeDocument.colorProfileName` (ou, via `batchPlay`, o perfil CMYK do documento) e retornar `null` quando o documento não tiver um perfil CMYK associado
    - _Requirements: 11.7, 11.8, 8.5_
  - [ ] 10.5 Implementar reconexão automática e modo offline
    - Ao capturar exceção de qualquer chamada à API UXP, marcar `isConnected() === false` e emitir um evento de status consultável por `main.js`
    - Implementar um retry poll de baixo custo (~1s) chamando `pullForeground()`; ao suceder, reconectar, atualizar o estado com a cor atual do Photoshop e limpar o status de falha, dentro de 5 segundos
    - _Requirements: 10.6, 10.7_
  - [ ]* 10.6 Escrever testes unitários de `ps-bridge.js`
    - Usar mocks do módulo `photoshop` para validar: debounce de 50ms (uma única escrita ao soltar após múltiplos eventos de `commit:false`), modo offline quando a API lança erro, reconexão automática restaurando a cor e limpando o status, e `getCmykProfile()` retornando `null` para documento sem perfil CMYK
    - Arquivo `tests/unit-ps-bridge.test.js`
    - _Requirements: 10.1, 10.6, 10.7, 11.8_

- [ ] 11. Portar `panels.js` — sliders, hex, dials, gamut, mixer, rampas
  - [ ] 11.1 Criar `color-wheel-plugin/js/panels.js` com Slider_Panel
    - Copiar de `demo/js/panels.js` sem alterar a lógica: definição `MODES` (RGB/HSV/LAB/CMYK/B-W), `buildSliders`/`valueFromPointer`/`quantize`/`commitChannel`/`wireSliderTrack`/`wireSliderInput`/`refreshSliders`/`buildModeButtons`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [ ]* 11.2 Escrever teste de propriedade para clamp de range dos sliders
    - **Property 9: Clamp de range dos sliders**
    - **Validates: Requirements 4.6**
    - Arquivo `tests/property-09-slider-clamp.test.js`, cobrindo os 5 modos de cor
  - [ ]* 11.3 Escrever testes unitários de rejeição de entrada não numérica no slider
    - Cobrir `wireSliderInput` rejeitando caracteres fora do padrão permitido por canal (negativo só em LAB a/b, decimal só em LAB) e mantendo o último valor válido
    - Arquivo `tests/unit-slider-input-rejection.test.js`
    - _Requirements: 4.7_
  - [ ] 11.4 Adicionar Color_Preview/Hex_Display em `js/panels.js`
    - Copiar `initHex`/`commitHex`/`refreshHex` de `demo/js/panels.js` sem alterar a lógica
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_
  - [ ]* 11.5 Escrever testes unitários de reversão do Hex_Display
    - Cobrir `commitHex` revertendo ao último valor válido e aplicando indicação visual de erro por 2 segundos quando a entrada for inválida
    - Arquivo `tests/unit-hex-revert.test.js`
    - _Requirements: 6.5_
  - [ ] 11.6 Adicionar BT_Controls em `js/panels.js`
    - Copiar `drawDial`/`ratioFromPointer`/`initDials`/`refreshDials` de `demo/js/panels.js` sem alterar a lógica, incluindo o uso de `AppState.setTempOffset`/`state.tempOffset` para deslocar o matiz na leitura sem alterar o H armazenado
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [ ]* 11.7 Escrever teste de propriedade para o dial de brilho
    - **Property 7: Dial de brilho preserva matiz e saturação**
    - **Validates: Requirements 7.2, 7.6**
    - Arquivo `tests/property-07-brightness-dial.test.js`
  - [ ]* 11.8 Escrever teste de propriedade para o dial de temperatura
    - **Property 8: Dial de temperatura desloca matiz dentro de ±60° preservando S e V**
    - **Validates: Requirements 7.3**
    - Arquivo `tests/property-08-temperature-dial.test.js`
  - [ ] 11.9 Adicionar Gamut_Indicator UI em `js/panels.js`
    - Copiar `refreshGamut`/`initGamut` de `demo/js/panels.js`; adaptar a fonte do envelope de gamut para usar `PsBridge.getCmykProfile()` quando disponível em vez da aproximação fixa `maxChroma(L)` do demo, e cair no estado de erro do Requisito 8.5 quando o perfil não estiver disponível
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 11.10 Escrever testes unitários do estado de erro de perfil CMYK ausente
    - Cobrir Gamut_Indicator exibindo o ícone de erro e desabilitando a correção de gamut quando `PsBridge.getCmykProfile()` resolve para `null`, e o Slider_Panel no modo CMYK exibindo a mesma mensagem em vez de números
    - Arquivo `tests/unit-gamut-cmyk-missing.test.js`
    - _Requirements: 8.5, 11.8_
  - [ ] 11.11 Adicionar Mixer_Panel em `js/panels.js`
    - Copiar `initMixer`/`initTrack`/`refreshMixer`/`refreshHistoryBar`/`refreshBlenderCanvas`/`refreshShadesCanvas`/`refreshSwatchesBar`/`refreshSchemeCanvas`/`feedMixerFromWheel` de `demo/js/panels.js` sem alterar a lógica (5 faixas: Color history, Blender, Shades & tones, Swatches, Scheme)
    - Adaptar o rodapé de import/export de barras (`#mixExport`/`#mixImport`) para persistir em `colorWheelPlugin.mixerStrips.v1` via `localStorage` em vez do fluxo manual de exportação de texto do demo
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 11.12 Escrever teste de propriedade para mistura linear do Mixer_Panel
    - **Property 10: Mistura linear do Mixer_Panel**
    - **Validates: Requirements 5.4**
    - Arquivo `tests/property-10-mixer-lerp.test.js`
  - [ ]* 11.13 Escrever testes unitários do Mixer_Panel com menos de 2 cores de origem
    - Cobrir a faixa Blender desabilitando o slider de proporção e exibindo mensagem quando não há 2 cores de origem distintas definidas
    - Arquivo `tests/unit-mixer-insufficient-sources.test.js`
    - _Requirements: 5.6_
  - [ ] 11.14 Adicionar UI da rampa B/W em `js/panels.js`
    - Copiar `initBwRamp`/`refreshBwRamp` de `demo/js/panels.js` sem alterar a lógica (botões `−`/`+`, destaque do degrau mais próximo, tick marks)
    - _Requirements: 15.1, 15.2, 15.3, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12_
  - [ ] 11.15 Adicionar UI do Color_Limiter em `js/panels.js`
    - Copiar `initLimit`/`refreshLimit` de `demo/js/panels.js` sem alterar a lógica (controle de habilitação, seletor de N, sobreposição de edição de rotação com snap SHIFT/CTRL)
    - _Requirements: 14.1, 14.2, 14.3, 14.13, 14.14, 14.15_

- [ ] 12. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Wiring final — `main.js` e boot do plugin
  - [ ] 13.1 Criar `color-wheel-plugin/js/main.js` a partir de `demo/js/main.js`
    - Copiar `refreshSwatches`/`initSwatches`/`initMenu`/`buildArc`/`refreshArc`/`initShape`/`refreshShape`/`initLumLock`/`initValueCheck`/`initMaskRack`/`initGamut`/`initHarmonyEdit`/`initValueBar`/`initRotation`/`initTabs`/`initHistory`/`refreshHistoryButtons`/`refreshStatus`/`init` sem alterar a lógica
    - Remover a chamada a `Docking.init()`
    - Adicionar a chamada a `PsBridge.init()` no boot, e assinar `PsBridge.onExternalColorChange(...)` para propagar cores externas ao `AppState`; usar `PsBridge.isConnected()` para alimentar `refreshStatus()` com "Modo offline — sincronização com Photoshop indisponível" (reaproveitando `#statusBar`)
    - Adicionar verificação de `require('photoshop').app.hostVersion` no boot: se inferior a 24, renderizar mensagem de incompatibilidade em vez do painel, sem lançar exceção não capturada
    - _Requirements: 3.5, 3.6, 9.7, 10.4, 10.5, 10.6, 10.7, 13.3, 13.4_
  - [ ] 13.2 Completar o boot com a restauração de estado persistido
    - No `init()`, restaurar Color_Limiter (`colorWheelPlugin.limiter.v1`), BW_Ramp (`colorWheelPlugin.bwSteps.v1`), paletas (`colorWheelPlugin.palettes.v1`) e faixas do mixer (`colorWheelPlugin.mixerStrips.v1`) antes da primeira renderização
    - _Requirements: 14.18, 15.13_
  - [ ]* 13.3 Escrever testes de integração do fluxo completo local
    - Cobrir, com `PsBridge` mockado: selecionar cor via wheel/slider/hex propaga a todas as visualizações dentro do orçamento de tempo definido nos Requisitos 4.3/4.4/6.2/7.5, e o plugin continua funcional quando `PsBridge.isConnected()` é `false` (modo offline)
    - Arquivo `tests/integration-full-flow.test.js`
    - _Requirements: 10.6, 12.3_

- [ ] 14. Checkpoint final — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tarefas marcadas com `*` são de teste (propriedade ou unitário) e podem ser puladas para um MVP mais rápido; nenhuma tarefa de teste implementa funcionalidade nova.
- Cada teste de propriedade referencia o número da Property correspondente no design.md e as cláusulas de requisito que ela valida, para rastreabilidade.
- Os módulos `palettes.js` (tarefa 8.1) e `gode.js` (tarefa 8.2) são portados como recursos adicionais do demo — o requirements.md define os termos `Palette_Manager`, `Saved_Palette`, `Swatch`, `Mixing_Canvas`, `Blend_Strength` e `Eyedropper` no Glossary, mas não possui uma seção "Requisito N" numerada dedicada a eles; o design.md os lista na Architecture como portados sem alteração de lógica.
- **Verificação manual dentro do Photoshop (fora do escopo de execução automática desta lista de tarefas)** — não existe harness de teste automatizado para o runtime UXP; a checklist abaixo, já descrita na Testing Strategy do design.md, deve ser executada manualmente em uma instalação real do Photoshop v24+ após a implementação:
  - `PS_Bridge`: selecionar cor no plugin → foreground do Photoshop muda; usar o color picker nativo → plugin reflete a mudança em até 500ms
  - `PS_Bridge`: debounce — arrastar o wheel continuamente gera apenas uma escrita final no Photoshop, não uma por frame
  - Persistência do painel: fechar e reabrir o Photoshop, painel reaparece sem reativação manual (Requisito 13.2)
  - Gating de versão: mensagem de incompatibilidade não gera erro não capturado em versões < v24 (Requisito 13.4)
  - Leitura do perfil CMYK: documento CMYK com perfil configurado vs. documento RGB sem perfil, confirmando os dois caminhos do Requisito 11.7/11.8
  - Performance: arrastar o wheel/triângulo mantém ≥30fps percebidos (Requisito 12.1)
  - Tempo de boot ≤2s (Requisito 12.2) e apresentação do painel em ≤5s após abertura (Requisito 13.3)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["3.1", "7.1"] },
    { "id": 2, "tasks": ["4.1", "3.2", "3.3", "3.4", "3.5", "3.6", "7.2"] },
    { "id": 3, "tasks": ["4.2", "6.1", "11.1", "8.1", "8.2", "10.1"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "6.2", "11.2", "11.3", "11.4", "10.2"] },
    { "id": 5, "tasks": ["4.11", "11.5", "11.6", "10.3"] },
    { "id": 6, "tasks": ["11.7", "11.8", "11.9", "10.4"] },
    { "id": 7, "tasks": ["11.10", "11.11", "10.5"] },
    { "id": 8, "tasks": ["11.12", "11.13", "11.14", "10.6"] },
    { "id": 9, "tasks": ["11.15"] },
    { "id": 10, "tasks": ["13.1"] },
    { "id": 11, "tasks": ["13.2"] },
    { "id": 12, "tasks": ["13.3"] }
  ]
}
```
