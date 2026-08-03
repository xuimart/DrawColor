# Color Wheel Plugin — Estado do projeto

Documento de continuidade. Resume o que existe, as decisões tomadas e o que
falta, para retomar o trabalho numa nova conversa sem perder contexto.

## Objetivo

Criar um plugin de roda de cores para Adobe Photoshop (UXP), inspirado no
Coolorus, com código próprio. Hoje existe uma **demo funcional em HTML** que
valida a ergonomia e a matemática de cor antes de investir no plugin real.

## O que existe

### Especificação

`.kiro/specs/color-wheel-plugin/requirements.md` — 13 requisitos em EARS,
cobrindo roda HSV, seletor de saturação/valor, harmonias, sliders multi-modo,
mixer, preview e hex, dials de brilho e temperatura, indicador de gamut,
histórico, integração com o Photoshop, conversões de cor, performance e
estrutura UXP.

**Atenção:** a demo avançou muito além do documento. As features listadas em
"Implementado na demo mas não especificado" ainda precisam ser incorporadas
aos requisitos.

### Demo

Abre direto no navegador, sem build: `demo/index.html`.

| Arquivo | Responsabilidade |
|---|---|
| `demo/index.html` | Estrutura do painel |
| `demo/styles.css` | Tema escuro estilo Photoshop e layout |
| `demo/js/color.js` | Conversões RGB/HSV/LAB/CMYK, gamut, cinza perceptual, mistura |
| `demo/js/state.js` | Estado central com assinantes, histórico, harmonias, máscara de gamut, travamentos |
| `demo/js/wheel.js` | Render e interação da roda: anel, triângulo, quadrado, disco, máscara |
| `demo/js/panels.js` | Sliders multi-modo, mixer, dials, hex, rampa B/W, limite de cor |
| `demo/js/palettes.js` | Paletas salvas, persistidas em localStorage |
| `demo/js/gode.js` | Godê de mistura com pincel, espátula e conta-gotas |
| `demo/js/docking.js` | Separa abas em janelas flutuantes e reencaixa |
| `demo/js/main.js` | Montagem da interface, menu, arcos de ícones, satélites |
| `demo/verify-color-math.js` | Verificação das propriedades de correção |

Rodar a verificação: `node demo/verify-color-math.js`

## Implementado na demo mas não especificado

Estas features nasceram na conversa e ainda não estão nos requisitos:

- **Limite de cor** — discretiza matiz (6 a 36 setores) e opcionalmente os
  níveis de saturação e valor. A roda passa a mostrar setores discretos e o
  seletor interno aparece posterizado.
- **Rampa B/W com contagem ajustável** — de 2 a 24 valores, do branco ao preto.
- **Paletas salvas** — múltiplas paletas nomeadas, persistidas, com importação
  a partir do limite de cor ou da rampa B/W, e exportação em texto.
- **Godê de mistura** — canvas onde a tinta se mistura por sobreposição, com
  pincel, espátula e conta-gotas.
- **Rotação do anel de matiz** — livre, ou com snap de 15° e 60°.
- **Três formas de seletor** — triângulo, quadrado e disco.
- **Travamento de luminosidade** — mantém o L do LAB ao mudar matiz e saturação.
- **Conferência de valores** — exibe o picker todo em cinza perceptual.
- **Máscara de gamut** — seis formatos, editável, com gamut lock.
- **Harmonias editáveis** — arrastar os marcadores secundários ajusta os
  ângulos, por esquema.
- **Separar abas em janelas flutuantes** — qualquer aba, com posição persistida.

## Decisões de projeto e o porquê

**Conversões internas em ponto flutuante.** O requisito 11.2 pede round-trip
HSV → RGB → HSV dentro de ±1, o que é impossível com RGB inteiro de 8 bits: em
cores dessaturadas o matiz se perde por completo. As conversões internas
trabalham em float e o arredondamento acontece só na borda de saída. **O texto
do requisito ainda precisa ser corrigido.**

**Cinza perceptual via L do LAB, não luma.** Amarelo e azul saturados têm a
mesma saturação mas valores muito diferentes. Uma desaturação ingênua achataria
os dois para perto do meio e a conferência de valores não serviria para nada.

