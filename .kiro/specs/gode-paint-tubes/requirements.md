# Requirements Document

Sistema de tubos de tinta para o godê de mistura.

## Introduction

Hoje o godê tem um único caminho para receber tinta pronta: o botão "Dispor paleta", que lê `Palettes.getActiveColors()` e desenha até 16 círculos de raio 15 numa grade fixa de 8 por linha. O relato do usuário aponta o problema central: "já temos o dispor paleta... mas não entendi quais as cores ele está colocando". A operação é opaca em cinco pontos, todos verificáveis no código atual de `loadPalette` em `demo/js/gode.js`:

1. **Sem escolha.** As cores vêm todas da paleta ativa, na ordem em que foram salvas por `addCurrentColor`. O artista não seleciona o que entra no godê.
2. **Sem origem.** Depois de `ctx.arc(...)` e `ctx.fill()`, as pastilhas são círculos anônimos de pixels. Nada no canvas, no `#godeHint` ou na interface diz de qual cor ou de qual paleta cada círculo veio.
3. **Corte silencioso.** `colors.slice(0, 16)` descarta o excedente sem aviso. Uma paleta de 30 cores perde 14 e a mensagem final continua sendo "Pastilhas dispostas — espatule para misturar".
4. **Posição imposta.** `perRow`, `pad`, `gapX` e o raio 15 são constantes. Não existe caminho para colocar uma cor onde o artista quer.
5. **Sem noção de tinta.** A pastilha é um disco de cor sólida. O que a espátula espalha é pixel, não tinta com quantidade.

A direção deste documento é a metáfora física da caixa de tintas. O artista monta uma Caixa_De_Tubos escolhendo o que leva — cores de uma paleta salva, a cor corrente do painel, ou um Conjunto_Predefinido de pigmentos clássicos — e cada Tubo fica disponível como fonte de tinta identificada. Esguichar é um gesto sobre o canvas: clique deposita uma poça, arraste deposita um filete. Misturar continua sendo o que já é hoje, com pincel, espátula e conta-gotas.

O escopo é a aba do godê (`#paneGode`), o módulo novo de tubos e a persistência via Platform Adapter. Fora de escopo: alterar o modelo de mistura de `stamp`/`strokeBetween`, alterar `palettes.js` além da leitura que já existe, e simulação de volume finito de tinta (registrada como questão aberta em Q4b).

## Glossary

- **Godê**: A superfície de mistura da aba `#paneGode`, um canvas de 340 por 190 pixels de resolução interna, com as ferramentas pincel, espátula e conta-gotas
- **Tubo**: Uma fonte de tinta nomeada, formada por identificador, nome, cor em hexadecimal de 6 dígitos e origem
- **Caixa_De_Tubos**: A coleção ordenada de Tubos disponível no Godê, de 0 a 16 Tubos, única para a instalação e independente da paleta ativa
- **Origem_Do_Tubo**: A procedência registrada de um Tubo, um dos valores `paleta`, `cor-atual`, `predefinido` ou `manual`
- **Conjunto_Predefinido**: Um agrupamento nomeado de Tubos embutido no código, não editável, que o artista carrega na Caixa_De_Tubos
- **Pigmentos_Clássicos**: O Conjunto_Predefinido de sete Tubos descrito no Requisito 4
- **Paleta_Zorn**: O Conjunto_Predefinido de quatro Tubos descrito no Requisito 4
- **Tubo_Ativo**: O Tubo selecionado na Bandeja_De_Tubos, cuja cor a Ferramenta_Tubo deposita
- **Bandeja_De_Tubos**: A faixa de controles da aba do Godê que exibe um chip por Tubo da Caixa_De_Tubos
- **Ferramenta_Tubo**: A quarta ferramenta do Godê, que deposita a cor do Tubo_Ativo no canvas
- **Esguicho**: Um gesto único da Ferramenta_Tubo, do acionamento do ponteiro até a soltura, que deposita tinta no canvas
- **Poça**: A marca circular deixada por um Esguicho sem deslocamento, de raio igual à metade do Tamanho_Do_Esguicho
- **Filete**: A marca contínua deixada por um Esguicho com deslocamento, formada por Poças sobrepostas ao longo do caminho do ponteiro
- **Tamanho_Do_Esguicho**: O valor corrente do controle `#godeSize`, no intervalo de 6 a 70, que governa o diâmetro da Poça
- **Tinta_Pura**: Tinta depositada com opacidade total e sem mistura com a cor que já está no canvas, ao contrário da pincelada, que mistura pelo `flow`
- **Registro_De_Depósitos**: A lista de depósitos de tinta do Godê, cada um com identificador do Tubo, centro e raio, usada para informar a origem de uma região do canvas
- **Disposição**: A operação que deposita uma Poça de cada Tubo da Caixa_De_Tubos em posições calculadas, substituindo o "Dispor paleta" atual
- **Grade_De_Disposição**: O conjunto de centros e o raio calculados pela Disposição para uma quantidade dada de Tubos
- **Tubes_Store**: O subsistema que mantém a Caixa_De_Tubos em memória, valida as operações e persiste o estado
- **Tubes_Serializer**: O subsistema que converte a Caixa_De_Tubos em texto JSON e texto JSON em Caixa_De_Tubos
- **Platform_Storage**: O armazenamento síncrono com cache em memória exposto por `Platform.storage`, já usado por `palettes.js`, `layout-store.js` e `docking.js`
- **Pilha_De_Desfazer**: A pilha de snapshots `ImageData` do Godê, limitada a 30 entradas, alimentada por `saveSnapshot`

