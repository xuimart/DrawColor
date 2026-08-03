# Requirements Document

Correção de bug: independência dos canais no modo LAB do painel de sliders.

## Introduction

No modo LAB do painel de sliders, mover um canal altera o número exibido nos outros dois. O relato do usuário é direto: "quando eu movo para o lado o A, ele altera o B e o L, e vice-versa". A evidência são dois estados consecutivos do painel: primeiro `L=100, A=127, B=127`, com os três thumbs no extremo direito; depois de mexer somente no A, `L=58, A=110, B=69`.

O sintoma é conhecido e já tem um mecanismo dedicado no código. `panels.js` guarda o triplo LAB editado num `latch`, justamente porque a volta RGB → LAB não é a inversa da ida: LAB descreve cores que o sRGB não alcança e `labToRgb` recorta por componente. Os testes unitários desse mecanismo estão em `tests/slider-channels.test.js` e passam. A falha está no caminho ao vivo, fora do alcance desses testes: o triplo editado é descartado por eventos que não representam escolha de cor nenhuma, e a partir daí os canais voltam a ser derivados do RGB recortado.

Os números do relato confirmam o mecanismo sem margem para dúvida. O triplo `L=100, A=127, B=127` recorta para `rgb(255, 70, 0)`, e `rgbToLab(255, 70, 0)` devolve `L=57,70 · A=67,45 · B=69,01` — arredondado, `L=58` e `B=69`, exatamente os dois valores do estado 2. O `A=110` é o único canal que o usuário realmente moveu. Ou seja: L e B já haviam sido recalculados antes do gesto; o gesto no A apenas revelou o estrago.

O impacto é que o modo LAB é inutilizável para o que ele serve. Um artista que escolhe uma luminosidade e trabalha o par A/B em torno dela perde a luminosidade a cada interação com o resto do painel, e os extremos dos canais — as cores mais saturadas que o LAB descreve — são inalcançáveis na prática.

## Glossary

- **Triplo_Editado**: O conjunto de valores de canal que o usuário editou num modo que guarda estado, hoje a variável `latch` de `panels.js`, no formato `{ mode, vals }`
- **Modo_Com_Latch**: Um modo de slider cuja conversão de ida e volta pelo RGB perde informação, e que por isso declara `latch: true`: LAB e CMYK
- **Modo_Reversível**: Um modo cuja conversão de ida e volta é fiel, e que por isso deriva os canais da cor a cada leitura: RGB, HSV e B/W
- **Não_Alcançável**: Um triplo cujo RGB correspondente, convertido de volta, difere do triplo original em mais de 1 unidade em algum componente. É o caso de todo LAB fora do sRGB, porque `labToRgb` recorta por componente
- **Origem**: A string que `AppState.emit` repassa aos subscribers, vinda de `opts.reason` ou, na ausência dele, do padrão `'color'`
- **ORIGENS_EXTERNAS**: A lista `['color', 'host', 'peer']` que hoje define quais origens descartam o Triplo_Editado
- **Aviso_Intercorrente**: Um aviso do `AppState` que chega entre dois gestos do usuário no painel de sliders

## Requirements

### Requisito 1: Comportamento Atual (Defeito)

O que acontece hoje, do sintoma visível até as decisões de código que o produzem.

#### Critérios

1.1 WHEN o usuário edita os canais LAB até um triplo fora do sRGB e em seguida move um único canal THEN o sistema exibe os outros dois canais recalculados a partir do RGB recortado, e não nos valores que o usuário havia editado

1.2 WHEN chega um aviso do `AppState` cuja origem está em `ORIGENS_EXTERNAS` THEN o sistema descarta o Triplo_Editado mesmo que a cor não tenha mudado em nenhum componente

1.3 WHEN o usuário aciona um controle que emite `'color'` sem alterar a cor — a caixa de limitação de cor, os botões de máscara de gamut, o restaurar da máscara — THEN o sistema descarta o Triplo_Editado e reescreve os três números do painel LAB, sem que nada na cor tenha mudado

1.4 WHEN o usuário desfaz ou refaz THEN o sistema restaura o HSV gravado e descarta o Triplo_Editado, porque a entrada de histórico não guarda o triplo

1.5 WHEN o campo hex perde o foco THEN o sistema commita o conteúdo do campo como se fosse uma cor recém-digitada, ainda que nada tenha sido digitado, e o commit passa por `setHsv` sem `reason` explícito

1.6 WHEN qualquer ponto do código escreve cor sem declarar `reason` — roda, seletor de saturação e valor, dials, barras do mixer, godê, paletas, rampa B/W, barra de histórico, troca de foreground — THEN o sistema classifica a escrita como `'color'` e a trata como externa, porque `emit(opts.reason || 'color')` é o comportamento padrão de `setHsv`

1.7 WHEN `applyChannel(modeName, key, value)` é chamado THEN o sistema lê os valores correntes por `readVals()`, que consulta `S.state.sliderMode` em vez do `modeName` recebido, de modo que o parâmetro não governa a leitura que a função faz

### Requisito 2: Comportamento Esperado (Correto)

O comportamento correto para cada uma das condições acima.

#### Critérios

2.1 WHEN o usuário edita os canais LAB até um triplo fora do sRGB e em seguida move um único canal THEN o sistema SHALL manter os outros dois canais exatamente nos valores editados, sem desvio algum, e alterar somente o canal movido

2.2 WHEN chega um aviso de mudança de cor cuja cor resultante é idêntica à cor corrente THEN o sistema SHALL preservar o Triplo_Editado

2.3 WHEN o usuário aciona um controle que não escolhe cor — limitação de cor, máscara de gamut, forma do seletor, giro do anel, conferência de valores — THEN o sistema SHALL preservar o Triplo_Editado e manter os três números do painel LAB inalterados

