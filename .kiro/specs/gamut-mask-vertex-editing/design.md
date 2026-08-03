# Design da Correção: Edição de Vértices da Máscara de Gamut

## Overview

A edição livre de vértices da máscara de gamut apresenta dois defeitos que se manifestam em conjunto: os vértices ficam presos à bounding box do espaço unitário, e a superfície de cor não se regenera quando os pontos mudam. O resultado é que o modo de edição de vértices é visualmente inoperante — o contorno se move, mas a região de cor permanece estática.

A causa imediata do Sub-bug A é o `C.clamp(x, -1, 1)` em `setMaskVertex`, que impede coordenadas unitárias fora de ±1. Esse clamp foi pensado para manter os vértices dentro da caixa de alças, mas ignora que a caixa de alças não é o limite da área útil — o disco é. Quando `rx` e `ry` são pequenos, a projeção do vértice no disco tem folga de sobra, mas o clamp impede o movimento.

A causa imediata do Sub-bug B é a composição da `maskKey` em `render()` de `wheel.js`: ela usa `kind`, `cx`, `cy`, `rx`, `ry` e `angle`, mas não inclui `gamut.points`. Quando `setMaskVertex` atualiza os pontos, nenhum dos componentes da chave muda, e o cache da superfície não é invalidado.

## Glossary

- **Espaço unitário**: Sistema de coordenadas local da máscara, onde o polígono canônico é definido. Transformado para coordenadas do disco por `unitToDisc(x, y)` via escala por `rx`/`ry`, rotação por `angle` e translação por `cx`/`cy`
- **Espaço do disco**: Sistema de coordenadas da roda de cor, com raio 1 centrado na origem. Um ponto com `hypot(u, v) ≤ 1` está dentro da área útil
- **Bounding box**: O retângulo `[-1, -1]` a `[1, 1]` no espaço unitário, que corresponde aos quatro cantos da caixa de alças
- **`maskKey`**: String usada como componente da chave de cache da superfície (`svCacheKey`) em `wheel.js`, que determina se a superfície precisa ser repintada
- **`svCacheKey`**: Chave completa do cache da superfície de saturação/valor, concatenando `driver`, `svSteps`, `hueSteps`, `shape`, `wheelRotation`, `gray` e `maskKey`
- **F**: O código como está hoje (não corrigido)
- **F'**: O código depois da correção

## Bug Details

### Bug Condition

**Sub-bug A** se manifesta quando o usuário arrasta um vértice para uma coordenada unitária com `|x| > 1` ou `|y| > 1`, mas cuja projeção no disco (via `unitToDisc`) tem `hypot(u, v) ≤ 1`. Nesse instante `setMaskVertex` clampeia a coordenada a ±1 e o vértice não atinge a posição desejada — fica preso ao retângulo da caixa.

**Sub-bug B** se manifesta em qualquer edição de vértice bem-sucedida: `state.gamut.points` muda, mas nenhum componente de `maskKey` muda, e `svCacheKey === svKey` continua verdadeiro. A superfície não é repintada.

**Formal Specification:**

```
FUNCTION isBugConditionA(input)
  INPUT: input of type VertexEdit
    input.index   : índice do vértice
    input.unitX   : coordenada X no espaço unitário
    input.unitY   : coordenada Y no espaço unitário
    input.gamut   : { cx, cy, rx, ry, angle, kind, points }
  OUTPUT: boolean

  disc ← unitToDisc(input.unitX, input.unitY)
  RETURN (|input.unitX| > 1 OR |input.unitY| > 1)
         AND hypot(disc.u, disc.v) ≤ 1
END FUNCTION

FUNCTION isBugConditionB(input)
  INPUT: input of type VertexEdit
    input.index   : índice do vértice
    input.newX    : nova coordenada X (aceita por setMaskVertex)
    input.newY    : nova coordenada Y (aceita por setMaskVertex)
  OUTPUT: boolean

  // Qualquer edição aceita dispara o sub-bug B,
  // porque a chave de cache nunca inclui gamut.points
  RETURN setMaskVertex(input.index, input.newX, input.newY) = true
END FUNCTION

FUNCTION expectedBehaviorA(stored, input)
  RETURN stored.x = input.unitX AND stored.y = input.unitY
END FUNCTION

FUNCTION expectedBehaviorB(cacheInvalidated)
  RETURN cacheInvalidated = true
END FUNCTION
```

### Examples

- **Hexágono com `rx=0.3, ry=0.3`.** Vértice canônico em `(1, 0)` projeta para `(0.3, 0)` no disco — raio 0.3, dentro do disco. Arrastar para `(2.5, 0)` no unitário projetaria para `(0.75, 0)` — raio 0.75, dentro do disco. Mas `setMaskVertex` clampeia a `(1, 0)` e o vértice não se move.

