/**
 * layout.js — Fonte única do Layout_De_Referência (Requisitos 1 a 7).
 *
 * Todo número deste arquivo está no Reference_Space: 628 x 907 unidades,
 * origem no canto superior esquerdo do painel. O CSS expressa as medidas
 * fixas em `--u` (uma unidade de referência em px) e este módulo posiciona
 * os controles móveis a partir da tabela de âncoras.
 *
 * Convenção de âncora: ângulo em graus, 0 no topo, crescendo no sentido
 * horário; raio em unidades de referência a partir do Wheel_Center.
 *   x = cx + raio * sin(ângulo) * escala
 *   y = cy - raio * cos(ângulo) * escala
 *
 * O editor de arraste (Requisitos 8 a 12) vai escrever direto em ANCHORS e
 * chamar applyLayout() — nenhuma posição de controle móvel vive no CSS.
 */
window.LAYOUT = (function () {
  'use strict';

  const DEG = Math.PI / 180;

  const REFERENCE = {
    width: 628,
    height: 907,
    wheelCenter: { x: 325, y: 352 },
    outerR: 213,
    innerR: 178
  };

  const MIN_EFFECTIVE_WIDTH = 320;
  const MAX_EFFECTIVE_WIDTH = 1200;

  /**
   * Requisito 4: âncoras derivadas do Figma_Reference_Frame.
   */
  /**
   * Organização desenhada no Figma e convertida por build/figma-to-anchors.js.
   *
   * A tabela anterior vinha de um mock que replicava o Coolorus, e a semelhança
   * incomodava. Nesta, as harmonias formam uma coluna à direita, o trilho de
   * conferência e os dials sobem para a faixa livre do topo, forma e máscara
   * vão para a esquerda e o hex fica no canto superior esquerdo.
   *
   * O comentário ao lado de cada linha é o ponto no espaço de referência, que é
   * o que se enxerga no Figma; o par ângulo e raio é o que o código usa, para a
   * posição acompanhar a escala do painel.
   */
  const ANCHORS = {
    // Revisão do usuário (v1.0.3): harmonias mais espaçadas (passo 66) e
    // maiores; dials T e B no canto superior direito, em cima da coluna de
    // harmonias; conferência e luminosidade centradas sobre a roda; forma e
    // máscara um pouco mais afastadas entre si.
    'harmony.1':             { angle: 60.47, radius: 294.2 },   // (581, 207)
    'harmony.2':             { angle: 72.85, radius: 267.9 },   // (581, 273)
    'harmony.3':             { angle: 87.09, radius: 256.3 },   // (581, 339)
    'harmony.4':             { angle: 101.70, radius: 261.4 },  // (581, 405)
    'harmony.5':             { angle: 114.93, radius: 282.3 },  // (581, 471)
    'harmony.6':             { angle: 125.85, radius: 315.8 },  // (581, 537)
    'sat.gamutmask':         { angle: 268.98, radius: 282.0 },  // ( 43, 357)
    'sat.shape':             { angle: 287.33, radius: 295.4 },  // ( 43, 264)
    'hex.field':             { angle: 301.82, radius: 302.5 },  // ( 68, 193)
    'history.redo':          { angle: 227.49, radius: 295.8 },  // (107, 552)
    'history.undo':          { angle: 234.06, radius: 340.8 },  // ( 49, 552)
    'rail.dial.temperature': { angle: 36.40, radius: 316.8 },   // (513,  97)
    'rail.dial.brightness':  { angle: 44.89, radius: 359.9 },   // (579,  97) alinhado com as harmonias
    'rail.lumlock':          { angle: 10.87, radius: 254.6 },   // (373, 102)
    'rail.valuecheck':       { angle: 354.29, radius: 251.2 },  // (300, 102)
    'swatch.fg':             { angle: 312.13, radius: 339.8 },  // ( 73, 124)
    'swatch.bg':             { angle: 319.94, radius: 287.4 },  // (140, 132)
    'swatch.swap':           { angle: 323.60, radius: 340.4 }   // (123,  78)
  };

  /**
   * Controles sem âncora própria na referência, posicionados ao lado do dono.
   *
   * Editar e travar a máscara moravam aqui, em 98.2° e 91.0° no raio 272. Não
   * cabiam: entre harmony.6 (79.6°) e sat.gamutmask (106.43°) há cerca de 127
   * unidades de arco, e três botões de 34 mais as metades dos vizinhos pedem
   * 146. No tamanho de referência eles já se tocavam, e com qualquer redução
   * de escala empilhavam de vez — os botões têm tamanho mínimo em px, a
   * distância entre eles não. Agora são um popout ancorado no próprio botão da
   * máscara, junto com o botão de restaurar.
   */
  const ADJACENT = {};

  /* ---------------- Anchor_Model (Requisito 3) ---------------- */

  function anchorToPoint(anchor, center, scale) {
    const s = scale === undefined || scale === null ? 1 : scale;
    const a = anchor.angle * DEG;
    return {
      x: center.x + anchor.radius * Math.sin(a) * s,
      y: center.y - anchor.radius * Math.cos(a) * s
    };
  }

  function pointToAnchor(point, center, scale) {
    const s = scale === undefined || scale === null ? 1 : scale;
    const dx = (point.x - center.x) / s;
    const dy = (point.y - center.y) / s;
    let angle = Math.atan2(dx, -dy) / DEG;
    if (angle < 0) angle += 360;
    return { angle, radius: Math.hypot(dx, dy) };
  }

  /* ------------ Normalization & Bounds (Requisitos 3, 7, 8) ------------ */

  function normalizeAnchor(anchor) {
    var angle = ((anchor.angle % 360) + 360) % 360;
    var radius = Math.max(0, Math.min(700, anchor.radius));
    return { angle: angle, radius: radius };
  }

  function clampAnchorToBounds(anchor, controlSize, scale) {
    var s = scale === undefined || scale === null ? 1 : scale;
    var point = anchorToPoint(anchor, REFERENCE.wheelCenter, s);
    var half = controlSize / 2;
    var maxX = REFERENCE.width * s - half;
    var maxY = REFERENCE.height * s - half;
    var cx = Math.max(half, Math.min(maxX, point.x));
    var cy = Math.max(half, Math.min(maxY, point.y));
    return pointToAnchor({ x: cx, y: cy }, REFERENCE.wheelCenter, s);
  }

  /* ---------------- Scale_Controller (Requisito 7) ---------------- */

  let currentScale = 1;

  /**
   * Deslocamento horizontal da área da roda, em px.
   *
   * A escala é min(largura, altura útil). Num painel largo e baixo quem manda
   * é a altura: a roda encolhe, mas a área de referência (628 unidades) fica
   * mais estreita que o painel. Antes ela ficava presa à esquerda e a sobra ia
   * toda para a direita — um vão enorme ao lado dos satélites. Com o
   * deslocamento, o conjunto (roda, swatches, satélites, hex) é centralizado
   * no espaço que sobra.
   *
   * Entra em centerPx(), então tudo que é posicionado por âncora acompanha, e
   * o editor de layout continua convertendo o ponteiro certo. O CSS lê o mesmo
   * valor em --ox para o que é posicionado por coordenada (a roda e a barra
   * de valor).
   */
  let currentOffsetX = 0;

  /**
   * Deslocamento vertical, em px. Só é diferente de zero na disposição lado a
   * lado, em que a roda ocupa a altura inteira e é centralizada nela.
   */
  let currentOffsetY = 0;

  /** Último plano aplicado (ver computePlan). */
  let currentPlan = null;

  function panel() {
    return document.getElementById('panel');
  }

  /**
   * Mede a largura do contêiner pai (.demo-shell). Esse elemento preenche
   * a viewport e serve de referência estável para a escala.
   */
  function availableWidth(el) {
    const host = el && el.parentElement;
    if (host && host.clientWidth > 0) return host.clientWidth;
    return window.innerWidth;
  }

  /**
   * Altura de referência da área que escala: Y 0 a 608, ou seja cabeçalho,
   * swatches, roda e barra de valor. Abaixo disso ficam abas, conteúdo e
   * status, que são ancorados no rodapé e têm altura mínima em px — eles não
   * acompanham a escala, então não entram nesta conta.
   */
  const TOP_REFERENCE_HEIGHT = 608;

  /**
   * Piso da escala. Existe só para a roda não desaparecer, não para proteger
   * tamanho de botão.
   *
   * A interface encolhe inteira e junto, como no Coolorus: os controles do arco
   * têm tamanho proporcional, sem piso em px, então tamanho e distância caem
   * pelo mesmo fator e a sobreposição fica impossível em qualquer escala. Um
   * piso alto aqui era o que forçava a área de cima a não caber no painel e
   * fazia aparecer barra de rolagem.
   */
  const MIN_SCALE = 0.25;

  /**
   * Escala = min(largura/628, altura útil/608).
   *
   * `reservedH` é a altura ocupada pela faixa de baixo. Sem ela a conta usaria
   * a altura inteira do painel contra as 907 unidades da referência, o que
   * pressupõe que a faixa de baixo encolhe junto — e ela não encolhe mais.
   * Num painel largo e baixo essa diferença é exatamente o que fazia a roda
   * ser cortada.
   *
   * Sem altura (demo sem restrição vertical), decide só pela largura.
   */
  function computeScale(availW, availH, reservedH) {
    const clamped = Math.min(Math.max(availW, MIN_EFFECTIVE_WIDTH), MAX_EFFECTIVE_WIDTH);
    var scaleW = clamped / REFERENCE.width;

    // O piso vale em todos os caminhos. Antes o retorno por largura escapava
    // dele, e a garantia de alvo de clique dependia de sorte aritmética.
    if (!availH || availH <= 0) return Math.max(scaleW, MIN_SCALE);

    var scaleH;
    if (reservedH && reservedH > 0) {
      var topH = availH - reservedH;
      scaleH = topH > 0 ? topH / TOP_REFERENCE_HEIGHT : MIN_SCALE;
    } else {
      scaleH = availH / REFERENCE.height;
    }

    return Math.max(Math.min(scaleW, scaleH), MIN_SCALE);
  }

  /**
   * Altura da faixa de baixo, medida no DOM. As alturas dela têm piso em px e
   * um termo que acompanha a escala, então existe realimentação: mudar a
   * escala muda um pouco a reserva. Uma passada só é suficiente porque na
   * situação que importa — painel apertado — o piso em px domina e a reserva
   * fica estável.
   *
   * A lista precisa cobrir TODA linha da faixa. O bloco "Limitar cores"
   * (`.limit-panel`) entrou na faixa depois e ficou de fora daqui: a escala
   * reservava menos espaço do que a faixa ocupava, e a diferença empurrava a
   * linha MODE para além da borda inferior do painel, que tem overflow:hidden
   * no CEP. O sintoma era o conteúdo dos sliders cortado na base.
   */
  function reservedBottomHeight(el) {
    var total = 0;
    ['.limit-panel', '.tabs', '.tab-body', '.status-bar'].forEach(function (sel) {
      var node = el.querySelector(sel);
      if (node && node.offsetHeight > 0) total += node.offsetHeight;
    });
    return total;
  }

  function scale() {
    return currentScale;
  }

  function centerPx() {
    return {
      x: currentOffsetX + REFERENCE.wheelCenter.x * currentScale,
      y: currentOffsetY + REFERENCE.wheelCenter.y * currentScale
    };
  }

  function offsetX() {
    return currentOffsetX;
  }

  function offsetY() {
    return currentOffsetY;
  }

  /**
   * Sobra de largura dividida ao meio. Nunca negativo: quando o painel é mais
   * estreito que a largura mínima efetiva, a área continua alinhada à
   * esquerda como antes, em vez de sair pela borda esquerda.
   */
  function computeOffsetX(panelW, scale) {
    if (!(panelW > 0)) return 0;
    return Math.max(0, (panelW - REFERENCE.width * scale) / 2);
  }

  /* ---------------- Disposição responsiva (misto A + B) ---------------- */

  /**
   * Duas disposições, escolhidas pelo tamanho do painel:
   *
   *   empilhada  — a de sempre: roda em cima, abas e sliders embaixo.
   *   lado a lado — roda numa coluna à esquerda com a altura inteira, abas e
   *                 sliders numa coluna à direita. Só entra quando deixa a
   *                 roda bem maior (SIDE_MIN_GAIN), ou seja, em painel largo.
   *
   * Nas duas, quando sobra largura ao lado da roda, as ferramentas se
   * espalham até as bordas da área (swatches, hex e botões à esquerda;
   * harmonias à direita) e o "Limitar cores" vira um cartão no vão entre a
   * roda e as harmonias. Tirar o bloco da faixa de baixo devolve altura à
   * roda na disposição empilhada.
   *
   * Num dock normal ou alto não há sobra, e tudo fica como antes.
   */
  const SIDE_COL_W = 280;        // px, largura da coluna de controles
  const SIDE_COL_MIN = 240;      // abaixo disso os sliders ficam apertados
  const SIDE_COL_REF = 400;      // unidades: a coluna acompanha a escala
  // Lado a lado só se a roda crescer 25%. Com 15% um painel de 530 x 390 já
  // virava lado a lado, com a roda espremida numa área de 250 px ao lado de
  // uma coluna quase do mesmo tamanho — empilhado com o cartão no vão fica
  // melhor ali.
  const SIDE_MIN_GAIN = 1.25;
  const SIDE_KEEP_GAIN = 1.12;   // histerese: já em lado a lado, fica até aqui
  const SPREAD_MIN_SLACK = 8;    // px de sobra lateral para espalhar
  const SPREAD_PAD = 6;          // px entre as ferramentas e a borda
  const LIMIT_CARD_W = 120;      // px, cartão do "Limitar cores"
  const LIMIT_CARD_H = 84;       // px, altura aproximada do cartão

  /** Ferramentas que vão para a borda esquerda ou direita ao espalhar. */
  function spreadSide(id) {
    if (/^(sat\.|hex\.|history\.|swatch\.)/.test(id)) return 'left';
    // Os dials T e B ficam em cima da coluna de harmonias e vão junto com ela.
    if (/^(harmony\.|rail\.dial\.)/.test(id)) return 'right';
    return null;
  }

  /** Coluna de harmonias na referência: centro em x e meio diâmetro. */
  const HARMONY_X = 581;
  const HARMONY_HALF = 25;

  /** Vão entre a borda direita da roda e a coluna de harmonias já espalhada. */
  function gutterAt(s, ox, right) {
    const wheelRight = ox + (REFERENCE.wheelCenter.x + REFERENCE.outerR) * s;
    const harmonyLeft = right - SPREAD_PAD - (REFERENCE.width - HARMONY_X + HARMONY_HALF) * s;
    return { x: wheelRight, w: harmonyLeft - wheelRight };
  }

  function cardFits(gutter, s) {
    return gutter.w >= LIMIT_CARD_W + 12 &&
      REFERENCE.outerR * 2 * s >= LIMIT_CARD_H;
  }

  /**
   * Plano da disposição. Função pura, para poder ser testada sem DOM.
   *
   * `strip` é a altura da faixa de baixo na disposição empilhada:
   *   { tabH, bodyH, statusH, limitRowH }
   * `opts.allowSide` liga o lado a lado (só onde a altura vem do host);
   * `opts.allowSpread` desliga o espalhamento no modo de organização, em que
   * as posições precisam bater com as âncoras.
   */
  function computePlan(w, h, strip, opts) {
    opts = opts || {};
    const allowSpread = opts.allowSpread !== false;
    const base = strip.tabH + strip.bodyH + strip.statusH;

    // Empilhada, tentando o "Limitar cores" ao lado da roda.
    const stackedPlan = function (canSpread) {
      let s = computeScale(w, h, base);
      let ox = computeOffsetX(w, s);
      let spread = canSpread && ox >= SPREAD_MIN_SLACK;
      let gutter = gutterAt(s, ox, w);
      const limit = spread && cardFits(gutter, s) ? 'gutter' : 'row';

      if (limit === 'row') {
        s = computeScale(w, h, base + strip.limitRowH);
        ox = computeOffsetX(w, s);
        spread = canSpread && ox >= SPREAD_MIN_SLACK;
        gutter = gutterAt(s, ox, w);
      }
      return {
        mode: 'stacked', scale: s, ox, oy: 0, spread,
        right: w, areaW: w, colW: 0, limit, gutter
      };
    };

    const stacked = stackedPlan(allowSpread);
    if (!opts.allowSide) return stacked;

    // A escolha entre empilhada e lado a lado não depende de espalhar: entrar
    // no modo de organização não pode trocar a disposição debaixo do usuário.
    const reference = allowSpread ? stacked : stackedPlan(true);

    // Lado a lado. Sem altura do host não há como decidir.
    if (!(h > 0)) return stacked;

    const baseCol = Math.min(SIDE_COL_W, w * 0.55);
    if (baseCol < SIDE_COL_MIN) return stacked;

    // A coluna cresce com a escala, para o texto das abas e sliders (que
    // também escala) continuar cabendo. Poucas iterações bastam: coluna
    // maior → roda menor → coluna pedida menor, e isso converge rápido.
    const sideScale = function (cw) {
      return Math.max(MIN_SCALE, Math.min((w - cw) / REFERENCE.width, h / TOP_REFERENCE_HEIGHT));
    };
    let colW = baseCol;
    for (let i = 0; i < 4; i++) {
      const want = Math.max(baseCol, Math.min(SIDE_COL_REF * sideScale(colW), w * 0.5));
      colW = (colW + want) / 2;
    }
    colW = Math.round(colW);

    const areaW = w - colW;
    const ss = sideScale(colW);
    const gain = opts.prevMode === 'side' ? SIDE_KEEP_GAIN : SIDE_MIN_GAIN;
    if (!(ss > reference.scale * gain)) return stacked;

    const sox = Math.max(0, (areaW - REFERENCE.width * ss) / 2);
    const soy = Math.max(0, (h - TOP_REFERENCE_HEIGHT * ss) / 2);
    const sspread = allowSpread && sox >= SPREAD_MIN_SLACK;
    const sgutter = gutterAt(ss, sox, areaW);

    return {
      mode: 'side', scale: ss, ox: sox, oy: soy, spread: sspread,
      right: areaW, areaW, colW,
      limit: sspread && cardFits(sgutter, ss) ? 'gutter' : 'column',
      gutter: sgutter
    };
  }

  /* ---------------- Aplicação do layout ---------------- */

  /**
   * Ponto de um controle no painel, em px.
   *
   * Sem espalhar é a âncora pura. Espalhando, o controle mantém a distância
   * que tinha da borda da referência (esquerda ou direita), medida em
   * unidades, só que agora a partir da borda real da área — é o que leva as
   * ferramentas para as laterais em vez de deixá-las grudadas na roda.
   */
  function controlPoint(id, anchor, center, ctx) {
    const side = ctx && ctx.spread ? spreadSide(id) : null;
    if (!side) return anchorToPoint(anchor, center, currentScale);
    const rp = anchorToPoint(anchor, REFERENCE.wheelCenter, 1);
    const s = currentScale;
    return {
      x: side === 'left'
        ? SPREAD_PAD + rp.x * s
        : ctx.right - SPREAD_PAD - (REFERENCE.width - rp.x) * s,
      y: currentOffsetY + rp.y * s
    };
  }

  function place(el, anchor, center, id, ctx) {
    if (!el) return;
    const p = id ? controlPoint(id, anchor, center, ctx) : anchorToPoint(anchor, center, currentScale);

    // Fora do modo de organização, nenhum controle sai pela lateral. O campo
    // hex tem piso em px na largura e o "#" pendurado à esquerda, então num
    // painel estreito ele era cortado na borda ("#6A07").
    if (ctx && ctx.clamp && el.offsetWidth > 0) {
      const half = el.offsetWidth / 2;
      const extraLeft = id === 'hex.field' ? 16 * currentScale : 0;
      const lo = half + extraLeft + 2;
      const hi = ctx.right - half - 2;
      if (hi > lo) p.x = Math.max(lo, Math.min(hi, p.x));
    }

    el.style.left = p.x.toFixed(2) + 'px';
    el.style.top = p.y.toFixed(2) + 'px';
  }

  function isEditingLayout() {
    const E = window.LayoutEditor;
    return !!(E && typeof E.isEditing === 'function' && E.isEditing());
  }

  /**
   * O shell declara se a altura do painel vem do host (CEP) com
   * `--fill-host: 1`. Só nesse caso o lado a lado é seguro: no UXP e na demo a
   * altura do painel é derivada de --u, e mudar a escala mudaria a altura que
   * decide a escala.
   */
  function hostFillsHeight(el) {
    try {
      return getComputedStyle(el).getPropertyValue('--fill-host').trim() === '1';
    } catch (e) {
      return false;
    }
  }

  /**
   * Alturas da faixa de baixo na disposição empilhada, na escala `s`. Mesmos
   * tokens do CSS (--tab-h, --body-h, --status-h, --limit-h). Calculadas em vez
   * de medidas porque na disposição lado a lado essas linhas não estão onde
   * estariam empilhadas.
   */
  function stripAt(el, s) {
    const statusOff = el.style.getPropertyValue('--status-h').trim() === '0px';
    const status = el.querySelector('.status-bar');
    const statusHidden = statusOff || !status || status.hidden;
    const body = parseFloat(el.style.getPropertyValue('--body-h'));
    return {
      tabH: Math.max(28, 38 * s),
      bodyH: body > 0 ? body : Math.max(128, 155 * s),
      statusH: statusHidden ? 0 : Math.max(26, 47 * s),
      limitRowH: Math.max(24, 30 * s)
    };
  }

  function clearPlan(el) {
    el.classList.remove('layout-side', 'limit-card', 'limit-col');
    ['--oy', '--area-w', '--col-w', '--limit-x', '--limit-y', '--limit-w',
      '--side-limit-h', '--limit-h'].forEach(function (v) { el.style.removeProperty(v); });
  }

  /** Classes e variáveis que o CSS lê para cada disposição. */
  function applyPlanToDom(el, plan) {
    const px = function (n) { return n.toFixed(2) + 'px'; };
    el.classList.toggle('layout-side', plan.mode === 'side');
    el.classList.toggle('limit-card', plan.limit !== 'row');
    el.classList.toggle('limit-col', plan.limit === 'column');

    el.style.setProperty('--oy', px(plan.oy));
    if (plan.limit === 'row') el.style.removeProperty('--limit-h');
    else el.style.setProperty('--limit-h', '0px');

    if (plan.mode === 'side') {
      el.style.setProperty('--area-w', px(plan.areaW));
      el.style.setProperty('--col-w', px(plan.colW));
    } else {
      el.style.removeProperty('--area-w');
      el.style.removeProperty('--col-w');
    }

    const card = el.querySelector('.limit-panel');
    if (plan.limit === 'gutter') {
      const cw = Math.min(LIMIT_CARD_W, plan.gutter.w - 12);
      el.style.setProperty('--limit-w', px(cw));
      el.style.setProperty('--limit-x', px(plan.gutter.x + (plan.gutter.w - cw) / 2));
      el.style.setProperty('--limit-y', px(plan.oy + REFERENCE.wheelCenter.y * plan.scale));
      el.style.setProperty('--side-limit-h', '0px');
    } else if (plan.limit === 'column') {
      el.style.removeProperty('--limit-x');
      el.style.removeProperty('--limit-y');
      el.style.removeProperty('--limit-w');
      // Medido depois de a classe entrar: o cartão empilha as linhas e a
      // altura depende da fonte, que tem piso em px.
      const ch = card && card.offsetHeight > 0 ? card.offsetHeight : LIMIT_CARD_H;
      el.style.setProperty('--side-limit-h', px(ch + 12));
    } else {
      ['--limit-x', '--limit-y', '--limit-w'].forEach(function (v) { el.style.removeProperty(v); });
      el.style.setProperty('--side-limit-h', '0px');
    }
  }

  function applyLayout() {
    const el = panel();
    if (!el) return;

    // Usa a largura e altura reais do painel
    const w = el.clientWidth > 0 ? el.clientWidth : availableWidth(el);
    const h = el.clientHeight > 0 ? el.clientHeight : 0;

    const toolsShell = !!(document.body && document.body.classList.contains('shell-tools'));
    const editing = isEditingLayout();
    let ctx = null;

    if (toolsShell) {
      // A janela de ferramentas não tem roda: nada de plano.
      clearPlan(el);
      currentPlan = null;
      currentScale = computeScale(w, h, reservedBottomHeight(el));
      currentOffsetX = computeOffsetX(w, currentScale);
      currentOffsetY = 0;
    } else {
      const prevMode = currentPlan ? currentPlan.mode : 'stacked';
      const opts = {
        allowSide: h > 0 && hostFillsHeight(el),
        allowSpread: !editing,
        prevMode: prevMode
      };
      // Duas passadas: a faixa depende da escala, que depende da faixa.
      let plan = computePlan(w, h, stripAt(el, currentScale), opts);
      const strip = stripAt(el, plan.scale);
      plan = computePlan(w, h, strip, opts);

      currentPlan = plan;
      currentScale = plan.scale;
      currentOffsetX = plan.ox;
      currentOffsetY = plan.oy;
      // A escala entra antes da medição do cartão em applyPlanToDom.
      el.style.setProperty('--scale', String(currentScale));
      applyPlanToDom(el, plan);
      ctx = { spread: plan.spread, right: plan.right, clamp: !editing };

      // Voltando para empilhada, o corpo das abas precisa ser remedido: em
      // lado a lado a medição fica parada (ver Panels.measureBodyHeight).
      if (prevMode === 'side' && plan.mode !== 'side' &&
          window.Panels && typeof window.Panels.measureBodyHeight === 'function') {
        setTimeout(window.Panels.measureBodyHeight, 0);
      }
    }

    el.style.setProperty('--scale', String(currentScale));
    el.style.setProperty('--ox', currentOffsetX.toFixed(2) + 'px');

    const center = centerPx();

    Object.keys(ANCHORS).forEach(function (id) {
      place(el.querySelector('[data-layout="' + id + '"]'), ANCHORS[id], center, id, ctx);
    });

    Object.keys(ADJACENT).forEach(function (selector) {
      place(el.querySelector(selector), ADJACENT[selector], center);
    });

    /**
     * Não há passada de separação aqui, de propósito.
     *
     * Houve uma, que empurrava os satélites sobrepostos depois de posicionados.
     * Ela existia para compensar o piso em px no tamanho dos botões, e era
     * remendo: tratava o sintoma e ainda deslocava os controles da posição que
     * a âncora pedia. Com o tamanho proporcional a sobreposição não acontece,
     * e a garantia é geométrica — se o layout de referência não tem
     * sobreposição em escala 1, não tem em nenhuma escala.
     */
  }

  /* ---------------- Boot ---------------- */

  let pending = 0;

  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      applyLayout();
    });
  }

  function init() {
    applyLayout();

    var el = panel();
    var host = el && el.parentElement;

    // O Platform Adapter cai para polling onde ResizeObserver não existe (UXP).
    var observe = (window.Platform && window.Platform.observeResize) || function (node, cb) {
      if (node && typeof ResizeObserver === 'function') {
        new ResizeObserver(cb).observe(node);
      }
      return function () {};
    };

    if (host) observe(host, schedule);
    // Observa o próprio painel para resize manual (CSS resize: both)
    if (el) observe(el, schedule);
    window.addEventListener('resize', schedule);
  }

  return {
    REFERENCE: REFERENCE,
    ANCHORS: ANCHORS,
    ADJACENT: ADJACENT,
    MIN_EFFECTIVE_WIDTH: MIN_EFFECTIVE_WIDTH,
    MAX_EFFECTIVE_WIDTH: MAX_EFFECTIVE_WIDTH,
    anchorToPoint: anchorToPoint,
    pointToAnchor: pointToAnchor,
    normalizeAnchor: normalizeAnchor,
    clampAnchorToBounds: clampAnchorToBounds,
    computeScale: computeScale,
    computeOffsetX: computeOffsetX,
    computePlan: computePlan,
    plan: function () { return currentPlan; },
    scale: scale,
    offsetX: offsetX,
    offsetY: offsetY,
    centerPx: centerPx,
    applyLayout: applyLayout,
    schedule: schedule,
    init: init
  };
})();
