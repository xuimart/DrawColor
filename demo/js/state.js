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
    sliderMode: 'HSV',
    tempOffset: 0,
    // Rotação do anel de matiz, em graus. Só afeta a apresentação:
    // o matiz da cor continua sendo o valor real de H.
    wheelRotation: 0,
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

  // Encaixa o matiz no centro do setor mais próximo
  function quantizeHue(h, steps) {
    const size = 360 / steps;
    return (((Math.round(h / size) * size) % 360) + 360) % 360;
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

  // Paleta completa disponível sob o limite atual (útil para preview e export)
  function getLimitedPalette() {
    if (!state.limit.enabled) return null;
    const hues = [];
    for (let i = 0; i < state.limit.hueSteps; i++) {
      hues.push((i * 360) / state.limit.hueSteps);
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
    state.scheme = id;
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

  // Offsets em uso: os ajustados pelo usuário, ou os canônicos do esquema
  function getHarmonyOffsets() {
    const scheme = getScheme();
    const custom = state.harmonyOffsets[scheme.id];
    return custom ? custom.slice() : scheme.offsets.slice();
  }

  function setHarmonyOffset(index, deg) {
    const scheme = getScheme();
    if (index < 0 || index >= scheme.offsets.length) return;

    const offsets = getHarmonyOffsets();
    offsets[index] = normalizeOffset(deg);
    state.harmonyOffsets[scheme.id] = keepApart(offsets, index);
    emit('scheme');
  }

  /**
   * Abre ou fecha o esquema inteiro a partir de um braço.
   *
   * Mover um marcador sozinho é útil para ajuste fino, mas desfaz a
   * composição: um análogo deixa de ser simétrico na primeira arrastada. Aqui
   * todos os braços escalam pelo mesmo fator, então a relação entre eles é
   * preservada — o análogo continua simétrico, o tetrádico continua espaçado
   * por igual, e o par complementar continua oposto.
   *
   * Cada braço é tratado conforme o papel que exerce na composição:
   *
   *   - o espelho do braço arrastado vai para o espelho do novo ângulo. É o
   *     que mantém a simetria do análogo e do triádico.
   *   - o eixo complementar (~180) fica parado. Ele é o eixo da composição,
   *     não uma abertura: girá-lo desfaz a leitura de um análogo acentuado.
   *   - os demais escalam pelo fator k = novo / atual.
   *
   * O espelho é resolvido antes da proporção de propósito. No tetrádico o
   * terceiro braço está gravado como 270, e escalá-lo por 0,5 daria 135 —
   * desmanchando o quadrado. Reconhecido como espelho de 90, ele vai para
   * -45 e a figura continua simétrica em torno do eixo.
   */
  function spreadHarmony(index, deg) {
    const scheme = getScheme();
    if (index < 0 || index >= scheme.offsets.length) return;

    const offsets = getHarmonyOffsets();
    const atual = offsets[index];
    const alvo = normalizeOffset(deg);

    // Sem referência de abertura não há fator: cai no ajuste individual.
    if (Math.abs(atual) < 1e-6 || isOpposite(atual)) {
      setHarmonyOffset(index, deg);
      return;
    }

    const k = alvo / atual;
    const espelho = normalizeOffset(-atual);

    const escalados = offsets.map((off, i) => {
      if (i === index) return alvo;
      if (isOpposite(off)) return off;
      if (Math.abs(normalizeOffset(off) - espelho) < 1e-6) return normalizeOffset(-alvo);
      return normalizeOffset(off * k);
    });

    state.harmonyOffsets[scheme.id] = keepApart(escalados, index);

    emit('scheme');
  }

  // Um braço é o eixo complementar quando aponta para o lado oposto do matiz.
  function isOpposite(off) {
    const d = ((off % 360) + 360) % 360;
    return Math.abs(d - 180) < 1e-6;
  }

  // Volta o esquema ativo aos ângulos canônicos
  function resetHarmony() {
    delete state.harmonyOffsets[getScheme().id];
    emit('scheme');
  }

  function isHarmonyEdited() {
    const scheme = getScheme();
    const custom = state.harmonyOffsets[scheme.id];
    if (!custom) return false;
    return custom.some((off, i) => Math.abs(off - scheme.offsets[i]) > 1e-9);
  }

  // Matizes secundários do esquema ativo (Requisito 3.2)
  function getHarmonyHues() {
    return getHarmonyOffsets().map((off) => (((state.hsv.h + off) % 360) + 360) % 360);
  }

  /* ---------------- Outros ---------------- */

  function setSliderMode(mode) {
    state.sliderMode = mode;
    emit('mode');
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
   */
  function hsToDisc(h, s) {
    const r = C.clamp(s, 0, 100) / 100;
    const a = (h - 90) * DEG;
    return { u: r * Math.cos(a), v: r * Math.sin(a) };
  }

  function discToHs(u, v) {
    const r = Math.hypot(u, v);
    let h = Math.atan2(v, u) / DEG + 90;
    h = ((h % 360) + 360) % 360;
    return { h, s: C.clamp(r * 100, 0, 100) };
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
    MIN_HARMONY_GAP,
    setSliderMode, setTempOffset, swapForeground,
    quantizeHue, quantizeLevel, applyLimit, setLimit, getLimitedPalette,
    setBwSteps, getBwRamp,
    setValueCheck, display, displayCss,
    SHAPES, setWheelRotation, nudgeWheelRotation, resetWheelRotation, setShape,
    setLuminosityLock, luminosityOf, applyLuminosityLock,
    MASK_KINDS, MASK_SHAPES, MASK_DEFAULT_SIZE, maskShape, maskOutline,
    maskAnchorsUnit, hasReachableAnchor,
    unitInside, unitClamp, discToUnit, unitToDisc,
    hsToDisc, discToHs, insideMask, clampToMask, applyGamutMask,
    setGamut, resetGamut, nudgeGamut,
    maskVertices, setMaskVertex, hasCustomMask, resetMaskVertices
  };
})();
