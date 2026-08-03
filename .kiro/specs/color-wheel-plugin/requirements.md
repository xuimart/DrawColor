# Requirements Document

## Introduction

Este documento descreve os requisitos para um plugin UXP para Adobe Photoshop que replica a funcionalidade do plugin Coolorus. O plugin fornece uma roda de cores HSV interativa com seleção via triângulo interno, esquemas de harmonia de cores, sliders multi-modo, mixers, controles de brilho/temperatura, indicador de gamut, histórico de undo/redo e integração bidirecional com as cores de foreground/background do Photoshop. O plugin também oferece um limitador de cor que quantiza o anel de matiz em segmentos discretos rotacionáveis, uma escala discreta de tons de cinza configurável no modo B/W, gerenciamento de paletas salvas com persistência, exportação e importação, e um godê de mistura no qual o artista deposita e mistura pigmentos digitais para amostrar o resultado. O objetivo é oferecer uma ferramenta profissional de seleção e manipulação de cores dentro do ambiente do Photoshop.

## Glossary

- **Plugin**: O plugin UXP Color Wheel para Adobe Photoshop descrito neste documento
- **Color_Wheel**: O componente visual circular externo que exibe o espectro completo de matiz (hue) de 0° a 360°
- **Triangle_Selector**: O seletor triangular interno à roda de cores usado para escolher saturação e valor (brightness)
- **Harmony_Engine**: O subsistema responsável por calcular e posicionar marcadores de harmonia de cores na roda
- **Slider_Panel**: O painel inferior contendo sliders para manipulação numérica de cores em múltiplos modos
- **Mixer_Panel**: O painel de mistura de cores acessível via aba dedicada
- **Color_Preview**: O componente visual que exibe a cor atualmente selecionada como foreground
- **Hex_Display**: O campo que exibe e permite edição do valor hexadecimal da cor selecionada
- **BT_Controls**: Os controles dial de brilho (Brightness) e temperatura (Temperature) no topo do painel
- **Gamut_Indicator**: O indicador visual que sinaliza quando uma cor está fora do gamut de um espaço de cor específico
- **History_Manager**: O subsistema que gerencia undo/redo de seleções de cores
- **PS_Bridge**: A camada de integração bidirecional entre o plugin e as cores de foreground/background do Photoshop
- **Harmony_Scheme**: Um conjunto de relações cromáticas predefinidas (complementar, triádica, análoga, split-complementar, tetrádica)
- **Color_Limiter**: O subsistema que divide o anel de matiz da Color_Wheel em um número finito de segmentos discretos e restringe a seleção de matiz aos matizes representativos desses segmentos
- **Hue_Segment**: Um dos setores angulares de amplitude igual em que o anel de matiz é dividido quando o Color_Limiter está habilitado; seu matiz representativo é o matiz do centro angular do setor
- **Rotation_Offset**: O deslocamento angular, de 0° a 359°, aplicado ao conjunto completo de Hue_Segments do Color_Limiter
- **BW_Ramp**: A escala discreta de tons de cinza neutros exibida pelo Slider_Panel no modo B/W, composta por um número configurável de degraus
- **Palette_Manager**: O subsistema responsável por criar, listar, carregar, renomear, excluir, exportar e importar paletas de cores salvas
- **Saved_Palette**: Uma coleção nomeada e ordenada de Swatches persistida em armazenamento local
- **Swatch**: Uma amostra de cor individual armazenada em uma Saved_Palette, representada por um valor hexadecimal no formato #RRGGBB
- **Mixing_Canvas**: A superfície de pintura dedicada (godê digital) na qual o usuário deposita e mistura cores para posterior amostragem
- **Blend_Strength**: O parâmetro percentual que define o peso da cor selecionada em relação ao pigmento já existente durante a mistura no Mixing_Canvas
- **Eyedropper**: O modo de operação do Mixing_Canvas no qual um clique amostra a cor do pixel sob o cursor e a define como cor de foreground
- **HSV**: Modelo de cor Hue-Saturation-Value
- **RGB**: Modelo de cor Red-Green-Blue
- **LAB**: Modelo de cor CIE L*a*b*
- **CMYK**: Modelo de cor Cyan-Magenta-Yellow-Key(Black)

## Requirements

### Requisito 1: Renderização da Roda de Cores HSV

