# Requirements Document

## Introduction

Este documento descreve os requisitos para tornar o painel da demo do Color Wheel visualmente idêntico a um layout de referência, e para oferecer um modo de organização no qual o usuário arrasta os controles ao redor da roda e o arranjo resultante é persistido.

O trabalho tem dois objetivos de igual importância. O primeiro é a paridade visual: geometria, coordenadas, dimensões e cores do painel devem reproduzir o Layout_De_Referência dentro de uma tolerância declarada e verificável. O segundo é a editabilidade: o usuário entra no Modo_De_Organização, reposiciona os controles móveis por arraste, e o Layout_Store guarda o arranjo em armazenamento local, restaurável na próxima abertura, com ação de restauração do padrão e com exportação e importação em texto JSON.

O Layout_De_Referência é mantido como um arquivo do Figma, o Figma_Reference_Frame, de chave de arquivo `7NNEGJVNPnbjoNgLeQHheo`, nó de frame `1:2`, de nome "Panel". Cada Movable_Control corresponde a uma camada desse frame cujo nome é o identificador do controle, e o Default_Profile é derivado das posições das camadas desse frame. O Figma_Reference_Frame substitui a captura de tela usada nas medições anteriores e é a fonte autoritativa de toda medida citada neste documento.

A estrutura de DOM da demo já corresponde ao layout de referência: existem `.panel-header`, `.swatch-stack`, `.wheel-stage` com `#wheel`, `#iconArc`, `#wheelSatellites`, `#leftRail`, `#historyRail`, `#hexRow`, `.tabs`, `.slider-list`, `.mode-row` e `.status-bar`. O escopo deste documento é paridade de métricas, tokens e ancoragem, além do editor de layout, e não a reestruturação do DOM.

O espaço de coordenadas de referência tem 628 unidades de largura por 907 de altura, com origem no canto superior esquerdo do painel, eixo X crescente para a direita e eixo Y crescente para baixo. Toda medida citada neste documento está nesse espaço.

## Glossary

- **Panel**: O painel único da demo do Color Wheel, composto por cabeçalho, stage da roda, faixa de abas com conteúdo e barra de status
- **Figma_Reference_Frame**: O frame do Figma que mantém o Layout_De_Referência, identificado pela chave de arquivo `7NNEGJVNPnbjoNgLeQHheo` e pelo nó `1:2`, de nome "Panel", no qual cada Movable_Control é uma camada cujo nome é o identificador do controle
- **Layout_De_Referência**: O conjunto completo de valores de geometria e de cor lidos do Figma_Reference_Frame e listados nos Requisitos 1 a 6 deste documento
- **Reference_Space**: O espaço de coordenadas do Layout_De_Referência, com 628 unidades de largura e 907 unidades de altura, origem no canto superior esquerdo do Panel
- **Tolerância_De_Paridade**: O desvio máximo aceito entre a renderização do Panel e o Layout_De_Referência, igual a ±1 unidade do Reference_Space para medidas iguais ou inferiores a 100 unidades, ±2 unidades para medidas superiores a 100 unidades, e ±0,5° para medidas angulares
- **Wheel_Center**: O ponto do Reference_Space na coordenada (325, 352), a partir do qual a roda de cores e os Movable_Controls do stage são posicionados
- **Wheel_Stage**: A região do Panel entre as coordenadas Y 57 e 608, que contém a roda de cores e os Movable_Controls posicionados ao redor da roda
- **Movable_Control**: Um controle que o usuário pode reposicionar no Modo_De_Organização, a saber: cada botão do arco de harmonias, cada botão do trilho esquerdo, cada dial do trilho esquerdo, cada botão do trilho de histórico, cada satélite do lado direito, o campo hex e o grupo de swatches de foreground e background
- **Fixed_Control**: Um controle cuja posição não é editável, a saber: o cabeçalho, a roda de cores, a faixa de abas, o conteúdo das abas, a linha de modos e a barra de status
- **Anchor**: A descrição da posição de um Movable_Control, formada por um ângulo em graus e um raio em unidades do Reference_Space, ambos medidos a partir do Wheel_Center, com 0° no topo do Panel e valores crescentes em sentido horário
- **Anchor_Model**: O subsistema que converte entre Anchor e coordenada de tela, nos dois sentidos, aplicando o fator de escala corrente
- **Scale_Controller**: O subsistema que calcula o Scale_Factor a partir da largura renderizada do Panel e aplica o Scale_Factor a todas as medidas do Layout_De_Referência
- **Scale_Factor**: O número pelo qual toda medida do Reference_Space é multiplicada para produzir a medida renderizada, igual à largura efetiva do Panel dividida por 628
- **Layout_Editor**: O subsistema que implementa o Modo_De_Organização, incluindo arraste, alças, guias e encaixe
- **Modo_De_Organização**: O estado do Panel no qual todo Movable_Control aceita arraste e exibe alça de arraste, e no qual os controles não executam a própria ação ao receber clique
- **Snap_Engine**: O subsistema que ajusta a Anchor produzida por um arraste para o valor de encaixe mais próximo
- **Layout_Profile**: Um arranjo nomeado que associa cada Movable_Control a uma Anchor
- **Default_Profile**: O Layout_Profile de nome "Padrão", cujas Anchors correspondem ao Layout_De_Referência derivado do Figma_Reference_Frame e cujo conteúdo não é alterável pelo usuário
- **Layout_Store**: O subsistema que persiste os Layout_Profiles e o nome do Layout_Profile ativo em armazenamento local do navegador
- **Layout_Serializer**: O subsistema que converte um Layout_Profile em texto JSON e que converte texto JSON em um Layout_Profile
- **Theme_Tokens**: O conjunto nomeado de cores do Layout_De_Referência listado no Requisito 6