- **Retângulo com `rx=0.72, ry=0.24`.** Vértice em `(-1, -1)` projeta para `(-0.72, -0.24)` — raio 0.76. Arrastar para `(-1, -3)` projetaria para `(-0.72, -0.72)` — raio 1.02, fora do disco. Nesse caso o clamp ao disco é legítimo; o vértice deve parar no raio 1 do disco.

- **Qualquer edição aceita.** Mover o vértice 0 de `(1, 0)` para `(0.5, 0.5)`: a forma muda, o contorno vermelho se move, mas a superfície pintada permanece estática porque `maskKey` não mudou.

- **Caso que já funciona.** Mover o vértice 0 de `(1, 0)` para `(0.8, -0.3)`: ambas coordenadas dentro de ±1. O clamp não atua, `setMaskVertex` aceita. Mas a superfície ainda não se regenera (Sub-bug B sempre presente).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Formatos `ellipse` e `dual` continuam sem vértices editáveis
- Máscara travada continua rejeitando edição
- Valores não numéricos e índices fora da faixa continuam rejeitados
- Escolher outro formato no rack continua descartando os pontos editados
- `resetMaskVertices` continua descartando os pontos e mantendo posição/tamanho/rotação
- Redimensionar, rotacionar e mover a máscara pelas alças continua alterando `cx`, `cy`, `rx`, `ry`, `angle` sem tocar em `gamut.points`
- Centro, tamanho e rotação continuam intactos quando um vértice é movido
- A superfície continua sendo invalidada pelas dependências existentes (driver, svSteps, hueSteps, shape, wheelRotation, gray, kind, cx, cy, rx, ry, angle)
- O polígono canônico dos formatos padrão continua inscrito na caixa quando nenhum vértice foi editado
- `insideMask` e `clampToMask` continuam lendo `gamut.points` ao vivo (já funcionam corretamente)
- A recolha de centro até a máscara ter uma região alcançável continua funcionando

**Scope:**

As mudanças estão confinadas a:
- `setMaskVertex` em `state.js` (lógica de clamp)
- `render()` ou subscriber em `wheel.js` (invalidação de cache)

Não se toca em: `color.js`, `panels.js`, `layout*.js`, `platform.js`, `ps-bridge.js`, `panel-sync.js`, nem na geometria de `insideMask`/`clampToMask`/`unitInside`/`unitClamp`.

## Hypothesized Root Cause

**Sub-bug A — confirmado por leitura de código:**

Em `state.js`, linha ~600:
```javascript
base[index] = { x: C.clamp(x, -1, 1), y: C.clamp(y, -1, 1) };
```

O `C.clamp` limita a coordenada unitária a ±1 incondicionalmente. O comentário do código diz "os pontos vivem no espaço unitário, limitados a ±1: é o mesmo espaço da caixa de alças". Mas a caixa de alças é apenas o retângulo canônico — não é o limite da área útil. Quando `rx` e `ry` são < 1, a projeção de coordenadas unitárias > 1 cai dentro do disco com folga. O limite natural do vértice é o raio do disco, não a bounding box.

**Sub-bug B — confirmado por leitura de código:**

Em `wheel.js`, `render()`:
```javascript
const maskKey = masked
  ? `${g.kind}|${g.cx.toFixed(3)}|${g.cy.toFixed(3)}|${g.rx.toFixed(3)}|${g.ry.toFixed(3)}|${Math.round(g.angle)}`
  : 'nomask';
```

A chave não inclui `gamut.points`. Quando `setMaskVertex` altera os pontos, `maskKey` permanece o mesmo. O subscriber em `init()` só invalida `svCacheKey` para `reason === 'shape'` ou `reason === 'rotation'`. A emissão de `setGamut` é `'gamut'` seguido de `'color'` — nenhum dos dois invalida o cache. A superfície fica congelada.

## Correctness Properties

Property 1: Bug Condition A — Vértice não preso à bounding box

_For any_ edição de vértice em que a coordenada unitária excede ±1 mas cuja projeção no disco tem raio ≤ 1, o código corrigido SHALL aceitar a coordenada exata e armazená-la em `gamut.points` sem clampar.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition B — Superfície invalida com edição de vértice

_For any_ edição de vértice aceita (retorno `true`), o código corrigido SHALL invalidar o cache da superfície de modo que o próximo render produza uma imagem consistente com a forma atualizada.

**Validates: Requirements 2.3, 2.4**

Property 3: Preservation — Comportamento inalterado