## Decisões de Design Propostas

Cada questão abaixo tem uma resposta proposta. As marcadas com **[confirmar]** alteram o alcance do trabalho e precisam de aval antes do documento de design.

**Q1 — Como o artista escolhe os tubos?** Os dois caminhos, porque resolvem necessidades diferentes. Importar uma paleta inteira é o atalho para quem já montou a paleta do estudo; escolher cor por cor é o que permite levar quatro tubos e nada mais. A proposta cobre três entradas: importar a paleta ativa, adicionar a cor corrente do painel, e carregar um Conjunto_Predefinido. Formalizado nos Requisitos 2 e 3.

**Q2 — Onde os tubos aparecem?** Numa Bandeja_De_Tubos horizontal e rolável, inserida entre `.gode-tools` e o canvas, recolhível por um botão. A aba já é apertada: tem barra de ferramentas, canvas com alça de redimensionamento, dois sliders, dois botões de ação e a linha de dica. A bandeja recolhida ocupa a altura de uma linha de chips (28 pixels), e o canvas do Godê já é redimensionável pela alça, então o artista pode devolver a altura quando quiser. **[confirmar]** a alternativa: colocar os tubos como uma quinta aba própria, o que dá mais espaço mas separa a caixa de tintas do godê onde ela é usada.

**Q3 — Os tubos são persistidos?** Sim, em Platform_Storage sob a chave `colorWheelPlugin.tubes.v1`, no mesmo padrão de `palettes.js`: leitura síncrona do cache no init, gravação por `setItem` com flush debounced pelo Platform Adapter. Isso funciona igual nos três ambientes, inclusive UXP, que não tem `localStorage`. Formalizado no Requisito 9.

**Q4 — Esguichar é clique ou arraste?** Os dois, com a mesma ferramenta: clique deposita uma Poça, arraste deposita um Filete. A quantidade de tinta é a área coberta, governada pelo slider Tamanho que já existe. **[confirmar] Q4b:** a proposta *não* implementa volume finito de tinta. Fazer a Poça ter carga que a espátula consome exigiria um segundo buffer de massa por pixel, paralelo ao canvas de cor, e reescreveria `sampleArea`, `stamp` e o undo. É um trabalho de porte próprio e a recomendação é deixá-lo para um spec posterior.

**Q5 — A caixa é por paleta, global, ou um terceiro conceito?** Terceiro conceito, global e única. Amarrar a caixa à paleta ativa reintroduz exatamente o problema 1: trocar de paleta trocaria os tubos sem o artista pedir. Uma caixa por paleta multiplicaria estado sem ganho, já que a paleta é o arquivo de cores e a caixa é o que está na mão agora. Caixas nomeadas ficam fora de escopo; quem quer alternar conjuntos usa os Conjuntos_Predefinidos ou reimporta uma paleta.

**Q6 — Deve existir um conjunto padrão de pigmentos clássicos?** Sim, e é a resposta mais direta à confusão relatada. Um tubo chamado "Azul Ultramar" diz o que é; um círculo `#26346F` não diz nada. A proposta traz Pigmentos_Clássicos com sete tubos e Paleta_Zorn com quatro, ambos embutidos e não editáveis, carregáveis na caixa com uma ação. **[confirmar]** os valores hexadecimais do Requisito 4: são aproximações em sRGB dos pigmentos, escolhidas por leitura visual, não medidas de amostras. Se houver preferência por outros valores, é aqui que eles entram.

**Q7 — Como conviver com o "Dispor paleta" atual?** O botão `#godeLoad` passa a dispor os Tubos da Caixa_De_Tubos, e a disposição de paleta vira um caso particular: importar a paleta ativa para a caixa e dispor. Com a caixa vazia, o botão importa a paleta ativa antes de dispor, o que preserva o gesto de um clique que existe hoje. O rótulo muda de "Dispor paleta" para "Dispor tubos". Formalizado no Requisito 6.