## Requirements

### Requisito 1: Moldura e Bandas do Panel

**User Story:** Como usuário do painel, eu quero que a moldura e as faixas horizontais do painel tenham as mesmas proporções da referência, para que o painel pareça o mesmo produto do Figma_Reference_Frame.

#### Critérios de Aceitação

1. THE Panel SHALL renderizar com 628 unidades de largura e 907 unidades de altura no Reference_Space, dentro da Tolerância_De_Paridade
2. THE Panel SHALL renderizar o fundo na cor do token `panel-bg` e os cantos sem arredondamento, com raio de canto igual a 0
3. THE Panel SHALL renderizar quatro bandas horizontais nos seguintes intervalos do eixo Y: cabeçalho de 0 a 56, Wheel_Stage de 57 a 608, abas com conteúdo de 609 a 859 e barra de status de 860 a 907, cada limite dentro da Tolerância_De_Paridade
4. THE Panel SHALL renderizar divisores de 1 unidade de espessura na cor do token `divider` nas coordenadas Y 56, 608 e 859, cada divisor ocupando as 628 unidades de largura do Panel
5. THE Panel SHALL renderizar o título "Color Wheel" na cor do token `text-primary`, com 13 unidades de altura de fonte, começando na coordenada X 16, com o topo do texto na coordenada Y 26 e 16 unidades de altura de linha
6. THE Panel SHALL renderizar o botão de menu do cabeçalho centrado na coordenada (597, 33), com área de acionamento de 28 por 28 unidades

### Requisito 2: Geometria da Roda de Cores e do Seletor Interno

**User Story:** Como artista digital, eu quero que a roda, o anel de matiz e o seletor interno tenham exatamente as proporções da referência, para que a área de escolha de cor ocupe o mesmo espaço visual.

#### Critérios de Aceitação

