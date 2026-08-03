# Design da Correção: Independência dos Canais LAB

## Overview

O modo LAB do painel de sliders precisa que cada canal se mova sozinho. Isso já foi resolvido uma vez, com o `latch` de `panels.js`: o triplo LAB que o usuário editou fica guardado e é a verdade exibida, em vez de ser derivado da cor a cada leitura. A parte unitária desse mecanismo está correta e coberta por `tests/slider-channels.test.js`.

O que falta é o caminho ao vivo. O latch é descartado por `dropLatchIfExternal(reason)` sempre que chega um aviso cuja origem está em `ORIGENS_EXTERNAS`, e essa lista inclui `'color'` — que é a origem padrão de toda escrita de cor que não declara outra. O resultado é que eventos que não escolhem cor alguma derrubam o triplo editado, e os canais voltam a ser derivados do RGB recortado. Como o RGB recortado descreve uma cor diferente da que o usuário pediu, os números saltam.

A correção troca o critério de invalidação. Em vez de um subscriber inspecionar uma string de origem depois do fato, o triplo editado passa a viver dentro do `AppState`, ao lado do HSV, e é invalidado no único ponto por onde toda cor passa: `setHsv`. Quem escreve a cor e é dono do triplo declara isso na própria escrita; todos os demais invalidam por omissão. Esquecer de declarar passa a ser seguro, porque a omissão leva ao comportamento conservador — derivar da cor — e não ao comportamento errado.

Duas correções de higiene acompanham, porque removem gatilhos inteiros sem custo: o campo hex deixa de recommitar a cor quando o conteúdo já corresponde à cor corrente, e a entrada de histórico passa a carregar o triplo, para desfazer e refazer restaurarem o que o usuário editou.

## Glossary

- **Bug_Condition (C)**: A condição que dispara a falha — o modo de slider guarda triplo editado, o triplo não é alcançável em sRGB, e chega um aviso de mudança de cor que não corresponde a escolha de cor pelo usuário
- **Property (P)**: O comportamento desejado — editar um canal altera aquele canal e nenhum outro, com os demais permanecendo exatamente nos valores editados
- **Preservation**: Tudo o que não está sob a Bug_Condition: os modos reversíveis, os triplos dentro do gamut, as escolhas deliberadas de cor, o histórico, a ponte com o Photoshop e a sincronização entre janelas
- **Triplo_Editado**: O conjunto de valores de canal que o usuário editou num modo que guarda estado, hoje a variável `latch` de `panels.js`, no formato `{ mode, vals }`
- **Modo_Com_Latch**: Um modo de slider cuja conversão de ida e volta pelo RGB perde informação, e que por isso declara `latch: true`: LAB e CMYK
- **Modo_Reversível**: Um modo cuja conversão de ida e volta é fiel, e que por isso deriva os canais da cor a cada leitura: RGB, HSV e B/W
- **Não_Alcançável**: Um triplo cujo RGB correspondente, convertido de volta, difere do triplo original em mais de 1 unidade em algum componente. É o caso de todo LAB fora do sRGB, porque `labToRgb` recorta por componente
- **`resolveVals(modeName, rgb, current)`**: A função de `panels.js` que decide entre devolver o Triplo_Editado e derivar os canais da cor
- **`readVals()`**: O invólucro de `resolveVals` que lê o modo de `S.state.sliderMode` e a cor de `S.getRgb()`
- **`applyChannel(modeName, key, value)`**: A função de `panels.js` que aplica um valor a um canal — o miolo do gesto, sem DOM
- **`dropLatchIfExternal(reason)`**: O subscriber de `panels.js` que descarta o Triplo_Editado conforme a origem do aviso. É o ponto de falha desta correção
- **`ORIGENS_EXTERNAS`**: A lista `['color', 'host', 'peer']` que hoje define quais origens descartam o Triplo_Editado
- **Origem**: A string que `AppState.emit` repassa aos subscribers, vinda de `opts.reason` ou, na ausência dele, do padrão `'color'`
- **F**: O código como está hoje, antes da correção
- **F'**: O código depois da correção

