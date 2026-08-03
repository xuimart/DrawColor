# Implementation Plan: Independência dos Canais LAB

## Overview

A ordem é a da metodologia de condição do bug: explorar antes de corrigir. A tarefa 1 escreve um teste que FALHA no código atual e cujo papel é produzir contraexemplos e confirmar a causa-raiz. A tarefa 2 fixa o comportamento a preservar, observando o código atual antes de afirmar qualquer coisa. Só a tarefa 3 mexe no código de produção.

Os testes ficam em `tests/lab-channel-independence.test.js`, rodam com `node:test` e `fast-check`, carregam os módulos por `require` como `tests/slider-channels.test.js` faz, e o arquivo entra na lista de `npm test` na raiz. A fiação do ciclo ao vivo — `S.subscribe(...)` ligando o descarte do triplo — é reproduzida à mão no teste, porque `Panels.init()` toca o DOM.

## Tasks

- [ ] 1. Escrever o teste de exploração da condição do bug
  - **Property 1: Bug Condition** - Independência dos canais no caminho ao vivo
  - **CRÍTICO**: este teste DEVE FALHAR no código não corrigido — a falha é o que confirma que o bug existe
  - **NÃO tente corrigir o teste nem o código quando ele falhar**
  - **NOTA**: este teste codifica o comportamento esperado; é ele que valida a correção quando passar, depois da implementação
  - **OBJETIVO**: produzir contraexemplos que demonstrem a falha e confirmar ou refutar a causa-raiz hipotetizada no design
  - Criar `tests/lab-channel-independence.test.js` com `node:test`, `fast-check` e `require('./setup.js')`
  - Carregar `color.js`, `state.js` e `panels.js` pelo mesmo padrão de `tests/slider-channels.test.js`
  - Reproduzir a fiação ao vivo: `S.subscribe((st, reason) => Panels.dropLatchIfExternal(reason))`, que é o que `Panels.init()` faz e que os testes atuais não exercitam
  - **Abordagem de PBT escopada**: para o caso determinístico do relato, escopar a propriedade ao triplo concreto `L=100, A=127, B=127` com edição `A=110`, garantindo reprodutibilidade; a versão geral sorteia `L` em `[0,100]`, `A` e `B` em `[-128,127]`, filtrando por `naoAlcancavelEmSRGB` conforme a Bug Condition do design
  - Ciclo do teste, na ordem: aplicar o triplo canal por canal com `Panels.applyChannel` → disparar um aviso intercorrente que a aplicação dispara hoje e que não altera nenhum componente da cor (`S.setLimit({ enabled: false })`, e uma variante com `S.setGamut({})`) → editar um único canal → ler `Panels.readVals()`
  - Asserções conforme `expectedBehavior` do design: o canal editado vale `v`, e cada outro canal vale exatamente o valor editado antes do intercorrente
  - Asserção auxiliar: `S.getRgb()` é idêntico antes e depois do aviso intercorrente, para sustentar que o descarte é indevido
  - Incluir o caso de borda alcançável (triplo dentro do sRGB), que deve passar hoje e delimita a condição do bug
  - Rodar no código NÃO CORRIGIDO com `node --test tests/lab-channel-independence.test.js`
  - **RESULTADO ESPERADO**: o teste FALHA — está correto, é a prova de que o bug existe
  - Documentar os contraexemplos encontrados, incluindo os valores derivados que aparecem no lugar dos editados, e registrar se a causa-raiz foi confirmada ou refutada
  - Se a causa-raiz for refutada, parar e voltar ao design antes de seguir
  - Marcar a tarefa como concluída quando o teste estiver escrito, executado e a falha documentada
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.6_