1. THE Panel SHALL renderizar a roda de cores centrada no Wheel_Center, com raio externo de 213 unidades e raio interno de 178 unidades, resultando em espessura de anel de 35 unidades e razão entre raio interno e raio externo de 0,835
2. THE Panel SHALL renderizar o marcador de matiz principal como um círculo de 19 unidades de raio com borda branca de 3 unidades de espessura
3. THE Panel SHALL renderizar cada marcador secundário de harmonia como um círculo de 16 unidades de raio com borda branca de 2 unidades de espessura
4. THE Panel SHALL renderizar, para cada marcador do anel, uma linha de chamada de 2 unidades de espessura na cor do token `leader-line` que conecta o marcador a uma alça circular de 5 unidades de raio situada no interior do seletor
5. THE Panel SHALL renderizar o seletor triangular inscrito no raio interno, com aresta esquerda vertical entre as coordenadas (174, 162) e (174, 548) e vértice direito na coordenada (480, 348), ocupando uma caixa envolvente de 306 por 386 unidades com origem na coordenada (174, 162), cada coordenada dentro da Tolerância_De_Paridade
6. THE Panel SHALL renderizar o marcador de saturação e valor como um círculo de 13 unidades de raio com borda branca de 2,5 unidades de espessura

### Requisito 3: Modelo de Ancoragem dos Controles Móveis

**User Story:** Como usuário do painel, eu quero que os botões ao redor da roda fiquem sempre na mesma posição relativa à roda, para que o arranjo continue correto quando o painel é redimensionado.

#### Critérios de Aceitação

1. THE Anchor_Model SHALL representar a posição de cada Movable_Control por uma Anchor formada por ângulo em graus, no intervalo de 0 inclusive a 360 exclusive, e raio em unidades do Reference_Space, no intervalo de 0 a 700
2. THE Anchor_Model SHALL converter uma Anchor em coordenada de tela multiplicando o raio pelo Scale_Factor e somando o resultado à posição renderizada do Wheel_Center
3. THE Anchor_Model SHALL converter uma coordenada de tela em Anchor de modo que a conversão da Anchor resultante de volta para coordenada de tela reproduza a coordenada original dentro de 0,01 unidade do Reference_Space
4. WHEN a largura renderizada do Panel mudar, THE Anchor_Model SHALL reposicionar cada Movable_Control mantendo o ângulo da Anchor inalterado e o raio renderizado proporcional ao Scale_Factor
5. THE Anchor_Model SHALL posicionar cada Movable_Control pelo centro geométrico do controle, e não por uma das bordas do controle
6. WHERE um Movable_Control estiver oculto, THE Anchor_Model SHALL preservar a Anchor do controle oculto sem reatribuir a Anchor aos controles visíveis

### Requisito 4: Posições de Referência dos Controles ao Redor da Roda

**User Story:** Como usuário do painel, eu quero que cada botão satélite apareça na mesma posição do Figma_Reference_Frame, para que o painel seja reconhecível botão por botão.

#### Critérios de Aceitação

1. THE Panel SHALL renderizar todo botão circular satélite com 44 unidades de diâmetro
2. THE Panel SHALL renderizar os seis botões do arco de harmonias centrados nas coordenadas (377, 93) com Anchor de 11,36° e raio 264,2, (438, 112) com Anchor de 25,20° e raio 265,3, (485, 153) com Anchor de 38,79° e raio 255,3, (536, 194) com Anchor de 53,16° e raio 263,6, (571, 244) com Anchor de 66,29° e raio 268,7 e (592, 303) com Anchor de 79,60° e raio 271,5, cada coordenada dentro da Tolerância_De_Paridade
3. WHEN um botão do arco de harmonias estiver selecionado, THE Panel SHALL renderizar um anel de 2 unidades de espessura na cor do token `accent` ao redor do botão selecionado
4. THE Panel SHALL renderizar os controles do trilho esquerdo em coluna reta na coordenada X 49, com o botão de conferência de valores centrado na coordenada (49, 259) com Anchor de 288,63° e raio 291,2, o botão de travamento de luminosidade centrado na coordenada (49, 333) com Anchor de 273,94° e raio 276,7, o dial de brilho centrado na coordenada (49, 408) com Anchor de 258,53° e raio 281,6 e o dial de temperatura centrado na coordenada (49, 471) com Anchor de 246,68° e raio 300,6
5. THE Panel SHALL renderizar o rótulo de cada dial do trilho esquerdo centrado horizontalmente com o dial correspondente e com o topo do rótulo deslocado 22 unidades abaixo do centro do dial, na cor do token `text-dim`
6. THE Panel SHALL renderizar o botão de desfazer do histórico centrado na coordenada (49, 552) com Anchor de 234,06° e raio 340,8, na mesma coluna X 49 dos controles do trilho esquerdo, e o botão de refazer do histórico centrado na coordenada (107, 552) com Anchor de 227,49° e raio 295,8
7. THE Panel SHALL renderizar o botão de máscara de gamut centrado na coordenada (586, 429) com Anchor de 106,43° e raio 272,1 e o botão de forma do seletor centrado na coordenada (557, 492) com Anchor de 121,11° e raio 271,0
8. THE Panel SHALL renderizar o grupo de swatches com o círculo de foreground de 92 unidades de diâmetro centrado na coordenada (73, 124) com Anchor de 312,13° e raio 339,8, o círculo de background de 72 unidades de diâmetro centrado na coordenada (146, 132) com Anchor de 320,87° e raio 283,6 e desenhado atrás do círculo de foreground, e o botão de troca de 26 unidades de diâmetro centrado na coordenada (170, 84) com Anchor de 329,97° e raio 309,6

