# Documento de Requisitos de Correção

## Introduction

No modo B/W do painel de sliders, o canal K e a régua de valores não falam a mesma língua. Com a régua em 10 valores, clicar no segundo degrau — o degrau cujo nível nominal é 90 — faz o campo K exibir 89. O desvio não é cosmético: ele quebra a relação entre o número que o artista lê e o degrau que ele escolheu, que é justamente o que a régua de valores existe para dar.

A causa é que a leitura e a escrita do canal K usam escalas diferentes, e a régua é gerada numa terceira referência. Como a leitura não é a inversa da escrita, nenhum valor sobrevive à ida e volta: ele sempre volta deslocado. Junto com isso, a régua distribui os N degraus de 100 até 100/N, então o preto absoluto nunca aparece e a régua não cobre a faixa completa de valores que o artista precisa comparar.

A correção unifica o canal K numa única escala — porcentagem de cinza em 8 bits — e redistribui a régua para cobrir de branco puro a preto puro, com os níveis caindo em múltiplos exatos do passo. O comportamento deve ser o mesmo em todos os shells: painel ancorado CEP/UXP, demo, janela Tools e janela flutuante.

## Bug Analysis

### Current Behavior (Defect)

*Comportamento atual (defeito)*

O canal K lê a cor numa escala e escreve noutra, e a régua é montada numa terceira. Os três números discordam entre si.

1.1 WHEN o modo B/W está ativo e o usuário clica num degrau da régua de valores THEN o sistema exibe no campo K um número diferente do nível nominal daquele degrau — com 10 valores, o degrau de nível 90 faz o campo mostrar 89

1.2 WHEN o usuário define um valor v no canal K e o sistema relê o canal em seguida THEN o sistema devolve um número diferente de v, porque a leitura do canal não é a inversa da escrita

1.3 WHEN a régua é configurada com a contagem N THEN o sistema interpreta N como número de INTERVALOS e gera N+1 amostras cobrindo de 100 até 0, o que faz o passo virar 100/N sobre N+1 degraus e produz níveis quebrados — com 10 quadrados na tela os valores saem 100, 89, 78, 67, 56, 44, 33, 22, 11, 0 em vez de pular de 10 em 10

1.4 WHEN o usuário digita no campo K exatamente o nível nominal de um degrau THEN o sistema pode destacar um degrau vizinho, porque o destaque compara o nível da régua com a cor atual numa escala diferente daquela em que o valor foi escrito

1.5 WHEN a cor atual é um cinza que veio da régua THEN o sistema exibe em K um valor que não coincide com nenhum nível da régua, mesmo a cor sendo exatamente a de um degrau

### Expected Behavior (Correct)

*Comportamento esperado (correto)*

O canal K passa a ser porcentagem de cinza em 8 bits, com leitura e escrita na mesma escala. A régua passa a interpretar a contagem como número de intervalos e cobre a faixa inteira, de branco puro a preto puro.

2.1 WHEN o modo B/W está ativo e o usuário clica num degrau da régua de valores THEN o sistema SHALL exibir no campo K exatamente o nível nominal daquele degrau, sem desvio de arredondamento — com 10 intervalos, o degrau de nível 90 SHALL exibir 90

2.2 WHEN o usuário define um valor inteiro v no canal K e o sistema relê o canal em seguida THEN o sistema SHALL devolver o mesmo v

2.3 WHEN a régua é configurada com N amostras, sendo N escolhido entre os divisores de 100 aceitos pelo sistema, THEN o sistema SHALL gerar exatamente N amostras nos níveis 100 − i × (100/N), para i de 0 a N−1, começando no branco puro (nível 100) e terminando no nível 100/N, com o passo 100/N inteiro e todo nível sendo múltiplo exato desse passo. O preto puro (nível 0) NÃO faz parte da régua: ele é obtido digitando 0 no canal K

2.4 WHEN o usuário digita no campo K exatamente o nível nominal de um degrau THEN o sistema SHALL destacar esse degrau, e não um vizinho

2.5 WHEN a cor atual é acromática (r = g = b) THEN o sistema SHALL derivar K diretamente do componente de cinza, sem passar por conversão perceptual

2.6 WHEN a cor atual é cromática THEN o sistema SHALL exibir em K o cinza perceptual equivalente da cor, expresso na escala de porcentagem de cinza em 8 bits

2.7 WHEN a régua está configurada com N amostras THEN o rótulo de contagem SHALL informar N, a quantidade de amostras exibidas

2.8 WHEN o modo B/W é usado em qualquer shell — painel ancorado CEP/UXP, demo, janela Tools ou janela flutuante — THEN o sistema SHALL apresentar os mesmos níveis de régua, o mesmo valor de K e o mesmo degrau destacado

### Unchanged Behavior (Regression Prevention)

*Comportamento inalterado (prevenção de regressão)*

3.1 WHEN o modo de slider é RGB, HSV, LAB ou CMYK THEN o sistema SHALL CONTINUAR A usar os mesmos canais, limites, passos e casas decimais de hoje

3.2 WHEN o usuário edita um canal nos modos LAB ou CMYK THEN o sistema SHALL CONTINUAR A preservar o triplo editado, mantendo os demais canais parados

3.3 WHEN uma cor atravessa qualquer conversão entre espaços THEN o sistema SHALL CONTINUAR A respeitar o round-trip dentro de ±1 por componente

3.4 WHEN o usuário importa a régua B/W para uma paleta THEN o sistema SHALL CONTINUAR A preencher a paleta com os tons da régua, agora na nova contagem de amostras

3.5 WHEN o usuário aciona os botões − e + da contagem da régua THEN o sistema SHALL CONTINUAR A andar apenas pela lista de divisores de 100 aceitos, encaixando qualquer contagem pedida no divisor mais próximo, e SHALL desabilitar o botão quando a contagem atual for a primeira ou a última da lista

3.6 WHEN uma cor está selecionada e o modo B/W está ativo THEN o sistema SHALL CONTINUAR A destacar um único degrau da régua, o correspondente à cor atual

3.7 WHEN a conferência de valores está ligada THEN o sistema SHALL CONTINUAR A exibir a interface em cinza sem alterar a cor real selecionada, o histórico ou o que vai para o Photoshop

3.8 WHEN o modo B/W é exibido THEN o trilho do canal K SHALL CONTINUAR A mostrar o degradê de preto a branco com o thumb posicionado proporcionalmente ao valor

3.9 WHEN o usuário escolhe um degrau da régua THEN o sistema SHALL CONTINUAR A gravar a cor no histórico, mantendo undo e redo funcionando

3.10 WHEN a cor muda por outro controle enquanto o modo B/W está ativo — roda, hex, mixer, ponte com o Photoshop THEN o sistema SHALL CONTINUAR A atualizar o campo K e o destaque da régua sem travar o thumb