**Q8 — Interação com o undo/redo do godê?** Todo depósito de tinta é uma entrada única na Pilha_De_Desfazer, do mesmo jeito que uma pincelada: `saveSnapshot` no acionamento do ponteiro, nada durante o movimento. Uma Disposição inteira também é uma entrada única. Alterações na Caixa_De_Tubos não entram na Pilha_De_Desfazer, porque a pilha guarda `ImageData` do canvas e a caixa é configuração persistida, não pixel. Formalizado no Requisito 8.

**Q9 — Esguichar altera a cor corrente do painel?** Não. A Ferramenta_Tubo deposita a cor do Tubo_Ativo sem chamar `AppState.setRgb`, para não disparar histórico, envio ao Photoshop e sincronização de janelas a cada Esguicho. Quem quiser levar a cor do tubo para o painel usa Alt+clique no chip do tubo. Formalizado nos Requisitos 5 e 11.

## Requirements

### Requisito 1: A Caixa de Tubos

**User Story:** Como artista, eu quero montar um conjunto explícito de tubos de tinta, para que eu saiba exatamente quais cores estão disponíveis para misturar no godê.

#### Critérios de Aceitação

1. THE Tubes_Store SHALL manter a Caixa_De_Tubos como uma lista ordenada de 0 a 16 Tubos
2. THE Tubes_Store SHALL representar cada Tubo por um identificador único, um nome de 1 a 24 caracteres, uma cor em hexadecimal de 6 dígitos e uma Origem_Do_Tubo
3. THE Tubes_Store SHALL manter uma única Caixa_De_Tubos por instalação, independente da paleta ativa de `Palettes`
4. WHEN a paleta ativa de `Palettes` mudar, THE Tubes_Store SHALL manter a Caixa_De_Tubos inalterada
5. IF uma operação de inclusão for solicitada com a Caixa_De_Tubos já contendo 16 Tubos, THEN THE Tubes_Store SHALL rejeitar a inclusão, manter a Caixa_De_Tubos inalterada e exibir a mensagem de caixa cheia com o limite de 16
6. IF uma operação de inclusão for solicitada com uma cor cujo hexadecimal já pertence a um Tubo da Caixa_De_Tubos, THEN THE Tubes_Store SHALL rejeitar a inclusão, manter a Caixa_De_Tubos inalterada e exibir a mensagem de que a cor já está na caixa
7. IF uma operação de inclusão for solicitada com um valor que não seja hexadecimal de 6 dígitos, THEN THE Tubes_Store SHALL rejeitar a inclusão e manter a Caixa_De_Tubos inalterada
8. WHILE a Caixa_De_Tubos estiver vazia, THE Bandeja_De_Tubos SHALL exibir o texto de caixa vazia com as ações de importar a paleta ativa e de carregar Pigmentos_Clássicos

### Requisito 2: Montagem a Partir de Paletas

**User Story:** Como artista que já montou uma paleta para o estudo, eu quero levar essa paleta inteira para a caixa de tubos, para que eu não precise adicionar cor por cor.

#### Critérios de Aceitação

1. WHEN o usuário acionar a importação da paleta ativa, THE Tubes_Store SHALL criar um Tubo para cada cor da paleta ativa, na ordem da paleta, com Origem_Do_Tubo igual a `paleta` e nome igual ao hexadecimal da cor
2. WHEN a importação da paleta ativa criar Tubos, THE Tubes_Store SHALL descartar as cores cujo hexadecimal já pertença a um Tubo da Caixa_De_Tubos e informar a quantidade descartada por duplicidade
3. IF a quantidade de cores candidatas exceder o espaço livre da Caixa_De_Tubos, THEN THE Tubes_Store SHALL importar as cores que couberem na ordem da paleta e exibir a quantidade exata de cores não importadas e o motivo do limite de 16
4. IF a paleta ativa não contiver cor alguma, THEN THE Tubes_Store SHALL manter a Caixa_De_Tubos inalterada e exibir a mensagem de que a paleta ativa está vazia
5. WHERE o usuário optar por substituir em vez de acrescentar, THE Tubes_Store SHALL esvaziar a Caixa_De_Tubos antes de importar as cores da paleta ativa
6. WHEN a importação terminar, THE Tubes_Store SHALL exibir a quantidade de Tubos importados e o nome da paleta de procedência

### Requisito 3: Montagem a Partir de Cores Individuais

**User Story:** Como artista, eu quero escolher cor por cor os tubos que levo para o godê, para que eu misture com um conjunto pequeno e deliberado.

#### Critérios de Aceitação