**User Story:** Como um artista digital, eu quero visualizar uma roda de cores HSV com o espectro completo de matiz no anel externo, para que eu possa selecionar matizes de forma intuitiva e visual.

#### Critérios de Aceitação

1. THE Color_Wheel SHALL renderizar um anel circular usando canvas HTML5, exibindo o espectro de matiz de 0° a 360° em incrementos de no máximo 1°, com uma proporção entre raio interno e raio externo de no mínimo 0.6 e no máximo 0.85
2. WHEN o usuário clicar ou arrastar sobre o anel externo da Color_Wheel, THE Plugin SHALL atualizar o matiz selecionado para o ângulo correspondente à posição do cursor com precisão de ±1°
3. THE Color_Wheel SHALL exibir um indicador de seleção na posição do matiz atualmente selecionado, com contraste mínimo de 3:1 em relação às cores adjacentes do espectro e tamanho proporcional à largura do anel
4. WHEN o painel do plugin for redimensionado, THE Color_Wheel SHALL ajustar seu tamanho mantendo a forma circular e respeitando um tamanho mínimo de 120px de diâmetro e máximo limitado pela menor dimensão disponível do contêiner
5. THE Color_Wheel SHALL renderizar com anti-aliasing habilitado no contexto canvas para evitar artefatos de serrilhamento visíveis nas bordas do anel
6. IF o usuário clicar em uma área fora dos limites do anel externo (além do raio externo ou dentro do raio interno), THEN THE Plugin SHALL manter o matiz previamente selecionado sem alteração

### Requisito 2: Seletor Triangular de Saturação/Valor

**User Story:** Como um artista digital, eu quero selecionar saturação e valor (brightness) através de um triângulo inscrito na roda de cores, para que eu possa ajustar a intensidade e luminosidade da cor de forma rápida.

#### Critérios de Aceitação

1. THE Triangle_Selector SHALL renderizar um triângulo equilátero inscrito dentro do anel da Color_Wheel
2. THE Triangle_Selector SHALL exibir um gradiente onde o vértice superior representa o matiz puro (saturação 100%, valor 100%), o vértice inferior esquerdo representa preto (valor 0%), e o vértice inferior direito representa branco (saturação 0%, valor 100%)
3. WHEN o matiz selecionado mudar na Color_Wheel, THE Triangle_Selector SHALL atualizar seu gradiente para refletir o novo matiz mantendo os valores atuais de saturação e valor
4. WHEN o usuário clicar ou arrastar dentro do Triangle_Selector, THE Plugin SHALL calcular e atualizar os valores de saturação e valor (brightness) correspondentes à posição do cursor usando coordenadas baricêntricas
5. IF o cursor for arrastado para fora dos limites do Triangle_Selector, THEN THE Plugin SHALL restringir (clamp) a seleção ao ponto mais próximo dentro do triângulo
6. THE Triangle_Selector SHALL exibir um marcador circular na posição correspondente à saturação e valor atualmente selecionados, com borda de contraste para visibilidade contra fundos claros e escuros

### Requisito 3: Esquemas de Harmonia de Cores

**User Story:** Como um artista digital, eu quero visualizar relações de harmonia cromática na roda de cores, para que eu possa escolher paletas equilibradas e profissionais.

#### Critérios de Aceitação

1. THE Harmony_Engine SHALL suportar os seguintes esquemas com os respectivos deslocamentos de matiz a partir do matiz principal: Complementar (1 marcador secundário a 180°), Análogo (2 marcadores secundários a +30° e −30°), Triádico (2 marcadores secundários a +120° e −120°), Split-Complementar (2 marcadores secundários a +150° e −150°) e Tetrádico (3 marcadores secundários a +90°, +180° e +270°)
2. WHEN um Harmony_Scheme estiver ativo, THE Harmony_Engine SHALL posicionar marcadores visuais na Color_Wheel nas posições de matiz calculadas conforme os deslocamentos angulares definidos para o esquema selecionado, exibindo os marcadores secundários visualmente distintos do marcador principal
3. WHEN o usuário arrastar o marcador de matiz principal na Color_Wheel, THE Harmony_Engine SHALL recalcular e reposicionar todos os marcadores secundários dentro de no máximo 50 milissegundos após cada mudança de posição do marcador principal
4. WHEN o usuário clicar em um marcador secundário de harmonia, THE Plugin SHALL definir a cor de foreground do Photoshop para a cor representada por aquele marcador, mantendo os valores de saturação e brilho correspondentes à posição do marcador na Color_Wheel
5. THE Plugin SHALL permitir que o usuário selecione o Harmony_Scheme ativo através de um controle de seleção que liste todos os 5 esquemas disponíveis por nome
6. WHEN nenhum Harmony_Scheme estiver ativo, THE Plugin SHALL exibir apenas o marcador de matiz principal na Color_Wheel, sem nenhum marcador secundário visível
7. IF o usuário selecionar um Harmony_Scheme diferente enquanto um esquema já estiver ativo, THEN THE Harmony_Engine SHALL remover os marcadores do esquema anterior e posicionar os novos marcadores conforme o esquema recém-selecionado dentro de no máximo 200 milissegundos

