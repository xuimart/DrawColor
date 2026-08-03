# Documento de Requisitos do Bugfix

## Introduction

Na aba **Sliders**, o conteúdo deveria terminar logo depois da linha `MODE:`
(legenda, botões RGB/HSV/LAB/CMYK/B-W e os dois botões de ícone à direita).
Hoje sobra uma faixa vertical vazia entre a linha MODE e a borda inferior do
painel. A faixa não pertence a nenhum controle: é altura reservada a mais.

O usuário relatou a sobra sem conseguir associá-la a um shell específico, e o
comportamento esperado é o mesmo em todos: painel ancorado no Photoshop (CEP e
UXP), demo no navegador, janela "DrawColor Tools" e janela flutuante dos
Sliders. A sobra tem mais de uma origem e aparece em situações diferentes
(modo com menos canais, escala fora de 1, janela mais alta que o conteúdo),
por isso o bug é descrito por condição observável e não por um único caso.

Impacto: o painel ocupa espaço vertical que não usa. Em dock estreito no
Photoshop, altura é o recurso escasso — a sobra empurra a roda para uma escala
menor do que seria necessário e faz o painel parecer desalinhado com o resto
da interface do Photoshop.

## Bug Analysis

### Current Behavior (Defect)

O que acontece hoje quando a aba Sliders está ativa.

1.1 QUANDO a aba Sliders está ativa e a altura reservada para o corpo da aba é
maior que a altura do conteúdo do modo ativo, ENTÃO o sistema deixa a diferença
como faixa vertical vazia entre a linha MODE e o rodapé.

1.2 QUANDO o modo ativo tem menos canais do que o modo de referência de três
canais — por exemplo B/W, com um canal e a rampa de valores — ENTÃO o sistema
mantém a mesma altura reservada do corpo da aba e a diferença vira espaço vazio
abaixo da linha MODE.

1.3 QUANDO a escala do painel é diferente de 1, ENTÃO o sistema calcula a
altura reservada do corpo da aba por outra regra que a altura efetiva das
linhas, e a divergência aparece como sobra abaixo da linha MODE (ou, no sentido
oposto, como corte na linha MODE).

1.4 QUANDO a barra de status está visível, ENTÃO o sistema reserva para ela mais
altura do que o seu texto ocupa, e o restante aparece como margem vazia entre a
linha MODE e a borda inferior do painel.

1.5 QUANDO a aba Sliders é exibida na janela "DrawColor Tools", em que o corpo
da aba estica para preencher a janela, ENTÃO o sistema joga toda a sobra de
altura abaixo da linha MODE.

1.6 QUANDO a aba Sliders é separada em janela flutuante, ENTÃO o sistema aplica
à janela uma altura tabelada por número de canais, que não corresponde à altura
real do conteúdo, deixando espaço vazio abaixo da linha MODE.

1.7 QUANDO o painel ou a janela tem altura maior que a soma do conteúdo,
ENTÃO o sistema distribui parte da sobra abaixo da linha MODE em vez de manter
o conteúdo encostado no rodapé.

### Expected Behavior (Correct)

O que deve acontecer nas mesmas condições.

2.1 QUANDO a aba Sliders está ativa, ENTÃO o sistema DEVE reservar para o corpo
da aba exatamente a altura do conteúdo do modo ativo, sem folga vertical
residual abaixo da linha MODE.

2.2 QUANDO o modo ativo tem menos canais do que o modo de referência de três
canais, ENTÃO o sistema DEVE reservar a altura correspondente ao conteúdo desse
modo, incluindo a rampa de valores do B/W, e nada além dela.

2.3 QUANDO a escala do painel é diferente de 1, ENTÃO o sistema DEVE derivar a
altura reservada do corpo da aba das mesmas medidas efetivas usadas para
desenhar as linhas, de modo que não haja sobra nem corte em nenhuma escala.

2.4 QUANDO a barra de status está visível, ENTÃO o sistema DEVE reservar para
ela apenas a altura do seu próprio conteúdo (espaçamento interno mais a linha
de texto).

2.5 QUANDO a aba Sliders é exibida na janela "DrawColor Tools", ENTÃO o sistema
DEVE encerrar o conteúdo dos Sliders imediatamente após a linha MODE, sem
transformar a sobra da janela em vão abaixo dela.

2.6 QUANDO a aba Sliders é separada em janela flutuante, ENTÃO o sistema DEVE
dimensionar a janela pela altura medida do conteúdo do modo ativo, respeitando
os limites mínimos e máximos existentes.

2.7 QUANDO o painel ou a janela tem altura maior que a soma do conteúdo, ENTÃO o
sistema DEVE manter a faixa inferior encostada no rodapé, com a sobra ficando
acima da faixa de abas, e nunca entre a linha MODE e a borda inferior.

### Unchanged Behavior (Regression Prevention)

O que precisa continuar exatamente como está.

3.1 QUANDO o modo ativo é CMYK, com quatro canais, ENTÃO o sistema DEVE
CONTINUAR A exibir as quatro linhas de slider inteiras, sem cortar nenhuma
delas e sem invadir a linha MODE.

3.2 QUANDO o modo ativo é B/W, ENTÃO o sistema DEVE CONTINUAR A exibir a rampa
de valores e o seu contador completos.

3.3 QUANDO o painel é redimensionado em largura, ENTÃO o sistema DEVE CONTINUAR
A calcular a escala e posicionar cabeçalho, swatches, roda e barra de valor
exatamente como hoje.

3.4 QUANDO o painel é baixo demais para caber a área da roda mais a faixa
inferior, ENTÃO o sistema DEVE CONTINUAR A impedir que a faixa inferior suba
por cima da roda e dos satélites.

3.5 QUANDO a aba ativa é Mixers, Paletas ou Godê, ENTÃO o sistema DEVE CONTINUAR
A esticar o conteúdo dessas abas como hoje, com a área de pintura do Godê
ocupando a sobra vertical disponível.

3.6 QUANDO a barra de status está oculta por haver conexão com o Photoshop,
ENTÃO o sistema DEVE CONTINUAR A não reservar altura nenhuma para ela.

3.7 QUANDO a escala cai para valores pequenos, ENTÃO o sistema DEVE CONTINUAR A
respeitar os tamanhos mínimos em pixels dos trilhos, campos numéricos, botões de
modo e botões de ícone da linha MODE.

3.8 QUANDO a aba Sliders está em janela flutuante, ENTÃO o sistema DEVE CONTINUAR
A respeitar os limites de tamanho da janela em relação à área visível e a permitir
o redimensionamento manual.

3.9 QUANDO o usuário troca o modo de cor, ENTÃO o sistema DEVE CONTINUAR A
reconstruir os sliders e preservar os valores por canal como hoje, sem mudança
no comportamento de cor.