1. WHEN o usuário acionar a inclusão da cor corrente, THE Tubes_Store SHALL criar um Tubo com a cor hexadecimal corrente de `AppState`, Origem_Do_Tubo igual a `cor-atual` e nome igual ao hexadecimal da cor
2. WHEN o usuário acionar a inclusão de uma cor a partir de um chip da paleta ativa, THE Tubes_Store SHALL criar um Tubo com a cor do chip acionado, Origem_Do_Tubo igual a `paleta` e nome igual ao hexadecimal da cor
3. WHEN o usuário acionar a inclusão de uma cor pela Bandeja_De_Tubos, THE Tubes_Store SHALL acrescentar o Tubo criado ao fim da Caixa_De_Tubos
4. WHEN um Tubo for criado, THE Bandeja_De_Tubos SHALL exibir o chip do Tubo criado e selecioná-lo como Tubo_Ativo
5. WHEN o usuário acionar a inclusão da cor corrente com a Caixa_De_Tubos já contendo essa cor, THE Bandeja_De_Tubos SHALL selecionar como Tubo_Ativo o Tubo que já contém a cor

### Requisito 4: Conjuntos Predefinidos de Pigmentos

**User Story:** Como artista de tinta a óleo, eu quero começar de um conjunto de pigmentos nomeados que eu reconheço, para que eu saiba de que cor cada tubo é sem precisar interpretar um hexadecimal.

#### Critérios de Aceitação

1. THE Tubes_Store SHALL oferecer o Conjunto_Predefinido Pigmentos_Clássicos com sete Tubos, nesta ordem: Branco de Titânio `#F7F4EC`, Amarelo Cádmio `#F9C013`, Vermelho Cádmio `#DA291C`, Alizarina Carmesim `#7E212F`, Azul Ultramar `#26346F`, Terra de Siena Queimada `#7B3F1D` e Preto de Marfim `#221E1C`
2. THE Tubes_Store SHALL oferecer o Conjunto_Predefinido Paleta_Zorn com quatro Tubos, nesta ordem: Branco de Titânio `#F7F4EC`, Ocre Amarelo `#C9A227`, Vermelhão `#C1440E` e Preto de Marfim `#221E1C`
3. WHEN o usuário carregar um Conjunto_Predefinido, THE Tubes_Store SHALL substituir o conteúdo da Caixa_De_Tubos pelos Tubos do Conjunto_Predefinido carregado, com Origem_Do_Tubo igual a `predefinido` e o nome do pigmento como nome do Tubo
4. THE Tubes_Store SHALL manter o conteúdo de cada Conjunto_Predefinido inalterado por qualquer operação do usuário sobre a Caixa_De_Tubos
5. WHEN o usuário renomear ou remover um Tubo carregado de um Conjunto_Predefinido, THE Tubes_Store SHALL aplicar a alteração somente à Caixa_De_Tubos
6. THE Bandeja_De_Tubos SHALL exibir o nome do pigmento de cada Tubo de Origem_Do_Tubo igual a `predefinido` no chip correspondente

### Requisito 5: Bandeja de Tubos

**User Story:** Como artista, eu quero ver os tubos que escolhi antes de esguichar, para que eu identifique cada cor pelo nome e escolha de qual tubo sai a tinta.

#### Critérios de Aceitação

1. THE Bandeja_De_Tubos SHALL renderizar um chip por Tubo da Caixa_De_Tubos, na ordem da Caixa_De_Tubos, dentro da aba `#paneGode` e acima do canvas do Godê
2. THE Bandeja_De_Tubos SHALL renderizar cada chip com a cor do Tubo aplicada por `AppState.displayCss`, de modo que a conferência de valores afete os chips do mesmo jeito que afeta os chips da paleta
3. THE Bandeja_De_Tubos SHALL fornecer a cada chip um nome acessível formado pelo nome do Tubo e pelo hexadecimal da cor do Tubo
4. WHEN o usuário acionar um chip, THE Bandeja_De_Tubos SHALL definir o Tubo correspondente como Tubo_Ativo e THE Godê SHALL ativar a Ferramenta_Tubo
5. WHILE um Tubo estiver selecionado como Tubo_Ativo, THE Bandeja_De_Tubos SHALL renderizar o chip correspondente com um anel de destaque de 2 pixels e `aria-checked` igual a `true`
6. WHEN o usuário acionar um chip com a tecla Alt pressionada, THE Godê SHALL definir a cor corrente de `AppState` como a cor do Tubo acionado, com commit em histórico
7. THE Bandeja_De_Tubos SHALL oferecer um controle que recolhe e expande a faixa de chips, preservando a Caixa_De_Tubos e o Tubo_Ativo em ambos os estados
8. WHILE a quantidade de chips exceder a largura disponível, THE Bandeja_De_Tubos SHALL oferecer rolagem horizontal, mantendo a altura da faixa igual à de uma linha de chips
9. THE Bandeja_De_Tubos SHALL permitir selecionar cada chip pela tecla Tab e acioná-lo pelas teclas Enter e Espaço

### Requisito 6: Esguichar e Dispor Tinta

