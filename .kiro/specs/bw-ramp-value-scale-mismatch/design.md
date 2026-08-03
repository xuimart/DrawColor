# B/W Ramp Value Scale Mismatch — Bugfix Design

## Overview

O canal K do modo B/W e a régua de valores operam em escalas diferentes, causando divergência entre o valor exibido e o degrau selecionado. A leitura usa L* (LAB perceptual), a escrita usa porcentagem linear de cinza 8 bits, e a régua gera amostras numa terceira referência (L* com espaçamento que exclui o preto absoluto).

A correção unifica tudo numa única escala — **porcentagem de cinza 8 bits** — onde o nível inteiro `w` corresponde ao componente RGB `Math.round(w / 100 * 255)`. A régua passa a interpretar `bwSteps` como número de **intervalos** (N), gerando N+1 amostras de 100 a 0 com níveis inteiros exatos. O destaque compara na mesma escala, eliminando o desvio.

## Glossary

- **Bug_Condition (C)**: A condição em que clicar num degrau da régua B/W faz o campo K exibir um valor diferente do nível nominal daquele degrau
- **Property (P)**: O campo K exibe exatamente o nível nominal do degrau clicado, e releitura devolve o mesmo valor
- **Preservation**: Todos os outros modos (RGB, HSV, LAB, CMYK), o round-trip ±1, a importação para paleta, e os comportamentos de undo/redo devem permanecer inalterados
- **getBwRamp()**: Função em `demo/js/state.js` que gera o array de tons da régua B/W
- **MODES['B/W']**: Definição do modo B/W em `demo/js/panels.js` com `fromRgb`, `toRgb` e `write`
- **refreshBwRamp()**: Função em `demo/js/panels.js` que renderiza a régua e calcula o destaque `is-current`
- **N**: Número de intervalos (`state.bwSteps`). A régua exibe N+1 amostras
- **Escala de cinza 8 bits**: `level` ∈ [0, 100] inteiro; RGB correspondente = `Math.round(level / 100 * 255)` replicado em r, g, b

## Bug Details

### Bug Condition

O bug se manifesta quando o modo B/W está ativo e o usuário interage com a régua de valores ou com o campo K. A leitura (`fromRgb`) converte via `rgbToLab` (escala perceptual L*), enquanto a escrita (`toRgb`/`write`) converte via porcentagem linear de 8 bits. Além disso, `getBwRamp` gera degraus usando `labToRgb(level, 0, 0)` — cujo RGB não é `Math.round(level/100*255)` para todos os níveis.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input de tipo { action: 'clickRamp' | 'setChannel', level: int }
  OUTPUT: boolean

  LET ramp = getBwRamp_original()
  LET tone = ramp.find(t => t.level == input.level)

  IF input.action == 'clickRamp' THEN
    LET rgb = { r: tone.r, g: tone.g, b: tone.b }
    LET readBack = MODES_BW_original.fromRgb(rgb).w
    RETURN Math.round(readBack) != input.level
  END IF

  IF input.action == 'setChannel' THEN
    LET rgb = MODES_BW_original.toRgb({ w: input.level })
    LET readBack = MODES_BW_original.fromRgb(rgb).w
    RETURN Math.round(readBack) != input.level
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Degrau 90 com 10 valores**: Clicar no degrau de nível 90 → `labToRgb(90,0,0)` = `{r:229,g:229,b:229}` → `rgbToLab(229,229,229).L` ≈ 91.1 → campo mostra 91, não 90
- **Degrau 10 com 10 valores**: Clicar no degrau de nível 10 → `labToRgb(10,0,0)` = `{r:27,g:27,b:27}` → `rgbToLab(27,27,27).L` ≈ 10.8 → campo mostra 11, não 10
- **Ida e volta K=50**: Escrever 50 → `Math.round(50/100*255) = 128` → ler `rgbToLab(128,128,128).L` ≈ 53.6 → campo mostra 54, não 50
- **Preto ausente**: Com N=10 valores a régua gera níveis [100, 90, 80, ..., 10] — o nível 0 (preto) nunca aparece

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Modos RGB, HSV, LAB e CMYK continuam com os mesmos canais, limites, passos e decimals
- O round-trip ±1 por componente em todas as conversões entre espaços permanece
- A importação da régua B/W para paleta (`fillFromBwRamp`) continua funcionando (consome o array de `getBwRamp`)
- Botões − e + respeitam BW_MIN (2) e BW_MAX (24), desabilitando nos extremos
- O triplo editado em LAB/CMYK continua protegido pelo latch
- Undo/redo gravam a cor ao clicar num degrau
- A conferência de valores (value check) continua afetando só a exibição
- O degradê do trilho K continua de preto a branco com thumb proporcional

**Scope:**
Todas as interações que NÃO envolvem o modo B/W ficam completamente intactas. Dentro do modo B/W, a escrita (`toRgb`/`write`) já está correta — a mudança é na leitura (`fromRgb`) e na geração da régua (`getBwRamp`).

## Hypothesized Root Cause

Com base na análise do código atual:

1. **Escala divergente na leitura**: `MODES['B/W'].fromRgb` usa `C.rgbToLab(r,g,b).L` — escala perceptual L* de 0 a 100. Mas a escrita usa `Math.round(w/100*255)` — escala linear de cinza 8 bits. L* não é proporcional ao nível de cinza: `L* = 116 × f(Y/Yn) − 16`, onde f é não-linear. A ida e volta perde o valor.

2. **Geração da régua em L***: `getBwRamp` calcula `level` como porcentagem e depois faz `labToRgb(level, 0, 0)`, tratando `level` como se fosse L*. O RGB resultante, quando relido por `fromRgb`, não devolve exatamente `level` porque a conversão LAB→RGB→LAB envolve clipping e arredondamento.

3. **Contagem sem preto**: A fórmula `100 - i * (100/n)` para `i` de 0 a n−1 gera n amostras começando em 100 e terminando em `100/n` (nunca 0). O artista não consegue selecionar preto puro na régua.

4. **Destaque na escala errada**: `refreshBwRamp` compara `tone.level` com `currentL` (L* da cor atual). Se a cor veio da escrita (escala 8 bits), o L* relido não coincide com `tone.level`, e o destaque pode errar de degrau.

## Correctness Properties

Property 1: Bug Condition - Round-trip do canal K

_For any_ valor inteiro `w` no intervalo [0, 100], ao escrever `w` no canal K e reler imediatamente, o sistema SHALL devolver exatamente `w`. Ou seja, `fromRgb_fixed(toRgb_fixed({w})).w === w`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Comportamento dos outros modos

_For any_ cor representada em RGB [0-255] e qualquer modo ∈ {RGB, HSV, LAB, CMYK}, a leitura e escrita de canais SHALL produzir o mesmo resultado que o código original, preservando os modos que não são B/W e o round-trip ±1 por componente.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assumindo que a análise da causa raiz está correta:

**File**: `demo/js/state.js`

**Function**: `getBwRamp`

**Specific Changes**:
1. **Interpretar bwSteps como número de intervalos (N)**: Gerar N+1 amostras (não N)
2. **Fórmula de nível inteiro**: `Math.round(i * 100 / N)` para i de 0 a N, invertendo a ordem para que 100 venha primeiro: `level = Math.round((N - i) * 100 / N)` ou equivalentemente iterar de 0 a N com `level = Math.round(i * 100 / N)` e inverter
3. **RGB direto de 8 bits**: `const g = Math.round(level / 100 * 255)` → `{ level, r: g, g: g, b: g }`. Não usar `labToRgb`
4. **Confirmar BW_MIN e BW_MAX**: BW_MIN = 2 (mínimo 2 intervalos = 3 amostras), BW_MAX = 24 (máximo 24 intervalos = 25 amostras) — manter os valores atuais

---

**File**: `demo/js/panels.js`

**Function**: `MODES['B/W'].fromRgb`

**Specific Changes**:
1. **Cor acromática (r = g = b)**: Derivar K diretamente → `Math.round(r / 255 * 100)`
2. **Cor cromática (r ≠ g ou r ≠ b)**: Converter L* para cinza equivalente → `Math.round(C.labToRgb(L, 0, 0).r / 255 * 100)`, onde L = `C.rgbToLab(r, g, b).L`
3. **Manter toRgb e write como estão**: Já usam a escala correta (`Math.round(w/100*255)`)

---

**File**: `demo/js/panels.js`

**Function**: `refreshBwRamp`

**Specific Changes**:
1. **Destaque na escala de 8 bits**: Calcular o cinza atual na mesma escala: para cor acromática usar `Math.round(cur.r / 255 * 100)`, para cromática usar `Math.round(C.labToRgb(C.rgbToLab(cur.r, cur.g, cur.b).L, 0, 0).r / 255 * 100)`. Comparar com `tone.level`
2. **Tolerância proporcional**: `closestDist < 50 / (ramp.length - 1)` (ou equivalente ao passo entre degraus dividido por 2)
3. **Rótulo de contagem**: Exibir `ramp.length` (que é N+1) em vez de `S.state.bwSteps`

---

**File**: `demo/js/palettes.js`

**Function**: `fillFromBwRamp`

**Specific Changes**:
Nenhuma mudança funcional necessária. A função já consome o array retornado por `getBwRamp()` e converte cada `{r, g, b}` para hex. A nova contagem (N+1 em vez de N) será automaticamente refletida.

---

**File**: `tests/slider-channels.test.js`

**Specific Changes**:
1. **Teste de round-trip do canal K**: Validar que para todo `w` inteiro de 0 a 100, `fromRgb(toRgb({w})).w === w`
2. **Teste de degraus da régua**: Validar que cada `tone.level` da régua, ao ser escrito e relido, devolve o mesmo valor
3. **Teste de contagem**: Validar que `getBwRamp()` retorna `bwSteps + 1` amostras
4. **Teste de cobertura**: Validar que a régua inclui nível 100 (branco) e nível 0 (preto)

## Testing Strategy