### Requisito 5: Campo Hex, Abas, Sliders, Linha de Modos e Barra de Status

**User Story:** Como usuário do painel, eu quero que os campos, abas e sliders tenham as mesmas dimensões da referência, para que a metade inferior do painel também corresponda ao Figma_Reference_Frame.

#### Critérios de Aceitação

1. THE Panel SHALL renderizar o glifo "#" do campo hex na coordenada X 495 com o topo do texto na coordenada Y 561 e 14 unidades de altura de fonte, e o campo de entrada entre as coordenadas X 511 e 611, com 100 unidades de largura, entre as coordenadas Y 551 e 587, com 36 unidades de altura, centro na coordenada (561, 569) correspondente à Anchor de 132,60° e raio 320,6, fundo na cor do token `input-bg`, borda na cor do token `input-border` e texto de 14 unidades alinhado à direita
2. THE Panel SHALL renderizar a faixa de abas entre as coordenadas Y 619 e 657, com botões de 38 unidades de altura, intervalos horizontais de 14 a 104 para "Sliders", 111 a 201 para "Mixers", 208 a 297 para "Paletas" e 304 a 386 para "Godê", e o ícone de separar aba centrado na coordenada (600, 638)
3. WHEN uma aba estiver ativa, THE Panel SHALL renderizar a aba ativa com borda de 1 unidade na cor do token `tab-active-border`, fundo na cor do token `tab-active-bg` e raio de canto de 3 unidades
4. THE Panel SHALL renderizar as linhas de slider com passo vertical de 44 unidades, centradas nas coordenadas Y 691,5, 735,5 e 779,5, cada linha com rótulo de canal na coordenada X 16 em 12 unidades de altura de fonte, barra de gradiente entre as coordenadas X 41 e 516 com 475 unidades de largura, 23 unidades de altura e raio de canto de 2 unidades, e campo numérico entre as coordenadas X 527 e 597 com 70 unidades de largura, 26 unidades de altura e raio de canto de 3 unidades
5. THE Panel SHALL renderizar o cursor de cada slider como uma barra vertical branca de 4 unidades de largura, com contorno escuro, ocupando a altura total da barra de gradiente
6. THE Panel SHALL renderizar a linha de modos centrada na coordenada Y 831,5, com os botões de modo entre as coordenadas Y 816 e 847 e 31 unidades de altura, o rótulo "MODE:" na coordenada X 18 em 10 unidades de altura de fonte na cor do token `text-dim`, os botões de modo nos intervalos horizontais de 80 a 119 para "RGB", 133 a 186 para "HSV", 201 a 232 para "LAB", 255 a 305 para "CMYK" e 325 a 361 para "B/W", e dois botões de alternância de 33 unidades de altura entre as coordenadas Y 815 e 848, com raio de canto de 4 unidades, nos intervalos horizontais de 497 a 540 e 550 a 593
7. THE Panel SHALL renderizar o texto da barra de status na coordenada X 14, com o topo do texto na coordenada Y 872, 10 unidades de altura de fonte e cor do token `text-dim`