**User Story:** Como artista, eu quero esguichar tinta de um tubo onde eu quiser no godê, para que eu decida a posição e a quantidade de cada cor antes de misturar.

#### Critérios de Aceitação

1. THE Godê SHALL oferecer a Ferramenta_Tubo como quarta opção do grupo de ferramentas `.gode-tools`, ao lado de pincel, espátula e conta-gotas
2. WHILE a Ferramenta_Tubo estiver ativa e existir Tubo_Ativo, WHEN o usuário acionar o ponteiro sobre o canvas sem deslocá-lo, THE Godê SHALL depositar uma Poça de Tinta_Pura da cor do Tubo_Ativo, centrada na posição do ponteiro, com raio igual à metade do Tamanho_Do_Esguicho
3. WHILE a Ferramenta_Tubo estiver ativa e existir Tubo_Ativo, WHEN o usuário arrastar o ponteiro sobre o canvas, THE Godê SHALL depositar um Filete de Tinta_Pura ao longo do caminho do ponteiro, com espaçamento entre centros consecutivos igual ou inferior à metade do raio da Poça
4. THE Godê SHALL depositar a Tinta_Pura com opacidade total, sem misturar com a cor previamente presente no canvas, de modo que a cor depositada no centro da Poça seja exatamente a cor do Tubo_Ativo
5. IF a posição do ponteiro colocar parte da Poça fora dos limites do canvas, THEN THE Godê SHALL depositar somente a parte da Poça interna aos limites do canvas, sem alterar o raio
6. IF o usuário acionar o ponteiro com a Ferramenta_Tubo ativa e sem Tubo_Ativo, THEN THE Godê SHALL manter o canvas inalterado e exibir a mensagem de que nenhum tubo está selecionado
7. WHEN o usuário acionar a Disposição, THE Godê SHALL depositar uma Poça de cada Tubo da Caixa_De_Tubos nos centros da Grade_De_Disposição, na ordem da Caixa_De_Tubos
8. THE Grade_De_Disposição SHALL calcular, para uma quantidade de 1 a 16 Tubos, centros e raio tais que cada Poça fique inteiramente dentro dos limites do canvas e a distância entre quaisquer dois centros seja igual ou superior à soma dos dois raios acrescida de 4 pixels
9. IF a Caixa_De_Tubos estiver vazia quando o usuário acionar a Disposição, THEN THE Godê SHALL importar as cores da paleta ativa para a Caixa_De_Tubos conforme o Requisito 2 e em seguida executar a Disposição
10. WHEN a Disposição terminar, THE Godê SHALL exibir a quantidade de Poças depositadas e o nome do primeiro e do último Tubo dispostos
11. THE Godê SHALL rotular o controle `#godeLoad` como "Dispor tubos"

### Requisito 7: Origem da Tinta no Canvas

**User Story:** Como artista, eu quero saber de qual tubo veio a tinta que está numa região do godê, para que eu entenda o que estou misturando.

#### Critérios de Aceitação

1. WHEN o Godê depositar tinta por Esguicho ou por Disposição, THE Godê SHALL acrescentar ao Registro_De_Depósitos o identificador do Tubo, o centro e o raio de cada Poça depositada
2. WHEN o ponteiro passar sobre uma posição do canvas contida em um depósito do Registro_De_Depósitos, THE Godê SHALL exibir no elemento `#godeHint` o nome do Tubo, o hexadecimal da cor do Tubo e a Origem_Do_Tubo do depósito correspondente
3. IF a posição do ponteiro estiver contida em mais de um depósito do Registro_De_Depósitos, THEN THE Godê SHALL exibir os dados do depósito acrescentado mais recentemente
4. WHEN o Godê for limpo, THE Godê SHALL esvaziar o Registro_De_Depósitos
5. THE Godê SHALL manter o Registro_De_Depósitos fora do canvas, sem desenhar texto na superfície de mistura
6. THE Registro_De_Depósitos SHALL conter no máximo 400 depósitos, descartando os mais antigos ao exceder esse limite

### Requisito 8: Integração com o Desfazer do Godê

**User Story:** Como artista, eu quero desfazer um esguicho como desfaço uma pincelada, para que o comportamento do godê continue previsível.

#### Critérios de Aceitação