**Ordem dos modificadores de cor.** Máscara de gamut restringe matiz e
saturação, depois o travamento de luminosidade ajusta o valor, e por último o
limite de cor discretiza. Assim a cor final sempre cai na grade quando o limite
está ativo. Consequência aceita: com máscara e limite juntos, o ponto
quantizado pode ficar marginalmente fora da elipse.

**Cores aplicadas explicitamente são honradas.** Hex digitado, chip de paleta,
resultado do mixer, conta-gotas do godê e controles cujo propósito é mudar o
brilho passam `relock: true`, que redefine a referência do travamento em vez de
lutar contra ela. Sem isso o dial de brilho não funcionaria com o lock ligado.

**Espaço unitário para os formatos de máscara.** Cada formato declara só sua
geometria num círculo de raio 1; escala, rotação e translação são
compartilhadas. Polígonos usam ponto mais próximo da borda, que é mais
previsível que projeção radial em formas não convexas.

**Âncoras por região na máscara.** A elipse+círculo é uma união desconexa. O
recolhimento para dentro da máscara precisa de uma âncora por região, porque o
centro geral pode não pertencer a nenhuma delas.

**Convenção única de matiz.** Anel, disco e máscara usam matiz 0 no topo. Havia
um bug em que a máscara era desenhada 90° fora de onde restringia.

**Offsets de harmonia são relativos ao matiz principal.** Um esquema editado
continua acompanhando a cor quando o marcador principal se move.

**Docking move o nó do DOM, não recria.** Os listeners e o código de refresh
continuam válidos porque buscam elementos por id.

**Satélites posicionados por coordenada polar.** Todo grupo ao redor da roda é
um arco que cobre o stage e posiciona os filhos por ângulo e raio. Elementos
escondidos não ocupam posição, então o arco se redistribui sozinho.

## Limitações conhecidas

- **Gamut CMYK é aproximado.** Usa um envelope de croma analítico, não um perfil
  ICC. No plugin real deve vir do perfil do documento ativo.
- **Mistura do godê é linear em RGB.** Não é subtrativa: amarelo com azul dá
  cinza, não verde. Mistura realista exigiria um modelo tipo Kubelka-Munk.
- **Cinza do godê usa filtro CSS.** O canvas é a fonte de verdade da tinta, então
  converter os pixels destruiria a pintura. O resultado difere levemente do
  cinza perceptual usado no resto do painel.
- **Performance do godê.** Usa `getImageData` por pincelada. Pode precisar de um
  buffer próprio com pincel grande.
- **Requisito 11.2 está incorreto** como escrito (ver decisões acima).

## Próximos passos sugeridos

1. **Atualizar os requisitos** com as features da demo e corrigir o requisito
   11.2. Sem isso o documento e o código estão divergentes.
2. **Design técnico** (`design.md`) para o plugin UXP.
3. **Migrar para UXP**: `manifest.json` com entrypoint de painel, mínimo
   Photoshop v24. A demo já está modularizada por responsabilidade, o que
   atende o requisito 13.6.
4. **Integração com o Photoshop** (requisito 10): sincronizar
   `app.foregroundColor` nos dois sentidos, com debounce no envio.
5. **Painéis separados de verdade.** O `manifest.json` aceita vários entrypoints
   de painel. Cada painel é um documento HTML próprio, então o estado não pode
   ser variável de módulo como hoje. Recomendação: usar a cor de foreground do
   Photoshop como fonte de verdade entre painéis — resolve a sincronização e já
   cobre mudanças feitas por fora do plugin.
6. **Testes de propriedade de verdade.** Hoje `verify-color-math.js` é um script
   caseiro com amostragem aleatória. Vale migrar para um framework de
   property-based testing quando o projeto ganhar build.

## Referência visual

O layout segue o Coolorus: swatches no canto superior esquerdo, arco de
harmonias no superior direito, satélites do gamut no inferior direito, controles
de cor no arco esquerdo, histórico no inferior esquerdo, hex no inferior direito
da roda. Abas de Sliders, Mixers, Paletas e Godê abaixo.
