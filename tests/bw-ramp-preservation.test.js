/**
 * Preservation property tests for the B/W ramp bugfix.
 *
 * These tests capture the baseline behavior of modes RGB, HSV, LAB and CMYK
 * that must NOT change when we fix the B/W mode. All tests MUST PASS on the
 * current unfixed code. If any test fails, the test is wrong (not the code).
 *
 * Methodology: observation-first. Each property was confirmed on the unfixed
 * code before being asserted.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
 */
'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fc = require('fast-check');

require('./setup.js');

let C, S, Panels;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

before(() => {
  load('color.js');
  load('state.js');
  load('panels.js');
  C = window.Color;
  S = window.AppState;
  Panels = window.Panels;
});

beforeEach(() => {
  // Reset state to known baseline
  S.state.sliderMode = 'RGB';
  S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };
  S.state.channels = null;
});

/* =========================================================================
 * Arbitraries
 * ========================================================================= */

const rgbArb = fc.record({
  r: fc.integer({ min: 0, max: 255 }),
  g: fc.integer({ min: 0, max: 255 }),
  b: fc.integer({ min: 0, max: 255 })
});

/* =========================================================================
 * Test 2a: RGB identity — MODES.RGB.fromRgb(rgb) === rgb
 *
 * **Validates: Requirements 3.1**
 * ========================================================================= */

describe('Test 2a: RGB mode fromRgb is identity', () => {
  it('for all RGB in [0,255]³, MODES.RGB.fromRgb(rgb) === rgb', () => {
    fc.assert(
      fc.property(rgbArb, (rgb) => {
        const result = Panels.MODES.RGB.fromRgb(rgb);
        assert.strictEqual(result.r, rgb.r, `r: expected ${rgb.r}, got ${result.r}`);
        assert.strictEqual(result.g, rgb.g, `g: expected ${rgb.g}, got ${result.g}`);
        assert.strictEqual(result.b, rgb.b, `b: expected ${rgb.b}, got ${result.b}`);
      }),
      { numRuns: 500 }
    );
  });

  it('MODES.RGB.toRgb clamps and rounds to [0,255]', () => {
    fc.assert(
      fc.property(rgbArb, (rgb) => {
        const result = Panels.MODES.RGB.toRgb(rgb);
        assert.strictEqual(result.r, Math.round(C.clamp(rgb.r, 0, 255)));
        assert.strictEqual(result.g, Math.round(C.clamp(rgb.g, 0, 255)));
        assert.strictEqual(result.b, Math.round(C.clamp(rgb.b, 0, 255)));
      }),
      { numRuns: 500 }
    );
  });
});

/* =========================================================================
 * Test 2b: HSV round-trip — toRgb(fromRgb(rgb)) within ±1 per component
 *
 * Note: MODES.HSV.fromRgb() ignores its argument and reads S.getHsv().
 * So the round-trip test sets the color via S.setRgb first, then verifies
 * that HSV.toRgb(HSV.fromRgb(rgb)) is within ±1 of the current RGB.
 *
 * **Validates: Requirements 3.1, 3.3**
 * ========================================================================= */

describe('Test 2b: HSV round-trip within ±1 per component', () => {
  it('for all RGB in [0,255]³, HSV round-trip is within ±1', () => {
    fc.assert(
      fc.property(rgbArb, (rgb) => {
        // Set the color in AppState so HSV.fromRgb can read it
        S.setRgb(rgb.r, rgb.g, rgb.b, { reason: 'color' });

        const hsv = Panels.MODES.HSV.fromRgb(rgb);
        const back = Panels.MODES.HSV.toRgb(hsv);

        const currentRgb = S.getRgb();
        assert.ok(Math.abs(back.r - currentRgb.r) <= 1,
          `r: HSV round-trip off by ${Math.abs(back.r - currentRgb.r)} (${currentRgb.r} -> ${back.r})`);
        assert.ok(Math.abs(back.g - currentRgb.g) <= 1,
          `g: HSV round-trip off by ${Math.abs(back.g - currentRgb.g)} (${currentRgb.g} -> ${back.g})`);
        assert.ok(Math.abs(back.b - currentRgb.b) <= 1,
          `b: HSV round-trip off by ${Math.abs(back.b - currentRgb.b)} (${currentRgb.b} -> ${back.b})`);
      }),
      { numRuns: 500 }
    );
  });
});

/* =========================================================================
 * Test 2c: LAB fromRgb matches C.rgbToLab and round-trip is ±1
 *
 * **Validates: Requirements 3.1, 3.3**
 * ========================================================================= */

describe('Test 2c: LAB fromRgb matches C.rgbToLab and round-trip ±1', () => {
  it('for all RGB in [0,255]³, MODES.LAB.fromRgb(rgb) matches C.rgbToLab', () => {
    fc.assert(
      fc.property(rgbArb, (rgb) => {
        const result = Panels.MODES.LAB.fromRgb(rgb);
        const expected = C.rgbToLab(rgb.r, rgb.g, rgb.b);

        assert.strictEqual(result.L, expected.L, `L mismatch`);
        assert.strictEqual(result.a, expected.a, `a mismatch`);
        assert.strictEqual(result.b, expected.b, `b mismatch`);
      }),
      { numRuns: 500 }
    );
  });

  it('for all RGB in [0,255]³, LAB round-trip is within ±1 per component', () => {
    fc.assert(
      fc.property(rgbArb, (rgb) => {
        const lab = Panels.MODES.LAB.fromRgb(rgb);
        const back = Panels.MODES.LAB.toRgb(lab);

        assert.ok(Math.abs(back.r - rgb.r) <= 1,
          `r: LAB round-trip off by ${Math.abs(back.r - rgb.r)} (${rgb.r} -> ${back.r})`);
        assert.ok(Math.abs(back.g - rgb.g) <= 1,
          `g: LAB round-trip off by ${Math.abs(back.g - rgb.g)} (${rgb.g} -> ${back.g})`);
        assert.ok(Math.abs(back.b - rgb.b) <= 1,
          `b: LAB round-trip off by ${Math.abs(back.b - rgb.b)} (${rgb.b} -> ${back.b})`);
      }),
      { numRuns: 500 }
    );
  });
});

