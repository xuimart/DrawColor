/**
 * color.js — Lógica de conversão entre espaços de cor.
 * Requisito 11: HSV, RGB, LAB, CMYK com round-trip dentro de ±1.
 */
window.Color = (function () {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* ---------------- HSV <-> RGB ---------------- */

  /**
   * HSV -> RGB em precisão contínua (componentes 0-255 sem arredondar).
   * As conversões internas trabalham em float; o arredondamento para
   * 8 bits acontece só na borda (display, hex, Photoshop). Sem isso a
   * ida-e-volta HSV -> RGB -> HSV perde o matiz em cores dessaturadas.
   */
  function hsvToRgbFloat(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    v = clamp(v, 0, 100) / 100;

    const c = v * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;

    if (hp < 1)      { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else             { r = c; b = x; }

    const m = v - c;
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  // h: 0-360, s: 0-100, v: 0-100  ->  r/g/b: 0-255 inteiros
  function hsvToRgb(h, s, v) {
    const f = hsvToRgbFloat(h, s, v);
    return { r: Math.round(f.r), g: Math.round(f.g), b: Math.round(f.b) };
  }

  function rgbToHsv(r, g, b) {
    r = clamp(r, 0, 255) / 255;
    g = clamp(g, 0, 255) / 255;
    b = clamp(b, 0, 255) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    if (d !== 0) {
      if (max === r)      h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else                h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;

    return {
      h: h,
      s: max === 0 ? 0 : (d / max) * 100,
      v: max * 100
    };
  }

  /* ---------------- HEX ---------------- */

  function rgbToHex(r, g, b) {
    const p = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return ('#' + p(r) + p(g) + p(b)).toUpperCase();
  }

  // Retorna null quando a entrada é inválida (Requisito 6.5)
  function hexToRgb(input) {
    if (typeof input !== 'string') return null;
    const raw = input.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16)
    };
  }

  /* ---------------- RGB <-> LAB (sRGB, D65) ---------------- */

  const WHITE = { x: 95.047, y: 100.0, z: 108.883 };

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    /**
     * O `+ 0` normaliza -0 para 0. Math.round preserva o sinal de negativos
     * minúsculos, e um componente -0 atravessa comparações estritas e
     * serialização de forma inconsistente. Componente de cor não tem sinal.
     */
    return clamp(Math.round(v * 255) + 0, 0, 255);
  }

  function rgbToLab(r, g, b) {
    const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);

    const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) * 100;
    const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) * 100;
    const z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) * 100;

    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116);
    const fx = f(x / WHITE.x), fy = f(y / WHITE.y), fz = f(z / WHITE.z);

    return {
      L: (116 * fy) - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  function labToRgb(L, a, bb) {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - bb / 200;

    const inv = (t) => {
      const t3 = t * t * t;
      return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
    };

    const x = inv(fx) * WHITE.x / 100;
    const y = inv(fy) * WHITE.y / 100;
    const z = inv(fz) * WHITE.z / 100;

    const rl =  x *  3.2404542 + y * -1.5371385 + z * -0.4985314;
    const gl =  x * -0.9692660 + y *  1.8760108 + z *  0.0415560;
    const bl =  x *  0.0556434 + y * -0.2040259 + z *  1.0572252;

    // Requisito 11.7: clipping por componente para fora de gamut
    return { r: linearToSrgb(rl), g: linearToSrgb(gl), b: linearToSrgb(bl) };
  }

  /* ---------------- RGB <-> CMYK ---------------- */

  function rgbToCmyk(r, g, b) {
    const rn = clamp(r, 0, 255) / 255, gn = clamp(g, 0, 255) / 255, bn = clamp(b, 0, 255) / 255;
    const k = 1 - Math.max(rn, gn, bn);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: ((1 - rn - k) / (1 - k)) * 100,
      m: ((1 - gn - k) / (1 - k)) * 100,
      y: ((1 - bn - k) / (1 - k)) * 100,
      k: k * 100
    };
  }

  function cmykToRgb(c, m, y, k) {
    c = clamp(c, 0, 100) / 100; m = clamp(m, 0, 100) / 100;
    y = clamp(y, 0, 100) / 100; k = clamp(k, 0, 100) / 100;
    return {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k))
    };
  }

  /* ---------------- Gamut CMYK (aproximação para demo) ---------------- */

  // Envelope de croma aproximado de um gamut de impressão típico.
  // Num plugin real isso viria do perfil ICC do documento (Requisito 11.5).
  function maxChroma(L) {
    const t = clamp(L, 0, 100) / 100;
    return 88 * Math.pow(Math.sin(Math.PI * t), 0.75);
  }

  function isOutOfGamut(r, g, b) {
    const lab = rgbToLab(r, g, b);
    const chroma = Math.hypot(lab.a, lab.b);
    return chroma > maxChroma(lab.L);
  }

  /**
   * Reduz o croma mantendo matiz e luminosidade até a cor entrar no gamut
   * (menor Delta E, Requisito 8.3). A busca binária é necessária porque
   * labToRgb faz clipping por componente, o que pode reintroduzir croma.
   */
  function clipToGamut(r, g, b) {
    if (!isOutOfGamut(r, g, b)) return { r, g, b };

    const lab = rgbToLab(r, g, b);
    let lo = 0, hi = 1, best = labToRgb(lab.L, 0, 0);

    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const cand = labToRgb(lab.L, lab.a * mid, lab.b * mid);
      if (isOutOfGamut(cand.r, cand.g, cand.b)) {
        hi = mid;
      } else {
        lo = mid;
        best = cand;
      }
    }
    return best;
  }

  /* ---------------- Escala de cinza perceptual ---------------- */

  /**
   * Converte para cinza preservando a luminosidade percebida (L do LAB).
   * Diferente do desaturar por média ou por luma Rec.709: aqui amarelo e
   * azul saturados resultam em cinzas realmente diferentes, que é o que
   * o artista precisa ver ao conferir valores.
   */
  function toGray(r, g, b) {
    const L = rgbToLab(r, g, b).L;
    return labToRgb(L, 0, 0);
  }

  function deltaE(c1, c2) {
    const a = rgbToLab(c1.r, c1.g, c1.b);
    const b = rgbToLab(c2.r, c2.g, c2.b);
    return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
  }

  /* ---------------- Roda do artista (RYB) ---------------- */

  /**
   * Correspondência entre a posição na roda RYB e o matiz real em HSV.
   *
   * A roda RYB é a do pintor: as primárias são vermelho, amarelo e azul,
   * igualmente espaçadas. A roda HSV é a da luz: vermelho, verde e azul. São
   * rodas diferentes, e é isso que muda a teoria das cores — o complementar
   * do vermelho é o VERDE no RYB e o ciano no HSV.
   *
   * A tabela dá o matiz HSV de cada um dos 12 matizes clássicos do círculo
   * cromático RYB, de 30 em 30 graus:
   *
   *   0   vermelho          →   0
   *   30  vermelho-laranja  →  15
   *   60  laranja           →  30
   *   90  amarelo-laranja   →  45
   *   120 amarelo           →  60
   *   150 amarelo-verde     →  90
   *   180 verde             → 120
   *   210 azul-verde        → 180
   *   240 azul              → 240
   *   270 azul-violeta      → 270
   *   300 violeta           → 285
   *   330 vermelho-violeta  → 330
   *
   * Entre dois pontos a correspondência é linear. A tabela é estritamente
   * crescente, o que garante que a função tem inversa — condição necessária,
   * porque a roda converte nos dois sentidos a cada quadro (posição do cursor
   * para matiz, e matiz dos marcadores para posição na tela).
   *
   * Confira as três primárias e seus complementares, que é o teste que
   * importa para o pintor:
   *   vermelho (0)   ↔ verde (180)    → matizes HSV 0 e 120
   *   amarelo (120)  ↔ violeta (300)  → matizes HSV 60 e 285
   *   azul (240)     ↔ laranja (60)   → matizes HSV 240 e 30
   */
  const RYB_HUE_TABLE = [0, 15, 30, 45, 60, 90, 120, 180, 240, 270, 285, 330, 360];
  const RYB_STEP = 360 / (RYB_HUE_TABLE.length - 1);   // 30°

  const wrap360 = (deg) => ((deg % 360) + 360) % 360;

  /** Posição na roda RYB (0-360) -> matiz HSV (0-360). */
  function rybToHue(angle) {
    const a = wrap360(angle);
    const i = Math.min(Math.floor(a / RYB_STEP), RYB_HUE_TABLE.length - 2);
    const t = (a - i * RYB_STEP) / RYB_STEP;
    const hue = RYB_HUE_TABLE[i] + (RYB_HUE_TABLE[i + 1] - RYB_HUE_TABLE[i]) * t;
    return wrap360(hue);
  }

  /** Matiz HSV (0-360) -> posição na roda RYB (0-360). Inversa de rybToHue. */
  function hueToRyb(hue) {
    const h = wrap360(hue);
    for (let i = 0; i < RYB_HUE_TABLE.length - 1; i++) {
      const lo = RYB_HUE_TABLE[i];
      const hi = RYB_HUE_TABLE[i + 1];
      if (h >= lo && h <= hi) {
        // hi > lo sempre: a tabela é estritamente crescente.
        const t = (h - lo) / (hi - lo);
        return wrap360((i + t) * RYB_STEP);
      }
    }
    return h;   // inalcançável: a tabela cobre [0, 360]
  }

  /* ---------------- Mistura ---------------- */

  // Interpolação linear em RGB (Requisito 5.4)
  function mixRgb(c1, c2, t) {
    t = clamp(t, 0, 1);
    return {
      r: Math.round(c1.r + (c2.r - c1.r) * t),
      g: Math.round(c1.g + (c2.g - c1.g) * t),
      b: Math.round(c1.b + (c2.b - c1.b) * t)
    };
  }

  return {
    clamp,
    hsvToRgb, hsvToRgbFloat, rgbToHsv,
    rgbToHex, hexToRgb,
    rgbToLab, labToRgb,
    rgbToCmyk, cmykToRgb,
    isOutOfGamut, clipToGamut, deltaE,
    toGray, mixRgb,
    rybToHue, hueToRyb, RYB_HUE_TABLE
  };
})();
