# Implementation Plan: Edição de Vértices da Máscara de Gamut

## Overview

A ordem segue a metodologia de condição do bug: explorar antes de corrigir. A tarefa 1 escreve um teste que FALHA no código atual, exercitando ambos os sub-bugs. A tarefa 2 fixa o comportamento a preservar, observando o código atual. Só a tarefa 3 mexe no código de produção.

Os testes ficam em `tests/gamut-mask-vertex-editing.test.js`, rodam com `node:test` e `fast-check`, carregam os módulos por `require` como `tests/gamut-mask.test.js` faz, e o arquivo entra na lista de `npm test` na raiz.

## Tasks

- [ ] 1. Escrever o teste de exploração da condição do bug
  - **Property 1: Bug Condition A** — Vértice não preso à bounding box
  - **Property 2: Bug Condition B** — Superfície invalida com edição de vértice
  - **CRÍTICO**: este teste DEVE FALHAR no código não corrigido — a falha confirma que o bug existe
  - **NÃO tente corrigir o teste nem o código quando ele falhar**
  - Criar `tests/gamut-mask-vertex-editing.test.js` com `node:test`, `fast-check` e `require('./setup.js')`
  - Carregar `color.js`, `state.js` e `wheel.js` pelo mesmo padrão de `tests/gamut-mask.test.js`
  - **Sub-bug A — caso determinístico**: configurar máscara hexagonal com `rx=0.3, ry=0.3, cx=0, cy=0, angle=0`; o vértice 0 do hexágono está em ~`(1, 0)` no espaço unitário; chamar `setMaskVertex(0, 2.5, 0)` — a projeção `unitToDisc(2.5, 0)` dá `(0.75, 0)`, raio 0.75, dentro do disco; verificar que `maskVertices()[0]` é `(2.5, 0)` e não `(1, 0)`
  - **Sub-bug A — propriedade com fast-check**: gerar `rx` em `[0.1, 0.5]`, `ry` em `[0.1, 0.5]`, coordenada unitária `(x, y)` com pelo menos um componente `> 1` ou `< -1`, filtrada por `hypot(unitToDisc(x, y)) ≤ 1`; verificar que `setMaskVertex` aceita e armazena `(x, y)` sem alteração
  - **Sub-bug B — caso determinístico**: configurar máscara retangular com `rx=0.9, ry=0.9, editing=true`; verificar que `insideMask(h, s)` para um ponto próximo ao canto superior direito retorna `true`; mover o canto para o centro `(0.05, -0.05)`; verificar que `insideMask` para o mesmo ponto agora retorna `false` (já funciona); construir a `maskKey` como `wheel.js` faz e verificar que ela NÃO mudou (mostrando que a superfície não seria regenerada)
  - **Sub-bug B — verificação de invalidação**: verificar que o subscriber de `wheel.js` configurado em `init()` NÃO invalida `svCacheKey` quando `reason === 'gamut'` (para provar que o bug existe); como `init()` toca o DOM, simular o subscriber à mão: `S.subscribe((st, reason) => { ... })` e verificar que `'gamut'` não está na condição
  - Rodar com `node --test tests/gamut-mask-vertex-editing.test.js`
  - **RESULTADO ESPERADO**: o teste FALHA — a falha é a prova do bug
  - Documentar contraexemplos: para Sub-bug A, a coordenada armazenada é `(1, 0)` em vez de `(2.5, 0)`; para Sub-bug B, `maskKey` é idêntica antes e depois da edição
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [ ] 2. Escrever os testes de preservação (ANTES de implementar a correção)
  - **Property 3: Preservation** — Comportamento inalterado fora da condição do bug
  - **IMPORTANTE**: seguir a metodologia de observação primeiro — rodar no código NÃO CORRIGIDO, confirmar que passam
  - Observar e fixar: `ellipse` e `dual` retornam `null` de `maskVertices()`
  - Observar e fixar: máscara travada rejeita `setMaskVertex` com `false`
  - Observar e fixar: valores não numéricos (`NaN`, `Infinity`) rejeitados com `false`
  - Observar e fixar: índice fora da faixa rejeitado com `false`
  - Observar e fixar: vértice movido para dentro de ±1 é aceito e armazenado (com `fast-check`: gerar `(x, y)` em `[-1, 1]`)
  - Observar e fixar: centro, tamanho e rotação intactos após edição de vértice
  - Observar e fixar: trocar formato descarta pontos editados
  - Observar e fixar: `resetMaskVertices` descarta pontos e mantém enquadramento
  - Observar e fixar: `insideMask` e `clampToMask` leem `gamut.points` ao vivo após edição
  - Rodar no código NÃO CORRIGIDO
  - **RESULTADO ESPERADO**: os testes PASSAM — confirma a linha de base
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [ ] 3. Correção da edição de vértices da máscara de gamut

  - [ ] 3.1 Substituir o clamp de bounding box pelo clamp ao disco
    - Em `demo/js/state.js`, na função `setMaskVertex`, substituir `{ x: C.clamp(x, -1, 1), y: C.clamp(y, -1, 1) }` pela lógica: projetar `(x, y)` para o disco via `unitToDisc`; se `hypot(u, v) > 1`, normalizar para raio 1 e projetar de volta via `discToUnit`; se `hypot ≤ 1`, aceitar `(x, y)` sem alteração
    - Atualizar o comentário de `setMaskVertex` para refletir que o limite é o disco, não a caixa
    - _Bug_Condition: isBugConditionA — coordenada unitária fora de ±1 com projeção no disco ≤ 1_
    - _Expected_Behavior: vértice armazenado na coordenada exata_
    - _Requirements: 2.1, 2.2_

  - [ ] 3.2 Invalidar o cache da superfície ao editar vértices
    - Em `demo/js/wheel.js`, no subscriber de `S.subscribe` dentro de `init()`, acrescentar `reason === 'gamut'` à condição que faz `svCacheKey = null`
    - A condição final fica: `if (reason === 'shape' || reason === 'rotation' || reason === 'gamut') svCacheKey = null;`
    - _Bug_Condition: isBugConditionB — qualquer edição de vértice aceita_
    - _Expected_Behavior: superfície regenerada no próximo render_
    - _Requirements: 2.3, 2.4_

  - [ ] 3.3 Atualizar o teste existente que verifica clamp a ±1
    - Em `tests/gamut-mask.test.js`, o teste `'vértice fora da caixa é recolhido para ±1'` verifica que `setMaskVertex(0, 5, -9)` resulta em `(1, -1)`. Após a correção, o vértice será clampado ao disco, não à caixa. Atualizar o teste para verificar o novo comportamento: a coordenada armazenada deve projetar para raio ≤ 1 no disco
    - _Requirements: 2.2, 3.2_

  - [ ] 3.4 Verificar que o teste de exploração agora passa
    - **Property 1 & 2: Bug Conditions A e B**
    - Rodar o MESMO teste da tarefa 1 no código corrigido
    - **RESULTADO ESPERADO**: o teste PASSA, confirmando que ambos os sub-bugs foram corrigidos
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.5 Verificar que os testes de preservação continuam passando
    - **Property 3: Preservation**
    - Rodar os MESMOS testes da tarefa 2 no código corrigido
    - Confirmar que `tests/gamut-mask.test.js` (atualizado na 3.3) segue passando
    - **RESULTADO ESPERADO**: os testes PASSAM, confirmando que não há regressão
    - _Requirements: 3.1–3.10_