## Bug Details

### Bug Condition

A falha se manifesta quando o usuário está num Modo_Com_Latch, editou os canais até um triplo Não_Alcançável, e entre dois gestos chega um aviso de mudança de cor cuja origem está em `ORIGENS_EXTERNAS` sem que a cor tenha efetivamente mudado por escolha do usuário. Nesse instante o Triplo_Editado é descartado, `resolveVals` volta a derivar os canais por `C.rgbToLab(rgb)`, e os números exibidos passam a descrever o RGB recortado. O gesto seguinte, em um único canal, exibe os outros dois já recalculados — e parece ter movido todos.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type SessaoDeCanais
    input.modo          : nome do modo de slider
    input.triplo        : valores dos canais editados pelo usuário
    input.intercorrente : aviso que chega entre dois gestos
  OUTPUT: boolean

  RETURN MODES[input.modo].latch = true
         AND naoAlcancavelEmSRGB(input.triplo)
         AND corDepois(input.intercorrente) = corAntes(input.intercorrente)
         AND origemDe(input.intercorrente) IN ORIGENS_EXTERNAS
END FUNCTION

FUNCTION naoAlcancavelEmSRGB(T)
  rgb   ← labToRgb(T.L, T.a, T.b)
  volta ← rgbToLab(rgb.r, rgb.g, rgb.b)
  RETURN |volta.L − T.L| > 1 OR |volta.a − T.a| > 1 OR |volta.b − T.b| > 1
END FUNCTION

FUNCTION expectedBehavior(vistos, triplo, k, v)
  INPUT: vistos — canais exibidos depois de editar o canal k para v
  OUTPUT: boolean

  RETURN vistos[k] = v
         AND FOR ALL j ≠ k: vistos[j] = triplo[j]