_For any_ entrada que não satisfaz nenhuma das condições de bug — formatos sem vértice, máscara travada, valores inválidos, índices fora da faixa, coordenadas dentro de ±1 com projeção no disco — o código corrigido SHALL produzir o mesmo resultado que o código atual.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Alternativas avaliadas — Sub-bug A

**Alternativa A1 — Ampliar o clamp para ±2 ou ±3.**
Troca o limite arbitrário `1` por outro limite arbitrário. Resolve parcialmente: com `rx=0.3`, o vértice a `(3, 0)` projeta para `(0.9, 0)` — dentro do disco. Mas não há valor fixo que funcione para todos os `rx`/`ry`, e o limite fica incoerente com a área útil real. Rejeitada.

**Alternativa A2 — Não clampar e deixar o espaço unitário se estender.**
Remove o clamp completamente. O vértice pode ir para qualquer lugar, e a projeção pode sair do disco. Simples mas perigosa: vértices fora do disco geram formas sem nenhuma região de cor alcançável, e `insideMask` devolveria `true` para pontos que a roda não tem. Rejeitada sem alguma forma de contenção.

**Alternativa A3 — Redefinir o espaço unitário para que o disco inteiro seja alcançável.**
Mudaria a semântica do espaço unitário para que `(1, 0)` mapeie para o ponto mais distante do disco no eixo X. Isso quebraria todas as definições de polígono canônico (`MASK_SHAPES`), as alças, e a semântica de `rx`/`ry`. Rejeitada pelo custo e risco de regressão.

**Alternativa A4 — Clampar no espaço do disco (raio ≤ 1). Escolhida.**
Em vez de clampar a coordenada unitária, projeta-a para o disco via `unitToDisc`. Se o ponto resultante tem `hypot(u, v) > 1`, normaliza para raio 1 e projeta de volta via `discToUnit`. Se `hypot ≤ 1`, aceita a coordenada unitária original sem alteração. Isso:
- Permite ao vértice atingir qualquer ponto dentro do disco
- Impede que o vértice saia do disco (sem cor alcançável lá fora)
- Não altera a semântica do espaço unitário nem os polígonos canônicos
- É coerente com o comportamento do Coolorus e de outros editores de máscara

**Alternativa A4 — implementação:**
```javascript
function setMaskVertex(index, x, y) {
  if (state.gamut.locked) return false;
  if (!isNum(x) || !isNum(y)) return false;

  const base = maskVertices();
  if (!base || index < 0 || index >= base.length) return false;

  // Clampar ao disco, não à bounding box
  const disc = unitToDisc(x, y);
  const r = Math.hypot(disc.u, disc.v);
  if (r > 1) {
    // Normaliza para raio 1 e projeta de volta
    const clamped = discToUnit(disc.u / r, disc.v / r);
    x = clamped.x;
    y = clamped.y;
  }

  base[index] = { x, y };
  state.gamut.points = base;

  setGamut({});
  return true;
}
```

### Alternativas avaliadas — Sub-bug B

**Alternativa B1 — Incluir `gamut.points` na chave de cache.**
Serializar `gamut.points` como parte de `maskKey`. Funciona, mas serializar um array de 3–6 pontos com `toFixed` a cada frame é custo desnecessário, e a string fica longa. Aceitável como fallback.

**Alternativa B2 — Invalidar o cache em `setMaskVertex`. Escolhida.**
`setMaskVertex` já chama `setGamut({})`, que emite `'gamut'`. Basta o subscriber de `wheel.js` invalidar `svCacheKey` quando `reason === 'gamut'`. Isso é:
- Mínimo: uma condição a mais no subscriber existente
- Correto: toda mudança de máscara (posição, tamanho, rotação, vértices) emite `'gamut'`
- Eficiente: não serializa nada, não aloca

**Alternativa B2 — implementação:**
```javascript
S.subscribe((st, reason) => {
  if (reason === 'shape' || reason === 'rotation' || reason === 'gamut') svCacheKey = null;
  requestRender();
});
```

**Alternativa B3 — Forçar `svCacheKey = null` dentro de `setMaskVertex`.**
Acopla `state.js` ao estado interno de `wheel.js`. Rejeitada: `state.js` não conhece e não deve conhecer o cache de render.

### Changes Required

**Arquivo**: `demo/js/state.js`

1. **`setMaskVertex`**: substituir o `C.clamp(x, -1, 1)` / `C.clamp(y, -1, 1)` pela projeção e clamp ao disco conforme Alternativa A4.

**Arquivo**: `demo/js/wheel.js`

2. **Subscriber em `init()`**: acrescentar `reason === 'gamut'` à condição que invalida `svCacheKey`.

## Testing Strategy

### Validation Approach

Os testes seguem a mesma metodologia do spec de referência: explorar primeiro (confirmar que o bug existe no código atual), preservar segundo (fixar a linha de base que não deve mudar), corrigir terceiro.