- [ ] 4. Testes de regressão no runner do projeto
  - Acrescentar `tests/gamut-mask-vertex-editing.test.js` ao script `test` do `package.json` da raiz
  - Acrescentar teste unitário: vértice com projeção fora do disco (raio > 1) é clampado — coordenada armazenada projeta para raio ≈ 1
  - Acrescentar teste unitário: vértice com projeção dentro do disco (raio ≤ 1) mas fora de ±1 é aceito sem clamp
  - Acrescentar teste unitário: após mover vértice, `insideMask` para um ponto que a nova forma exclui retorna `false` (coerência visual)
  - Acrescentar teste unitário: redimensionar a máscara (`rx`, `ry`) não afeta `gamut.points`
  - Rodar a suíte inteira com `npm test` na raiz
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2, 3.7_

- [ ] 5. Checkpoint — conferir a suíte completa e o comportamento visual
  - Garantir que todos os testes passam com `npm test`
  - Conferir no painel o ciclo do relato: abrir edição de vértices no hexágono, arrastar um vértice para fora da bounding box vermelha, verificar que o vértice acompanha o ponteiro e que a superfície de cor se adapta à nova forma
  - Verificar que a caixa de alças (contorno tracejado) NÃO limita mais o movimento dos vértices brancos
  - Verificar que ao mover o vértice de volta, a superfície se readapta em tempo real

## Notes

- A tarefa 1 falhando é o resultado correto dela; a tarefa 2 passando é o resultado correto dela
- Se a tarefa 1 passar no código não corrigido, algo está errado: o teste não está exercitando a condição do bug
- O teste existente `'vértice fora da caixa é recolhido para ±1'` em `gamut-mask.test.js` precisará ser atualizado (tarefa 3.3) porque o novo comportamento clampeia ao disco, não à caixa
- Nenhuma tarefa toca `demo/js/color.js`, `demo/js/panels.js` ou `demo/js/layout*.js`
- A mudança em `wheel.js` é uma condição a mais no subscriber já existente — risco mínimo de regressão

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5"] }
  ]
}
```