### Requisito 6: Tokens de Cor

**User Story:** Como usuário do painel, eu quero que as cores do painel sejam as mesmas da referência, para que o painel se integre ao tema escuro do Photoshop do mesmo modo.

#### Critérios de Aceitação

1. THE Theme_Tokens SHALL definir os seguintes valores: `panel-bg` igual a #2b2b2b, `surface-raised` igual a #323232, `divider` igual a #3c3c3c, `button-face` igual a #4a4a4a, `button-face-end` igual a #3e3e3e, `icon-stroke` igual a #d0d0d0, `text-primary` igual a #e8e8e8, `text-dim` igual a #8a8a8a, `accent` igual a #2d8cf0, `input-bg` igual a #1e1e1e, `input-border` igual a #3a5a8a, `leader-line` igual a #8a8a8a, `tab-active-bg` igual a #3a3a3a, `tab-active-border` igual a #6a6a6a, `warn` igual a #e8a33d e `focus` igual a #5aa9f0
2. THE Panel SHALL obter toda cor de superfície, texto, borda e ícone a partir dos Theme_Tokens
3. THE Panel SHALL renderizar cada botão circular satélite com um gradiente que vai da cor do token `button-face` à cor do token `button-face-end`
4. THE Panel SHALL renderizar o traço de todo ícone de botão na cor do token `icon-stroke`
5. THE Panel SHALL renderizar o título do cabeçalho na cor #c8c8c8

### Requisito 7: Escala Proporcional do Panel

**User Story:** Como usuário do painel do Photoshop, eu quero que o painel acompanhe a largura disponível mantendo as proporções, para que o layout continue idêntico à referência em qualquer largura de encaixe.

#### Critérios de Aceitação

1. THE Scale_Controller SHALL calcular o Scale_Factor como a largura efetiva do Panel dividida por 628
2. THE Scale_Controller SHALL restringir a largura efetiva do Panel ao intervalo de 320 a 1200 unidades, usando 320 quando a largura disponível for inferior a 320 e 1200 quando a largura disponível for superior a 1200
3. WHEN a largura disponível para o Panel mudar, THE Scale_Controller SHALL recalcular o Scale_Factor e reaplicar todas as medidas do Layout_De_Referência dentro de 100 milissegundos
4. WHILE o Scale_Factor for diferente de 1, THE Scale_Controller SHALL preservar a razão entre qualquer par de medidas do Layout_De_Referência dentro de 0,5 por cento da razão original
5. THE Scale_Controller SHALL manter a razão entre altura e largura do Panel igual a 907 dividido por 628 para qualquer Scale_Factor
6. THE Scale_Controller SHALL posicionar todo Movable_Control e todo Fixed_Control inteiramente dentro dos limites renderizados do Panel para qualquer Scale_Factor no intervalo permitido

### Requisito 8: Modo de Organização por Arraste

**User Story:** Como usuário do painel, eu quero arrastar os botões ao redor da roda para onde eu preferir, para que o painel siga o meu jeito de trabalhar.

#### Critérios de Aceitação

