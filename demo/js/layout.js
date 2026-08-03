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
    'harmony.1':             { angle: 59.93, radius: 285.4 },   // (572, 209)
    'harmony.2':             { angle: 70.80, radius: 261.5 },   // (572, 266)
    'harmony.3':             { angle: 83.30, radius: 248.7 },   // (572, 323)
    'harmony.4':             { angle: 96.47, radius: 248.6 },   // (572, 380)
    'harmony.5':             { angle: 108.99, radius: 261.2 },  // (572, 437)
    'harmony.6':             { angle: 119.89, radius: 284.9 },  // (572, 494)
    'sat.gamutmask':         { angle: 271.46, radius: 274.1 },  // ( 51, 345)
    'sat.shape':             { angle: 287.43, radius: 287.2 },  // ( 51, 266)
    'hex.field':             { angle: 301.82, radius: 302.5 },  // ( 68, 193)
    'history.redo':          { angle: 227.49, radius: 295.8 },  // (107, 552)
    'history.undo':          { angle: 234.06, radius: 340.8 },  // ( 49, 552)
    'rail.dial.temperature': { angle: 14.79, radius: 258.6 },   // (391, 102) alinhado com os botões
    'rail.dial.brightness':  { angle: 29.94, radius: 288.5 },   // (469, 102) alinhado com os botões
    'rail.lumlock':          { angle: 357.25, radius: 250.3 },  // (313, 102)
    'rail.valuecheck':       { angle: 341.22, radius: 264.1 },  // (240, 102)
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
   */
  function reservedBottomHeight(el) {
    var total = 0;
    ['.tabs', '.tab-body', '.status-bar'].forEach(function (sel) {
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
      x: REFERENCE.wheelCenter.x * currentScale,
      y: REFERENCE.wheelCenter.y * currentScale
    };
  }

  /* ---------------- Aplicação do layout ---------------- */

  function place(el, anchor, center) {
    if (!el) return;
    const p = anchorToPoint(anchor, center, currentScale);
    el.style.left = p.x.toFixed(2) + 'px';
    el.style.top = p.y.toFixed(2) + 'px';
  }

  function applyLayout() {
    const el = panel();
    if (!el) return;

    // Usa a largura e altura reais do painel
    const w = el.clientWidth > 0 ? el.clientWidth : availableWidth(el);
    const h = el.clientHeight > 0 ? el.clientHeight : 0;
    currentScale = computeScale(w, h, reservedBottomHeight(el));
    el.style.setProperty('--scale', String(currentScale));

    const center = centerPx();

    Object.keys(ANCHORS).forEach(function (id) {
      place(el.querySelector('[data-layout="' + id + '"]'), ANCHORS[id], center);
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
    scale: scale,
    centerPx: centerPx,
    applyLayout: applyLayout,
    schedule: schedule,
    init: init
  };
})();
