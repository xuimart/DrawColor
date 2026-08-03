/**
 * wheel.js — Roda de matiz rotacionável + seletor interno de S/V,
 * disponível em duas formas: triângulo e quadrado.
 * Requisitos 1, 2, 3, 12.
 */
window.Wheel = (function () {
  'use strict';

  const C = window.Color;
  const S = window.AppState;

  /**
   * Geometria em unidades do Reference_Space (Requisito 2.1): o canvas tem
   * 426 unidades, o anel externo encosta na borda e o raio interno sai da
   * razão da referência — nada de valor solto aqui.
   */
  const SIZE = 426;
  const CX = SIZE / 2, CY = SIZE / 2;
  const OUTER_R = SIZE / 2;              // 213
  const INNER_RATIO = 178 / 213;         // 0,835 — anel de 35 unidades
  const INNER_R = OUTER_R * INNER_RATIO; // 178
  const TRI_R = INNER_R - 6;       // raio do triângulo inscrito
  const SQ_R = INNER_R - 4;        // raio do círculo que circunscreve o quadrado

  // Marcadores (Requisitos 2.2, 2.3, 2.4, 2.6)
  const MAIN_MARKER_R = 19, MAIN_MARKER_BORDER = 3;
  const SEC_MARKER_R = 16, SEC_MARKER_BORDER = 2;
  const SV_MARKER_R = 13, SV_MARKER_BORDER = 2.5;
  const LEADER_HANDLE_R = 5;             // alça da linha de chamada
  const LEADER_COLOR = '#8a8a8a';        // token leader-line
  /**
   * Trilha dos marcadores do anel. Fica um pouco dentro do meio do anel para
   * o marcador principal caber inteiro nas 426 unidades do canvas — a posição
   * radial não influi no matiz, que é puramente angular.
   */
  const MARKER_TRACK_R = OUTER_R - (MAIN_MARKER_R + MAIN_MARKER_BORDER / 2 + 1);
  const LEADER_INNER_R = INNER_R - 36;   // alça dentro do seletor

  const DEG = Math.PI / 180;

  let canvas, ctx;
  let DPR = 1;                     // resolução do backing store, sem distorcer o desenho
  let ringCache = null;            // anel desenhado sem rotação; a rotação é aplicada no draw
  let ringCacheKey = null;
  let svCache = null;              // superfície de S/V do seletor interno
  let svCacheKey = null;
  let rafPending = false;
  let dragMode = null;             // 'ring' | 'sv' | 'rotate' | null
  let rotateAnchor = null;         // estado inicial de um arraste de rotação

  /* ================= Triângulo ================= */

  /**
   * Com rotação 0 o vértice do matiz puro aponta para a direita e a aresta
   * preto→branco fica vertical, encostada à esquerda — arranjo do Coolorus.
   */
  const TRI_ROTATION = 0;
  const TRI_ANGLES = { hue: 0, black: 120, white: 240 };

  function triVertices() {
    const at = (angle) => {
      const a = (angle + TRI_ROTATION) * DEG;
      return { x: CX + TRI_R * Math.cos(a), y: CY + TRI_R * Math.sin(a) };
    };
    return { hue: at(TRI_ANGLES.hue), black: at(TRI_ANGLES.black), white: at(TRI_ANGLES.white) };
  }

  // Coordenadas baricêntricas (Requisito 2.4)
  function barycentric(px, py) {
    const t = triVertices();
    const d = (t.black.y - t.white.y) * (t.hue.x - t.white.x)
            + (t.white.x - t.black.x) * (t.hue.y - t.white.y);
    const wHue = ((t.black.y - t.white.y) * (px - t.white.x)
                + (t.white.x - t.black.x) * (py - t.white.y)) / d;
    const wBlack = ((t.white.y - t.hue.y) * (px - t.white.x)
                  + (t.hue.x - t.white.x) * (py - t.white.y)) / d;
    return { hue: wHue, black: wBlack, white: 1 - wHue - wBlack };
  }

  function baryToSv(w) {
    const bright = w.hue + w.white;             // preto tem V=0
    const v = C.clamp(bright * 100, 0, 100);
    const s = bright <= 0 ? 0 : C.clamp((w.hue / bright) * 100, 0, 100);
    return { s, v };
  }

  function svToPoint(s, v) {
    const t = triVertices();
    const sn = C.clamp(s, 0, 100) / 100;
    const vn = C.clamp(v, 0, 100) / 100;
    const wHue = vn * sn, wWhite = vn * (1 - sn), wBlack = 1 - vn;
    return {
      x: t.hue.x * wHue + t.black.x * wBlack + t.white.x * wWhite,
      y: t.hue.y * wHue + t.black.y * wBlack + t.white.y * wWhite
    };
  }

  function insideTriangle(px, py) {
    const w = barycentric(px, py);
    return w.hue >= 0 && w.black >= 0 && w.white >= 0;
  }

  // Ponto mais próximo dentro do triângulo (Requisito 2.5)
  function clampToTriangle(px, py) {
    if (insideTriangle(px, py)) return { x: px, y: py };

    const t = triVertices();
    const edges = [[t.hue, t.black], [t.black, t.white], [t.white, t.hue]];
    let best = null, bestD = Infinity;

    for (const [a, b] of edges) {
      const abx = b.x - a.x, aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      let tt = len2 === 0 ? 0 : ((px - a.x) * abx + (py - a.y) * aby) / len2;
      tt = C.clamp(tt, 0, 1);
      const qx = a.x + abx * tt, qy = a.y + aby * tt;
      const d = (px - qx) ** 2 + (py - qy) ** 2;
      if (d < bestD) { bestD = d; best = { x: qx, y: qy }; }
    }
    return best;
  }

  function traceTriangle(c) {
    const t = triVertices();
    c.beginPath();
    c.moveTo(t.hue.x, t.hue.y);
    c.lineTo(t.black.x, t.black.y);
    c.lineTo(t.white.x, t.white.y);
    c.closePath();
  }

  /* ================= Quadrado ================= */

  // Quadrado inscrito no círculo interno: lado = r * √2
  function squareRect() {
    const half = SQ_R / Math.SQRT2;
    return { x0: CX - half, y0: CY - half, size: half * 2 };
  }

  // Saturação cresce para a direita, valor cresce para cima
  function squarePointToSv(px, py) {
    const r = squareRect();
    return {
      s: C.clamp(((px - r.x0) / r.size) * 100, 0, 100),
      v: C.clamp((1 - (py - r.y0) / r.size) * 100, 0, 100)
    };
  }

  function squareSvToPoint(s, v) {
    const r = squareRect();
    return {
      x: r.x0 + (C.clamp(s, 0, 100) / 100) * r.size,
      y: r.y0 + (1 - C.clamp(v, 0, 100) / 100) * r.size
    };
  }

  function insideSquare(px, py) {
    const r = squareRect();
    return px >= r.x0 && px <= r.x0 + r.size && py >= r.y0 && py <= r.y0 + r.size;
  }

  function clampToSquare(px, py) {
    const r = squareRect();
    return {
      x: C.clamp(px, r.x0, r.x0 + r.size),
      y: C.clamp(py, r.y0, r.y0 + r.size)
    };
  }

  function traceSquare(c) {
    const r = squareRect();
    c.beginPath();
    c.rect(r.x0, r.y0, r.size, r.size);
  }

  /* ================= Interface comum do seletor ================= */

  /* ================= Disco (matiz angular + saturação radial) ================= */

  // O disco encosta no anel, como no Coolorus
  const DISC_R = INNER_R - 2;

  // Converte um ponto da tela para coordenadas normalizadas do disco,
  // já descontando a rotação do anel
  function discLocal(px, py) {
    const dx = px - CX, dy = py - CY;
    const rot = S.state.wheelRotation * DEG;
    return {
      u: (dx * Math.cos(-rot) - dy * Math.sin(-rot)) / DISC_R,
      v: (dx * Math.sin(-rot) + dy * Math.cos(-rot)) / DISC_R
    };
  }

  function discToScreen(u, v) {
    const rot = S.state.wheelRotation * DEG;
    return {
      x: CX + (u * Math.cos(rot) - v * Math.sin(rot)) * DISC_R,
      y: CY + (u * Math.sin(rot) + v * Math.cos(rot)) * DISC_R
    };
  }

  // O disco compartilha a convenção do anel e da máscara: matiz 0 no topo
  function discPointToHs(px, py) {
    const p = discLocal(px, py);
    return S.discToHs(p.u, p.v);
  }

  function discHsToPoint(h, s) {
    const p = S.hsToDisc(h, s);
    return discToScreen(p.u, p.v);
  }

  function insideDisc(px, py) {
    // Tolerância para o clamp na borda não cair fora por erro de arredondamento
    return Math.hypot(px - CX, py - CY) <= DISC_R + 1e-6;
  }

  function clampToDisc(px, py) {
    const dx = px - CX, dy = py - CY;
    const dist = Math.hypot(dx, dy);
    if (dist <= DISC_R) return { x: px, y: py };
    const k = DISC_R / dist;
    return { x: CX + dx * k, y: CY + dy * k };
  }

  function traceDisc(c) {
    c.beginPath();
    c.arc(CX, CY, DISC_R, 0, Math.PI * 2);
  }

  /* ================= Interface comum do seletor ================= */

  const SHAPES = {
    triangle: {
      // Controla saturação e valor; o matiz vem do anel
      drivenBy: 'h',
      pointToSv: (x, y) => baryToSv(barycentric(x, y)),
      svToPoint: svToPoint,
      pointToHsv: (x, y, hsv) => ({ ...hsv, ...baryToSv(barycentric(x, y)) }),
      hsvToPoint: (hsv) => svToPoint(hsv.s, hsv.v),
      inside: insideTriangle,
      clamp: clampToTriangle,
      trace: traceTriangle,
      bounds: () => {
        const t = triVertices();
        const xs = [t.hue.x, t.black.x, t.white.x];
        const ys = [t.hue.y, t.black.y, t.white.y];
        return {
          minX: Math.floor(Math.min(...xs)), maxX: Math.ceil(Math.max(...xs)),
          minY: Math.floor(Math.min(...ys)), maxY: Math.ceil(Math.max(...ys))
        };
      }
    },
    square: {
      drivenBy: 'h',
      pointToSv: squarePointToSv,
      svToPoint: squareSvToPoint,
      pointToHsv: (x, y, hsv) => ({ ...hsv, ...squarePointToSv(x, y) }),
      hsvToPoint: (hsv) => squareSvToPoint(hsv.s, hsv.v),
      inside: insideSquare,
      clamp: clampToSquare,
      trace: traceSquare,
      bounds: () => {
        const r = squareRect();
        return {
          minX: Math.floor(r.x0), maxX: Math.ceil(r.x0 + r.size),
          minY: Math.floor(r.y0), maxY: Math.ceil(r.y0 + r.size)
        };
      }
    },
    disc: {
      // Controla matiz e saturação; o valor vem do dial ou dos sliders
      drivenBy: 'v',
      pointToHsv: (x, y, hsv) => ({ ...hsv, ...discPointToHs(x, y) }),
      hsvToPoint: (hsv) => discHsToPoint(hsv.h, hsv.s),
      inside: insideDisc,
      clamp: clampToDisc,
      trace: traceDisc,
      bounds: () => ({
        minX: Math.floor(CX - DISC_R), maxX: Math.ceil(CX + DISC_R),
        minY: Math.floor(CY - DISC_R), maxY: Math.ceil(CY + DISC_R)
      })
    }
  };

  function shape() {
    return SHAPES[S.state.shape] || SHAPES.triangle;
  }

  /* ================= Render do anel ================= */

  function buildRing() {
    const off = document.createElement('canvas');
    off.width = off.height = Math.round(SIZE * DPR);
    const c = off.getContext('2d');
    // O anel é vetorial: vale desenhá-lo na resolução do dispositivo
    c.setTransform(DPR, 0, 0, DPR, 0, 0);

    const limit = S.state.limit;

    if (limit.enabled) {
      // Setores discretos: cada faixa mostra exatamente um matiz disponível
      const n = limit.hueSteps;
      const size = 360 / n;
      for (let i = 0; i < n; i++) {
        const center = i * size;
        const a0 = (center - size / 2 - 90) * DEG;
        const a1 = (center + size / 2 - 90) * DEG;
        const rgb = S.display(C.hsvToRgb(center, 100, 100));
        c.beginPath();
        c.arc(CX, CY, OUTER_R, a0, a1, false);
        c.arc(CX, CY, INNER_R, a1, a0, true);
        c.closePath();
        c.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        c.fill();

        c.beginPath();
        c.moveTo(CX + INNER_R * Math.cos(a0), CY + INNER_R * Math.sin(a0));
        c.lineTo(CX + OUTER_R * Math.cos(a0), CY + OUTER_R * Math.sin(a0));
        c.lineWidth = 1;
        c.strokeStyle = 'rgba(30,30,30,.85)';
        c.stroke();
      }
    } else {
      // Setores de 1° (Requisito 1.1) com leve overlap para não deixar costura
      for (let i = 0; i < 360; i++) {
        const a0 = (i - 90) * DEG;
        const a1 = (i + 1.2 - 90) * DEG;
        const rgb = S.display(C.hsvToRgb(i, 100, 100));
        c.beginPath();
        c.arc(CX, CY, OUTER_R, a0, a1, false);
        c.arc(CX, CY, INNER_R, a1, a0, true);
        c.closePath();
        c.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        c.fill();
      }
    }

    // Bordas suaves do anel (Requisito 1.5 — anti-aliasing)
    c.globalCompositeOperation = 'destination-in';
    c.beginPath();
    c.arc(CX, CY, OUTER_R, 0, Math.PI * 2);
    c.arc(CX, CY, INNER_R, 0, Math.PI * 2, true);
    c.fill();
    c.globalCompositeOperation = 'source-over';

    return off;
  }

  /* ================= Render do seletor de S/V ================= */

  /**
   * A superfície de S/V é pintada pixel a pixel, então fica em 1 unidade por
   * pixel (SIZE) mesmo em telas de alta densidade: é um degradê contínuo, a
   * ampliação não aparece, e o custo por quadro continua previsível.
   */
  function buildSelector(baseHsv, svSteps, hueSteps, masked) {
    const sh = shape();
    const off = document.createElement('canvas');
    off.width = off.height = SIZE;
    const c = off.getContext('2d');
    const img = c.createImageData(SIZE, SIZE);
    const data = img.data;

    const b = sh.bounds();

    for (let y = b.minY; y <= b.maxY; y++) {
      for (let x = b.minX; x <= b.maxX; x++) {
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        const cx = x + 0.5, cy = y + 0.5;
        if (!sh.inside(cx, cy)) {
          // margem de tolerância para o recorte anti-aliased cobrir a borda
          if (Math.hypot(sh.clamp(cx, cy).x - cx, sh.clamp(cx, cy).y - cy) > 1.5) continue;
        }

        let hsv = sh.pointToHsv(cx, cy, baseHsv);

        // Sob limite a superfície aparece posterizada, mostrando exatamente
        // os tons que estão disponíveis
        if (hueSteps) hsv = { ...hsv, h: S.quantizeHue(hsv.h, hueSteps) };
        if (svSteps >= 2) {
          hsv = { ...hsv, s: S.quantizeLevel(hsv.s, svSteps), v: S.quantizeLevel(hsv.v, svSteps) };
        }

        let rgb = S.display(C.hsvToRgb(hsv.h, hsv.s, hsv.v));

        // Fora da máscara a cor aparece lavada, mantendo só uma insinuação
        // do matiz — é assim que o gamut fica legível de imediato
        if (masked && !S.insideMask(hsv.h, hsv.s)) {
          rgb = C.mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.8);
        }
        const i = (y * SIZE + x) * 4;
        data[i] = rgb.r; data[i + 1] = rgb.g; data[i + 2] = rgb.b; data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);

    // Recorta com path para obter bordas anti-aliased
    const smooth = document.createElement('canvas');
    smooth.width = smooth.height = SIZE;
    const sc = smooth.getContext('2d');
    sh.trace(sc);
    sc.clip();
    sc.drawImage(off, 0, 0);
    return smooth;
  }

  /* ================= Marcadores ================= */

  // Posição de um matiz na tela, já considerando a rotação da roda
  function hueMarkerPos(hue, radius) {
    const a = (hue + S.state.wheelRotation - 90) * DEG;
    return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
  }

  // Requisito 1.3 / 2.2 / 2.3 / 2.6: anel branco com contorno escuro
  function drawMarker(p, r, fill, border) {
    const w = border || 2;
    if (fill) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.lineWidth = w;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r + w / 2 + 0.6, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.stroke();
  }

  /* ================= Máscara de gamut ================= */

  const HANDLE_HIT = 12;   // raio de captura generoso, para não brigar com o mouse

  /**
   * Alças da caixa de edição: cantos redimensionam os dois eixos, e as do
   * meio de cada lado redimensionam um eixo só. Sem as do meio é impossível
   * ajustar a máscara sem alterar a proporção.
   */
  function maskHandles() {
    const spec = [
      { sx: -1, sy: -1, axis: 'both' }, { sx: 1, sy: -1, axis: 'both' },
      { sx: 1, sy: 1, axis: 'both' },   { sx: -1, sy: 1, axis: 'both' },
      { sx: 0, sy: -1, axis: 'y' },     { sx: 0, sy: 1, axis: 'y' },
      { sx: -1, sy: 0, axis: 'x' },     { sx: 1, sy: 0, axis: 'x' }
    ];
    return spec.map((h) => {
      const d = S.unitToDisc(h.sx, h.sy);
      return { ...discToScreen(d.u, d.v), ...h };
    });
  }

  function maskCenterScreen() {
    const g = S.state.gamut;
    return discToScreen(g.cx, g.cy);
  }

  /**
   * Alças de vértice, uma por canto da figura.
   *
   * Só existem em formatos poligonais: elipse e lobos duplos não têm vértice
   * para pegar, e nesses a caixa continua sendo o controle. Mover um vértice
   * congela a figura como polígono livre — daí em diante ela deixa de ser o
   * formato canônico e passa a ser sua.
   */
  function maskVertexHandles() {
    const pts = S.maskVertices();
    if (!pts) return [];

    return pts.map((pt, index) => {
      const d = S.unitToDisc(pt.x, pt.y);
      return { ...discToScreen(d.u, d.v), index: index, unit: pt };
    });
  }

  // Traça o contorno da máscara no contexto informado
  function traceMask(c) {
    const outline = S.maskOutline();
    const g = S.state.gamut;
    const center = maskCenterScreen();
    const spin = (g.angle + S.state.wheelRotation) * DEG;

    if (outline.type === 'ellipse') {
      c.save();
      c.translate(center.x, center.y);
      c.rotate(spin);
      c.beginPath();
      c.ellipse(0, 0, g.rx * DISC_R, g.ry * DISC_R, 0, 0, Math.PI * 2);
      c.restore();
      return;
    }

    if (outline.type === 'polygon') {
      c.beginPath();
      outline.points.forEach((p, i) => {
        const s = discToScreen(p.u, p.v);
        if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
      });
      c.closePath();
      return;
    }

    // União de círculos: um subpath por lobo
    c.beginPath();
    outline.circles.forEach((circle) => {
      const s = discToScreen(circle.center.u, circle.center.v);
      c.save();
      c.translate(s.x, s.y);
      c.rotate(spin);
      c.ellipse(0, 0, circle.rx * DISC_R, circle.ry * DISC_R, 0, 0, Math.PI * 2);
      c.restore();
    });
  }

  /**
   * A área fora da máscara já sai lavada da própria superfície, então aqui
   * só desenhamos as ajudas de edição. Fora do modo de edição a máscara
   * aparece limpa, sem contorno — como no Coolorus.
   */
  function drawGamutMask() {
    const g = S.state.gamut;
    if (!g.editing) return;

    traceMask(ctx);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = g.locked ? 'rgba(120,120,120,.9)' : '#e03b30';
    ctx.stroke();

    const center = maskCenterScreen();

    /**
     * Caixa de edição: só os quatro cantos entram no contorno.
     *
     * Ligar todas as alças na ordem do array desenhava um emaranhado — a lista
     * tem os cantos e depois os meios de cada lado, então o traço ia de canto
     * em canto e voltava cruzando a figura pelo meio.
     */
    const handles = maskHandles();
    const cantos = handles.filter((h) => h.axis === 'both');

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(160,160,160,.55)';
    ctx.beginPath();
    cantos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    handles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.axis === 'both' ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.axis === 'both' ? '#e03b30' : '#f2a03c';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.stroke();
    });

    /**
     * Alças de vértice: brancas e maiores que as da caixa, porque são elas que
     * dão a forma. Ficam por cima do contorno para o clique acertá-las antes
     * do "arrastar em qualquer ponto move a máscara".
     */
    maskVertexHandles().forEach((v) => {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#e03b30';
      ctx.stroke();
    });

    // Alça central de movimento, bem visível
    ctx.beginPath();
    ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e03b30';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(center.x - 3, center.y);
    ctx.lineTo(center.x + 3, center.y);
    ctx.moveTo(center.x, center.y - 3);
    ctx.lineTo(center.x, center.y + 3);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#e03b30';
    ctx.stroke();

    // Alça de rotação, acima do centro da elipse
    const rotHandle = maskRotateHandle();
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(rotHandle.x, rotHandle.y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(160,160,160,.8)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rotHandle.x, rotHandle.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f0f0';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.stroke();
  }

  function maskRotateHandle() {
    const g = S.state.gamut;
    const rot = g.angle * DEG;
    const x = 0, y = -(g.ry + 0.16);
    const u = g.cx + (x * Math.cos(rot) - y * Math.sin(rot));
    const v = g.cy + (x * Math.sin(rot) + y * Math.cos(rot));
    return discToScreen(u, v);
  }

  // Requisito 2.4: linha de chamada de 2 unidades no token leader-line
  function drawLeader(from, to) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = LEADER_COLOR;
    ctx.stroke();
  }

  /* ================= Loop de render (Requisito 12.4) ================= */

  function render() {
    const hsv = S.getHsv();
    const sh = shape();
    const midR = MARKER_TRACK_R;
    const limit = S.state.limit;
    const g = S.state.gamut;
    const svSteps = limit.enabled ? limit.svSteps : 0;

    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.beginPath();
    ctx.arc(CX, CY, INNER_R, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2b2b';
    ctx.fill();

    // O anel é desenhado sem rotação e rotacionado na composição,
    // evitando redesenhar 360 setores a cada grau girado
    const masked = S.state.gamut.enabled && S.state.shape === 'disc';
    const gray = S.state.valueCheck ? 'g' : 'c';
    const ringKey = (limit.enabled ? 'q' + limit.hueSteps : 'continuous') + gray;
    if (ringCacheKey !== ringKey) {
      ringCache = buildRing();
      ringCacheKey = ringKey;
    }
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(S.state.wheelRotation * DEG);
    ctx.translate(-CX, -CY);
    ctx.drawImage(ringCache, 0, 0, SIZE, SIZE);
    ctx.restore();

    // Requisito 2.3: a superfície reflete o canal que a forma não controla —
    // matiz para triângulo e quadrado, valor para o disco
    const hueSteps = limit.enabled && S.state.shape === 'disc' ? limit.hueSteps : 0;
    const driver = sh.drivenBy === 'v' ? Math.round(hsv.v * 2) : Math.round(hsv.h * 2);
    const maskKey = masked
      ? `${g.kind}|${g.cx.toFixed(3)}|${g.cy.toFixed(3)}|${g.rx.toFixed(3)}|${g.ry.toFixed(3)}|${Math.round(g.angle)}`
      : 'nomask';
    const svKey = `${driver}|${svSteps}|${hueSteps}|${S.state.shape}|${S.state.wheelRotation}|${gray}|${maskKey}`;
    if (svCacheKey !== svKey) {
      svCache = buildSelector(hsv, svSteps, hueSteps, masked);
      svCacheKey = svKey;
    }
    ctx.drawImage(svCache, 0, 0, SIZE, SIZE);

    // Contorno discreto do seletor, para separá-lo do fundo
    sh.trace(ctx);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.stroke();

    // Máscara de gamut, aplicável só no disco onde matiz e saturação convivem
    if (S.state.gamut.enabled && S.state.shape === 'disc') drawGamutMask();

    // Marcadores secundários de harmonia (Requisito 3.2)
    S.getHarmonyHues().forEach((h) => {
      const outer = hueMarkerPos(h, midR);
      const inner = hueMarkerPos(h, LEADER_INNER_R);
      drawLeader(outer, inner);
      drawMarker(inner, LEADER_HANDLE_R, null);
      drawMarker(outer, SEC_MARKER_R, S.displayCss(C.hsvToRgb(h, hsv.s, hsv.v)), SEC_MARKER_BORDER);
    });

    // Marcador principal de matiz — maior, para distinção visual
    const main = hueMarkerPos(hsv.h, midR);
    drawLeader(main, hueMarkerPos(hsv.h, LEADER_INNER_R));
    drawMarker(hueMarkerPos(hsv.h, LEADER_INNER_R), LEADER_HANDLE_R, null);
    drawMarker(main, MAIN_MARKER_R, S.displayCss(C.hsvToRgb(hsv.h, 100, 100)), MAIN_MARKER_BORDER);

    // Marcador da cor no seletor interno (Requisito 2.6)
    drawMarker(sh.hsvToPoint(hsv), SV_MARKER_R, null, SV_MARKER_BORDER);

    rafPending = false;
  }

  function requestRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(render);
  }

  function invalidateCaches() {
    svCacheKey = null;
    ringCacheKey = null;
  }

  /* ================= Interação ================= */

  function toCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const scale = SIZE / rect.width;
    return {
      x: (evt.clientX - rect.left) * scale,
      y: (evt.clientY - rect.top) * scale
    };
  }

  // Ângulo do cursor em torno do centro, com 0 no topo
  function screenAngle(p) {
    const deg = Math.atan2(p.y - CY, p.x - CX) * 180 / Math.PI + 90;
    return ((deg % 360) + 360) % 360;
  }

  function applyRing(p) {
    // Desconta a rotação da roda para chegar ao matiz real
    const hue = screenAngle(p) - S.state.wheelRotation;
    const hsv = S.getHsv();
    S.setHsv({ h: hue, s: hsv.s, v: hsv.v });
  }

  function applySv(p) {
    const sh = shape();
    const q = sh.clamp(p.x, p.y);
    S.setHsv(sh.pointToHsv(q.x, q.y, S.getHsv()));
  }

  /* ---------------- edição da máscara ---------------- */

  /**
   * Decide o que o arraste vai manipular. Em modo de edição, arrastar
   * qualquer ponto do disco move a máscara — não é preciso acertar o
   * interior da forma. Alt+arraste move mesmo fora do modo de edição.
   */
  function pickMaskHandle(p, evt) {
    const g = S.state.gamut;
    if (!g.enabled || g.locked) return null;

    const altMove = evt.altKey && insideDisc(p.x, p.y);
    if (!g.editing) return altMove ? { grab: 'move' } : null;

    const rot = maskRotateHandle();
    if (Math.hypot(p.x - rot.x, p.y - rot.y) <= HANDLE_HIT) return { grab: 'rotate' };

    const centerHandle = maskCenterScreen();
    if (Math.hypot(p.x - centerHandle.x, p.y - centerHandle.y) <= HANDLE_HIT) return { grab: 'move' };

    /**
     * Vértices antes das alças da caixa e antes do mover: eles ficam sobre o
     * contorno, então perderiam a disputa para "qualquer ponto move a máscara"
     * e a edição livre seria inalcançável.
     */
    let vertice = null, verticeD = Infinity;
    for (const v of maskVertexHandles()) {
      const d = Math.hypot(p.x - v.x, p.y - v.y);
      if (d <= HANDLE_HIT && d < verticeD) { verticeD = d; vertice = v; }
    }
    if (vertice) return { grab: 'vertex', index: vertice.index };

    // Alças mais próximas primeiro, para cantos e laterais não competirem
    let nearest = null, nearestD = Infinity;
    for (const h of maskHandles()) {
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      if (d <= HANDLE_HIT && d < nearestD) { nearestD = d; nearest = h; }
    }
    if (nearest) return { grab: 'resize', axis: nearest.axis };

    // Qualquer outro ponto do disco move a máscara
    if (insideDisc(p.x, p.y)) return { grab: 'move' };
    return null;
  }

  function applyMaskDrag(p, evt) {
    const local = discLocal(p.x, p.y);
    const start = rotateAnchor;

    if (start.grab === 'vertex') {
      /**
       * O vértice segue o ponteiro no espaço unitário da máscara, então
       * tamanho, rotação e centro continuam valendo — arrastar o vértice muda
       * a figura, não o enquadramento dela.
       */
      const unit = S.discToUnit(local.u, local.v);
      S.setMaskVertex(start.index, unit.x, unit.y);
      return;
    }

    if (start.grab === 'move') {
      S.setGamut({
        cx: start.gamut.cx + (local.u - start.local.u),
        cy: start.gamut.cy + (local.v - start.local.v)
      });
      return;
    }

    if (start.grab === 'rotate') {
      let angle = Math.atan2(local.v - start.gamut.cy, local.u - start.gamut.cx) / DEG + 90;
      if (evt.shiftKey) angle = Math.round(angle / 15) * 15;
      S.setGamut({ angle });
      return;
    }

    // Redimensiona no referencial da máscara; a alça define o eixo afetado
    const rot = start.gamut.angle * DEG;
    const du = local.u - start.gamut.cx, dv = local.v - start.gamut.cy;
    const x = Math.abs(du * Math.cos(-rot) - dv * Math.sin(-rot));
    const y = Math.abs(du * Math.sin(-rot) + dv * Math.cos(-rot));

    if (start.axis === 'x') S.setGamut({ rx: x });
    else if (start.axis === 'y') S.setGamut({ ry: y });
    else if (evt.shiftKey) {
      // Shift mantém a proporção original
      const ratio = start.gamut.ry / start.gamut.rx;
      S.setGamut({ rx: x, ry: x * ratio });
    } else {
      S.setGamut({ rx: x, ry: y });
    }
  }

  // Cursor coerente com o que o arraste vai fazer
  function updateMaskCursor(p, evt) {
    // Marcador secundário sinaliza que pode ser arrastado
    if (pickSecondary(p)) { canvas.style.cursor = 'grab'; return; }

    const g = S.state.gamut;
    if (!g.enabled || S.state.shape !== 'disc') { canvas.style.cursor = 'crosshair'; return; }

    const grab = pickMaskHandle(p, evt);
    if (!grab) { canvas.style.cursor = 'crosshair'; return; }
    canvas.style.cursor = grab.grab === 'resize' ? 'nwse-resize'
      : grab.grab === 'rotate' ? 'grab'
      : grab.grab === 'vertex' ? 'crosshair' : 'move';
  }

  function applyRotate(p, evt) {
    const delta = screenAngle(p) - rotateAnchor.startAngle;
    // Shift arredonda de 15 em 15; com Ctrl, de 60 em 60
    const snap = evt.ctrlKey ? 60 : 15;
    S.setWheelRotation(rotateAnchor.startRotation + delta, evt.shiftKey ? snap : 0);
  }

  /**
   * O marcador mais próximo do ponto, não o primeiro da lista.
   *
   * Com "o primeiro", dois marcadores próximos deixavam o segundo inalcançável:
   * o clique caía sempre no de menor índice, e arrastar movia o esquema todo —
   * os dois seguiam colados. O estado impede que eles se cubram, mas a escolha
   * pelo mais próximo é o que faz o gesto acertar quem o usuário mirou.
   */
  function pickSecondary(p) {
    const hues = S.getHarmonyHues();
    let achado = null;

    for (let i = 0; i < hues.length; i++) {
      const m = hueMarkerPos(hues[i], MARKER_TRACK_R);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d > SEC_MARKER_R + 2) continue;
      if (!achado || d < achado.dist) achado = { index: i, hue: hues[i], dist: d };
    }

    return achado;
  }

  /**
   * Arrastar um marcador secundário abre ou fecha o esquema inteiro: todos os
   * braços escalam pelo mesmo fator e a composição se mantém. É o gesto que o
   * artista quer na maior parte do tempo — mexer um braço só desmancha a
   * simetria que o esquema existe para garantir.
   *
   * Com Alt, o braço arrastado se move sozinho, para ajuste fino.
   *
   * O offset é relativo ao matiz principal, então o esquema editado continua
   * acompanhando a cor quando o marcador principal se move.
   */
  function applyHarmonyDrag(p, evt) {
    const hue = screenAngle(p) - S.state.wheelRotation;
    let offset = hue - S.getHsv().h;
    if (evt.shiftKey) offset = Math.round(offset / 15) * 15;

    if (evt.altKey) S.setHarmonyOffset(rotateAnchor.index, offset);
    else S.spreadHarmony(rotateAnchor.index, offset);
  }

  function onPointerDown(evt) {
    const p = toCanvasCoords(evt);
    const dist = Math.hypot(p.x - CX, p.y - CY);
    const onRing = dist >= INNER_R - 2 && dist <= OUTER_R + 2;

    // Em modo de edição, a máscara tem prioridade sobre a escolha de cor
    if (S.state.shape === 'disc') {
      const grab = pickMaskHandle(p, evt);
      if (grab) {
        dragMode = 'mask';
        rotateAnchor = { ...grab, local: discLocal(p.x, p.y), gamut: { ...S.state.gamut } };
        canvas.setPointerCapture(evt.pointerId);
        return;
      }
    }

    // Shift no anel gira a roda em vez de escolher matiz
    if (onRing && evt.shiftKey) {
      dragMode = 'rotate';
      rotateAnchor = { startAngle: screenAngle(p), startRotation: S.state.wheelRotation };
      canvas.setPointerCapture(evt.pointerId);
      return;
    }

    /**
     * Marcador secundário: arrastar edita o ângulo daquele braço, clicar sem
     * arrastar adota a cor (Requisito 3.4). A distinção é feita na soltura,
     * comparando o quanto o cursor andou.
     */
    const secondary = pickSecondary(p);
    if (secondary) {
      dragMode = 'harmony';
      rotateAnchor = { index: secondary.index, hue: secondary.hue, start: p, moved: false };
      canvas.setPointerCapture(evt.pointerId);
      return;
    }

    if (onRing) {
      dragMode = 'ring';
      applyRing(p);
    } else if (dist < INNER_R) {
      dragMode = 'sv';
      applySv(p);
    } else {
      // Requisito 1.6: fora dos limites não altera nada
      return;
    }
    canvas.setPointerCapture(evt.pointerId);
  }

  function onPointerMove(evt) {
    const p = toCanvasCoords(evt);

    if (!dragMode) { updateMaskCursor(p, evt); return; }

    if (dragMode === 'ring') applyRing(p);
    else if (dragMode === 'sv') applySv(p);
    else if (dragMode === 'rotate') applyRotate(p, evt);
    else if (dragMode === 'mask') applyMaskDrag(p, evt);
    else if (dragMode === 'harmony') {
      const moved = Math.hypot(p.x - rotateAnchor.start.x, p.y - rotateAnchor.start.y) > 3;
      if (moved) rotateAnchor.moved = true;
      if (rotateAnchor.moved) applyHarmonyDrag(p, evt);
    }
  }

  function onPointerUp(evt) {
    if (!dragMode) return;

    // Clique seco num marcador secundário adota a cor daquele braço
    if (dragMode === 'harmony' && !rotateAnchor.moved) {
      const hsv = S.getHsv();
      S.setHsv({ h: rotateAnchor.hue, s: hsv.s, v: hsv.v }, { commit: true });
    }

    // Girar a roda, editar a máscara e editar a harmonia não mudam a cor
    const isColorChange = dragMode === 'ring' || dragMode === 'sv';
    dragMode = null;
    rotateAnchor = null;
    if (canvas.hasPointerCapture(evt.pointerId)) canvas.releasePointerCapture(evt.pointerId);
    if (isColorChange) S.pushHistory();
  }

  /* ================= Ícones de harmonia ================= */

  /**
   * Ícone do esquema de harmonia.
   *
   * As medidas são proporcionais ao lado do canvas, tomando 26 como base: o
   * canvas é desenhado em resolução maior que a exibida e o CSS reduz. Sem
   * isso, um canvas de 26 px exibido num tamanho fracionário — que é o caso,
   * porque o painel escala — cai em meio pixel e o ícone parece deslocado
   * dentro do botão.
   */
  function drawSchemeIcon(cv, scheme) {
    const c = cv.getContext('2d');
    const w = cv.width;
    const s = w / 26;
    const r = w / 2 - 1 * s;
    const cx = w / 2, cy = w / 2;

    c.clearRect(0, 0, w, w);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = '#9a9a9a';
    c.fill();

    [0].concat(scheme.offsets).forEach((off, idx) => {
      const a = (off - 90) * DEG;
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, r, a - 0.16, a + 0.16);
      c.closePath();
      c.fillStyle = idx === 0 ? '#f2f2f2' : '#4d4d4d';
      c.fill();

      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      c.lineWidth = 1.5 * s;
      c.strokeStyle = idx === 0 ? '#fff' : '#3a3a3a';
      c.stroke();
    });

    if (scheme.offsets.length === 0) {
      c.beginPath();
      c.arc(cx, cy, 3.5 * s, 0, Math.PI * 2);
      c.fillStyle = '#2f2f2f';
      c.fill();
    }
  }

  // Ícones das formas do seletor, para os botões do trilho esquerdo
  function drawShapeIcon(cv, kind) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2, cy = w / 2, r = w / 2 - 2;

    c.clearRect(0, 0, w, w);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = '#9a9a9a';
    c.lineWidth = 1.5;
    c.stroke();

    c.fillStyle = '#d8d8d8';
    if (kind === 'triangle') {
      const tr = r - 3;
      c.beginPath();
      [0, 120, 240].forEach((angle, i) => {
        const a = angle * DEG;
        const x = cx + tr * Math.cos(a), y = cy + tr * Math.sin(a);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.closePath();
      c.fill();
    } else if (kind === 'square') {
      const half = (r - 2) / Math.SQRT2;
      c.fillRect(cx - half, cy - half, half * 2, half * 2);
    } else {
      c.beginPath();
      c.arc(cx, cy, r - 3, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Ícones dos formatos de máscara: disco claro com a forma vazada em escuro
  function drawMaskKindIcon(cv, kind, active) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2, cy = w / 2;
    const r = w / 2 - 1;

    c.clearRect(0, 0, w, w);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = active ? '#d2d2d2' : '#a6a6a6';
    c.fill();

    c.fillStyle = active ? '#3a3a3a' : '#5f5f5f';
    const k = r * 0.58;
    const shape = S.maskShape(kind);

    if (kind === 'ellipse') {
      c.beginPath();
      c.ellipse(cx, cy, k, k * 0.62, 0, 0, Math.PI * 2);
      c.fill();
      return;
    }
    if (kind === 'rect') {
      const h = k * 0.44;
      c.fillRect(cx - k, cy - h / 2, k * 2, h);
      return;
    }
    if (kind === 'dual') {
      c.beginPath();
      c.ellipse(cx, cy - k * 0.38, k * 0.68, k * 0.44, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(cx, cy + k * 0.6, k * 0.3, 0, Math.PI * 2);
      c.fill();
      return;
    }

    // Triângulo, losango e hexágono vêm direto da definição da máscara
    const squash = kind === 'diamond' ? 1 : 1;
    const stretch = kind === 'diamond' ? 0.55 : 1;
    c.beginPath();
    shape.points.forEach((p, i) => {
      const x = cx + p.x * k * stretch, y = cy + p.y * k * squash;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.closePath();
    c.fill();
  }

  // Ícone da conferência de valores: círculo partido em preto e branco
  function drawValueIcon(cv, active) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2, cy = w / 2, r = w / 2 - 2;

    c.clearRect(0, 0, w, w);

    c.beginPath();
    c.moveTo(cx, cy - r);
    c.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
    c.closePath();
    c.fillStyle = '#1e1e1e';
    c.fill();

    c.beginPath();
    c.moveTo(cx, cy + r);
    c.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2);
    c.closePath();
    c.fillStyle = '#f2f2f2';
    c.fill();

    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.lineWidth = 1.4;
    c.strokeStyle = active ? '#ffffff' : '#8a8a8a';
    c.stroke();
  }

  // Solzinho do travamento de luminosidade
  function drawSunIcon(cv, active) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2, cy = w / 2;
    const core = w * 0.22, ray = w * 0.42;

    c.clearRect(0, 0, w, w);
    const tint = active ? '#ffd479' : '#c9c9c9';

    c.beginPath();
    c.arc(cx, cy, core, 0, Math.PI * 2);
    c.fillStyle = tint;
    c.fill();

    c.strokeStyle = tint;
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i * 45) * DEG;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (core + 2), cy + Math.sin(a) * (core + 2));
      c.lineTo(cx + Math.cos(a) * ray, cy + Math.sin(a) * ray);
      c.stroke();
    }
  }

  // Ícone do gamut mask: elipse inclinada dentro do disco
  function drawGamutIcon(cv, active) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2, cy = w / 2, r = w / 2 - 2;

    c.clearRect(0, 0, w, w);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = active ? '#e8e8e8' : '#9a9a9a';
    c.lineWidth = 1.4;
    c.stroke();

    c.save();
    c.translate(cx, cy);
    c.rotate(-28 * DEG);
    c.beginPath();
    c.ellipse(0, 0, r * 0.78, r * 0.42, 0, 0, Math.PI * 2);
    c.fillStyle = active ? 'rgba(224,59,48,.75)' : 'rgba(180,180,180,.5)';
    c.fill();
    c.strokeStyle = active ? '#e03b30' : '#9a9a9a';
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
  }

  /* ---------------- Ícones das ferramentas da máscara ---------------- */

  /**
   * Editar, travar e restaurar eram os caracteres `✎`, `🔒` e `↺`.
   *
   * Texto não serve aqui. O glifo depende da fonte instalada, e o emoji vem
   * colorido pela fonte do sistema — o cadeado saía amarelo, brigando com o
   * cinza do resto dos controles, e o tamanho não acompanhava `--u` como os
   * outros ícones. Desenhados em canvas eles seguem a mesma convenção dos
   * demais: um par de cores que responde ao estado e geometria em unidades do
   * próprio botão.
   */

  const ICON_ON = '#e8e8e8';
  const ICON_OFF = '#c9c9c9';

  // Lápis inclinado a 45°, com ponta e corpo
  function drawEditIcon(cv, active) {
    const c = cv.getContext('2d');
    const w = cv.width;

    c.clearRect(0, 0, w, w);
    const tint = active ? ICON_ON : ICON_OFF;

    c.save();
    c.translate(w / 2, w / 2);
    c.rotate(-45 * DEG);

    const len = w * 0.52;      // comprimento total do lápis
    const halfW = w * 0.11;    // metade da largura do corpo
    const tip = w * 0.16;      // comprimento da ponta

    // Corpo
    c.beginPath();
    c.rect(-len / 2, -halfW, len - tip, halfW * 2);
    c.fillStyle = tint;
    c.fill();

    // Ponta: triângulo fechando na direita
    c.beginPath();
    c.moveTo(len / 2 - tip, -halfW);
    c.lineTo(len / 2, 0);
    c.lineTo(len / 2 - tip, halfW);
    c.closePath();
    c.fill();

    // Traço da borracha, na outra extremidade
    c.beginPath();
    c.rect(-len / 2, -halfW, w * 0.07, halfW * 2);
    c.fillStyle = active ? '#9a9a9a' : '#7d7d7d';
    c.fill();

    c.restore();
  }

  // Cadeado: arco por cima, corpo retangular por baixo
  function drawLockIcon(cv, active) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2;

    c.clearRect(0, 0, w, w);
    const tint = active ? ICON_ON : ICON_OFF;

    const bodyW = w * 0.46, bodyH = w * 0.34;
    const bodyY = w * 0.52;
    const shackleR = bodyW * 0.34;
    const shackleY = bodyY - shackleR * 0.5;

    // Arco. Aberto quando destravado, para o estado ser legível sem cor.
    c.beginPath();
    if (active) {
      c.arc(cx, shackleY, shackleR, Math.PI, 0);
    } else {
      // Destravado: o arco sai do corpo e abre para a direita
      c.arc(cx + shackleR * 0.55, shackleY, shackleR, Math.PI, -Math.PI * 0.15);
    }
    c.lineWidth = Math.max(1.4, w * 0.09);
    c.strokeStyle = tint;
    c.lineCap = 'round';
    c.stroke();

    // Corpo
    const r = w * 0.05;
    const x = cx - bodyW / 2, y = bodyY;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + bodyW - r, y);
    c.quadraticCurveTo(x + bodyW, y, x + bodyW, y + r);
    c.lineTo(x + bodyW, y + bodyH - r);
    c.quadraticCurveTo(x + bodyW, y + bodyH, x + bodyW - r, y + bodyH);
    c.lineTo(x + r, y + bodyH);
    c.quadraticCurveTo(x, y + bodyH, x, y + bodyH - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fillStyle = tint;
    c.fill();

    // Furo da chave, vazado no tom do botão
    c.beginPath();
    c.arc(cx, y + bodyH * 0.42, w * 0.055, 0, Math.PI * 2);
    c.fillStyle = '#3a3a3a';
    c.fill();
  }

  // Restaurar: seta circular anti-horária, aberta no topo
  function drawResetIcon(cv, active) {
    const c = cv.getContext('2d');
    const w = cv.width, cx = w / 2, cy = w / 2;
    const r = w * 0.3;

    c.clearRect(0, 0, w, w);
    const tint = active ? ICON_ON : ICON_OFF;

    // Arco quase completo, com a boca voltada para cima
    const start = -60 * DEG;
    const end = 250 * DEG;
    c.beginPath();
    c.arc(cx, cy, r, start, end);
    c.lineWidth = Math.max(1.4, w * 0.085);
    c.strokeStyle = tint;
    c.lineCap = 'round';
    c.stroke();

    /**
     * Ponta de flecha no início do arco, apontando no sentido do giro.
     * A tangente em `start` é a direção do movimento; a cabeça é desenhada
     * em torno dela para a seta não parecer colada de qualquer jeito.
     */
    const px = cx + Math.cos(start) * r;
    const py = cy + Math.sin(start) * r;
    const tangent = start - Math.PI / 2;   // sentido anti-horário
    const head = w * 0.17;

    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(
      px + Math.cos(tangent + 2.5) * head,
      py + Math.sin(tangent + 2.5) * head
    );
    c.lineTo(
      px + Math.cos(tangent - 2.5) * head,
      py + Math.sin(tangent - 2.5) * head
    );
    c.closePath();
    c.fillStyle = tint;
    c.fill();
  }

  /* ================= Init ================= */

  function init() {
    canvas = document.getElementById('wheel');

    /**
     * O CSS define o tamanho em unidades de referência; aqui o backing store
     * ganha os pixels do dispositivo e o contexto é escalado, então todo o
     * desenho continua em unidades de referência, sem distorção.
     */
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(SIZE * DPR);
    canvas.height = Math.round(SIZE * DPR);

    ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;   // Requisito 1.5

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    S.subscribe((st, reason) => {
      if (reason === 'shape' || reason === 'rotation' || reason === 'gamut') svCacheKey = null;
      requestRender();
    });

    requestRender();
  }

  return {
    init, requestRender, invalidateCaches,
    drawSchemeIcon, drawShapeIcon, drawSunIcon, drawGamutIcon, drawValueIcon,
    drawEditIcon, drawLockIcon, drawResetIcon,
    drawMaskKindIcon,
    // expostos para verificação da geometria (Requisito 2)
    geometry: {
      triVertices, barycentric, baryToSv, svToPoint, clampToTriangle,
      squareRect, squarePointToSv, squareSvToPoint, clampToSquare, insideSquare,
      discLocal, discToScreen, discPointToHs, discHsToPoint, insideDisc, clampToDisc,
      hueMarkerPos, screenAngle, SHAPES,
      SIZE, CX, CY, OUTER_R, INNER_R, INNER_RATIO, TRI_R, SQ_R, DISC_R,
      MARKER_TRACK_R,
      maskHandles, maskVertexHandles
    }
  };
})();