1. THE Panel SHALL oferecer um controle de alternância que entra e sai do Modo_De_Organização
2. WHILE o Panel estiver no Modo_De_Organização, THE Layout_Editor SHALL exibir um contorno de 1 unidade na cor do token `accent` ao redor de cada Movable_Control e exibir um indicador textual do Modo_De_Organização na barra de status
3. WHILE o Panel estiver no Modo_De_Organização, THE Layout_Editor SHALL tratar todo clique e arraste sobre um Movable_Control como reposicionamento, sem executar a ação própria do controle
4. WHEN o usuário arrastar um Movable_Control no Modo_De_Organização, THE Layout_Editor SHALL atualizar a posição renderizada do controle arrastado a cada quadro, mantendo constante o deslocamento entre o cursor e o centro do controle
5. WHEN o usuário soltar um Movable_Control arrastado, THE Layout_Editor SHALL converter a posição final em Anchor pelo Anchor_Model e gravar a Anchor resultante no Layout_Profile ativo
6. IF a posição final de um arraste colocar qualquer parte do Movable_Control fora dos limites renderizados do Panel, THEN THE Layout_Editor SHALL restringir a posição final ao ponto mais próximo no qual o controle fique inteiramente dentro dos limites do Panel
7. WHEN o usuário sair do Modo_De_Organização, THE Layout_Editor SHALL remover os contornos de edição e restabelecer a ação própria de cada Movable_Control
8. WHERE dois Movable_Controls se sobrepuserem no Layout_Profile ativo, THE Layout_Editor SHALL exibir um contorno na cor do token `warn` em cada controle sobreposto e manter as duas posições gravadas

### Requisito 9: Encaixe e Guias de Alinhamento

**User Story:** Como usuário organizando o painel, eu quero que os botões encaixem em posições regulares, para que o arranjo saia alinhado sem ajuste manual fino.

#### Critérios de Aceitação

1. WHEN o usuário arrastar um Movable_Control, THE Snap_Engine SHALL arredondar o ângulo da Anchor para o múltiplo de 5° mais próximo quando a diferença entre o ângulo arrastado e esse múltiplo for igual ou inferior a 2,5°
2. WHEN o usuário arrastar um Movable_Control, THE Snap_Engine SHALL arredondar o raio da Anchor para o raio de outro Movable_Control visível quando a diferença entre os dois raios for igual ou inferior a 6 unidades do Reference_Space
3. WHEN o Snap_Engine aplicar um encaixe de raio, THE Layout_Editor SHALL exibir um arco guia de 1 unidade de espessura na cor do token `accent` no raio de encaixe
4. WHEN o Snap_Engine aplicar um encaixe de ângulo, THE Layout_Editor SHALL exibir uma linha guia radial de 1 unidade de espessura na cor do token `accent` no ângulo de encaixe
5. THE Snap_Engine SHALL produzir o mesmo resultado ao receber uma Anchor já encaixada, de modo que aplicar o encaixe duas vezes seja igual a aplicar o encaixe uma vez
6. WHILE o usuário mantiver a tecla Alt pressionada durante um arraste, THE Snap_Engine SHALL retornar a Anchor arrastada sem aplicar encaixe

### Requisito 10: Persistência e Perfis de Layout

**User Story:** Como usuário do painel, eu quero que a organização que eu criei seja salva e reaberta comigo, para que eu não precise refazer o arranjo a cada sessão.

#### Critérios de Aceitação

1. THE Layout_Store SHALL manter o Default_Profile com as Anchors correspondentes às coordenadas de referência do Requisito 4
2. WHEN o Layout_Profile ativo receber uma Anchor nova, THE Layout_Store SHALL gravar o Layout_Profile ativo em armazenamento local dentro de 500 milissegundos
3. WHEN o Panel for aberto, THE Layout_Store SHALL carregar o Layout_Profile ativo gravado e aplicar as Anchors do Layout_Profile carregado
4. IF o armazenamento local não contiver nenhum Layout_Profile gravado, THEN THE Layout_Store SHALL aplicar o Default_Profile
5. IF o Layout_Profile gravado estiver ausente de uma Anchor para algum Movable_Control, THEN THE Layout_Store SHALL usar a Anchor do Default_Profile para o Movable_Control ausente
6. THE Layout_Store SHALL oferecer as operações de criar, renomear, ativar e excluir Layout_Profiles, aceitando nomes de 1 a 40 caracteres
7. IF o usuário solicitar renomear ou excluir o Default_Profile, THEN THE Layout_Store SHALL manter o Default_Profile inalterado e exibir a mensagem de que o perfil padrão é fixo
8. IF o usuário criar um Layout_Profile com nome igual ao de um Layout_Profile existente, THEN THE Layout_Store SHALL acrescentar ao nome solicitado um sufixo numérico que torne o nome único
9. WHEN o usuário acionar a restauração do padrão, THE Layout_Store SHALL substituir todas as Anchors do Layout_Profile ativo pelas Anchors do Default_Profile
10. WHEN o usuário excluir o Layout_Profile ativo, THE Layout_Store SHALL ativar o Default_Profile