Os testes ficam em `tests/gamut-mask-vertex-editing.test.js`, rodam com `node:test` e `fast-check`, carregam os módulos por `require` como `tests/gamut-mask.test.js` faz, e entram na lista de `npm test` na raiz.

### Exploratory Bug Condition Checking

**Goal**: Produzir contraexemplos que demonstrem ambos os sub-bugs ANTES de implementar a correção.

**Test Plan**:

1. **Sub-bug A — determinístico**: configurar máscara hexagonal com `rx=0.3, ry=0.3`, pegar o vértice 0 (que está em `(1, 0)`) e tentar movê-lo para `(2.5, 0)`. A projeção `unitToDisc(2.5, 0)` dá `(0.75, 0)` — raio 0.75, dentro do disco. Verificar que `maskVertices()[0]` ficou em `(2.5, 0)`. No código atual falhará: estará em `(1, 0)`.

2. **Sub-bug A — propriedade**: gerar coordenadas unitárias com `|x|` ou `|y|` > 1 cuja projeção no disco tem raio ≤ 1, e verificar que `setMaskVertex` aceita sem clampar. No código atual falhará para toda coordenada fora de ±1.

3. **Sub-bug B — determinístico**: mover um vértice e verificar que `insideMask` para um ponto excluído pela nova forma retorna `false` E que a chave `maskKey` (ou algum mecanismo equivalente) mudou. A parte de `insideMask` já passa (lê ao vivo), mas a parte da chave falhará.

4. **Sub-bug B — propriedade via proxy**: como o cache de render vive dentro do closure de `wheel.js` e não é acessível em teste unitário, usar um proxy: verificar que após `setMaskVertex`, chamar `render()` (ou a lógica equivalente) produz uma chave de cache diferente da anterior. Alternativa: verificar que o subscriber de `'gamut'` está configurado para invalidar.

**Expected Counterexamples**:

- Sub-bug A: toda coordenada com componente > 1 ou < -1 é clampada a ±1, independentemente da projeção no disco.
- Sub-bug B: `maskKey` não muda nunca com edição de vértice — a string é idêntica antes e depois.

### Fix Checking

```
FOR ALL input WHERE isBugConditionA(input) DO
  setMaskVertex'(input.index, input.unitX, input.unitY)
  stored ← maskVertices'()[input.index]
  ASSERT stored.x = input.unitX AND stored.y = input.unitY
END FOR

FOR ALL input WHERE isBugConditionB(input) DO
  // Após edição, o subscriber de 'gamut' invalida svCacheKey
  ASSERT cacheInvalidated = true
END FOR
```

### Preservation Checking

```
FOR ALL input WHERE NOT isBugConditionA(input) AND NOT isBugConditionB(input) DO
  ASSERT F(input) = F'(input)
END FOR
```

**Test Cases de Preservação**:

1. Formatos sem vértice (`ellipse`, `dual`): `maskVertices()` retorna `null`
2. Máscara travada: `setMaskVertex` retorna `false`
3. Valores não numéricos: `setMaskVertex` retorna `false`
4. Índice fora da faixa: `setMaskVertex` retorna `false`
5. Vértice movido para dentro de ±1: aceito, ponto armazenado (já funciona)
6. Centro, tamanho e rotação intactos após edição de vértice
7. Trocar formato descarta pontos editados
8. `resetMaskVertices` descarta pontos e preserva enquadramento

### Unit Tests

- Caso concreto: hexágono `rx=0.3`, vértice 0 movido para `(2.5, 0)` — verificar que ficou em `(2.5, 0)`
- Caso concreto: vértice movido para posição cuja projeção tem raio > 1 — verificar que foi clampado ao disco
- Caso concreto: mover vértice e verificar que `insideMask` reflete a nova forma
- `maskKey` ou mecanismo de invalidação: mover vértice e verificar que a chave de cache mudou
- Todos os testes existentes de `tests/gamut-mask.test.js` continuam passando (exceto o teste que verifica clamp a ±1, que precisará ser atualizado)

### Property-Based Tests

- **Property 1 (Sub-bug A)**: para todo vértice com projeção no disco ≤ 1, `setMaskVertex'` aceita e armazena a coordenada exata
- **Property 2 (Sub-bug A)**: para todo vértice com projeção no disco > 1, `setMaskVertex'` clampeia ao raio 1 do disco e a coordenada armazenada projeta para exatamente raio 1
- **Property 3 (Sub-bug B)**: para toda edição de vértice aceita, o mecanismo de invalidação de cache é acionado
- **Property 4 (Preservation)**: para toda entrada fora das condições de bug, o resultado é idêntico ao do código atual
