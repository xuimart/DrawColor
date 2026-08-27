/**
 * state.js — Estado central da cor, histórico de undo/redo e harmonias.
 * Requisitos 3, 9.
 */
window.AppState = (function () {
  'use strict';

  const C = window.Color;
  const HISTORY_LIMIT = 50;

  /* ---------------- Esquemas de harmonia (Requisito 3.1) ---------------- */
  /**
   * O conjunto acompanha a referência do Coolorus. São seis porque o arco do
   * Layout_De_Referência tem seis âncoras (harmony.1 a harmony.6) e o índice
   * do botão é que escolhe a âncora — um sétimo esquema ficaria sem posição.
   *
   * 'none' é o Mono da referência: um só matiz, sem marcadores secundários.
   * O análogo acentuado é o análogo mais o complementar, que é o esquema que
   * faltava. Ele entrou no lugar do split-complementar; para ter os dois é
   * preciso abrir uma sétima âncora no arco.
   */
  const HARMONY_SCHEMES = [
    { id: 'none',     label: 'Mono',                offsets: [] },
    { id: 'comp',     label: 'Complementar',        offsets: [180] },
    { id: 'analog',   label: 'Análogo',             offsets: [30, -30] },
    { id: 'accent',   label: 'Análogo acentuado',   offsets: [30, -30, 180] },
    { id: 'triad',    label: 'Triádico',            offsets: [120, -120] },
    { id: 'tetra',    label: 'Tetrádico',           offsets: [90, 180, 270] }
  ];

  /**
   * Distância mínima entre marcadores, em graus — vale tanto entre um braço e
   * o matiz principal quanto entre dois braços.
   *
   * O valor sai da geometria, não do gosto: na pista dos marcadores (raio ~188
   * unidades) um secundário tem 16 de raio mais 2 de borda, e o principal 19
   * mais 3. Dois secundários só deixam de se cobrir a partir de 36 unidades de
   * arco, o que dá cerca de 11°; contra o principal, cerca de 12°. Com o antigo
   * valor de 2° os marcadores empilhavam ao fechar um esquema, e aí só dava
   * para pegar um deles — o esquema travava.
   */
  const MIN_HARMONY_GAP = 12;

  /**
   * Abertura máxima de cada braço nos esquemas análogo e análogo acentuado.
   *
   * 90° é o teto natural: nele os dois braços ficam a ±90° do matiz principal e
   * formam uma LINHA RETA, com 180° de abertura entre eles. Passando disso a
   * figura se dobra para trás — os braços voltariam a se aproximar pelo outro
   * lado, e a abertura medida a partir do principal passaria de meia volta, o
   * que não tem leitura composicional.
   *
   * Já tentei 60° aqui, seguindo um comentário que dizia ser o valor do
   * Coolorus. Foi um aperto que ninguém pediu e que tirou justamente a abertura
   * ampla do análogo acentuado — onde os quatro marcadores em 0, ±90 e 180
   * distribuem o círculo por igual. O teto geométrico é melhor critério que uma
   * anotação não verificada.
   */
  const MAX_ANALOG_SPREAD = 90;

  /**
   * Abertura máxima para o tetrádico. O offset canônico é 90° e o Coolorus
   * permite range [10°, 80°]. Limitar impede que o retângulo se desfaça
   * num "sanduíche" achatado demais ou excessivamente aberto.
   */
  const MAX_TETRA_SPREAD = 80;

  /**
   * Tetrádico como DOIS EIXOS COMPLEMENTARES.
   *
   * O esquema é um retângulo: dois pares de complementares. O primeiro eixo é
   * o matiz principal e seu oposto (0 e 180) e fica parado — é a referência da
   * composição. O segundo eixo é φ e 180+φ, e gira em bloco: arrastar um de
   * seus marcadores abre ou fecha o ângulo entre os eixos, mantendo os dois
   * pontos sempre opostos.
   *
   * Por isso o tetrádico guarda UM número (φ), não três offsets soltos: os
   * offsets [φ, 180, 180+φ] são derivados dele. Offsets independentes
   * permitiriam quebrar a oposição dos pares, que é justamente o que dá ao
   * esquema a leitura de retângulo.
   *
   * Faixa de φ: simétrica em torno do quadrado, recortando as duas pontas.
   *
   * φ é a orientação de uma RETA, então vive módulo 180 — φ e φ+180 descrevem
   * o mesmo eixo.
   *
   * O que o limite protege é a LEITURA do esquema. Perto de 0 o eixo móvel cola
   * no matiz principal e perto de 180 cola no complementar; nos dois casos o
   * retângulo achata até virar quase uma linha e a composição deixa de se ler
   * como tetrádica. 30° de folga em cada ponta mantém os dois eixos claramente
   * distintos, com margem confortável sobre MIN_HARMONY_GAP, que só garante
   * que os marcadores não se cubram.
   *
   * O teto NÃO é 90, e isso é deliberado. O quadrado (φ=90) é o padrão, não o
   * máximo: φ=80 e φ=100 são retângulos distintos, inclinados para lados
   * opostos, com cores diferentes. Parar em 90 tiraria metade das composições
   * e, pior, travaria o marcador no meio do arraste — o cursor seguiria e o
   * marcador ficaria para trás. Com a faixa simétrica o marcador acompanha o
   * cursor pela volta inteira e só encosta nos extremos degenerados.
   */
  /**
   * Faixa de abertura do tetrádico: do eixo perpendicular até perto do eixo
   * fixo, sem nunca atravessá-lo.
   *
   * O eixo móvel começa perpendicular ao fixo (φ=90, o quadrado) e pode fechar
   * até quase encostar nele. O que ele NÃO pode é passar do outro lado: a
   * amplitude total do giro é de 90°, não de 180°.
   *
   * Isso corrige uma decisão minha que estava errada. Eu havia aberto a faixa
   * até 150° com o argumento de que φ=80 e φ=100 são retângulos distintos,
   * inclinados para lados opostos. É verdade geometricamente, mas não é como o
   * Coolorus se comporta, e a referência é o que vale aqui: passar de 90° deixa
   * o eixo móvel invadir o semicírculo do outro lado do eixo fixo, e ali ele
   * não deve entrar.
   *
   * O mínimo vem de MIN_HARMONY_GAP, a folga geométrica abaixo da qual dois
   * marcadores se cobrem na pista — é o "até perto do vermelho, sem encostar".
   */
  const TETRA_PHI_DEFAULT = 90;
  const TETRA_PHI_MIN = MIN_HARMONY_GAP;
  const TETRA_PHI_MAX = 90;

  /**
   * Geometria por esquema no modelo do Coolorus: um único ângulo de abertura
   * (φ) governa a forma, e os braços ESTRUTURAIS ficam travados.
   *
   * É a correção de um defeito de fundo. Antes cada braço era um número solto
   * que podia ser arrastado à parte, e isso permitia desmanchar o próprio
   * esquema: no análogo acentuado, arrastar o braço complementar o tirava dos
   * 180° e o "acento" deixava de ser um acento — os quatro marcadores viravam
   * quatro matizes sem relação. O mesmo vale para a simetria do análogo.
   *
   * No modelo φ isso não é possível de expressar:
   *
   *   analog  [ φ, −φ ]            simétrico por construção
   *   accent  [ φ, −φ, 180 ]       o complementar é estrutural
   *   tetra   [ φ, 180, 180+φ ]    dois eixos, cada um um par oposto
   *
   * `arms` diz o que cada braço faz quando arrastado: 'phi' ajusta a abertura,
   * 'fixed' não tem abertura para ajustar e gira o conjunto inteiro.
   *
   * Os esquemas sem entrada aqui (mono, complementar, triádico) têm forma
   * totalmente rígida e usam os offsets canônicos.
   */
  const SCHEME_PHI = {
    analog: {
      def: 30, min: MIN_HARMONY_GAP, max: MAX_ANALOG_SPREAD,
      offsets: (phi) => [phi, -phi],
      arms: ['phi', 'phi'],
      // Os dois braços são espelhos: a abertura é o módulo do ângulo.
      phiFrom: (index, deg) => Math.abs(wrapDeg(deg)),
      // Aqui φ é uma DISTÂNCIA ao matiz principal, não uma orientação: 170°
      // significa "muito aberto", e deve parar no máximo.
      wrap: false
    },
    accent: {
      def: 30, min: MIN_HARMONY_GAP, max: MAX_ANALOG_SPREAD,
      offsets: (phi) => [phi, -phi, 180],
      arms: ['phi', 'phi', 'fixed'],
      phiFrom: (index, deg) => Math.abs(wrapDeg(deg)),
      wrap: false
    },
    tetra: {
      def: TETRA_PHI_DEFAULT, min: TETRA_PHI_MIN, max: TETRA_PHI_MAX,
      offsets: (phi) => [phi, 180, 180 + phi],
      arms: ['phi', 'fixed', 'phi'],
      /**
       * φ é a orientação de uma RETA, então vive módulo 180. O braço de índice
       * 2 está gravado como 180+φ: desconta o meio-giro para achar φ.
       */
      phiFrom: (index, deg) => {
        const bruto = index === 2 ? deg - 180 : deg;
        return ((bruto % 180) + 180) % 180;
      },
      // Sendo orientação, o limite é circular: ver clampPhi.
      wrap: true
    }
  };

  /**
   * Distância angular entre duas orientações de reta (módulo 180).
   */
  function dist180(a, b) {
    const d = Math.abs(((a - b) % 180) + 180) % 180;
    return Math.min(d, 180 - d);
  }

  /**
   * Encaixa φ na faixa do esquema.
   *
   * Para uma abertura simples (`wrap: false`) é um clamp comum.
   *
   * Para uma ORIENTAÇÃO (`wrap: true`, o tetrádico) a faixa é um arco num
   * círculo de 180°, e o que está fora precisa parar na borda MAIS PRÓXIMA.
   * Essa distinção é o que faz o gesto parecer certo: arrastando o eixo móvel
   * para além do eixo fixo, ele encosta no mínimo do lado onde o cursor está,
   * em vez de saltar para o outro extremo da faixa.
   */
  function clampPhi(raw, def) {
    if (raw >= def.min && raw <= def.max) return raw;

    if (!def.wrap) return raw < def.min ? def.min : def.max;

    return dist180(raw, def.min) <= dist180(raw, def.max) ? def.min : def.max;
  }

  const listeners = [];

  const HUE_STEP_OPTIONS = [6, 8, 12, 16, 24, 36];

  /**
   * Quantidades de AMOSTRAS permitidas na régua B/W: de 1 a 15.
   * O artista escolhe livremente quantos degraus quer na régua. Os botões
   * − e + andam de 1 em 1 por esta lista.
   */
  const BW_STEP_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  // Derivados da lista, mantidos exportados por compatibilidade.
  const BW_MIN = BW_STEP_OPTIONS[0];
  const BW_MAX = BW_STEP_OPTIONS[BW_STEP_OPTIONS.length - 1];

  const state = {
    hsv: { h: 4, s: 100, v: 41.6 },   // #6A0700 aproximado
    background: { r: 143, g: 143, b: 143 },
    scheme: 'none',
    // Offsets ajustados pelo usuário, por esquema. Um esquema sem entrada
    // aqui usa os ângulos canônicos definidos em HARMONY_SCHEMES.
    harmonyOffsets: {},
    /**
     * Âncora da constelação de harmonia: o matiz de onde os offsets partem.
     *
     * Antes o marcador principal ERA a cor, e os secundários eram calculados a
     * partir dela. Isso tornava impossível pintar com um secundário: adotar a
     * cor dele o promovia a principal, e todos os outros se reposicionavam em
     * relação ao novo principal — a cada clique o esquema girava, e girava de
     * novo no clique seguinte.
     *
     * Com a âncora separada da cor, os marcadores derivam daqui e clicar num
     * deles não mexe na figura. Quem gira a constelação é só o gesto de girar,
     * e ela gira inteira, mantendo os ângulos relativos.
     */
    refHue: 4,
    /**
     * Qual marcador está ativo: null é o principal, um número é o índice do
     * secundário. O ativo é o que a cor atual representa.
     */
    activeSecondary: null,
    /**
     * Ângulo de abertura por esquema, em graus. Fonte única da forma dos
     * esquemas ajustáveis — ver SCHEME_PHI.
     */
    schemePhi: {
      analog: SCHEME_PHI.analog.def,
      accent: SCHEME_PHI.accent.def,
      tetra: SCHEME_PHI.tetra.def
    },
    sliderMode: 'HSV',
    tempOffset: 0,
    // Rotação do anel de matiz, em graus. Só afeta a apresentação:
    // o matiz da cor continua sendo o valor real de H.
    wheelRotation: 0,
    /**
     * Espaço do círculo cromático: 'rgb' (roda da luz) ou 'ryb' (roda do
     * pintor). Muda onde cada matiz fica na roda e, por consequência, para
     * onde as harmonias apontam — o complementar do vermelho é o ciano no RGB
     * e o verde no RYB. A cor em si continua guardada em HSV.
     */
    wheelSpace: 'rgb',
    // Forma do seletor interno de saturação/valor
    shape: 'triangle',              // 'triangle' | 'square'
    // Travamento de luminosidade: ao mudar matiz ou saturação, o valor é
    // reajustado para manter o L do espaço LAB constante
    lumLock: false,
    lockedL: null,
    /**
     * Máscara de gamut (gamut masking do Gurney): restringe as combinações
     * de matiz e saturação a uma elipse desenhada sobre o disco de cor.
     * Coordenadas normalizadas: centro do disco = (0,0), raio 1 = saturação 100.
     */
    gamut: {
      enabled: false,
      editing: false,
      locked: false,
      kind: 'ellipse',
      cx: 0, cy: 0,
      rx: 0.64, ry: 0.42,
      angle: 0,                     // rotação da máscara, em graus
      /**
       * Vértices editados à mão, no espaço unitário. Null = usa o polígono
       * canônico do formato. Preenchido no primeiro arraste de vértice.
       */
      points: null
    },
    // Limitação de cor: discretiza matiz e/ou saturação e valor
    limit: { enabled: false, hueSteps: 12, svSteps: 0 },  // svSteps 0 = contínuo
    // Rampa de tons de cinza do modo B/W. 10 amostras = passo 10:
    // 100, 90, 80 ... 10. O preto puro fica fora da régua.
    bwSteps: 10,
    // Conferência de valores: exibe todo o picker em cinza perceptual
    // sem alterar a cor real selecionada
    valueCheck: false,
    // Triplo editado pelo painel de sliders: { mode, vals } ou null
    channels: null,
    // histórico
    history: [],
    historyIndex: -1
  };

  function subscribe(fn) { listeners.push(fn); }

  function emit(reason) {
    listeners.forEach((fn) => fn(state, reason));
  }

  /* ---------------- Limitação de cor ---------------- */

  /**
   * Encaixa o matiz no centro do setor mais próximo.
   *
   * Os setores são iguais no ESPAÇO DA RODA, não no matiz: "12 matizes" quer
   * dizer doze posições igualmente espaçadas no círculo que o usuário vê. Na
   * roda RGB as duas coisas coincidem; na roda do pintor, não — dividir o
   * matiz em doze daria setores de tamanhos diferentes na tela, e os matizes
   * escolhidos não seriam os doze do círculo cromático RYB.
   */
  function quantizeHue(h, steps) {
    const size = 360 / steps;
    const angle = hueToAngle(h);
    return angleToHue(Math.round(angle / size) * size);
  }

  // Encaixa um componente 0-100 em `steps` níveis igualmente espaçados
  function quantizeLevel(value, steps) {
    if (steps < 2) return value;
    const idx = Math.round((value / 100) * (steps - 1));
    return (idx / (steps - 1)) * 100;
  }

  function applyLimit(hsv) {
    if (!state.limit.enabled) return hsv;
    const out = { ...hsv };
    out.h = quantizeHue(out.h, state.limit.hueSteps);
    if (state.limit.svSteps >= 2) {
      out.s = quantizeLevel(out.s, state.limit.svSteps);
      out.v = quantizeLevel(out.v, state.limit.svSteps);
    }
    return out;
  }

  function setLimit(patch) {
    Object.assign(state.limit, patch);
    if (state.limit.hueSteps < 2) state.limit.hueSteps = 2;
    // Reaplica o limite à cor atual para a interface não ficar inconsistente
    const snapped = applyLimit(state.hsv);
    state.hsv = snapped;
    emit('limit');
    emit('color');
  }

  /**
   * Paleta completa disponível sob o limite atual (útil para preview e export).
   * As posições são igualmente espaçadas no espaço da roda, então na roda do
   * pintor a lista traz os matizes do círculo cromático RYB.
   */
  function getLimitedPalette() {
    if (!state.limit.enabled) return null;
    const hues = [];
    for (let i = 0; i < state.limit.hueSteps; i++) {
      hues.push(angleToHue((i * 360) / state.limit.hueSteps));
    }
    return hues;
  }

  /* ---------------- Conferência de valores ---------------- */

  function setValueCheck(on) {
    state.valueCheck = !!on;
    emit('valuecheck');
  }

  /**
   * Filtro de exibição. Toda pintura da interface passa por aqui, então
   * ligar a conferência de valores afeta só o que é mostrado — a cor
   * selecionada, o histórico e o que vai para o Photoshop seguem em cor.
   */
  function display(rgb) {
    return state.valueCheck ? C.toGray(rgb.r, rgb.g, rgb.b) : rgb;
  }

  function displayCss(rgb) {
    const d = display(rgb);
    return `rgb(${d.r},${d.g},${d.b})`;
  }

  /**
   * Define a quantidade de amostras da régua B/W.
   * Arredonda e limita entre BW_MIN (1) e BW_MAX (15).
   */
  function setBwSteps(n) {
    state.bwSteps = C.clamp(Math.round(Number(n)), BW_MIN, BW_MAX);
    emit('bw');
  }

  // Tons de cinza da rampa B/W, do claro para o escuro.
  // `bwSteps` é a QUANTIDADE DE AMOSTRAS (N): a rampa devolve N elementos, com
  // passo 100/N, indo de 100 (branco puro) até Math.round(100/N).
  // O preto puro NÃO faz parte da régua: quem quer preto digita 0 no campo K.
  // Os degraus são espaçados na mesma escala que o canal K usa — porcentagem
  // de cinza em 8 bits — e não em L perceptual. É isso que faz o valor exibido
  // no campo K coincidir exatamente com o nível do degrau selecionado.
  function getBwRamp() {
    const out = [];
    const n = state.bwSteps; // N = quantidade de amostras exibidas na régua
    for (let i = 0; i < n; i++) {
      const level = Math.round(100 - i * (100 / n));
      const g = Math.round(level / 100 * 255);
      out.push({ level, r: g, g: g, b: g });
    }
    return out;
  }

  /* ---------------- Acesso à cor ---------------- */

  function getHsv() { return { ...state.hsv }; }

  function getChannels() { return state.channels; }

  function getRgb() {
    return C.hsvToRgb(state.hsv.h, state.hsv.s, state.hsv.v);
  }

  function getHex() {
    const rgb = getRgb();
    return C.rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  /**
   * Define a cor atual. `commit` controla se a cor entra no histórico —
   * durante arraste contínuo passamos commit=false e só gravamos ao soltar.
   */
  /**
   * A cor é o invariante central: um componente não finito aqui contamina
   * tudo adiante — HSV, RGB, hex, gradientes — e não há como recuperar depois,
   * porque `setRgb` preserva o matiz atual em cores acromáticas e um matiz NaN
   * sobrevive até a escrita de um cinza. Barrar na entrada é o único ponto
   * onde isso é resolvível de uma vez para todos os caminhos: sliders, hex,
   * paletas, ponte com o Photoshop e sincronização entre janelas.
   */
  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  /* ---------------- Triplo de canais editado no painel ---------------- */

  /**
   * A cor que um triplo de canais descreve, recortada para o sRGB.
   *
   * Só LAB e CMYK guardam triplo: são os modos cuja volta pelo RGB perde
   * informação. Os outros derivam os canais da cor e não precisam de estado.
   */
  function channelsToRgb(ch) {
    if (!ch || !ch.vals) return null;
    const v = ch.vals;
    if (ch.mode === 'LAB') {
      if (!isNum(v.L) || !isNum(v.a) || !isNum(v.b)) return null;
      return C.labToRgb(v.L, v.a, v.b);
    }
    if (ch.mode === 'CMYK') {
      if (!isNum(v.c) || !isNum(v.m) || !isNum(v.y) || !isNum(v.k)) return null;
      return C.cmykToRgb(v.c, v.m, v.y, v.k);
    }
    return null;
  }

  /**
   * Folga de 2 níveis por componente. A cor atravessa HSV aqui dentro e volta
   * arredondada para 8 bits; quando existe ponte com o Photoshop ela ainda faz
   * a viagem até o host e de volta. Comparar por igualdade exata derrubaria o
   * triplo por ruído de arredondamento.
   */
  function nearRgb(a, b) {
    return !!a && !!b &&
      Math.abs(a.r - b.r) <= 2 &&
      Math.abs(a.g - b.g) <= 2 &&
      Math.abs(a.b - b.b) <= 2;
  }

  /**
   * Decide o triplo depois de uma escrita de cor.
   *
   * O critério é consistência, não declaração. Antes o triplo era invalidado
   * sempre que a escrita não passava `opts.channels`, o que colocava a
   * corretude do modo LAB na dependência de dezenas de pontos de escrita, em
   * quatro módulos, lembrarem de declarar posse. Bastava um esquecer para os
   * canais saltarem — e foi o que aconteceu com o polling do Photoshop, que
   * relê o foreground a cada 400ms e reescreve a cor sem declarar nada.
   *
   * Agora quem escreve e é dono do triplo continua declarando, e vale. Quem
   * não declara não precisa saber que o triplo existe: ele sobrevive se ainda
   * descrever a cor resultante, e cai quando a cor virou outra. Um eco do host
   * é inofensivo; escolher outra cor na roda derruba o triplo, que é o certo.
   */
  function resolveChannels(opts, hsv) {
    if (opts.channels) return opts.channels;

    const kept = state.channels;
    if (!kept) return null;

    const want = channelsToRgb(kept);
    if (!want) return null;

    const now = C.hsvToRgb(hsv.h, hsv.s, hsv.v);
    return nearRgb(want, now) ? kept : null;
  }

  function setHsv(next, opts) {
    if (!next || !isNum(next.h) || !isNum(next.s) || !isNum(next.v)) return false;

    opts = opts || {};
    const requested = {
      h: ((next.h % 360) + 360) % 360,
      s: C.clamp(next.s, 0, 100),
      v: C.clamp(next.v, 0, 100)
    };

    // Controles cujo propósito é mudar o brilho redefinem a referência
    // do travamento em vez de lutar contra ele
    if (state.lumLock && opts.relock) state.lockedL = luminosityOf(requested);

    // A máscara restringe matiz e saturação, o travamento ajusta o valor e
    // o limite discretiza no final, para a cor sempre cair na grade
    const { h, s, v } = applyLimit(applyLuminosityLock(applyGamutMask(requested)));

    const changed = h !== state.hsv.h || s !== state.hsv.s || v !== state.hsv.v;
    state.hsv = { h, s, v };

    /**
     * A âncora só acompanha a cor quando o marcador ATIVO é o principal —
     * situação em que ela é, por definição, o matiz atual (offset zero).
     *
     * Com um secundário ativo a âncora fica onde está, e é isso que impede a
     * constelação de saltar. A versão anterior derivava a âncora da cor em
     * TODA escrita, e isso transformava qualquer atualização de cor numa
     * rotação disfarçada. Três caminhos reais faziam isso sem ninguém pedir:
     *
     *   - `panel-sync.js` transmite só {h,s,v} entre os dois painéis do CEP;
     *     quem recebia recalculava a âncora e girava o esquema;
     *   - `ps-bridge.js` lê a cor de volta do Photoshop, e o arredondamento da
     *     ida e volta RGB fazia a âncora derivar a cada leitura;
     *   - o histórico restaura {h,s,v} sem a âncora.
     *
     * Nenhum deles aparece nos testes em Node, e era daí que vinha o salto que
     * sobrevivia a todas as correções anteriores.
     */
    if (state.activeSecondary === null) state.refHue = state.hsv.h;

    // Quem é dono declara e vale; quem não declara mantém o triplo enquanto
    // ele continuar descrevendo a cor resultante
    state.channels = resolveChannels(opts, state.hsv);

    // Requisito 7.7: temperatura volta ao centro quando a cor muda por outro controle
    if (opts.resetTemp !== false) state.tempOffset = 0;

    if (opts.commit) pushHistory();
    if (changed || opts.force) emit(opts.reason || 'color');
    return true;
  }

  function setRgb(r, g, b, opts) {
    if (!isNum(r) || !isNum(g) || !isNum(b)) return false;

    const hsv = C.rgbToHsv(r, g, b);
    // Preserva o matiz quando a cor é acromática, evitando salto do marcador
    if (hsv.s === 0) hsv.h = state.hsv.h;
    return setHsv(hsv, opts);
  }

  function setHex(hex, opts) {
    const rgb = C.hexToRgb(hex);
    if (!rgb) return false;
    setRgb(rgb.r, rgb.g, rgb.b, opts);
    return true;
  }

  /* ---------------- Histórico (Requisito 9) ---------------- */

  function sameColor(a, b) {
    return a && b && a.h === b.h && a.s === b.s && a.v === b.v;
  }

  function pushHistory() {
    const current = getHsv();

    // 9.8: ignora duplicata consecutiva
    if (sameColor(state.history[state.historyIndex], current)) return;

    // 9.4: descarta o ramo de redo
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({ ...current, channels: state.channels ? { mode: state.channels.mode, vals: { ...state.channels.vals } } : null });

    // 9.1: limite de 50, descartando a mais antiga
    if (state.history.length > HISTORY_LIMIT) state.history.shift();

    state.historyIndex = state.history.length - 1;
    emit('history');
  }

  function canUndo() { return state.historyIndex > 0; }
  function canRedo() { return state.historyIndex < state.history.length - 1; }

  function undo() {
    if (!canUndo()) return;
    state.historyIndex -= 1;
    const entry = state.history[state.historyIndex];
    state.hsv = { h: entry.h, s: entry.s, v: entry.v };
    state.channels = entry.channels || null;
    state.tempOffset = 0;
    emit('color');
    emit('history');
  }

  function redo() {
    if (!canRedo()) return;
    state.historyIndex += 1;
    const entry = state.history[state.historyIndex];
    state.hsv = { h: entry.h, s: entry.s, v: entry.v };
    state.channels = entry.channels || null;
    state.tempOffset = 0;
    emit('color');
    emit('history');
  }

  /* ---------------- Harmonia ---------------- */

  function getScheme() {
    return HARMONY_SCHEMES.find((s) => s.id === state.scheme) || HARMONY_SCHEMES[0];
  }

  function setScheme(id) {
    if (!HARMONY_SCHEMES.some((s) => s.id === id)) return;
    const anterior = state.scheme;
    state.scheme = id;

    /**
     * Trocar de esquema muda quantos secundários existem. Um índice ativo que
     * não existe mais deixaria a âncora sendo tratada como principal sem aviso,
     * e o esquema saltaria na primeira mudança de cor. Voltar ao principal é o único
     * estado que todo esquema tem.
     */
    const offs = getHarmonyOffsets();
    if (state.activeSecondary !== null && state.activeSecondary >= offs.length) {
      state.activeSecondary = null;
    }

    /**
     * Ao trocar de esquema a âncora passa a ser a cor atual, para o esquema
     * novo nascer em volta do que o artista está usando. Só quando o esquema
     * realmente muda: repetir o mesmo id não deve mexer em nada.
     */
    if (anterior !== id) {
      state.activeSecondary = null;
      state.refHue = state.hsv.h;
    }

    emit('scheme');
  }

  // Normaliza um offset para o intervalo (-180, 180], afastado do principal
  function normalizeOffset(deg) {
    let d = ((deg % 360) + 360) % 360;
    if (d > 180) d -= 360;
    if (Math.abs(d) < MIN_HARMONY_GAP) d = d < 0 ? -MIN_HARMONY_GAP : MIN_HARMONY_GAP;
    return d;
  }

  /** Diferença angular mais curta entre dois offsets, com sinal. */
  function angleDelta(a, b) {
    let d = ((a - b) % 360 + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  /** Coloca um ângulo em (-180, 180], sem afastar do matiz principal. */
  function wrapDeg(deg) {
    let d = ((deg % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  /** Coloca um ângulo em [0, 360). */
  function wrap360(deg) {
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Afasta os braços que ficaram colados, para nenhum marcador cobrir outro.
   *
   * Dois marcadores no mesmo ponto da pista deixam um deles inalcançável: o
   * clique acerta sempre o mesmo e o esquema parece travado.
   *
   * O braço movido manda e fica onde foi pedido. Os demais são resolvidos do
   * mais próximo dele para o mais distante, e cada um precisa respeitar
   * distância do matiz principal, do braço movido E dos que já foram
   * acomodados. Conferir só contra o braço movido não basta: ao varrer um braço
   * pela volta, os empurrões acumulavam e dois vizinhos acabavam a 8° um do
   * outro.
   */
  function keepApart(offsets, index) {
    const fixo = wrapDeg(offsets[index]);
    const resultado = offsets.slice();

    // O matiz principal ocupa o offset zero e também disputa espaço.
    const ocupados = [0, fixo];

    const livre = (cand) => ocupados.every(
      (o) => Math.abs(angleDelta(cand, o)) >= MIN_HARMONY_GAP - 1e-9
    );

    offsets
      .map((off, i) => ({ i: i, off: wrapDeg(off) }))
      .filter((e) => e.i !== index)
      .sort((a, b) => Math.abs(angleDelta(a.off, fixo)) - Math.abs(angleDelta(b.off, fixo)))
      .forEach((e) => {
        let escolhido = e.off;

        if (!livre(escolhido)) {
          /**
           * Empurrar em passos não serve: perto do matiz principal o braço é
           * empurrado para dentro da zona proibida, volta pelo mínimo e conflita
           * de novo, oscilando. Aqui as posições possíveis são enumeradas — as
           * duas bordas de cada vaga ocupada — e escolhe-se a válida mais
           * próxima de onde o braço estava. Ele cede para o lado que tem espaço,
           * mesmo que seja o outro.
           */
          const candidatos = [];
          ocupados.forEach((o) => {
            candidatos.push(wrapDeg(o + MIN_HARMONY_GAP));
            candidatos.push(wrapDeg(o - MIN_HARMONY_GAP));
          });

          const validos = candidatos
            .filter(livre)
            .sort((a, b) => Math.abs(angleDelta(a, e.off)) - Math.abs(angleDelta(b, e.off)));

          if (validos.length) escolhido = validos[0];
        }

        resultado[e.i] = escolhido;
        ocupados.push(escolhido);
      });

    return resultado;
  }

  /* ---------------- Abertura dos esquemas ajustáveis (φ) ---------------- */

  /** Definição de φ do esquema ativo, ou null se a forma é rígida. */
  function phiDef(id) {
    return SCHEME_PHI[id || getScheme().id] || null;
  }

  /** O esquema ativo tem abertura ajustável? */
  function hasPhi() {
    return phiDef() !== null;
  }

  /** Ângulo de abertura do esquema ativo. Zero quando a forma é rígida. */
  function getPhi(id) {
    const alvo = id || getScheme().id;
    return SCHEME_PHI[alvo] ? state.schemePhi[alvo] : 0;
  }

  /** Define a abertura de um esquema, dentro da faixa dele. */
  function setPhi(id, deg) {
    const def = SCHEME_PHI[id];
    if (!def || !isNum(deg)) return;

    state.schemePhi[id] = clampPhi(deg, def);
    emit('scheme');
  }

  /**
   * O que acontece ao arrastar o braço `index`: 'phi' ajusta a abertura,
   * 'fixed' gira o conjunto, 'free' é o ajuste solto dos esquemas sem φ.
   */
  function armRole(index) {
    const def = phiDef();
    if (!def) return 'free';
    return def.arms[index] === 'phi' ? 'phi' : 'fixed';
  }

  // Offsets em uso: derivados de φ, ajustados à mão, ou os canônicos
  function getHarmonyOffsets() {
    const scheme = getScheme();
    const def = SCHEME_PHI[scheme.id];
    // Esquemas ajustáveis não têm offsets soltos: a forma inteira vem de φ.
    if (def) return def.offsets(state.schemePhi[scheme.id]);
    const custom = state.harmonyOffsets[scheme.id];
    return custom ? custom.slice() : scheme.offsets.slice();
  }

  function setHarmonyOffset(index, deg) {
    const scheme = getScheme();
    if (index < 0 || index >= scheme.offsets.length) return;

    const def = SCHEME_PHI[scheme.id];

    /**
     * Nos esquemas ajustáveis não existe ajuste individual, e isso é a própria
     * definição deles. Mover um braço sozinho desmancharia a relação que dá
     * nome ao esquema: a simetria do análogo, o complementar do acentuado, a
     * oposição dos eixos do tetrádico.
     *
     * Um pedido sobre um braço de abertura vira ajuste de φ. Sobre um braço
     * estrutural é ignorado — quem quiser mover aquele marcador está querendo
     * girar o conjunto, e quem trata isso é o wheel.js.
     */
    if (def) {
      if (def.arms[index] !== 'phi') return;
      setPhi(scheme.id, def.phiFrom(index, deg));
      return;
    }

    const offsets = getHarmonyOffsets();
    offsets[index] = normalizeOffset(deg);
    state.harmonyOffsets[scheme.id] = keepApart(offsets, index);
    emit('scheme');
  }

  /**
   * Abre ou fecha o esquema a partir de um braço.
   *
   * Nos esquemas ajustáveis isso é exatamente ajustar φ, e a forma se mantém
   * por construção: o análogo continua simétrico, o acentuado mantém o
   * complementar em 180 e o tetrádico mantém os dois eixos opostos.
   *
   * A versão anterior escalava cada braço por um fator e tentava reconhecer
   * papéis ("este é o espelho", "este é o complementar") a cada arraste. Era
   * frágil e vazava: no acentuado, arrastar o braço complementar caía no ajuste
   * individual e o tirava dos 180°, desmanchando o acento. Com a forma derivada
   * de um único ângulo, esse estado não é representável.
   */
  function spreadHarmony(index, deg) {
    const scheme = getScheme();
    if (index < 0 || index >= scheme.offsets.length) return;
    setHarmonyOffset(index, deg);
  }

  // Um braço é o eixo complementar quando aponta para o lado oposto do matiz.
  function isOpposite(off) {
    const d = ((off % 360) + 360) % 360;
    return Math.abs(d - 180) < 1e-6;
  }

  // Volta o esquema ativo à forma canônica
  function resetHarmony() {
    const scheme = getScheme();
    const def = SCHEME_PHI[scheme.id];
    // Esquemas ajustáveis são definidos por φ: restaurar é voltar à abertura padrão.
    if (def) state.schemePhi[scheme.id] = def.def;
    delete state.harmonyOffsets[scheme.id];
    emit('scheme');
  }

  function isHarmonyEdited() {
    const scheme = getScheme();
    const def = SCHEME_PHI[scheme.id];
    if (def) return Math.abs(state.schemePhi[scheme.id] - def.def) > 1e-9;

    const custom = state.harmonyOffsets[scheme.id];
    if (!custom) return false;
    return custom.some((off, i) => Math.abs(off - scheme.offsets[i]) > 1e-9);
  }

  /**
   * Adota a cor de um marcador secundário, sem mover a constelação
   * (Requisito 3.4).
   *
   * Este é o gesto que estava defeituoso: um clique num secundário girava o
   * esquema inteiro, e o clique seguinte girava de novo, num ciclo que
   * destruía a composição. A causa era o marcador principal SER a cor — adotar
   * um secundário o promovia a principal e os demais se recolocavam em torno
   * dele.
   *
   * Agora a ordem é: primeiro marca quem está ativo, depois grava a cor. Com um
   * secundário ativo, `setHsv` não toca na âncora — logo a figura fica parada
   * por construção, em qualquer esquema e com qualquer φ. Deixou de ser um caso
   * especial resolvido por simetria, que era o que falhava no análogo.
   */
  function adoptHarmonyMarker(index) {
    const offsets = getHarmonyOffsets();
    if (index < 0 || index >= offsets.length) return;

    const hues = getHarmonyHues();
    const hsv = getHsv();

    // A ordem importa: marcar o ativo ANTES de setHsv é o que impede a âncora
    // de acompanhar a cor nova.
    setActiveMarker(index);
    setHsv({ h: hues[index], s: hsv.s, v: hsv.v }, { commit: true });
  }

  /**
   * Matizes secundários do esquema ativo (Requisito 3.2).
   *
   * Os offsets são ÂNGULOS NA RODA, não diferenças de matiz. É essa distinção
   * que faz a teoria das cores mudar junto com o espaço escolhido: um
   * complementar é "meia volta na roda", e meia volta a partir do vermelho cai
   * no ciano na roda RGB e no verde na roda do pintor.
   */
  function getHarmonyHues() {
    const base = hueToAngle(state.refHue);
    return getHarmonyOffsets().map((off) => angleToHue(base + off));
  }

  /** Matiz do marcador principal — onde a âncora aparece na roda. */
  function getRefHue() {
    return state.refHue;
  }

  /**
   * Move a âncora para um matiz. É o ÚNICO caminho que gira a constelação, e
   * existe separado de `setHsv` de propósito: escrever cor e girar o esquema
   * são intenções diferentes, e confundi-las foi a origem do salto.
   */
  function setRefHue(hue) {
    if (!isNum(hue)) return;
    state.refHue = wrap360(hue);
  }

  /**
   * Gira a constelação até que o marcador de índice `index` caia no ângulo
   * pedido. `null` como índice trata o principal.
   *
   * Corpo rígido: os ângulos relativos entre marcadores não mudam, só a
   * orientação do conjunto. Sem descontar o offset do marcador agarrado, o
   * principal iria direto para o cursor e a figura saltaria — era o defeito de
   * arrastar um secundário nos esquemas de forma fixa.
   */
  function rotateSetTo(angle, index) {
    if (!isNum(angle)) return;
    const offs = getHarmonyOffsets();
    const off = (index === null || index === undefined) ? 0 : (offs[index] || 0);
    setRefHue(angleToHue(angle - off));
  }

  /**
   * Escolhe qual marcador está ativo, sem tocar na geometria.
   * `null` volta ao principal.
   */
  function setActiveMarker(index) {
    if (index === null) { state.activeSecondary = null; return; }
    const offs = getHarmonyOffsets();
    if (!(index >= 0 && index < offs.length)) return;
    state.activeSecondary = index;
  }

  /* ---------------- Outros ---------------- */

  function setSliderMode(mode) {
    state.sliderMode = mode;
    emit('mode');
  }

  /* ---------------- Espaço do círculo cromático (RGB / RYB) ---------------- */

  const WHEEL_SPACES = ['rgb', 'ryb'];

  function setWheelSpace(id) {
    if (!WHEEL_SPACES.includes(id)) return;
    state.wheelSpace = id;
    emit('wheelSpace');
  }

  /**
   * Conversores entre MATIZ (o valor real de H, que define a cor) e ÂNGULO NA
   * RODA (onde esse matiz aparece na tela).
   *
   * No espaço RGB os dois coincidem e as funções são identidade. No RYB a roda
   * é reordenada para a do pintor, e é esta única dupla de funções que carrega
   * a diferença — todo o resto do programa (desenho do anel, posição dos
   * marcadores, escolha por clique, harmonias, quantização, disco do gamut)
   * fala em termos delas em vez de assumir que ângulo é matiz.
   *
   * Concentrar a conversão aqui é o que evita o modo RYB "meio aplicado": se
   * cada consumidor fizesse a própria conta, bastaria um esquecer para os
   * marcadores caírem fora do anel que eles deveriam indicar.
   */
  function hueToAngle(hue) {
    return state.wheelSpace === 'ryb' ? C.hueToRyb(hue) : wrap360(hue);
  }

  function angleToHue(angle) {
    return state.wheelSpace === 'ryb' ? C.rybToHue(angle) : wrap360(angle);
  }

  /* ---------------- Rotação da roda e forma do seletor ---------------- */

  const SHAPES = ['triangle', 'square', 'disc'];

  /**
   * Gira o anel de matiz. `snap` em graus arredonda para o múltiplo mais
   * próximo (15 e 60 são os passos usados no arraste com Shift e Ctrl).
   */
  function setWheelRotation(deg, snap) {
    let next = deg;
    if (snap && snap > 0) next = Math.round(next / snap) * snap;
    state.wheelRotation = ((next % 360) + 360) % 360;
    emit('rotation');
  }

  function nudgeWheelRotation(delta, snap) {
    setWheelRotation(state.wheelRotation + delta, snap);
  }

  function resetWheelRotation() {
    setWheelRotation(0);
  }

  function setShape(next) {
    if (!SHAPES.includes(next)) return;
    state.shape = next;
    emit('shape');
  }

  /* ---------------- Máscara de gamut ---------------- */

  const DEG = Math.PI / 180;
  const EPS = 1e-9;

  /**
   * Formatos clássicos de gamut mask. Cada um é definido no espaço unitário
   * (círculo de raio 1), e depois esticado por rx/ry, rotacionado e
   * transladado. Assim inside/clamp valem para todos os formatos sem
   * duplicar a matemática de transformação.
   */
  const MASK_KINDS = ['triangle', 'rect', 'ellipse', 'diamond', 'dual', 'hexagon'];

  function polygonOnCircle(sides, startDeg) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = (startDeg + (i * 360) / sides) * DEG;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return pts;
  }

  // Losango de eixo longo vertical
  const DIAMOND = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  // Dois lobos separados: um dominante e um de apoio
  const DUAL_CIRCLES = [
    { cx: 0, cy: -0.42, r: 0.55 },
    { cx: 0, cy: 0.62, r: 0.30 }
  ];

  const MASK_SHAPES = {
    triangle: { type: 'polygon', points: polygonOnCircle(3, -90) },
    rect:     { type: 'polygon', points: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }] },
    ellipse:  { type: 'ellipse' },
    diamond:  { type: 'polygon', points: DIAMOND },
    dual:     { type: 'circles', circles: DUAL_CIRCLES },
    hexagon:  { type: 'polygon', points: polygonOnCircle(6, -90) }
  };

  /**
   * A forma em uso. Quando o usuário move um vértice, os pontos editados ficam
   * em `state.gamut.points` e passam a valer no lugar do formato canônico —
   * inside, clamp, contorno e alças todos leem daqui, então a edição livre não
   * precisa de matemática própria.
   *
   * Trocar de formato no rack ou restaurar a máscara descarta os pontos.
   */
  function maskShape(kind) {
    const custom = state.gamut && state.gamut.points;
    if (custom && custom.length >= 3) return { type: 'polygon', points: custom };
    return MASK_SHAPES[kind] || MASK_SHAPES.ellipse;
  }

  /** Vértices em uso, no espaço unitário, ou null se o formato não tiver. */
  function maskVertices() {
    const shape = maskShape(state.gamut.kind);
    return shape.type === 'polygon' ? shape.points.map((p) => ({ x: p.x, y: p.y })) : null;
  }

  /**
   * Move um vértice. O primeiro movimento congela o polígono do formato atual
   * em `points`, e a partir daí a figura é livre — rx, ry, ângulo e centro
   * continuam valendo, então redimensionar e girar seguem funcionando.
   *
   * Os pontos vivem no espaço unitário, limitados ao disco: a coordenada é
   * projetada para o espaço do disco via unitToDisc, e se o raio exceder 1
   * (fora da área útil da roda de cor) o ponto é normalizado de volta para
   * raio 1. Isso permite que vértices ultrapassem ±1 no espaço unitário
   * quando rx/ry são pequenos, desde que a projeção caiba no disco.
   */
  function setMaskVertex(index, x, y) {
    if (state.gamut.locked) return false;
    if (!isNum(x) || !isNum(y)) return false;

    const base = maskVertices();
    if (!base || index < 0 || index >= base.length) return false;

    // Clamp to the disc, not the bounding box
    const disc = unitToDisc(x, y);
    const r = Math.hypot(disc.u, disc.v);
    if (r > 1) {
      // Normalize to radius 1 and project back
      const clamped = discToUnit(disc.u / r, disc.v / r);
      x = clamped.x;
      y = clamped.y;
    }

    base[index] = { x, y };
    state.gamut.points = base;

    setGamut({});   // reaproveita a validação e o reenquadramento da cor
    return true;
  }

  function hasCustomMask() {
    return !!(state.gamut.points && state.gamut.points.length >= 3);
  }

  /** Volta ao polígono canônico do formato, mantendo tamanho e posição. */
  function resetMaskVertices() {
    if (state.gamut.locked) return false;
    if (!hasCustomMask()) return false;
    state.gamut.points = null;
    setGamut({});
    return true;
  }

  /**
   * Proporção inicial de cada formato. Usar a mesma para todos achata os
   * polígonos: um hexágono com rx 0.62 e ry 0.42 vira uma faixa amassada.
   */
  const MASK_DEFAULT_SIZE = {
    triangle: { rx: 0.62, ry: 0.62 },
    rect:     { rx: 0.72, ry: 0.24 },
    ellipse:  { rx: 0.64, ry: 0.42 },
    diamond:  { rx: 0.36, ry: 0.74 },
    dual:     { rx: 0.64, ry: 0.64 },
    hexagon:  { rx: 0.60, ry: 0.60 }
  };

  /**
   * Pontos garantidamente dentro da máscara, no espaço unitário. Servem de
   * porto seguro quando a borda projetada cai numa saturação inalcançável.
   * Formatos de regiões separadas, como os dois lobos, precisam de uma
   * âncora por região — o centro geral pode não pertencer a nenhuma delas.
   */
  function maskAnchorsUnit(kind) {
    const shape = maskShape(kind);
    if (shape.type === 'circles') return shape.circles.map((c) => ({ x: c.cx, y: c.cy }));
    if (shape.type === 'polygon') {
      const n = shape.points.length;
      const cx = shape.points.reduce((sum, p) => sum + p.x, 0) / n;
      const cy = shape.points.reduce((sum, p) => sum + p.y, 0) / n;
      return [{ x: cx, y: cy }];
    }
    return [{ x: 0, y: 0 }];
  }

  /* --- geometria no espaço unitário --- */

  function pointInPolygon(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      const straddles = (a.y > y) !== (b.y > y);
      if (straddles && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function nearestOnSegment(ax, ay, bx, by, px, py) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : C.clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t };
  }

  function nearestOnPolygon(pts, x, y) {
    let best = null, bestD = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const q = nearestOnSegment(pts[j].x, pts[j].y, pts[i].x, pts[i].y, x, y);
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bestD) { bestD = d; best = q; }
    }
    return best;
  }

  function unitInside(kind, x, y) {
    const shape = maskShape(kind);

    if (shape.type === 'ellipse') return x * x + y * y <= 1 + EPS;
    if (shape.type === 'polygon') {
      if (pointInPolygon(shape.points, x, y)) return true;
      // pontos exatamente na borda contam como dentro
      const q = nearestOnPolygon(shape.points, x, y);
      return Math.hypot(q.x - x, q.y - y) <= 1e-6;
    }
    return shape.circles.some((c) => Math.hypot(x - c.cx, y - c.cy) <= c.r + EPS);
  }

  function unitClamp(kind, x, y) {
    const shape = maskShape(kind);
    if (unitInside(kind, x, y)) return { x, y };

    if (shape.type === 'ellipse') {
      const d = Math.hypot(x, y);
      if (d === 0) return { x: 0, y: 0 };
      // encosta na borda com uma folga mínima para o teste de contenção
      const k = (1 - 1e-9) / d;
      return { x: x * k, y: y * k };
    }

    if (shape.type === 'polygon') return nearestOnPolygon(shape.points, x, y);

    // União de círculos: encosta no que estiver mais próximo
    let best = null, bestD = Infinity;
    shape.circles.forEach((c) => {
      const dx = x - c.cx, dy = y - c.cy;
      const d = Math.hypot(dx, dy);
      const k = d === 0 ? 0 : (c.r * (1 - 1e-9)) / d;
      const q = d === 0 ? { x: c.cx, y: c.cy } : { x: c.cx + dx * k, y: c.cy + dy * k };
      const dist = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (dist < bestD) { bestD = dist; best = q; }
    });
    return best;
  }

  /* --- transformações entre matiz/saturação e o espaço da máscara --- */

  /**
   * Matiz e saturação → coordenadas normalizadas do disco.
   * Matiz 0 fica no topo, como no anel: sem esse alinhamento a máscara
   * seria desenhada 90° fora de onde realmente restringe as cores.
   *
   * O ângulo é o da RODA, não o matiz cru: o disco encosta no anel e precisa
   * concordar com ele. Na roda do pintor, um matiz mora numa posição angular
   * diferente, e sem a conversão a máscara restringiria cores que não são as
   * que ela cobre na tela.
   */
  function hsToDisc(h, s) {
    const r = C.clamp(s, 0, 100) / 100;
    const a = (hueToAngle(h) - 90) * DEG;
    return { u: r * Math.cos(a), v: r * Math.sin(a) };
  }

  function discToHs(u, v) {
    const r = Math.hypot(u, v);
    const a = wrap360(Math.atan2(v, u) / DEG + 90);
    return { h: angleToHue(a), s: C.clamp(r * 100, 0, 100) };
  }

  // Ponto do disco no espaço unitário da máscara
  function discToUnit(u, v) {
    const g = state.gamut;
    const du = u - g.cx, dv = v - g.cy;
    const a = -g.angle * DEG;
    const x = du * Math.cos(a) - dv * Math.sin(a);
    const y = du * Math.sin(a) + dv * Math.cos(a);
    return { x: x / g.rx, y: y / g.ry };
  }

  function unitToDisc(x, y) {
    const g = state.gamut;
    const px = x * g.rx, py = y * g.ry;
    const a = g.angle * DEG;
    return {
      u: g.cx + (px * Math.cos(a) - py * Math.sin(a)),
      v: g.cy + (px * Math.sin(a) + py * Math.cos(a))
    };
  }

  function insideMask(h, s) {
    const g = state.gamut;
    if (g.rx <= 0 || g.ry <= 0) return false;
    const p = hsToDisc(h, s);
    const n = discToUnit(p.u, p.v);
    return unitInside(g.kind, n.x, n.y);
  }

  /**
   * Projeta matiz e saturação para dentro da máscara. Em polígonos usa o
   * ponto mais próximo da borda; em elipse e círculos, projeção radial.
   */
  function clampToMask(h, s) {
    const g = state.gamut;
    if (g.rx <= 0 || g.ry <= 0) return discToHs(g.cx, g.cy);

    const p = hsToDisc(h, s);
    const n = discToUnit(p.u, p.v);
    if (unitInside(g.kind, n.x, n.y)) return { h, s };

    const q = unitClamp(g.kind, n.x, n.y);
    const back = unitToDisc(q.x, q.y);

    // A saturação não passa de 100: parte da máscara pode cair numa região
    // inalcançável do disco. Nesse caso recolhe em direção à âncora mais
    // próxima, que setGamut garante ser sempre alcançável.
    if (Math.hypot(back.u, back.v) <= 1 + EPS) return discToHs(back.u, back.v);

    const STEPS = 48;
    let best = null, bestD = Infinity;

    maskAnchorsUnit(g.kind).forEach((anchor) => {
      const a = unitToDisc(anchor.x, anchor.y);
      if (Math.hypot(a.u, a.v) > 1 + EPS) return;

      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        const u = back.u + (a.u - back.u) * t;
        const v = back.v + (a.v - back.v) * t;
        if (Math.hypot(u, v) > 1 + EPS) continue;
        const un = discToUnit(u, v);
        if (!unitInside(g.kind, un.x, un.y)) continue;

        const d = (u - p.u) ** 2 + (v - p.v) ** 2;
        if (d < bestD) { bestD = d; best = { u, v }; }
        break;
      }
    });

    if (best) return discToHs(best.u, best.v);

    // Nenhuma âncora alcançável: devolve o ponto alcançável mais próximo
    const d = Math.hypot(back.u, back.v);
    return discToHs(back.u / d, back.v / d);
  }

  // A máscara é utilizável quando ao menos uma âncora tem saturação alcançável
  function hasReachableAnchor() {
    return maskAnchorsUnit(state.gamut.kind).some((anchor) => {
      const a = unitToDisc(anchor.x, anchor.y);
      return Math.hypot(a.u, a.v) <= 1 + EPS;
    });
  }

  // Contorno da máscara em coordenadas do disco, para desenho
  function maskOutline() {
    const g = state.gamut;
    const shape = maskShape(g.kind);

    if (shape.type === 'ellipse') return { type: 'ellipse' };
    if (shape.type === 'polygon') {
      return { type: 'polygon', points: shape.points.map((p) => unitToDisc(p.x, p.y)) };
    }
    return {
      type: 'circles',
      circles: shape.circles.map((c) => ({
        center: unitToDisc(c.cx, c.cy),
        // o raio é esticado por rx/ry; guardamos os dois para desenhar elipses
        rx: c.r * g.rx,
        ry: c.r * g.ry
      }))
    };
  }

  function applyGamutMask(hsv) {
    if (!state.gamut.enabled) return hsv;
    const fixed = clampToMask(hsv.h, hsv.s);
    return { h: fixed.h, s: fixed.s, v: hsv.v };
  }

  function setGamut(patch) {
    // Com a máscara travada, só o próprio travamento e o liga/desliga mudam
    if (state.gamut.locked) {
      const allowed = {};
      if ('locked' in patch) allowed.locked = patch.locked;
      if ('enabled' in patch) allowed.enabled = patch.enabled;
      if ('editing' in patch) allowed.editing = patch.editing;
      patch = allowed;
    }

    if ('kind' in patch && !MASK_KINDS.includes(patch.kind)) delete patch.kind;

    // Trocar de formato adota a proporção natural dele, a menos que o
    // chamador informe um tamanho explícito
    if ('kind' in patch && patch.kind !== state.gamut.kind
        && !('rx' in patch) && !('ry' in patch)) {
      Object.assign(patch, MASK_DEFAULT_SIZE[patch.kind]);
    }

    /**
     * Escolher um formato no rack descarta os vértices editados. Mantê-los
     * faria o rack não responder: a figura continuaria a mesma, porque os
     * pontos vencem o formato canônico.
     */
    if ('kind' in patch && patch.kind !== state.gamut.kind && !('points' in patch)) {
      patch.points = null;
    }

    Object.assign(state.gamut, patch);

    const g = state.gamut;
    g.rx = C.clamp(g.rx, 0.08, 1.4);
    g.ry = C.clamp(g.ry, 0.08, 1.4);

    const dist = Math.hypot(g.cx, g.cy);
    if (dist > 1) {
      g.cx /= dist;
      g.cy /= dist;
    }
    g.angle = ((g.angle % 360) + 360) % 360;

    // Recolhe o centro até a máscara voltar a ter uma região alcançável.
    // Sem isso é possível arrastá-la para uma saturação que não existe.
    for (let i = 0; i < 40 && !hasReachableAnchor(); i++) {
      g.cx *= 0.85;
      g.cy *= 0.85;
      if (Math.hypot(g.cx, g.cy) < 1e-6) { g.cx = 0; g.cy = 0; break; }
    }
    if (g.locked) g.editing = false;

    // Traz a cor atual para dentro da máscara recém-definida
    if (g.enabled) {
      const fixed = clampToMask(state.hsv.h, state.hsv.s);
      state.hsv = { h: fixed.h, s: fixed.s, v: state.hsv.v };
    }
    emit('gamut');
    emit('color');
  }

  function resetGamut() {
    const size = MASK_DEFAULT_SIZE[state.gamut.kind] || MASK_DEFAULT_SIZE.ellipse;
    // Restaurar devolve também a figura canônica, não só posição e tamanho.
    setGamut({ cx: 0, cy: 0, angle: 0, points: null, ...size });
  }

  // Move a máscara por um deslocamento em coordenadas do disco
  function nudgeGamut(du, dv) {
    setGamut({ cx: state.gamut.cx + du, cy: state.gamut.cy + dv });
  }

  /* ---------------- Travamento de luminosidade ---------------- */

  function luminosityOf(hsv) {
    const rgb = C.hsvToRgbFloat(hsv.h, hsv.s, hsv.v);
    return C.rgbToLab(rgb.r, rgb.g, rgb.b).L;
  }

  function setLuminosityLock(on) {
    state.lumLock = !!on;
    // Ao ligar, captura a luminosidade atual como referência
    state.lockedL = state.lumLock ? luminosityOf(state.hsv) : null;
    emit('lumlock');
  }

  /**
   * Ajusta V para que a cor atinja a luminosidade travada, mantendo H e S.
   * L cresce monotonicamente com V para H e S fixos, então busca binária
   * converge de forma estável.
   */
  function applyLuminosityLock(hsv) {
    if (!state.lumLock || state.lockedL === null) return hsv;

    const target = state.lockedL;
    let lo = 0, hi = 100;

    // Fora do alcance de V não há solução: fica no extremo mais próximo
    if (luminosityOf({ ...hsv, v: hi }) < target) return { ...hsv, v: hi };
    if (luminosityOf({ ...hsv, v: lo }) > target) return { ...hsv, v: lo };

    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (luminosityOf({ ...hsv, v: mid }) < target) lo = mid;
      else hi = mid;
    }
    return { ...hsv, v: (lo + hi) / 2 };
  }

  function setTempOffset(deg) {
    state.tempOffset = C.clamp(deg, -60, 60);
  }

  function swapForeground() {
    const fg = getRgb();
    const bg = state.background;
    state.background = fg;
    setRgb(bg.r, bg.g, bg.b, { commit: true });
  }

  // Semeia o histórico com a cor inicial
  pushHistory();

  return {
    HARMONY_SCHEMES, HUE_STEP_OPTIONS, BW_STEP_OPTIONS, BW_MIN, BW_MAX,
    state,
    subscribe, emit,
    getHsv, getRgb, getHex, getChannels,
    channelsToRgb, resolveChannels,
    setHsv, setRgb, setHex,
    pushHistory, canUndo, canRedo, undo, redo,
    getScheme, setScheme, getHarmonyHues,
    getHarmonyOffsets, setHarmonyOffset, spreadHarmony, resetHarmony, isHarmonyEdited, normalizeOffset,
    MIN_HARMONY_GAP, MAX_ANALOG_SPREAD, MAX_TETRA_SPREAD,
    adoptHarmonyMarker,
    getRefHue, setRefHue, rotateSetTo, setActiveMarker,
    SCHEME_PHI, hasPhi, getPhi, setPhi, armRole,
    TETRA_PHI_DEFAULT, TETRA_PHI_MIN, TETRA_PHI_MAX,
    setSliderMode, setTempOffset, swapForeground,
    quantizeHue, quantizeLevel, applyLimit, setLimit, getLimitedPalette,
    setBwSteps, getBwRamp,
    setValueCheck, display, displayCss,
    SHAPES, setWheelRotation, nudgeWheelRotation, resetWheelRotation, setShape,
    WHEEL_SPACES, setWheelSpace, hueToAngle, angleToHue,
    setLuminosityLock, luminosityOf, applyLuminosityLock,
    MASK_KINDS, MASK_SHAPES, MASK_DEFAULT_SIZE, maskShape, maskOutline,
    maskAnchorsUnit, hasReachableAnchor,
    unitInside, unitClamp, discToUnit, unitToDisc,
    hsToDisc, discToHs, insideMask, clampToMask, applyGamutMask,
    setGamut, resetGamut, nudgeGamut,
    maskVertices, setMaskVertex, hasCustomMask, resetMaskVertices
  };
})();