END FUNCTION
```

A terceira cláusula da condição — cor idêntica antes e depois — é o que separa a falha do comportamento legítimo. Quando o usuário escolhe outra cor na roda, o triplo editado perdeu validade de fato e os canais devem descrevê-la. O bug é o descarte na ausência de qualquer mudança.

### Examples

- **O caso relatado.** O usuário edita `L=100, A=127, B=127`; o painel exibe esses três valores e a cor é `rgb(255, 70, 0)`. Chega um aviso com origem `'color'` que não muda a cor. Os canais passam a exibir `L=58 · A=67 · B=69`, derivados de `rgbToLab(255, 70, 0) = L 57,70 · A 67,45 · B 69,01`. O usuário move só o A para 110 e vê `L=58 · A=110 · B=69`. Esperado: `L=100 · A=110 · B=127`.

- **Gatilho sem mudança de cor.** Com o triplo `L=100, A=127, B=127` no painel, o usuário mexe no seletor de limitação de cor com a limitação desligada. `setLimit` emite `'limit'` e depois `'color'` incondicionalmente; `applyLimit` devolve o HSV intocado. A cor permanece `rgb(255, 70, 0)` em todos os componentes e os três números do painel são reescritos. O mesmo vale para qualquer botão de máscara de gamut, porque `setGamut` também emite `'color'` no final.

- **Gatilho por omissão de origem.** O dial de brilho, as barras do mixer, o godê, as paletas, a rampa B/W e a barra de histórico chamam `setHsv`/`setRgb` sem `reason`. `setHsv` faz `emit(opts.reason || 'color')`, então toda escrita sem origem declarada é classificada como externa. A lista `ORIGENS_EXTERNAS` só é confiável enquanto todo ponto de escrita se lembrar de declarar.

- **Gatilho pelo campo hex.** `commitHex` é chamado no `blur` do campo e commita o conteúdo sempre, sem checar se houve edição. Como `refreshHex` não atualiza o campo enquanto ele está focado, o conteúdo pode estar defasado; o `blur` então grava uma cor diferente da corrente, com origem `'color'`. E como o `blur` acontece quando o foco sai do campo — inclusive ao clicar num trilho de slider, que tem `tabIndex = 0` — o gatilho fica embutido no próprio gesto de editar um canal.

- **Gatilho pelo histórico.** `undo` e `redo` emitem `'color'` explicitamente. A entrada de histórico guarda apenas HSV, então desfazer uma edição LAB nunca pode devolver o triplo editado, só o RGB recortado.

- **Caso de borda que não é o bug.** Triplo `L=50, A=10, B=-20`, dentro do sRGB. A ida e volta é fiel, então derivar da cor devolve os mesmos números e o descarte é inofensivo. A correção precisa deixar esse caso exatamente como está.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Os modos RGB, HSV e B/W continuam derivando os canais da cor a cada leitura, sem consultar triplo guardado
- Uma escolha deliberada de outra cor — roda, seletor de saturação e valor, paleta, godê, barra de histórico, hex digitado, cor vinda do Photoshop, cor vinda da outra janela — continua fazendo os canais LAB descreverem a nova cor
- Triplos LAB dentro do sRGB continuam exibindo os mesmos números antes e depois de qualquer recálculo
- Os extremos dos canais continuam alcançáveis: `L=100`, `A=-128`, `A=127`, `B=-128`, `B=127`
- CMYK com K em 100 continua preservando C, M e Y editados, ainda que a cor colapse em preto
- Um triplo guardado de um modo continua não valendo em outro modo
- A cor gravada no histórico, enviada ao Photoshop, enviada à outra janela e exibida no campo hex continua sendo o RGB recortado
- `applyChannel` continua rejeitando valor não numérico por qualquer caminho e devolvendo `false`
- A folga de um nível por componente de `sameRgb` continua valendo
- Um hex inválido no campo continua revertendo para o último hex válido e sinalizando erro por dois segundos
- `pushHistory` continua ignorando duplicata consecutiva e respeitando o limite de 50 entradas

**Scope:**

Toda entrada que não satisfaz `isBugCondition` deve ficar completamente inalterada pela correção. Isso inclui:

- Qualquer interação nos Modos_Reversíveis
- Qualquer triplo alcançável em sRGB nos Modos_Com_Latch
- Qualquer aviso de mudança de cor em que a cor efetivamente mudou por escolha do usuário
- Toda a matemática de cor de `color.js`, que não é tocada
- Toda a geometria de trilho, quantização e validação de entrada dos sliders

## Hypothesized Root Cause

A causa imediata está confirmada por aritmética: os valores `L=58` e `B=69` do relato são exatamente `rgbToLab(255, 70, 0)` arredondado, e `rgb(255, 70, 0)` é o recorte de `labToRgb(100, 127, 127)`. Não há outra origem possível para esses dois números. O Triplo_Editado foi descartado e os canais foram derivados do RGB recortado.

O que resta hipotetizar é qual evento faz o descarte. As causas candidatas, em ordem de confiança:

1. **Avisos `'color'` que não mudam a cor** — a mais forte, porque é determinística e independe de foco, de timing ou de ambiente. `setLimit` e `setGamut` terminam com `emit('color')` incondicional, mesmo quando `applyLimit` e `applyGamutMask` devolvem o HSV intocado. Qualquer clique nos controles de limitação de cor ou de máscara de gamut derruba o Triplo_Editado sem que nada na cor mude. Confirmada em execução: com o triplo `L=100, A=127, B=127` no painel, `setLimit({ enabled: false })` deixa a cor em `rgb(255, 70, 0)` e reescreve os três canais para `L=58 · A=67 · B=69`.

2. **Origem por omissão** — `setHsv` faz `emit(opts.reason || 'color')`, e a maioria dos pontos de escrita não declara `reason`: roda, seletor interno, dials, barras do mixer, godê, paletas, rampa B/W, barra de histórico, troca de foreground, barra de valores. A lista `ORIGENS_EXTERNAS` é um allowlist que depende de cada ponto de escrita se lembrar de declarar a origem. Uma escrita nova sem `reason` reintroduz a falha em silêncio.

3. **`commitHex` no `blur`** — o handler commita o conteúdo do campo mesmo sem edição. Vale ressalvar que `setHsv` só emite quando a cor mudou ou quando `force` está presente, então um commit de hex idêntico à cor corrente não emite nada e não derruba o latch. O gatilho existe quando o campo está defasado — o que acontece porque `refreshHex` não atualiza o campo enquanto ele tem foco. Nesse caso o `blur` grava uma cor diferente, com origem `'color'`, e o descarte é legítimo pelo critério atual mas ilegítimo pela intenção do usuário, que não digitou nada.

4. **`undo` / `redo`** — emitem `'color'` explicitamente e a entrada de histórico não carrega o triplo. Aqui o descarte não é o problema: o problema é não haver o que restaurar.

5. **Polling do Photoshop e sincronização entre janelas** — `PSBridge` lê o foreground a cada 400 ms e adota com origem `'host'` quando o valor lido difere do corrente por qualquer componente; `PanelSync` aplica a cor do par com origem `'peer'`. Nenhum dos dois roda no navegador, então não explica o relato se ele veio da demo, mas ambos são gatilhos reais no painel dentro do Photoshop e a correção precisa cobri-los.

A causa estrutural, comum a todas as candidatas, é onde a decisão de invalidação vive. O Triplo_Editado é estado local de `panels.js` e é invalidado por um subscriber que inspeciona uma string depois do fato. Isso coloca a corretude do modo LAB na dependência de uma convenção distribuída por dezenas de pontos de escrita, em quatro módulos, com um padrão que erra para o lado errado quando a convenção não é seguida.

## Correctness Properties

Property 1: Bug Condition — Independência dos canais no caminho ao vivo

_For any_ triplo LAB Não_Alcançável, _for any_ canal `k` e valor `v` no intervalo do canal, e _for any_ aviso intercorrente que não altere nenhum componente da cor, o código corrigido SHALL exibir `v` no canal `k` e exatamente os valores editados nos demais canais, sem desvio algum, quando o triplo é aplicado canal por canal, o aviso intercorrente é disparado e em seguida o canal `k` é editado para `v`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.6**

Property 2: Preservation — Comportamento inalterado fora da condição do bug

_For any_ entrada em que `isBugCondition` seja falsa — modo reversível, triplo alcançável em sRGB, ou aviso em que a cor efetivamente mudou — o código corrigido SHALL produzir exatamente o mesmo resultado que o código atual, preservando a derivação dos canais nos Modos_Reversíveis, a adoção de cores escolhidas deliberadamente, os extremos alcançáveis dos canais, a preservação de C, M e Y em CMYK com K alto, o isolamento entre triplos de modos diferentes, a folga de `sameRgb` e a rejeição de valores não numéricos.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9**

Property 3: Coerência do triplo com a cor gravada

_For any_ triplo LAB editado, alcançável ou não, o código corrigido SHALL gravar no histórico, enviar ao Photoshop, enviar à outra janela e exibir no campo hex o RGB recortado correspondente ao triplo, nunca o triplo em si, e SHALL restaurar o triplo junto com a cor quando a entrada de histórico correspondente é desfeita ou refeita.

**Validates: Requirements 2.4, 3.7**

## Fix Implementation

### Alternativas avaliadas

**Alternativa A — Estreitar `ORIGENS_EXTERNAS` e declarar `reason` em todos os pontos de escrita.**
Manteria o desenho atual e resolveria os gatilhos conhecidos: tirar `'color'` da lista, criar origens próprias para os controles que não escolhem cor, e passar `reason` explícito na roda, nos dials, nas barras, no godê, nas paletas e em `commitHex`. Rejeitada. O critério continuaria sendo um allowlist alimentado por convenção em quatro módulos, e o padrão de `setHsv` — `opts.reason || 'color'` — continuaria errando para o lado que quebra o LAB. Qualquer escrita futura que esqueça o `reason` reintroduz exatamente esta falha, sem aviso e sem teste que a pegue, porque o teste teria que enumerar os pontos de escrita. Além disso não resolve `setLimit` e `setGamut`, que emitem `'color'` por conta própria e teriam que ganhar uma origem nova cada.

**Alternativa B — `commitHex` não reescrever quando o campo já corresponde à cor corrente.**
Correta e barata: o `blur` hoje commita mesmo sem edição, e commitar uma cor idêntica é trabalho inútil que só pode causar dano. Aceita, mas como higiene, não como a correção. Remove um gatilho e deixa os outros quatro de pé.

**Alternativa C — Promover o triplo editado para dentro do `AppState`, ao lado do HSV.**
Escolhida. O Triplo_Editado passa a ser parte da identidade da cor, não estado paralelo de um painel. A invalidação acontece dentro de `setHsv`, que é o funil por onde toda cor passa, sem exceção — inclusive `setRgb` e `setHex`, que delegam a ele. Quem é dono do triplo declara isso na própria escrita; todo o resto invalida por omissão. Isso inverte o padrão para o lado seguro: esquecer de declarar produz o comportamento conservador — derivar da cor — em vez do errado. E resolve de uma vez os cinco gatilhos, incluindo `'host'`, `'peer'`, `setLimit` e `setGamut`, sem que nenhum deles precise ser tocado. O custo é mexer em `state.js` e no formato da entrada de histórico, e é o que dá de graça a restauração do triplo no desfazer.

**Alternativa D — Manter o latch e garantir que o triplo exibido sempre descreva uma cor alcançável.**
Tornaria a ida e volta fiel, e aí o descarte seria inofensivo porque a derivação devolveria os mesmos números. Rejeitada porque muda o produto: recortar o triplo para o gamut sRGB torna `A=127` e `B=127` inalcançáveis, e é justamente para alcançar os extremos que LAB existe no painel. Contraria o Requisito 3.4, o comentário de projeto que motiva o latch e o teste `resolveVals: com latch válido, devolve exatamente o que foi editado`.

### Changes Required

Assumindo que a análise de causa-raiz se confirme na tarefa de exploração.

**Arquivo**: `demo/js/state.js`

1. **Estado do triplo editado**: acrescentar `state.channels = null` ao estado, no formato `{ mode, vals }`, ao lado de `state.hsv`.

2. **Invalidação no funil**: em `setHsv`, definir `state.channels = opts.channels || null` antes de emitir. Uma escrita que é dona do triplo passa `channels`; toda outra escrita invalida por omissão. `setRgb` e `setHex` repassam `opts` e portanto herdam o comportamento sem mudança própria.

3. **Escritas que não mexem na cor**: `setLimit`, `setGamut` e `resetGamut` emitem `'color'` sem passar por `setHsv` quando a cor não muda. Preservar `state.channels` nesses caminhos — a invalidação pertence a quem escreve cor, não a quem avisa que outro estado mudou.

4. **Histórico**: gravar o triplo junto da entrada em `pushHistory`, e restaurá-lo em `undo` e `redo`. `sameColor` continua comparando somente HSV, para a deduplicação de entradas não mudar.

5. **Acesso**: expor `getChannels()` para leitura pelo painel.

**Arquivo**: `demo/js/panels.js`

6. **Fonte do triplo**: `readVals()` passa a ler o triplo de `S.getChannels()` em vez da variável local `latch`. `resolveVals(modeName, rgb, current)` fica como está — é função pura, já testada, e continua sendo o ponto que decide entre triplo e derivação.

7. **Escrita dos modos com latch**: `MODES.LAB.write` e `MODES.CMYK.write` passam `channels: { mode, vals }` no `opts` da escrita, declarando a posse do triplo. `force: true` e `relock: true` continuam necessários pelos mesmos motivos de hoje.

8. **Remoção do subscriber de descarte**: `dropLatchIfExternal` e `ORIGENS_EXTERNAS` saem do caminho de decisão. Manter os símbolos exportados durante a transição faria o teste antigo passar por acidente; a intenção é removê-los e ajustar o teste que os exercita, que hoje verifica o critério errado.

9. **`applyChannel`**: usar `resolveVals(modeName, S.getRgb(), S.getChannels())` em vez de `readVals()`, para o parâmetro `modeName` governar de fato a leitura. Não é a causa do bug relatado, mas é a inconsistência registrada na investigação e o lugar de resolvê-la é este.

10. **`commitHex`**: retornar sem escrever quando o conteúdo normalizado do campo já corresponde a `S.getHex()`. O tratamento de hex inválido fica intocado.

**Arquivo**: `demo/js/panel-sync.js`

11. Nada a fazer. A cor do par chega por `setHsv` sem `channels` e portanto invalida o triplo, que é o comportamento correto: a cor foi escolhida na outra janela.

## Testing Strategy

### Validation Approach

Duas fases. Primeiro produzir contraexemplos que demonstrem a falha no código NÃO CORRIGIDO, no nível em que ela acontece — o ciclo ao vivo, com o `subscribe` do `AppState` ligado, e não o nível unitário de `resolveVals`, que já passa. Depois verificar que a correção resolve a condição do bug e que nada fora dela mudou.

Os testes rodam no runner existente do projeto: `node:test` mais `fast-check`, com `tests/setup.js` fazendo o shim de `window` e de `document`, e os módulos carregados por `require` como em `tests/slider-channels.test.js`. O arquivo novo entra na lista de `npm test` na raiz.

O ponto que os testes existentes não cobrem, e que este spec precisa cobrir, é a fiação: `panels.js` só liga `dropLatchIfExternal` ao `AppState` dentro de `init()`, que toca o DOM. Os testes novos reproduzem essa fiação à mão — `S.subscribe((st, reason) => Panels.dropLatchIfExternal(reason))` — que é o mínimo necessário para o ciclo ao vivo existir num teste sem DOM.

### Exploratory Bug Condition Checking

**Goal**: Produzir contraexemplos que demonstrem a falha ANTES de implementar a correção, e confirmar ou refutar a análise de causa-raiz. Se refutar, é preciso re-hipotetizar antes de mexer no código.

**Test Plan**: Escrever um teste baseado em propriedade que exercite o ciclo completo: aplicar um triplo LAB Não_Alcançável canal por canal, disparar um aviso intercorrente que a aplicação dispara hoje e que não altera nenhum componente da cor, editar um único canal, e verificar que os outros não mudaram. Rodar no código NÃO CORRIGIDO e examinar as falhas.

**Test Cases**:

1. **Caso concreto do relato** (falha no código atual): triplo `L=100, A=127, B=127`; intercorrente `setLimit({ enabled: false })`; edição `A=110`. Esperado `L=100 · A=110 · B=127`; observado hoje `L=58 · A=110 · B=69`.
2. **Propriedade escopada a triplos Não_Alcançáveis** (falha no código atual): triplos gerados com `L` em `[0, 100]`, `A` e `B` em `[-128, 127]`, filtrados por `naoAlcancavelEmSRGB`; canal e valor sorteados.
3. **Intercorrente por máscara de gamut** (falha no código atual): mesmo ciclo com `setGamut({})` no lugar de `setLimit`, para mostrar que o gatilho não é um controle específico.
4. **Invariância da cor no intercorrente** (deve passar hoje): o aviso intercorrente não altera nenhum componente de `S.getRgb()`. Sustenta que o descarte é indevido, e não uma reação legítima a mudança de cor.
5. **Caso de borda alcançável** (deve passar hoje): triplo dentro do sRGB no mesmo ciclo. Delimita a condição do bug — se falhar, a hipótese está errada e o problema é mais amplo.

**Expected Counterexamples**:

- Os canais não editados aparecem nos valores derivados de `rgbToLab` do RGB recortado, e não nos valores editados. Para o caso do relato: `L=57,70…` em vez de `100` e `B=69,01…` em vez de `127`.
- Causas possíveis a discriminar pelos contraexemplos: `emit('color')` incondicional em `setLimit` e `setGamut`; origem por omissão em `setHsv`; `commitHex` no `blur`; `undo`/`redo`; `'host'` e `'peer'` nas pontes.

### Fix Checking

**Goal**: Verificar que, para toda entrada em que a condição do bug vale, o código corrigido produz o comportamento esperado.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  aplicarTriplo(input.triplo)
  disparar(input.intercorrente)
  vistos := editarCanal_corrigido(input.modo, input.k, input.v)
  ASSERT expectedBehavior(vistos, input.triplo, input.k, input.v)
END FOR
```