1. WHEN o usuário acionar o ponteiro para iniciar um Esguicho, THE Godê SHALL gravar um snapshot na Pilha_De_Desfazer antes de depositar tinta
2. WHILE um Esguicho estiver em curso, THE Godê SHALL gravar nenhum snapshot adicional, de modo que o Esguicho inteiro corresponda a uma única entrada da Pilha_De_Desfazer
3. WHEN o usuário acionar a Disposição, THE Godê SHALL gravar um único snapshot na Pilha_De_Desfazer antes de depositar a primeira Poça
4. WHEN o usuário desfizer uma entrada correspondente a um Esguicho ou a uma Disposição, THE Godê SHALL remover do Registro_De_Depósitos os depósitos criados por essa entrada
5. WHEN o usuário refizer uma entrada correspondente a um Esguicho ou a uma Disposição, THE Godê SHALL restabelecer no Registro_De_Depósitos os depósitos criados por essa entrada
6. WHEN o usuário incluir, renomear, reordenar ou remover um Tubo, THE Godê SHALL manter a Pilha_De_Desfazer inalterada
7. WHEN o usuário remover um Tubo cujo identificador conste no Registro_De_Depósitos, THE Godê SHALL preservar o nome e a cor do Tubo removido no Registro_De_Depósitos, de modo que a origem dos depósitos já feitos continue legível

### Requisito 9: Persistência e Serialização da Caixa

**User Story:** Como artista, eu quero que os tubos que escolhi continuem lá quando eu reabrir o painel, para que eu não remonte a caixa a cada sessão.

#### Critérios de Aceitação

1. WHEN a Caixa_De_Tubos for alterada, THE Tubes_Store SHALL gravar o estado em Platform_Storage sob a chave `colorWheelPlugin.tubes.v1`
2. WHEN o painel for aberto, THE Tubes_Store SHALL ler o estado gravado em Platform_Storage e aplicar a Caixa_De_Tubos lida
3. THE Tubes_Serializer SHALL produzir um texto JSON contendo a versão do formato igual a 1, o identificador do Tubo_Ativo e, para cada Tubo, o identificador, o nome, a cor hexadecimal e a Origem_Do_Tubo
4. FOR ALL Caixas_De_Tubos válidas, serializar e em seguida desserializar SHALL produzir uma Caixa_De_Tubos com a mesma sequência de identificadores, nomes, cores e Origens_Do_Tubo da Caixa_De_Tubos original
5. IF o texto lido de Platform_Storage não for JSON sintaticamente válido, THEN THE Tubes_Store SHALL iniciar com a Caixa_De_Tubos vazia e registrar um aviso no console
6. IF o texto lido contiver uma versão de formato diferente de 1, THEN THE Tubes_Store SHALL iniciar com a Caixa_De_Tubos vazia e registrar um aviso no console
7. IF o texto lido contiver um Tubo com cor que não seja hexadecimal de 6 dígitos, THEN THE Tubes_Serializer SHALL descartar o Tubo inválido, aceitar os Tubos restantes e informar a quantidade descartada
8. IF o texto lido contiver mais de 16 Tubos, THEN THE Tubes_Serializer SHALL aceitar os 16 primeiros e informar a quantidade descartada
9. IF o identificador de Tubo_Ativo lido não pertencer a nenhum Tubo aceito, THEN THE Tubes_Store SHALL definir o primeiro Tubo da Caixa_De_Tubos como Tubo_Ativo, ou nenhum Tubo_Ativo quando a Caixa_De_Tubos estiver vazia
10. IF Platform_Storage não estiver disponível para gravação, THEN THE Tubes_Store SHALL manter a Caixa_De_Tubos em memória e exibir a mensagem de que a caixa não será preservada

### Requisito 10: Edição da Caixa de Tubos

**User Story:** Como artista, eu quero renomear, reordenar e descartar tubos, para que a caixa reflita o conjunto que eu realmente uso.

#### Critérios de Aceitação

1. WHEN o usuário renomear um Tubo com um texto de 1 a 24 caracteres, THE Tubes_Store SHALL aplicar o nome informado ao Tubo indicado
2. IF o usuário renomear um Tubo com um texto vazio ou formado somente por espaços, THEN THE Tubes_Store SHALL aplicar ao Tubo indicado o hexadecimal da cor do Tubo como nome
3. IF o usuário renomear um Tubo com um texto de mais de 24 caracteres, THEN THE Tubes_Store SHALL aplicar os 24 primeiros caracteres do texto informado
4. WHEN o usuário remover um Tubo, THE Tubes_Store SHALL retirar o Tubo indicado da Caixa_De_Tubos preservando a ordem relativa dos Tubos restantes
5. WHEN o usuário remover o Tubo que é o Tubo_Ativo, THE Tubes_Store SHALL definir como Tubo_Ativo o Tubo imediatamente anterior na Caixa_De_Tubos, ou o primeiro Tubo quando o removido era o primeiro, ou nenhum Tubo_Ativo quando a Caixa_De_Tubos ficar vazia
6. WHEN o usuário mover um Tubo uma posição para a esquerda ou para a direita, THE Tubes_Store SHALL trocar o Tubo indicado com o Tubo vizinho no sentido solicitado
7. IF o usuário mover para a esquerda o primeiro Tubo ou para a direita o último Tubo, THEN THE Tubes_Store SHALL manter a Caixa_De_Tubos inalterada
8. WHEN o usuário esvaziar a Caixa_De_Tubos, THE Tubes_Store SHALL remover todos os Tubos e definir nenhum Tubo_Ativo
9. THE Tubes_Store SHALL preservar o identificador de cada Tubo por todas as operações de renomear e reordenar

