# Bugfix Requirements Document

## Introduction

Correção de bug: edição de vértices da máscara de gamut. Dois defeitos combinados tornam a edição livre inutilizável: os vértices ficam presos à bounding box do espaço unitário (±1), impedindo que a forma se estenda até o raio do disco; e a superfície de saturação/valor não se regenera quando os pontos mudam, porque a chave de cache não inclui `gamut.points`. O resultado visível é que o contorno vermelho se move mas a região de cor disponível fica estática — "a máscara não abre".

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN o usuário arrasta um vértice para uma posição cuja coordenada unitária excede ±1 em qualquer eixo, mas cuja projeção no disco tem raio ≤ 1 THEN o sistema clampeia o vértice a ±1 no espaço unitário e o vértice fica preso à bounding box vermelha

1.2 WHEN o usuário move um vértice THEN o sistema atualiza `state.gamut.points` e o contorno desenhado por `drawGamutMask` reflete a nova posição, porém a superfície lavada/saturada pintada por `buildSelector` NÃO é regenerada porque `svCacheKey` permanece idêntico ao valor anterior

1.3 WHEN o usuário move um vértice e em seguida consulta `insideMask(h, s)` para um ponto que a forma nova deveria excluir THEN o sistema pode retornar o resultado correto (porque `insideMask` lê `gamut.points` ao vivo), mas a representação visual não corresponde — a superfície mostra a região da forma ANTERIOR ao arraste

1.4 WHEN a máscara tem `rx` e `ry` pequenos (e.g. 0.3) e o polígono canônico tem vértices no raio 1 do espaço unitário THEN o vértice projetado cai dentro do disco com folga, mas o clamp impede que o usuário expanda a forma além da caixa original sem redimensionar `rx`/`ry` primeiro

### Expected Behavior (Correct)

2.1 WHEN o usuário arrasta um vértice para uma posição cuja projeção no disco (via `unitToDisc`) tem raio ≤ 1 THEN o sistema SHALL aceitar a coordenada unitária sem clampeá-la, independentemente de ela exceder ±1

2.2 WHEN o usuário arrasta um vértice para uma posição cuja projeção no disco tem raio > 1 THEN o sistema SHALL clampar o vértice ao limite do disco, projetando de volta para o espaço unitário via `discToUnit` e armazenando a coordenada resultante

2.3 WHEN o usuário move um vértice e `state.gamut.points` muda THEN o sistema SHALL invalidar o cache da superfície de modo que o próximo render regenere a imagem refletindo a forma atualizada

2.4 WHEN a superfície é regenerada após edição de vértice THEN o sistema SHALL usar `insideMask` com os pontos atualizados para determinar quais pixels pertencem à máscara, garantindo coerência entre contorno visual e região de cor disponível

### Unchanged Behavior (Regression Prevention)

3.1 WHEN o formato é `ellipse` ou `dual` (sem vértices) THEN o sistema SHALL CONTINUE TO rejeitar tentativas de edição de vértice e manter o comportamento da caixa de alças inalterado

3.2 WHEN o formato tem vértices e o vértice é movido para dentro de ±1 no espaço unitário THEN o sistema SHALL CONTINUE TO aceitar a coordenada (comportamento que já funciona hoje)

3.3 WHEN o usuário escolhe outro formato no rack após editar vértices THEN o sistema SHALL CONTINUE TO descartar os pontos editados e adotar o polígono canônico do novo formato

3.4 WHEN a máscara está travada (`locked: true`) THEN o sistema SHALL CONTINUE TO rejeitar edição de vértice e devolver `false`

3.5 WHEN um valor não numérico é passado a `setMaskVertex` THEN o sistema SHALL CONTINUE TO rejeitar a escrita e devolver `false`

3.6 WHEN o índice de vértice está fora da faixa THEN o sistema SHALL CONTINUE TO rejeitar a escrita e devolver `false`