/* =========================================================================
 * Test 2d: CMYK fromRgb matches C.rgbToCmyk and round-trip is ±1
 *
 * **Validates: Requirements 3.1, 3.3**
 * ========================================================================= */

describe('Test 2d: CMYK fromRgb matches C.rgbToCmyk and round-trip ±1', () => {
  it('for all RGB in [0,255]³, MODES.CMYK.fromRgb(rgb) matches C.rgbToCmyk', () => {
    fc.assert(
      fc.property(rgbArb, (rgb) => {
        const result = Panels.MODES.CMYK.fromRgb(rgb);
        const expected = C.rgbToCmyk(rgb.r, rgb.g, rgb.b);

        assert.strictEqual(result.c, expected.c, `c mismatch`);
        assert.strictEqual(result.m, expected.m, `m mismatch`);
        assert.strictEqual(result.y, expected.y, `y mismatch`);
        assert.strictEqual(result.k, expected.k, `k mismatch`);
      }),
      { numRuns: 500 }
    );
  });

  it('for all RGB in [0,255]³, CMYK round-trip is within ±1 per component', () => {
    fc.assert(
      fc.property(rgbArb, (rgb) => {
        const cmyk = Panels.MODES.CMYK.fromRgb(rgb);
        const back = Panels.MODES.CMYK.toRgb(cmyk);

        assert.ok(Math.abs(back.r - rgb.r) <= 1,
          `r: CMYK round-trip off by ${Math.abs(back.r - rgb.r)} (${rgb.r} -> ${back.r})`);
        assert.ok(Math.abs(back.g - rgb.g) <= 1,
          `g: CMYK round-trip off by ${Math.abs(back.g - rgb.g)} (${rgb.g} -> ${back.g})`);
        assert.ok(Math.abs(back.b - rgb.b) <= 1,
          `b: CMYK round-trip off by ${Math.abs(back.b - rgb.b)} (${rgb.b} -> ${back.b})`);
      }),
      { numRuns: 500 }
    );
  });
});

/* =========================================================================
 * Test 2e: setBwSteps arredonda e limita entre 1 e 15
 *
 * O contrato é simples: arredonda para inteiro e limita entre BW_MIN (1) e
 * BW_MAX (15). Qualquer valor de 1 a 15 é aceito — o artista escolhe
 * livremente quantos degraus quer na régua.
 *
 * **Validates: Requirements 3.5**
 * ========================================================================= */

describe('Test 2e: setBwSteps arredonda e limita entre 1 e 15', () => {
  it('limita em BW_MIN (1) qualquer valor abaixo do mínimo', () => {
    [0, -5, -100].forEach((n) => {
      S.setBwSteps(n);
      assert.strictEqual(S.state.bwSteps, S.BW_MIN,
        `${n} deveria limitar em BW_MIN=${S.BW_MIN}`);
    });
    assert.strictEqual(S.BW_MIN, 1, 'BW_MIN deve ser 1');
  });

  it('limita em BW_MAX (15) qualquer valor acima do máximo', () => {
    [16, 20, 100, 1000].forEach((n) => {
      S.setBwSteps(n);
      assert.strictEqual(S.state.bwSteps, S.BW_MAX,
        `${n} deveria limitar em BW_MAX=${S.BW_MAX}`);
    });
    assert.strictEqual(S.BW_MAX, 15, 'BW_MAX deve ser 15');
  });

  it('aceita sem alteração todo inteiro de 1 a 15', () => {
    for (let n = 1; n <= 15; n++) {
      S.setBwSteps(n);
      assert.strictEqual(S.state.bwSteps, n, `deveria aceitar ${n} sem mudar`);
    }
  });

  it('arredonda valores fracionários para o inteiro mais próximo', () => {
    S.setBwSteps(7.6);
    assert.strictEqual(S.state.bwSteps, 8, '7.6 deveria arredondar para 8');

    S.setBwSteps(3.2);
    assert.strictEqual(S.state.bwSteps, 3, '3.2 deveria arredondar para 3');

    S.setBwSteps(10.5);
    assert.strictEqual(S.state.bwSteps, 11, '10.5 deveria arredondar para 11');
  });

  it('todo valor pedido resulta num inteiro entre 1 e 15', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 200 }), (n) => {
        S.setBwSteps(n);
        const N = S.state.bwSteps;
        assert.ok(N >= S.BW_MIN && N <= S.BW_MAX,
          `bwSteps=${N} deveria estar entre ${S.BW_MIN} e ${S.BW_MAX}`);
        assert.strictEqual(N, Math.round(N), `bwSteps=${N} deveria ser inteiro`);
      }),
      { numRuns: 300 }
    );
  });
});