### Preservation Checking

**Goal**: Verificar que, para toda entrada em que a condição do bug não vale, o código corrigido produz o mesmo resultado que o código atual.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT F(input) = F'(input)
END FOR
```

**Testing Approach**: Teste baseado em propriedade é o indicado para a preservação, porque preservação é uma afirmação universal — "para toda entrada não-buggy" — e porque a superfície é larga: cinco modos de slider, quatro canais no maior deles, intervalos de 256 valores. Geração automática cobre o espaço e encontra as bordas que um punhado de exemplos escritos à mão não alcança. Os exemplos de `tests/slider-channels.test.js` continuam valendo como âncoras concretas e não são substituídos.

**Test Plan**: Observar primeiro o comportamento no código NÃO CORRIGIDO para as entradas fora da condição do bug, registrar o que se observa, e só então escrever as propriedades que afirmam aquele comportamento. Verificar que passam antes da correção.

**Test Cases**:

1. **Modos reversíveis**: observar que RGB, HSV e B/W derivam os canais da cor no código atual, mesmo com triplo guardado de outro modo, e escrever a propriedade que fixa isso.
2. **Triplos alcançáveis**: observar que um triplo LAB dentro do sRGB atravessa o ciclo inteiro sem alterar os números, e fixar.
3. **Escolha deliberada de outra cor**: observar que uma escrita que muda a cor faz os canais LAB descreverem a nova cor, e fixar. Cobre roda, paleta, godê, hex digitado, `'host'` e `'peer'`.
4. **Extremos dos canais**: observar que os extremos são aceitos e exibidos no código atual, e fixar.
5. **CMYK com K alto**: observar a preservação de C, M e Y quando a cor colapsa em preto, e fixar.
6. **Isolamento entre modos**: observar que triplo de um modo não vale em outro, e fixar.
7. **Cor gravada**: observar que o histórico, o hex e o RGB enviado usam o valor recortado, e fixar.
8. **Rejeição de valor não numérico**: observar que `applyChannel` devolve `false` e não escreve, e fixar.

### Unit Tests

- Caso concreto do relato: triplo, intercorrente, edição de um canal, três valores esperados
- `commitHex` sem edição não escreve cor; `commitHex` com hex inválido continua revertendo e sinalizando erro
- `undo` e `redo` restauram o triplo gravado com a entrada; `pushHistory` continua ignorando duplicata consecutiva
- `applyChannel` com `modeName` diferente de `S.state.sliderMode` lê os valores do modo indicado pelo parâmetro
- `setLimit` e `setGamut` com a cor inalterada preservam o triplo

### Property-Based Tests

- **Property 1**: para todo triplo Não_Alcançável, todo canal e todo valor, com aviso intercorrente que não muda a cor, editar um canal altera aquele canal e nenhum outro
- **Property 2**: para toda entrada fora da condição do bug, o resultado é idêntico ao do código atual
- **Property 3**: para todo triplo editado, a cor gravada e enviada é o RGB recortado, e desfazer restaura o triplo

### Integration Tests

- Ciclo completo no modo LAB: editar os três canais até um extremo, acionar os controles de limitação de cor e de máscara de gamut, editar um canal e conferir os três números
- Troca de modo e volta: LAB → RGB → LAB deriva da cor, sem ressuscitar triplo antigo
- Desfazer e refazer sobre uma sequência de edições LAB, conferindo que cada passo devolve o triplo daquele passo
- Convivência com a trava de luminosidade ligada e com a máscara de gamut ativa: a cor é restringida, os números exibidos continuam sendo os editados