3.7 WHEN a máscara é redimensionada, rotacionada ou movida pelas alças da caixa THEN o sistema SHALL CONTINUE TO alterar `cx`, `cy`, `rx`, `ry` e `angle` sem afetar `gamut.points`

3.8 WHEN a máscara não está em modo de edição e a cor muda THEN o sistema SHALL CONTINUE TO recalcular a superfície normalmente (o cache é invalidado pelas dependências existentes: `driver`, `svSteps`, `hueSteps`, `shape`, `wheelRotation`, `gray`)

3.9 WHEN `resetMaskVertices` é chamado THEN o sistema SHALL CONTINUE TO descartar os pontos editados e manter posição, tamanho e rotação intactos

3.10 WHEN o polígono canônico de um formato (triangle, rect, diamond, hexagon) tem vértices dentro de ±1 e o usuário não editou nenhum vértice THEN o sistema SHALL CONTINUE TO exibir a forma canônica inscrita na caixa, sem alteração

### Condição do Bug

Derivada dos requisitos, na notação do documento de design.

**Sub-bug A — Vértice preso à bounding box:**

```pascal
FUNCTION isBugConditionA(X)
  INPUT: X of type VertexEdit
    X.index     : índice do vértice no polígono
    X.unitX     : coordenada X desejada no espaço unitário
    X.unitY     : coordenada Y desejada no espaço unitário
    X.gamut     : estado da máscara (cx, cy, rx, ry, angle)
  OUTPUT: boolean

  disc ← unitToDisc(X.unitX, X.unitY, X.gamut)
  RETURN (|X.unitX| > 1 OR |X.unitY| > 1)
         AND hypot(disc.u, disc.v) ≤ 1
END FUNCTION
```

**Propriedade A — Fix Checking:**

```pascal
FOR ALL X WHERE isBugConditionA(X) DO
  result ← setMaskVertex'(X.index, X.unitX, X.unitY)
  stored ← maskVertices'()[X.index]
  ASSERT result = true
  ASSERT stored.x = X.unitX
  ASSERT stored.y = X.unitY
END FOR
```

**Sub-bug B — Superfície não invalida com edição de vértice:**

```pascal
FUNCTION isBugConditionB(X)
  INPUT: X of type VertexEdit
    X.index     : índice do vértice
    X.newX      : nova coordenada X
    X.newY      : nova coordenada Y
    X.gamut     : estado da máscara com points anteriores
  OUTPUT: boolean

  RETURN X.gamut.points ≠ null OR canFreeze(X.gamut.kind)
         // qualquer edição de vértice aceita
END FUNCTION
```

**Propriedade B — Fix Checking:**

```pascal
FOR ALL X WHERE isBugConditionB(X) DO
  keyAntes ← svCacheKey
  setMaskVertex'(X.index, X.newX, X.newY)
  // A chave de cache deve ter mudado OU deve estar nula (forçando regeneração)
  ASSERT svCacheKey' ≠ keyAntes OR svCacheKey' = null
END FOR
```

**Preservação — comum a ambos os sub-bugs:**

```pascal
FOR ALL X WHERE NOT isBugConditionA(X) AND NOT isBugConditionB(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

### Contraexemplo Conhecido

| Etapa | Espaço unitário | Espaço do disco | Resultado |
|-------|-----------------|-----------------|-----------|
| Máscara hexagonal, `rx=0.3, ry=0.3, angle=0, cx=0, cy=0` | Vértice canônico em `(1, 0)` | Projeção: `(0.3, 0)` — raio 0.3, dentro do disco | OK |
| Arrastar vértice para `(2.5, 0)` no unitário | `unitToDisc(2.5, 0)` = `(0.75, 0)` — raio 0.75, dentro do disco | `setMaskVertex` clampeia a `(1, 0)` — vértice não se move |
| Mover qualquer vértice | `gamut.points` muda | `maskKey` em `render()` não inclui `points` → superfície não regenera |