### Requisito 11: Comportamento Preservado

**User Story:** Como artista que já usa o godê, eu quero que as ferramentas e as paletas continuem funcionando como funcionam hoje, para que o sistema de tubos acrescente sem tirar.

#### Critérios de Aceitação

1. WHEN o usuário selecionar pincel, espátula ou conta-gotas, THE Godê SHALL CONTINUE TO aplicar a ferramenta selecionada com o mesmo comportamento de mistura, de fluxo e de amostragem em vigor antes dos Tubos
2. WHEN o usuário pressionar Shift ou Alt com o Godê visível, THE Godê SHALL CONTINUE TO ativar espátula ou conta-gotas temporariamente e restabelecer a ferramenta anterior ao soltar a tecla
3. WHEN a Ferramenta_Tubo estiver ativa e o usuário pressionar Shift ou Alt, THE Godê SHALL restabelecer a Ferramenta_Tubo e o Tubo_Ativo ao soltar a tecla
4. WHEN o usuário aplicar zoom por Ctrl+roda, pan pelo botão do meio ou Ctrl+0, THE Godê SHALL CONTINUE TO transformar a exibição do canvas sem alterar a resolução interna de 340 por 190 pixels
5. WHILE o zoom ou o pan estiverem diferentes do padrão, THE Godê SHALL depositar tinta na posição do canvas correspondente à posição do ponteiro, conforme a conversão de `toLocal`
6. WHEN o usuário acionar o conta-gotas sobre tinta depositada por um Tubo, THE Godê SHALL CONTINUE TO definir a cor corrente de `AppState` pela média do disco amostrado
7. THE Godê SHALL CONTINUE TO alternar a classe `is-value-check` do canvas conforme o estado de conferência de valores de `AppState`
8. THE Tubes_Store SHALL manter as paletas de `Palettes` inalteradas por qualquer operação sobre a Caixa_De_Tubos
9. WHEN o usuário esguichar tinta, THE Godê SHALL manter a cor corrente de `AppState` inalterada
10. THE Godê SHALL CONTINUE TO redimensionar o viewport pela alça de arraste no intervalo de 80 a 600 pixels de altura

## Propriedades de Corretude

As propriedades abaixo são verificáveis por teste baseado em propriedades com `node:test` e `fast-check`, no padrão de `tests/`. Cada uma opera sobre funções puras do Tubes_Store, do Tubes_Serializer e da Grade_De_Disposição, sem canvas e sem DOM.

**P1 — Round-trip de serialização (Req 9.3, 9.4).** Toda Caixa_De_Tubos válida sobrevive a serializar e desserializar.

```pascal
FOR ALL caixa : CaixaValida DO
  ASSERT desserializar(serializar(caixa)) = caixa
END FOR
```

**P2 — Invariantes da caixa sob qualquer sequência de operações (Req 1.1, 1.2, 1.5, 1.6).**

```pascal
FOR ALL ops : SequenciaDeOperacoes DO
  caixa ← aplicar(ops, caixaVazia)
  ASSERT 0 <= tamanho(caixa) <= 16
  ASSERT todos os hexadecimais de caixa são distintos
  ASSERT todo tubo de caixa tem hexadecimal de 6 dígitos e nome de 1 a 24 caracteres
END FOR
```

**P3 — Idempotência da importação (Req 2.2).** Importar a mesma paleta duas vezes seguidas resulta na mesma caixa que importar uma vez, porque a segunda passagem é toda descartada por duplicidade.

```pascal
FOR ALL paleta, caixa DO
  ASSERT importar(importar(caixa, paleta), paleta) = importar(caixa, paleta)
END FOR
```

**P4 — Conservação na importação (Req 2.2, 2.3).** Nada desaparece sem contabilidade.

```pascal
FOR ALL paleta, caixa DO
  r ← importar(caixa, paleta)
  ASSERT r.importadas + r.descartadasPorDuplicidade + r.descartadasPorLimite = tamanho(paleta)
  ASSERT tamanho(r.caixa) = tamanho(caixa) + r.importadas
END FOR
```

**P5 — Round-trip de inclusão e remoção (Req 3.3, 10.4).** Acrescentar ao fim e remover o último devolve a caixa original.

```pascal
FOR ALL caixa, hex WHERE tamanho(caixa) < 16 AND hex NOT IN cores(caixa) DO
  r ← adicionar(caixa, hex)
  ASSERT remover(r.caixa, ultimoId(r.caixa)) = caixa
END FOR
```