### Requisito 4: Sliders de Cor Multi-Modo

**User Story:** Como um artista digital, eu quero ajustar cores usando sliders numéricos em diferentes modelos de cor (RGB, HSV, LAB, CMYK, B/W), para que eu possa ter controle preciso sobre os valores cromáticos.

#### Critérios de Aceitação

1. THE Slider_Panel SHALL suportar os seguintes modos de cor: RGB (0-255), HSV (H: 0-360, S: 0-100, V: 0-100), LAB (L: 0-100, a: -128 a 127, b: -128 a 127), CMYK (0-100 por canal) e B/W (0-100)
2. WHEN o usuário selecionar um modo de cor, THE Slider_Panel SHALL exibir os sliders correspondentes àquele modo com os labels e ranges definidos no critério 1, e o modo padrão exibido na inicialização do painel SHALL ser HSV
3. WHEN o usuário ajustar qualquer slider no Slider_Panel, THE Plugin SHALL converter o valor para HSV e atualizar a Color_Wheel, o Triangle_Selector e o Color_Preview dentro de 100ms após a interação
4. WHEN a cor for alterada via Color_Wheel ou Triangle_Selector, THE Slider_Panel SHALL atualizar os valores numéricos dos sliders dentro de 100ms para refletir a nova cor no modo atualmente exibido, exibindo valores inteiros para RGB, HSV, CMYK e B/W e valores com no máximo 1 casa decimal para LAB
5. THE Slider_Panel SHALL exibir campos de entrada numérica editáveis ao lado de cada slider, com largura suficiente para exibir o valor máximo do range do respectivo canal
6. WHEN o usuário confirmar a entrada em um campo numérico (via tecla Enter ou perda de foco do campo), IF o valor inserido estiver fora do range válido, THEN THE Slider_Panel SHALL restringir (clamp) o valor ao limite mais próximo do range válido
7. IF o usuário inserir caracteres não numéricos (exceto sinal negativo para canais LAB a/b e separador decimal para LAB) em um campo numérico, THEN THE Slider_Panel SHALL rejeitar a entrada e manter o último valor válido exibido no campo

### Requisito 5: Painel de Mistura de Cores (Mixer)

**User Story:** Como um artista digital, eu quero misturar cores visualmente, para que eu possa criar variações e transições suaves entre cores.

#### Critérios de Aceitação

1. THE Plugin SHALL fornecer uma aba "Mixers" acessível a partir da interface principal do plugin
2. WHILE a aba Mixers estiver ativa, THE Mixer_Panel SHALL exibir uma interface para mistura entre exatamente 2 cores de origem, com uma faixa de no mínimo 5 e no máximo 20 amostras intermediárias entre elas
3. THE Mixer_Panel SHALL permitir que o usuário defina cada cor de origem clicando em um swatch de origem e selecionando a cor via Color_Wheel ou inserindo um valor hexadecimal, sendo a cor de foreground atual do Photoshop o valor padrão inicial para ambos os swatches
4. WHEN o usuário ajustar a proporção de mistura através de um slider com range de 0% (100% cor de origem A) a 100% (100% cor de origem B) em incrementos de 1%, THE Mixer_Panel SHALL calcular e exibir a cor resultante da interpolação linear em espaço RGB em no máximo 50 milissegundos
5. WHEN o usuário clicar em uma cor resultante (amostra intermediária ou cor do slider de proporção) no Mixer_Panel, THE Plugin SHALL definir a cor de foreground do Photoshop para aquela cor
6. IF o usuário não tiver definido pelo menos 2 cores de origem distintas, THEN THE Mixer_Panel SHALL desabilitar o slider de proporção e exibir uma mensagem indicando que duas cores de origem são necessárias