### Validation Approach

A estratégia segue duas fases: primeiro, surfaçar contra-exemplos que demonstram o bug no código não corrigido, depois verificar que a correção funciona e preserva o comportamento existente.

### Exploratory Bug Condition Checking

**Goal**: Surfaçar contra-exemplos que demonstram o bug ANTES de implementar a correção. Confirmar ou refutar a análise de causa raiz.

**Test Plan**: Escrever testes que exercitam o round-trip do canal K e a correspondência entre degrau e valor exibido. Executar no código NÃO corrigido para observar falhas.

**Test Cases**:
1. **Round-trip K=90**: Escrever 90 no canal K, reler com `fromRgb` → esperar 90, observar ≠ 90 (vai falhar no código atual)
2. **Round-trip K=50**: Escrever 50, reler → esperar 50, observar 54 (vai falhar)
3. **Degrau 90 com 10 valores**: Clicar degrau de nível 90, ler campo K → esperar 90, observar 91 (vai falhar)
4. **Preto ausente**: Verificar se nível 0 está na régua com 10 valores → esperar sim, observar não (vai falhar)

**Expected Counterexamples**:
- `fromRgb(toRgb({w: 90})).w` retorna 91 em vez de 90
- `fromRgb(toRgb({w: 50})).w` retorna 54 em vez de 50
- `getBwRamp()` com bwSteps=10 não contém nível 0

### Fix Checking

**Goal**: Verificar que para todas as entradas onde a condição de bug se aplica, a função corrigida produz o comportamento esperado.

**Pseudocode:**
```
FOR ALL w IN [0, 1, 2, ..., 100] DO
  rgb := MODES_BW_fixed.toRgb({ w })
  readBack := MODES_BW_fixed.fromRgb(rgb).w
  ASSERT readBack == w
END FOR

FOR ALL N IN [BW_MIN, BW_MIN+1, ..., BW_MAX] DO
  ramp := getBwRamp_fixed(N)
  ASSERT ramp.length == N + 1
  ASSERT ramp[0].level == 100
  ASSERT ramp[N].level == 0
  FOR EACH tone IN ramp DO
    rgb := { r: tone.r, g: tone.g, b: tone.b }
    readBack := MODES_BW_fixed.fromRgb(rgb).w
    ASSERT readBack == tone.level
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verificar que para todas as entradas onde a condição de bug NÃO se aplica, a função corrigida produz o mesmo resultado que a original.

**Pseudocode:**
```
FOR ALL mode IN ['RGB', 'HSV', 'LAB', 'CMYK'] DO
  FOR ALL rgb IN sampleSpace DO
    ASSERT MODES[mode].fromRgb_original(rgb) == MODES[mode].fromRgb_fixed(rgb)
    FOR ALL vals IN channelSpace(mode) DO
      ASSERT MODES[mode].toRgb_original(vals) == MODES[mode].toRgb_fixed(vals)
    END FOR
  END FOR
END FOR
```

**Testing Approach**: Property-based testing é recomendado para preservation checking porque:
- Gera automaticamente muitos casos de teste no espaço de entradas
- Captura edge cases que testes manuais poderiam perder
- Dá garantias fortes de que o comportamento não mudou para entradas não afetadas pelo bug

**Test Plan**: Observar o comportamento no código NÃO corrigido para RGB, HSV, LAB e CMYK, depois escrever testes property-based que capturam esse comportamento.

**Test Cases**:
1. **Round-trip RGB preservado**: Verificar que `MODES.RGB.fromRgb(toRgb(vals))` continua idêntico
2. **Round-trip LAB preservado**: Verificar que o latch de LAB/CMYK continua funcionando — mover um canal não altera os outros
3. **Importação B/W para paleta**: Verificar que `fillFromBwRamp` preenche a paleta com N+1 cores (a nova contagem)
4. **Limites BW_MIN/BW_MAX**: Verificar que setBwSteps respeita os clamps

### Unit Tests

- Testar `getBwRamp` para vários valores de N: contagem, nível mínimo, nível máximo, todos inteiros
- Testar `fromRgb` para cinzas puros (r=g=b): verificar que devolve `Math.round(r/255*100)`
- Testar `fromRgb` para cores cromáticas: verificar que o valor é consistente com a escala de 8 bits
- Testar que o destaque `is-current` acerta o degrau correto após clicar

### Property-Based Tests

- Gerar valores aleatórios de `w` ∈ [0, 100] inteiro e verificar round-trip exato
- Gerar valores aleatórios de N ∈ [2, 24] e verificar propriedades da régua (contagem, cobertura, inteiros)
- Gerar cores RGB aleatórias e verificar que os modos RGB/HSV/LAB/CMYK produzem o mesmo resultado que antes

### Integration Tests

- Testar fluxo completo: clicar degrau → verificar campo K → verificar destaque
- Testar troca entre modos: sair de B/W para LAB e voltar, verificando que valores estão consistentes
- Testar importação para paleta: configurar régua, importar, verificar que a paleta tem N+1 cores com os hex corretos