**P6 — Reordenação preserva o conteúdo (Req 10.6, 10.9).** Mover um tubo é permutação, não edição.

```pascal
FOR ALL caixa, i, sentido DO
  r ← mover(caixa, i, sentido)
  ASSERT conjuntoDeIds(r) = conjuntoDeIds(caixa)
  ASSERT multiconjuntoDeCores(r) = multiconjuntoDeCores(caixa)
  ASSERT tamanho(r) = tamanho(caixa)
END FOR
```

**P7 — Geometria da Grade_De_Disposição (Req 6.8).** Nenhuma poça vaza do canvas e nenhuma encosta na outra.

```pascal
FOR ALL n : 1..16 DO
  g ← grade(n, W = 340, H = 190)
  ASSERT tamanho(g.centros) = n
  FOR ALL c IN g.centros DO
    ASSERT c.x - g.raio >= 0 AND c.x + g.raio <= 340
    ASSERT c.y - g.raio >= 0 AND c.y + g.raio <= 190
  END FOR
  FOR ALL a, b IN g.centros WHERE a <> b DO
    ASSERT distancia(a, b) >= 2 * g.raio + 4
  END FOR
END FOR
```

**P8 — Determinismo da Grade_De_Disposição (Req 6.7).** A mesma quantidade de tubos produz a mesma grade, para que a Disposição seja reproduzível.

```pascal
FOR ALL n : 1..16 DO
  ASSERT grade(n, W, H) = grade(n, W, H)
END FOR
```

**P9 — Continuidade do Filete (Req 6.3).** Um arraste não deixa a tinta pontilhada: entre dois centros consecutivos do Filete a distância nunca passa de metade do raio.

```pascal
FOR ALL caminho : ListaDePontos, tamanhoEsguicho : 6..70 DO
  centros ← centrosDoFilete(caminho, tamanhoEsguicho)
  raio ← tamanhoEsguicho / 2
  FOR ALL k : 1..tamanho(centros)-1 DO
    ASSERT distancia(centros[k-1], centros[k]) <= raio / 2
  END FOR
END FOR
```

**P10 — Modelo do desfazer (Req 8.1, 8.2, 8.3).** Testado contra um modelo de pilha, com `ImageData` substituído por um contador de estados.

```pascal
FOR ALL acoes : SequenciaDeEsguichosEDisposicoes DO
  estado ← aplicar(acoes, estadoInicial)
  aplicar desfazer tamanho(acoes) vezes
  ASSERT estado = estadoInicial
  ASSERT profundidadeDaPilha <= 30
END FOR
```

**P11 — Registro_De_Depósitos limitado e consultável (Req 7.3, 7.6).**

```pascal
FOR ALL depositos : ListaDeDepositos, ponto DO
  reg ← registrar(depositos)
  ASSERT tamanho(reg) <= 400
  achado ← consultar(reg, ponto)
  IF achado <> nenhum THEN
    ASSERT distancia(ponto, achado.centro) <= achado.raio
    ASSERT achado é o mais recente entre os depósitos que contêm ponto
  END IF
END FOR
```

**P12 — Condições de erro (Req 1.6, 1.7, 9.5, 9.6, 9.7, 10.7).** Entradas inválidas são rejeitadas sem alterar estado.

```pascal
FOR ALL entrada : EntradaInvalida DO
  antes ← caixa
  r ← operar(caixa, entrada)
  ASSERT r.rejeitada = true
  ASSERT caixa = antes
END FOR
```

### Critérios verificados por exemplo, não por propriedade

Estes não ganham nada com 100 iterações e ficam como teste de exemplo ou verificação manual:

- Renderização visual dos chips, da Poça e do Filete no canvas (Req 5.1, 5.2, 6.4) — inspeção visual e um teste de exemplo lendo o pixel central da Poça
- Persistência efetiva em Platform_Storage nos três ambientes (Req 9.1, 9.2) — teste de integração com o stub de storage, no padrão de `tests/platform-*.test.js`
- Zoom, pan, alça de redimensionamento e atalhos de teclado (Req 11.2, 11.4, 11.5, 11.10) — teste de exemplo com eventos sintéticos
- Valores hexadecimais dos Conjuntos_Predefinidos (Req 4.1, 4.2) — comparação direta com a tabela do documento

## Fora de Escopo

- Volume finito de tinta por Poça, com consumo pela espátula (questão Q4b)
- Caixas_De_Tubos nomeadas e alternáveis, além dos Conjuntos_Predefinidos (questão Q5)
- Mistura subtrativa ou modelo de pigmento com absorção, em lugar da interpolação RGB de `Color.mixRgb`
- Alterações em `palettes.js` além da leitura de `getActiveColors`
- Exportação e importação da Caixa_De_Tubos em texto para o usuário, além da serialização interna de persistência