### Requisito 6: Preview de Cor e Display Hexadecimal

**User Story:** Como um artista digital, eu quero ver uma prévia grande da cor selecionada e seu valor hexadecimal, para que eu possa verificar visualmente e copiar o código da cor.

#### Critérios de Aceitação

1. THE Color_Preview SHALL exibir um swatch retangular de no mínimo 50×50 pixels da cor de foreground atualmente selecionada no canto superior esquerdo do painel
2. WHEN a cor selecionada for alterada por qualquer meio (wheel, sliders, mixer, Photoshop), THE Color_Preview SHALL atualizar a cor exibida em no máximo 100ms após a alteração
3. THE Hex_Display SHALL exibir o valor hexadecimal da cor selecionada no formato #RRGGBB
4. WHEN o usuário editar o valor no Hex_Display e confirmar (Enter ou perda de foco), THE Plugin SHALL aceitar valores de 6 dígitos hexadecimais (0-9, A-F, a-f) com ou sem prefixo #, parsear o valor e atualizar todas as visualizações e o Photoshop com a nova cor
5. IF o usuário inserir um valor no Hex_Display que contenha caracteres fora do conjunto [0-9, A-F, a-f, #] ou que não resulte em exatamente 6 dígitos hexadecimais após remoção do prefixo #, THEN THE Plugin SHALL reverter o campo para o último valor válido e exibir indicação visual de erro por 2 segundos
6. THE Hex_Display SHALL formatar a saída em maiúsculas com prefixo # (exemplo: #6A0700)
7. THE Hex_Display SHALL limitar a entrada do usuário a no máximo 7 caracteres (incluindo o prefixo #)

### Requisito 7: Controles de Brilho e Temperatura

**User Story:** Como um artista digital, eu quero ajustar rapidamente o brilho e a temperatura de cor usando controles dial, para que eu possa fazer ajustes rápidos sem navegar pela roda completa.

#### Critérios de Aceitação

1. THE BT_Controls SHALL exibir controles visuais no formato dial (rotativo) no topo do painel para brilho e temperatura
2. WHEN o usuário rotacionar o dial de brilho, THE Plugin SHALL ajustar o componente Value (V) da cor HSV no intervalo de 0 a 100 mantendo matiz e saturação inalterados
3. WHEN o usuário rotacionar o dial de temperatura, THE Plugin SHALL deslocar o matiz em direção a tons quentes (amarelo/vermelho) ou frios (azul) com deslocamento máximo de 60° em cada direção, mapeando linearmente a posição do dial ao grau de deslocamento
4. THE BT_Controls SHALL exibir indicadores visuais numéricos do valor atual de cada dial (valor de 0-100 para brilho e deslocamento em graus para temperatura)
5. WHEN o dial de brilho ou temperatura for ajustado, THE Plugin SHALL atualizar a Color_Wheel, o Triangle_Selector, os Sliders e o Color_Preview em no máximo 50 milissegundos
6. IF o valor de brilho atingir o limite mínimo (0) ou máximo (100) durante rotação do dial, THEN THE Plugin SHALL restringir (clamp) o valor ao limite e manter o dial na posição correspondente ao limite
7. WHEN o Plugin for inicializado ou uma nova cor for selecionada por outro controle, THE BT_Controls SHALL posicionar o dial de brilho no valor V atual da cor e resetar o dial de temperatura para a posição central (deslocamento 0°)

### Requisito 8: Indicador de Gamut

**User Story:** Como um artista digital, eu quero ser informado quando uma cor selecionada está fora do gamut imprimível, para que eu possa fazer escolhas conscientes sobre cores para impressão.

#### Critérios de Aceitação

1. THE Gamut_Indicator SHALL monitorar a cor selecionada em relação ao espaço de cor CMYK configurado e atualizar seu estado em no máximo 200ms após qualquer alteração de cor
2. WHEN a cor selecionada estiver fora do gamut CMYK, THE Gamut_Indicator SHALL exibir um ícone triangular de aviso com tamanho mínimo de 16x16 pixels, posicionado adjacente ao seletor de cor ativo
3. WHEN o usuário clicar no Gamut_Indicator com aviso ativo, THE Plugin SHALL substituir a cor atual pela cor perceptualmente mais próxima dentro do gamut CMYK (utilizando menor distância Delta E) e exibir a nova cor resultante no seletor de cor
4. WHILE a cor selecionada estiver dentro do gamut, THE Gamut_Indicator SHALL permanecer em estado inativo (não destacado) e sem ícone de aviso
5. IF o perfil CMYK configurado não estiver disponível ou for inválido, THEN THE Gamut_Indicator SHALL exibir uma indicação de erro e desabilitar a funcionalidade de correção de gamut até que um perfil válido seja configurado

### Requisito 9: Histórico de Cores (Undo/Redo)

**User Story:** Como um artista digital, eu quero desfazer e refazer seleções de cores, para que eu possa experimentar cores sem medo de perder uma seleção anterior.

#### Critérios de Aceitação

1. THE History_Manager SHALL manter um histórico das últimas 50 cores selecionadas pelo usuário, descartando a cor mais antiga quando o limite de 50 for atingido e uma nova cor for adicionada
2. WHEN o usuário clicar no botão de undo, THE History_Manager SHALL restaurar a cor anterior no histórico e atualizar todas as visualizações de cor ativas no plugin
3. WHEN o usuário clicar no botão de redo, THE History_Manager SHALL avançar para a próxima cor no histórico e atualizar todas as visualizações de cor ativas no plugin
4. IF o usuário selecionar uma nova cor após ter realizado undo, THEN THE History_Manager SHALL descartar todo o histórico de redo a partir do ponto atual e adicionar a nova cor como entrada mais recente no histórico
5. WHILE o histórico estiver na posição mais antiga ou contiver apenas uma entrada, THE Plugin SHALL desabilitar visualmente o botão de undo
6. WHILE o histórico estiver na posição mais recente, THE Plugin SHALL desabilitar visualmente o botão de redo
7. THE Plugin SHALL exibir ícones de seta (← →) como botões de undo/redo na interface
8. IF o usuário selecionar uma cor idêntica à cor atual (posição mais recente no histórico), THEN THE History_Manager SHALL ignorar a seleção e não adicionar entrada duplicada consecutiva ao histórico

### Requisito 10: Integração Bidirecional com Photoshop

**User Story:** Como um artista digital, eu quero que as cores selecionadas no plugin sejam sincronizadas com o Photoshop e vice-versa, para que eu possa usar o plugin como extensão natural do color picker nativo.

#### Critérios de Aceitação

1. WHEN o usuário selecionar uma cor no Plugin (via wheel, sliders, mixer ou hex), THE PS_Bridge SHALL definir a cor de foreground do Photoshop para a cor selecionada em no máximo 100ms, aplicando debounce de 50ms durante interações contínuas (arrastar sliders ou wheel) para enviar apenas a cor final ao Photoshop
2. WHEN a cor de foreground do Photoshop for alterada por meios externos (color picker nativo, eyedropper, ação), THE PS_Bridge SHALL detectar a mudança em no máximo 500ms e atualizar todas as visualizações do Plugin (wheel, sliders, mixer, campo hex e preview)
3. THE PS_Bridge SHALL sincronizar cores utilizando a API UXP do Photoshop (app.foregroundColor), garantindo que a diferença de cor entre o valor enviado/recebido e o valor exibido no Plugin não exceda deltaE ≤ 1 após conversões de espaço de cor
4. WHEN o painel do Plugin for aberto, THE PS_Bridge SHALL carregar a cor de foreground atual do Photoshop e exibir nas visualizações do Plugin em no máximo 2 segundos
5. WHEN o documento ativo do Photoshop for alterado, THE PS_Bridge SHALL carregar a cor de foreground do novo documento e atualizar o Plugin
6. IF a API UXP não estiver disponível ou retornar erro, THEN THE PS_Bridge SHALL exibir uma mensagem de status informando falha na sincronização e continuar operando em modo offline, no qual o Plugin permite seleção e manipulação local de cores mas desabilita o envio e recebimento de cores do Photoshop até que a conexão seja restabelecida
7. WHEN a API UXP voltar a estar disponível após uma falha, THE PS_Bridge SHALL restabelecer a sincronização automaticamente em no máximo 5 segundos, carregar a cor de foreground atual do Photoshop e remover a mensagem de status de falha

### Requisito 11: Conversão de Cores entre Espaços

**User Story:** Como um artista digital, eu quero que as conversões de cores entre diferentes espaços (RGB, HSV, LAB, CMYK) sejam precisas, para que eu tenha confiança nos valores exibidos.

#### Critérios de Aceitação

1. THE Plugin SHALL converter cores entre os espaços HSV, RGB, LAB e CMYK, produzindo resultados consistentes com as fórmulas de conversão definidas pelas especificações CIE e ICC para os respectivos espaços de cor
2. THE Plugin SHALL executar todas as conversões internas entre os espaços HSV, RGB, LAB e CMYK sobre representações contínuas em ponto flutuante (RGB expresso como frações reais no intervalo 0.0–1.0), e SHALL garantir que a conversão HSV → RGB → HSV de qualquer cor válida (H: 0–360, S: 0–100, V: 0–100), realizada integralmente sobre essa representação contínua, produza valores equivalentes ao original com tolerância máxima de ±1 em cada componente na escala do respectivo canal
3. THE Plugin SHALL garantir que a conversão RGB → LAB → RGB de qualquer cor válida, realizada integralmente sobre a representação contínua em ponto flutuante, produza valores equivalentes ao original com tolerância máxima de ±1 em cada componente na escala 0–255
4. THE Plugin SHALL aplicar a quantização para inteiros de 8 bits por canal exclusivamente nos limites de saída, definidos como: a formatação do Hex_Display, a exibição numérica no Slider_Panel e no BT_Controls, e o envio de cor ao Photoshop pelo PS_Bridge
5. WHEN uma cor for recebida de um limite de entrada quantizado em 8 bits (Hex_Display, Slider_Panel ou PS_Bridge), THE Plugin SHALL converter o valor para a representação contínua em ponto flutuante antes de qualquer conversão subsequente entre espaços de cor
6. THE Plugin SHALL utilizar o perfil ICC sRGB como espaço de cor de referência para conversões RGB
7. WHEN uma conversão CMYK for necessária, THE Plugin SHALL utilizar o perfil CMYK configurado no documento ativo do Photoshop
8. IF nenhum perfil CMYK estiver configurado no documento ativo WHEN uma conversão CMYK for solicitada, THEN THE Plugin SHALL exibir uma mensagem de erro indicando que um perfil CMYK é necessário e não realizar a conversão
9. IF uma cor de entrada estiver fora do gamut do espaço de cor de destino durante a conversão, THEN THE Plugin SHALL mapear o valor para a cor mais próxima dentro do gamut de destino utilizando clipping por componente

### Requisito 12: Performance e Responsividade da Interface

**User Story:** Como um artista digital, eu quero que o plugin responda de forma fluida durante interações de arrastar e clicar, para que meu fluxo de trabalho não seja interrompido.

#### Critérios de Aceitação

1. WHEN o usuário arrastar sobre a Color_Wheel ou o Triangle_Selector, THE Plugin SHALL atualizar a renderização visual a uma taxa mínima de 30 frames por segundo
2. THE Plugin SHALL completar a inicialização e exibir a interface funcional em no máximo 2 segundos após ser aberto
3. WHEN qualquer controle for ajustado, THE Plugin SHALL propagar a atualização para todos os componentes dependentes em no máximo 50 milissegundos
4. THE Plugin SHALL utilizar requestAnimationFrame para otimizar renderizações no canvas durante operações de arraste

### Requisito 13: Estrutura do Plugin UXP

**User Story:** Como um desenvolvedor, eu quero que o plugin siga a arquitetura UXP padrão do Photoshop, para que seja compatível e distribuível via Creative Cloud Marketplace.

#### Critérios de Aceitação

1. THE Plugin SHALL incluir um arquivo manifest.json que declare os campos obrigatórios da especificação UXP v5+ (id, name, version, host com minVersion correspondente ao Photoshop v24, e ao menos um entrypoint do tipo "panel") e que passe na validação de schema do UXP Developer Tool sem erros
2. THE Plugin SHALL registrar-se como um painel persistente dentro da interface do Photoshop, permanecendo disponível no menu de plugins após reinicialização do aplicativo sem necessidade de reativação manual
3. WHEN o Plugin for carregado em uma versão do Photoshop 2023 (v24) ou superior que suporte UXP, THE Plugin SHALL inicializar sem erros não capturados e apresentar seu painel de interface ao usuário em até 5 segundos após a abertura
4. IF o Plugin for executado em uma versão do Photoshop que não suporte UXP ou inferior à v24, THEN THE Plugin SHALL exibir uma mensagem indicando a incompatibilidade de versão sem causar falha no aplicativo host
5. THE Plugin SHALL utilizar HTML5 Canvas para renderização da roda de cores e triângulo
6. THE Plugin SHALL organizar o código-fonte em no mínimo 3 módulos JavaScript/TypeScript separados por responsabilidade: interface de usuário (UI), lógica de cor, e integração com Photoshop (PS)
### Requisito 14: Limitador de Cor (Quantização de Matiz)

**User Story:** Como um artista digital, eu quero limitar a roda de cores a um número finito de matizes discretos e rotacionar esse conjunto, para que eu possa trabalhar com uma paleta restrita e coerente ao longo de toda a ilustração.

#### Critérios de Aceitação

1. THE Plugin SHALL exibir um controle de alternância que habilita e desabilita o Color_Limiter, com o estado desabilitado como valor padrão na inicialização do painel
2. WHILE o Color_Limiter estiver desabilitado, THE Color_Wheel SHALL renderizar o espectro contínuo de matiz conforme definido no Requisito 1 e THE Plugin SHALL aceitar qualquer matiz no intervalo de 0° a 360°
3. WHILE o Color_Limiter estiver habilitado, THE Color_Wheel SHALL renderizar o anel de matiz dividido em N Hue_Segments de amplitude angular igual a 360°/N, preenchendo cada Hue_Segment com a cor achatada (flat) correspondente ao seu matiz representativo
4. THE Color_Limiter SHALL aceitar valores de N (quantidade de Hue_Segments) no intervalo de 2 a 36, com valor padrão 12
5. WHEN o usuário acionar o botão `−` ou o botão `+` do Color_Limiter, THE Color_Limiter SHALL decrementar ou incrementar N em 1 unidade e restringir (clamp) o resultado ao intervalo de 2 a 36
6. WHILE o Color_Limiter estiver habilitado, THE Color_Limiter SHALL calcular o matiz representativo do Hue_Segment de índice i (i de 0 a N−1) como ((i + 0.5) × 360/N + Rotation_Offset) módulo 360
7. WHILE o Color_Limiter estiver habilitado, WHEN o matiz for definido por qualquer meio (clique ou arraste na Color_Wheel, ajuste no Slider_Panel, entrada no Hex_Display, clique em marcador de harmonia ou sincronização recebida pelo PS_Bridge), THE Color_Limiter SHALL substituir o matiz solicitado pelo matiz representativo do Hue_Segment de menor distância angular circular, preservando os valores de saturação e valor da cor solicitada
8. IF dois Hue_Segments apresentarem distância angular circular idêntica em relação ao matiz solicitado, THEN THE Color_Limiter SHALL selecionar o Hue_Segment de menor índice
9. WHILE a sobreposição de edição do Color_Limiter estiver ativa, WHEN o usuário arrastar o cursor sobre a Color_Wheel, THE Color_Limiter SHALL aplicar ao conjunto completo de Hue_Segments um Rotation_Offset igual à variação angular do arraste, normalizado ao intervalo de 0° a 359°
10. WHILE o Color_Limiter estiver habilitado, THE Plugin SHALL exibir no centro da Color_Wheel o valor inteiro do Rotation_Offset atual em graus seguido do símbolo `°`
11. WHILE a tecla SHIFT estiver pressionada durante o arraste de rotação, THE Color_Limiter SHALL ajustar (snap) o Rotation_Offset para o múltiplo de 15° mais próximo
12. WHILE as teclas SHIFT e CTRL estiverem pressionadas simultaneamente durante o arraste de rotação, THE Color_Limiter SHALL ajustar (snap) o Rotation_Offset para o múltiplo de 60° mais próximo
13. WHILE a sobreposição de edição do Color_Limiter estiver ativa, THE Plugin SHALL exibir um texto de instrução informando que arrastar a roda rotaciona os segmentos e que SHIFT e SHIFT+CTRL ajustam a rotação em incrementos de 15° e 60°
14. WHEN o usuário acionar o controle de confirmação (marca de verificação) da sobreposição de edição, THE Plugin SHALL ocultar a sobreposição de edição e manter o Color_Limiter habilitado com os valores atuais de N e Rotation_Offset
15. WHILE o Color_Limiter estiver habilitado, THE Harmony_Engine SHALL posicionar cada marcador secundário no matiz representativo do Hue_Segment mais próximo do matiz obtido pelo deslocamento angular definido no Harmony_Scheme ativo
16. WHEN o Color_Limiter for habilitado, WHEN o valor de N for alterado ou WHEN o Rotation_Offset for alterado, THE Color_Limiter SHALL reajustar o matiz da cor selecionada para o matiz representativo do Hue_Segment mais próximo, preservando saturação e valor, e propagar a cor resultante para a Color_Wheel, o Triangle_Selector, o Slider_Panel, o Hex_Display, o Color_Preview e o PS_Bridge
17. WHEN o Color_Limiter for desabilitado, THE Plugin SHALL preservar os valores de matiz, saturação e valor da cor selecionada e retomar a aceitação de matizes contínuos
18. THE Color_Limiter SHALL persistir os valores de N, Rotation_Offset e estado de habilitação em armazenamento local persistente e restaurá-los na abertura seguinte do painel

### Requisito 15: Escala de Valores B/W Configurável

**User Story:** Como um artista digital, eu quero uma escala discreta de tons de cinza com número ajustável de degraus no modo B/W, para que eu possa trabalhar com um número controlado de valores tonais em estudos de luz e sombra.

#### Critérios de Aceitação

1. WHILE o Slider_Panel estiver no modo B/W, THE Slider_Panel SHALL exibir o BW_Ramp como uma escala discreta de tons de cinza no lugar do slider contínuo de 0-100 definido no Requisito 4
2. THE BW_Ramp SHALL aceitar quantidade de degraus (K) no intervalo de 2 a 16, com valor padrão 7
3. WHEN o usuário acionar o botão `−` ou o botão `+` do BW_Ramp, THE BW_Ramp SHALL decrementar ou incrementar K em 1 unidade e restringir (clamp) o resultado ao intervalo de 2 a 16
4. THE BW_Ramp SHALL distribuir os degraus uniformemente na escala perceptual de luminosidade L* do espaço LAB, atribuindo ao degrau de índice i (i de 0 a K−1, ordenado do mais claro para o mais escuro) o valor L* igual a 100 × (K−1−i) / (K−1)
5. THE BW_Ramp SHALL renderizar o degrau de índice 0 como branco puro (#FFFFFF) e o degrau de índice K−1 como preto puro (#000000)
6. THE BW_Ramp SHALL renderizar cada degrau como uma amostra clicável de cinza neutro, cuja cor possui os canais R, G e B com valores iguais, obtidos pela conversão do valor L* do degrau para RGB via LAB com componentes a=0 e b=0
7. WHEN o usuário clicar em um degrau do BW_Ramp, THE Plugin SHALL definir a cor selecionada para o cinza neutro daquele degrau e propagar a alteração para a Color_Wheel, o Triangle_Selector, o Hex_Display, o Color_Preview e o PS_Bridge
8. WHEN a cor selecionada for alterada por qualquer meio, THE BW_Ramp SHALL destacar como selecionado o degrau cujo valor L* apresentar a menor diferença absoluta em relação ao valor L* da cor selecionada, convertida para LAB
9. IF dois degraus apresentarem diferença absoluta idêntica de L* em relação à cor selecionada, THEN THE BW_Ramp SHALL destacar o degrau de menor índice
10. THE BW_Ramp SHALL exibir o destaque do degrau selecionado com contraste mínimo de 3:1 em relação à cor do próprio degrau e à cor dos degraus adjacentes
11. THE BW_Ramp SHALL exibir marcas de escala (tick marks) acima da escala, posicionadas nos limites entre degraus consecutivos, totalizando K+1 marcas
12. WHEN a quantidade de degraus K for alterada, THE BW_Ramp SHALL recalcular a distribuição dos degraus e o destaque do degrau mais próximo em no máximo 100 milissegundos, preservando a cor atualmente selecionada sem alteração
13. THE BW_Ramp SHALL persistir a quantidade de degraus K em armazenamento local persistente e restaurá-la na abertura seguinte do painel