### Requisito 11: Exportação e Importação do Layout

**User Story:** Como usuário do painel, eu quero exportar e importar a minha organização em texto, para que eu possa levar o arranjo para outra máquina e guardar uma cópia.

#### Critérios de Aceitação

1. WHEN o usuário solicitar a exportação, THE Layout_Serializer SHALL produzir um texto JSON contendo a versão do formato, o nome do Layout_Profile e, para cada Movable_Control, o identificador do controle com o ângulo e o raio da Anchor
2. THE Layout_Serializer SHALL gravar cada ângulo e cada raio com no máximo 3 casas decimais
3. WHEN o usuário importar um texto JSON válido, THE Layout_Serializer SHALL produzir um Layout_Profile e THE Layout_Store SHALL ativar o Layout_Profile importado
4. FOR ALL Layout_Profiles válidos, exportar e em seguida importar SHALL produzir um Layout_Profile cujas Anchors sejam iguais às Anchors do Layout_Profile original dentro de 0,001 unidade, e cujo conjunto de identificadores de controle seja igual ao conjunto original
5. IF o texto importado não for JSON sintaticamente válido, THEN THE Layout_Serializer SHALL rejeitar a importação, preservar o Layout_Profile ativo e exibir a mensagem de texto inválido
6. IF o texto importado contiver uma versão de formato desconhecida, THEN THE Layout_Serializer SHALL rejeitar a importação, preservar o Layout_Profile ativo e exibir a mensagem de versão não suportada
7. IF o texto importado contiver um ângulo fora do intervalo de 0 a 360 ou um raio fora do intervalo de 0 a 700, THEN THE Layout_Serializer SHALL rejeitar a importação, preservar o Layout_Profile ativo e exibir a mensagem de valor fora do intervalo
8. IF o texto importado contiver um identificador de controle desconhecido, THEN THE Layout_Serializer SHALL descartar a entrada desconhecida, importar as entradas restantes e exibir a quantidade de entradas descartadas

### Requisito 12: Teclado e Acessibilidade do Editor

**User Story:** Como usuário que trabalha pelo teclado, eu quero posicionar os botões sem o mouse, para que a organização do painel também seja acessível.

#### Critérios de Aceitação

1. WHILE o Panel estiver no Modo_De_Organização, THE Layout_Editor SHALL permitir selecionar um Movable_Control pela tecla Tab, seguindo a ordem de leitura do documento
2. WHEN o usuário pressionar uma tecla de direção com um Movable_Control selecionado no Modo_De_Organização, THE Layout_Editor SHALL deslocar o controle selecionado em 1 unidade do Reference_Space no sentido da tecla pressionada
3. WHEN o usuário pressionar Shift junto com uma tecla de direção com um Movable_Control selecionado no Modo_De_Organização, THE Layout_Editor SHALL deslocar o controle selecionado em 10 unidades do Reference_Space no sentido da tecla pressionada
4. THE Layout_Editor SHALL exibir um indicador de foco de 2 unidades de espessura na cor do token `focus` no Movable_Control selecionado
5. THE Panel SHALL fornecer um nome acessível a todo Movable_Control, ao controle de alternância do Modo_De_Organização e a cada operação de Layout_Profile
6. WHEN o Modo_De_Organização for ativado ou desativado, THE Panel SHALL anunciar o estado corrente do Modo_De_Organização por uma região viva do documento
7. WHEN uma Anchor for alterada por teclado, THE Panel SHALL anunciar o ângulo e o raio resultantes por uma região viva do documento