2.4 WHEN o usuário desfaz ou refaz uma entrada de histórico gravada a partir de uma edição LAB ou CMYK THEN o sistema SHALL restaurar junto o Triplo_Editado que produziu aquela entrada

2.5 WHEN o campo hex perde o foco e o conteúdo do campo já descreve a cor corrente THEN o sistema SHALL não reescrever a cor

2.6 WHEN um ponto do código escreve cor sem declarar origem THEN o sistema SHALL invalidar o Triplo_Editado por um critério que não dependa da origem declarada, de modo que esquecer o `reason` numa escrita nova não reintroduza a falha

2.7 WHEN `applyChannel(modeName, key, value)` é chamado THEN o sistema SHALL ler os valores correntes do modo indicado por `modeName`

### Requisito 3: Comportamento Inalterado (Prevenção de Regressão)

O que já funciona e não pode mudar. Cada item abaixo tem contrapartida em teste existente ou em comportamento observável hoje.

#### Critérios

3.1 WHEN o modo de slider é RGB, HSV ou B/W THEN o sistema SHALL CONTINUE TO derivar os canais da cor corrente a cada leitura, ignorando qualquer triplo guardado

3.2 WHEN o usuário escolhe deliberadamente outra cor — clique na roda, no seletor de saturação e valor, numa paleta, no godê, na barra de histórico, hex digitado, cor vinda do Photoshop, cor vinda da outra janela — THEN o sistema SHALL CONTINUE TO fazer os canais LAB descreverem a nova cor

3.3 WHEN o Triplo_Editado está dentro do sRGB THEN o sistema SHALL CONTINUE TO exibir os mesmos números antes e depois de qualquer recálculo, porque a ida e volta é fiel nesse caso

3.4 WHEN o usuário leva um canal LAB ao extremo do seu intervalo THEN o sistema SHALL CONTINUE TO aceitar e exibir o extremo, inclusive `A=-128`, `A=127`, `B=-128`, `B=127` e `L=100`

3.5 WHEN o modo é CMYK e K chega a 100 THEN o sistema SHALL CONTINUE TO preservar os valores editados de C, M e Y, ainda que a cor colapse em preto

3.6 WHEN existe triplo guardado de um modo e o modo corrente é outro THEN o sistema SHALL CONTINUE TO derivar os canais da cor, sem aplicar o triplo de um modo em outro

3.7 WHEN a cor é gravada no histórico, enviada ao Photoshop, enviada à outra janela ou exibida no campo hex THEN o sistema SHALL CONTINUE TO usar o RGB recortado, e não o triplo LAB fora do sRGB

3.8 WHEN um valor não numérico chega a `applyChannel` por qualquer caminho — ponteiro, teclado ou campo numérico — THEN o sistema SHALL CONTINUE TO rejeitar a escrita e devolver `false`

3.9 WHEN a cor volta do Photoshop com até um nível de diferença por componente THEN o sistema SHALL CONTINUE TO tratar as duas cores como a mesma, conforme a folga de `sameRgb`

3.10 WHEN o usuário digita um hex inválido e o campo perde o foco THEN o sistema SHALL CONTINUE TO reverter para o último hex válido e sinalizar erro por dois segundos

### Condição do Bug

Derivada dos requisitos acima, na notação que o documento de design formaliza.

**Condição** — identifica as entradas que disparam a falha:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type SessaoDeCanais
    X.modo          : nome do modo de slider
    X.triplo        : valores dos canais editados pelo usuário
    X.intercorrente : evento que chega entre dois gestos do usuário
  OUTPUT: boolean

  RETURN MODES[X.modo].latch = true
         AND naoAlcancavelEmSRGB(X.triplo)
         AND corDepois(X.intercorrente) = corAntes(X.intercorrente)
         AND origemDe(X.intercorrente) IN ORIGENS_EXTERNAS
END FUNCTION

FUNCTION naoAlcancavelEmSRGB(T)
  rgb   ← labToRgb(T.L, T.a, T.b)
  volta ← rgbToLab(rgb.r, rgb.g, rgb.b)
  RETURN |volta.L − T.L| > 1 OR |volta.a − T.a| > 1 OR |volta.b − T.b| > 1
END FUNCTION
```

**Propriedade** — comportamento correto para essas entradas:

```pascal
// Property: Fix Checking — independência dos canais no caminho ao vivo
FOR ALL X WHERE isBugCondition(X) DO
  aplicar X.triplo canal por canal
  disparar X.intercorrente
  vistos ← editarCanal'(X.modo, k, v)
  ASSERT vistos[k] = v
  ASSERT FOR ALL j ≠ k: vistos[j] = X.triplo[j]
END FOR
```

**Preservação** — comportamento inalterado para todo o resto:

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Onde `F` é o código como está hoje e `F'` é o código corrigido.

### Contraexemplo Conhecido

Reproduzido com os módulos carregados no Node, exatamente como `tests/slider-channels.test.js` os carrega, com o descarte do triplo ligado ao `subscribe` do `AppState` como `panels.js` faz:

| Etapa | Cor (RGB) | Canais exibidos |
|-------|-----------|-----------------|
| Edita L=100, A=127, B=127 | `255, 70, 0` | `L=100 · A=127 · B=127` |
| `setLimit({ enabled: false })` — emite `'limit'` e `'color'` | `255, 70, 0` | `L=58 · A=67 · B=69` |
| Move só o A para 110 | `255, 125, 0` | `L=58 · A=110 · B=69` |

A cor não mudou em nenhum componente entre a primeira e a segunda linha. Ainda assim os três números do painel foram reescritos, e o estado final é o mesmo `L=58, A=110, B=69` que o usuário relatou.