- [ ] 2. Escrever os testes de preservação (ANTES de implementar a correção)
  - **Property 2: Preservation** - Comportamento inalterado fora da condição do bug
  - **IMPORTANTE**: seguir a metodologia de observação primeiro — rodar o código NÃO CORRIGIDO, registrar o que se observa, e só então escrever a propriedade que afirma aquilo
  - Observar e fixar: RGB, HSV e B/W derivam os canais da cor mesmo com triplo guardado de outro modo
  - Observar e fixar: um triplo LAB dentro do sRGB atravessa o ciclo inteiro sem alterar os números
  - Observar e fixar: uma escrita que muda a cor de fato faz os canais LAB descreverem a nova cor — cobre roda, paleta, godê, hex digitado, `'host'` e `'peer'`
  - Observar e fixar: os extremos `L=100`, `A=-128`, `A=127`, `B=-128`, `B=127` são aceitos e exibidos
  - Observar e fixar: CMYK com `K=100` preserva C, M e Y editados, ainda que a cor colapse em preto
  - Observar e fixar: triplo de um modo não vale em outro modo
  - Observar e fixar: o histórico, o campo hex e o RGB enviado usam o valor recortado, nunca o triplo fora do sRGB
  - Observar e fixar: `applyChannel` devolve `false` e não escreve quando o valor não é numérico
  - Escrever as propriedades com `fast-check`, gerando modos, canais e valores dentro dos intervalos declarados em `MODES`
  - Rodar no código NÃO CORRIGIDO
  - **RESULTADO ESPERADO**: os testes PASSAM — confirma a linha de base a preservar
  - Marcar a tarefa como concluída quando os testes estiverem escritos, executados e passando no código não corrigido
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [ ] 3. Correção da independência dos canais no modo LAB

  - [ ] 3.1 Promover o triplo editado para dentro do AppState
    - Em `demo/js/state.js`, acrescentar `state.channels = null` ao estado, no formato `{ mode, vals }`, ao lado de `state.hsv`
    - Em `setHsv`, definir `state.channels = opts.channels || null` antes de emitir: quem é dono do triplo declara na escrita, todo o resto invalida por omissão
    - Preservar `state.channels` em `setLimit`, `setGamut` e `resetGamut`, que emitem `'color'` sem passar por `setHsv` e sem mudar a cor
    - Expor `getChannels()` para leitura pelo painel
    - Não alterar `setRgb` nem `setHex`: eles delegam a `setHsv` e herdam o comportamento
    - _Bug_Condition: isBugCondition(input) do design — modo com latch, triplo não alcançável em sRGB, aviso intercorrente sem mudança de cor_
    - _Expected_Behavior: expectedBehavior(vistos, triplo, k, v) do design_
    - _Preservation: Preservation Requirements do design_
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 3.1, 3.2, 3.3, 3.6_

  - [ ] 3.2 Ligar o painel ao triplo do AppState
    - Em `demo/js/panels.js`, `readVals()` passa a ler o triplo de `S.getChannels()` em vez da variável local `latch`
    - `MODES.LAB.write` e `MODES.CMYK.write` passam `channels: { mode, vals }` no `opts` da escrita, declarando a posse do triplo; `force: true` e `relock: true` continuam pelos mesmos motivos de hoje
    - Remover `dropLatchIfExternal` e `ORIGENS_EXTERNAS` do caminho de decisão, junto do `subscribe` que os usa em `init()`
    - Ajustar o teste `descarta o triplo quando a cor veio de outra origem`, em `tests/slider-channels.test.js`, que hoje verifica o critério por origem: o critério passa a ser a escrita de cor sem posse declarada
    - Manter `resolveVals` como está — é função pura, já coberta, e continua decidindo entre triplo e derivação
    - _Bug_Condition: isBugCondition(input) do design_
    - _Expected_Behavior: expectedBehavior(vistos, triplo, k, v) do design_
    - _Preservation: Preservation Requirements do design_
    - _Requirements: 2.1, 2.2, 2.6, 3.1, 3.3, 3.4, 3.5, 3.6_

  - [ ] 3.3 Carregar o triplo no histórico
    - Em `demo/js/state.js`, gravar o triplo junto da entrada em `pushHistory` e restaurá-lo em `undo` e `redo`
    - Manter `sameColor` comparando somente HSV, para a deduplicação de entradas consecutivas não mudar
    - _Expected_Behavior: Property 3 do design_
    - _Requirements: 2.4, 3.7_

  - [ ] 3.4 Remover os dois gatilhos de higiene
    - Em `demo/js/panels.js`, `commitHex` retorna sem escrever quando o conteúdo normalizado do campo já corresponde a `S.getHex()`; o tratamento de hex inválido fica intocado
    - `applyChannel` usa `resolveVals(modeName, S.getRgb(), S.getChannels())` em vez de `readVals()`, para o parâmetro `modeName` governar a leitura que a função faz
    - _Requirements: 2.5, 2.7, 3.10_

  - [ ] 3.5 Verificar que o teste de exploração agora passa
    - **Property 1: Bug Condition** - Independência dos canais no caminho ao vivo
    - **IMPORTANTE**: rodar o MESMO teste da tarefa 1 — não escrever teste novo
    - O teste da tarefa 1 codifica o comportamento esperado; quando ele passa, o comportamento esperado está satisfeito
    - **RESULTADO ESPERADO**: o teste PASSA, confirmando que o bug foi corrigido
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ] 3.6 Verificar que os testes de preservação continuam passando
    - **Property 2: Preservation** - Comportamento inalterado fora da condição do bug
    - **IMPORTANTE**: rodar os MESMOS testes da tarefa 2 — não escrever testes novos
    - **RESULTADO ESPERADO**: os testes PASSAM, confirmando que não há regressão
    - Confirmar que `tests/slider-channels.test.js`, `tests/lab.test.js`, `tests/mixer-history.test.js`, `tests/gamut-mask.test.js` e `tests/panel-sync.test.js` seguem passando
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [ ] 4. Testes de regressão no runner do projeto
  - Acrescentar `tests/lab-channel-independence.test.js` ao script `test` do `package.json` da raiz
  - Acrescentar os testes unitários da seção Unit Tests do design: caso concreto do relato; `commitHex` sem edição não escreve; `commitHex` com hex inválido continua revertendo e sinalizando erro; `undo`/`redo` restauram o triplo; `applyChannel` respeita o `modeName` recebido; `setLimit` e `setGamut` com a cor inalterada preservam o triplo
  - Acrescentar a Property 3 do design: a cor gravada e enviada é o RGB recortado, e desfazer restaura o triplo
  - Rodar a suíte inteira com `npm test` na raiz
  - _Requirements: 2.4, 2.5, 2.7, 3.7, 3.10_

- [ ] 5. Checkpoint — conferir a suíte completa e o comportamento no painel
  - Garantir que todos os testes passam; perguntar ao usuário se surgirem dúvidas
  - Conferir no painel o ciclo do relato: editar os três canais LAB até o extremo, acionar os controles de limitação de cor e de máscara de gamut, mover só o A, e verificar que L e B não mudaram

## Notes

- As tarefas 1 e 2 são autônomas e vêm antes da implementação de propósito: sem contraexemplo observado no código atual não há como saber se a correção acertou a causa
- A tarefa 1 falhando é o resultado correto dela; a tarefa 2 passando é o resultado correto dela
- Se a tarefa 1 passar no código não corrigido, o cenário ao vivo não foi reproduzido: revisar a fiação do `subscribe` e o aviso intercorrente escolhido antes de seguir
- Os contraexemplos da tarefa 1 são o que discrimina entre as cinco causas candidatas listadas no design
- Nenhuma tarefa toca `demo/js/color.js`: a matemática de cor não está em questão

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["3.5", "3.6"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5"] }
  ]
}
```
