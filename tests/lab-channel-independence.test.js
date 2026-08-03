/**
 * Exploração da condição do bug: independência dos canais LAB no caminho ao vivo.
 *
 * Este teste exercita o ciclo que os testes unitários de `slider-channels.test.js`
 * NÃO cobrem: a fiação do subscriber `dropLatchIfExternal` ao `AppState`, que é
 * o que `Panels.init()` faz no navegador. É esse subscriber que descarta o triplo
 * editado quando chega um aviso com origem em `ORIGENS_EXTERNAS`, mesmo que a cor
 * não tenha mudado.
 *
 * O teste DEVE FALHAR no código não corrigido — a falha confirma que o bug existe.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.6**
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

  // Wire the live cycle: this is what Panels.init() does and what existing
  // tests don't exercise. The subscriber drops the latch when the reason is
  // in ORIGENS_EXTERNAS.
  S.subscribe((st, reason) => Panels.dropLatchIfExternal(reason));
});

beforeEach(() => {
  // Reset state to a known baseline before each test
  S.state.sliderMode = 'LAB';
  S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };
  S.state.gamut = {
    enabled: false, editing: false, locked: false,
    kind: 'ellipse', cx: 0, cy: 0, rx: 0.64, ry: 0.42, angle: 0, points: null
  };
});

/**
 * Helper: returns true if the LAB triple is not achievable in sRGB,
 * i.e. the round-trip through RGB loses more than 1 unit in some channel.
 */
function naoAlcancavelEmSRGB(L, a, b) {
  const rgb = C.labToRgb(L, a, b);
  const volta = C.rgbToLab(rgb.r, rgb.g, rgb.b);
  return Math.abs(volta.L - L) > 1 ||
         Math.abs(volta.a - a) > 1 ||
         Math.abs(volta.b - b) > 1;
}

/**
 * Helper: applies a full LAB triple channel by channel, as the user would.
 */
function applyTriple(L, a, b) {
  Panels.applyChannel('LAB', 'L', L);
  Panels.applyChannel('LAB', 'a', a);
  Panels.applyChannel('LAB', 'b', b);
}

describe('Bug Condition Exploration: independência dos canais LAB no caminho ao vivo', () => {

  describe('Caso determinístico do relato (L=100, A=127, B=127, edit A=110)', () => {
    it('os canais não editados devem manter seus valores após aviso intercorrente (setLimit)', () => {
      // Step 1: apply the out-of-sRGB triple
      applyTriple(100, 127, 127);

      // Confirm the triple was applied
      const before = Panels.readVals();
      assert.strictEqual(before.L, 100, 'L should be 100 after applying triple');
      assert.strictEqual(before.a, 127, 'A should be 127 after applying triple');
      assert.strictEqual(before.b, 127, 'B should be 127 after applying triple');

      // Record RGB before the intercurrent event
      const rgbBefore = S.getRgb();

      // Step 2: fire an intercurrent event that does NOT change the color
      S.setLimit({ enabled: false });

      // Verify the color did not change
      const rgbAfter = S.getRgb();
      assert.strictEqual(rgbAfter.r, rgbBefore.r, 'R should not change');
      assert.strictEqual(rgbAfter.g, rgbBefore.g, 'G should not change');
      assert.strictEqual(rgbAfter.b, rgbBefore.b, 'B should not change');

      // Step 3: edit only channel A to 110
      Panels.applyChannel('LAB', 'a', 110);

      // Step 4: assert the expected behavior
      const after = Panels.readVals();
      assert.strictEqual(after.L, 100,
        `L should remain 100 (got ${after.L} — derived from RGB clipped)`);
      assert.strictEqual(after.a, 110,
        `A should be the edited value 110 (got ${after.a})`);
      assert.strictEqual(after.b, 127,
        `B should remain 127 (got ${after.b} — derived from RGB clipped)`);
    });
  });

  describe('Property: independência dos canais para triplos Não_Alcançáveis (fast-check)', () => {
    it('editar um canal após aviso intercorrente preserva os outros canais', () => {
      fc.assert(
        fc.property(
          // Generate an out-of-sRGB LAB triple
          fc.integer({ min: 0, max: 100 }),    // L
          fc.integer({ min: -128, max: 127 }), // a
          fc.integer({ min: -128, max: 127 }), // b
          // Channel to edit: 0=L, 1=a, 2=b
          fc.integer({ min: 0, max: 2 }),
          // New value for the channel
          fc.integer({ min: -128, max: 127 }),
          (L, a, b, chIdx, newVal) => {
            // Filter: only test out-of-sRGB triples
            fc.pre(naoAlcancavelEmSRGB(L, a, b));

            const channels = ['L', 'a', 'b'];
            const key = channels[chIdx];

            // Clamp newVal to the valid range for the channel
            const clampedVal = key === 'L'
              ? Math.max(0, Math.min(100, newVal))
              : Math.max(-128, Math.min(127, newVal));

            // Reset state
            S.state.sliderMode = 'LAB';
            S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };

            // Apply the triple
            applyTriple(L, a, b);

            // Record RGB before
            const rgbBefore = S.getRgb();

            // Fire intercurrent event (setLimit with limit already disabled)
            S.setLimit({ enabled: false });

            // Verify the color didn't change
            const rgbAfter = S.getRgb();
            if (rgbAfter.r !== rgbBefore.r ||
                rgbAfter.g !== rgbBefore.g ||
                rgbAfter.b !== rgbBefore.b) {
              // Color actually changed — not the bug condition, skip
              return;
            }

            // Edit one channel
            Panels.applyChannel('LAB', key, clampedVal);

            // Read the result
            const after = Panels.readVals();

            // The edited channel should have the new value
            assert.strictEqual(after[key], clampedVal,
              `Edited channel ${key} should be ${clampedVal}, got ${after[key]}`);

            // The other channels should be exactly what was edited before
            const triple = { L, a, b };
            for (const other of channels) {
              if (other !== key) {
                assert.strictEqual(after[other], triple[other],
                  `Channel ${other} should remain ${triple[other]}, got ${after[other]}`);
              }
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('Variante: setGamut como intercorrente', () => {
    it('setGamut({}) também descarta o triplo indevidamente', () => {
      // Same cycle but with setGamut as the intercurrent event
      applyTriple(100, 127, 127);

      const rgbBefore = S.getRgb();

      // setGamut emits 'gamut' then 'color'
      S.setGamut({});

      const rgbAfter = S.getRgb();
      assert.strictEqual(rgbAfter.r, rgbBefore.r, 'R should not change after setGamut');
      assert.strictEqual(rgbAfter.g, rgbBefore.g, 'G should not change after setGamut');
      assert.strictEqual(rgbAfter.b, rgbBefore.b, 'B should not change after setGamut');

      // Edit only A
      Panels.applyChannel('LAB', 'a', 110);

      const after = Panels.readVals();
      assert.strictEqual(after.L, 100,
        `L should remain 100 after setGamut intercurrent (got ${after.L})`);
      assert.strictEqual(after.a, 110,
        `A should be 110 (got ${after.a})`);
      assert.strictEqual(after.b, 127,
        `B should remain 127 after setGamut intercurrent (got ${after.b})`);
    });
  });

  describe('Invariância da cor no intercorrente (deve passar hoje)', () => {
    it('setLimit({ enabled: false }) não altera nenhum componente de getRgb()', () => {
      applyTriple(100, 127, 127);
      const rgbBefore = S.getRgb();

      S.setLimit({ enabled: false });

      const rgbAfter = S.getRgb();
      assert.strictEqual(rgbAfter.r, rgbBefore.r, 'R changed');
      assert.strictEqual(rgbAfter.g, rgbBefore.g, 'G changed');
      assert.strictEqual(rgbAfter.b, rgbBefore.b, 'B changed');
    });
  });

  describe('Caso de borda: triplo dentro do sRGB (deve passar hoje)', () => {
    it('triplo alcançável sobrevive ao ciclo inteiro sem perder valores', () => {
      // L=50, a=10, b=-20 is well within sRGB
      const L = 50, a = 10, b = -20;

      // Verify it IS reachable
      assert.ok(!naoAlcancavelEmSRGB(L, a, b),
        'This triple should be reachable in sRGB for this test to be valid');

      applyTriple(L, a, b);

      const rgbBefore = S.getRgb();

      // Fire intercurrent
      S.setLimit({ enabled: false });

      const rgbAfter = S.getRgb();
      assert.strictEqual(rgbAfter.r, rgbBefore.r);
      assert.strictEqual(rgbAfter.g, rgbBefore.g);
      assert.strictEqual(rgbAfter.b, rgbBefore.b);

      // Edit one channel
      Panels.applyChannel('LAB', 'a', 15);

      const after = Panels.readVals();
      // For in-sRGB triples, even after latch drop, deriving from color
      // gives back the same numbers (within ±1 rounding), so the test passes.
      // The key assertion: L and b should be close to what was edited.
      assert.ok(Math.abs(after.L - L) <= 1,
        `L should be ~${L} (got ${after.L})`);
      assert.strictEqual(after.a, 15,
        `A should be 15 (got ${after.a})`);
      assert.ok(Math.abs(after.b - b) <= 1,
        `B should be ~${b} (got ${after.b})`);
    });
  });
});


/* ============================================================================
 * PRESERVATION TESTS — Comportamento inalterado fora da condição do bug.
 *
 * Estes testes fixam comportamentos que FUNCIONAM HOJE no código não corrigido
 * e que a correção não pode quebrar. Seguem a metodologia "observar primeiro":
 * cada propriedade foi confirmada no código atual antes de ser afirmada.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
 * ========================================================================= */

describe('Preservation: comportamento inalterado fora da condição do bug', () => {

  /* -----------------------------------------------------------------------
   * 1. Modos reversíveis derivam os canais da cor, mesmo com latch de outro modo
   * --------------------------------------------------------------------- */
  describe('Modos reversíveis derivam canais da cor mesmo com latch de outro modo', () => {

    it('RGB deriva da cor independente de latch LAB (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          (r, g, b) => {
            // Set a known color
            S.setRgb(r, g, b, { reason: 'color' });
            Panels.dropLatchIfExternal('color');

            // Apply a LAB triple to create a latch
            S.state.sliderMode = 'LAB';
            Panels.applyChannel('LAB', 'L', 80);
            Panels.applyChannel('LAB', 'a', -50);
            Panels.applyChannel('LAB', 'b', 60);

            // Switch to RGB: channels must derive from current color, not LAB latch
            S.state.sliderMode = 'RGB';
            const rgb = S.getRgb();
            const vals = Panels.readVals();

            assert.strictEqual(vals.r, rgb.r, `R should derive from color (${rgb.r}), got ${vals.r}`);
            assert.strictEqual(vals.g, rgb.g, `G should derive from color (${rgb.g}), got ${vals.g}`);
            assert.strictEqual(vals.b, rgb.b, `B should derive from color (${rgb.b}), got ${vals.b}`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('HSV deriva da cor independente de latch LAB (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 359 }),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 100 }),
          (h, s, v) => {
            S.setHsv({ h, s, v }, { reason: 'color' });
            Panels.dropLatchIfExternal('color');

            // Create a LAB latch
            S.state.sliderMode = 'LAB';
            Panels.applyChannel('LAB', 'L', 50);
            Panels.applyChannel('LAB', 'a', 30);
            Panels.applyChannel('LAB', 'b', -30);

            // Switch to HSV
            S.state.sliderMode = 'HSV';
            const hsv = S.getHsv();
            const vals = Panels.readVals();

            assert.strictEqual(vals.h, hsv.h, `H should derive from state`);
            assert.strictEqual(vals.s, hsv.s, `S should derive from state`);
            assert.strictEqual(vals.v, hsv.v, `V should derive from state`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('B/W deriva da cor independente de latch LAB', () => {
      // Set a known color
      S.setRgb(128, 128, 128, { reason: 'color' });
      Panels.dropLatchIfExternal('color');

      // Create a LAB latch
      S.state.sliderMode = 'LAB';
      Panels.applyChannel('LAB', 'L', 90);
      Panels.applyChannel('LAB', 'a', 100);
      Panels.applyChannel('LAB', 'b', 100);

      // Switch to B/W
      S.state.sliderMode = 'B/W';
      const rgb = S.getRgb();
      // After the B/W scale fix, fromRgb uses 8-bit scale:
      // For achromatic: Math.round(r / 255 * 100)
      // For chromatic: Math.round(labToRgb(L, 0, 0).r / 255 * 100)
      const L = C.rgbToLab(rgb.r, rgb.g, rgb.b).L;
      let expectedW;
      if (rgb.r === rgb.g && rgb.g === rgb.b) {
        expectedW = Math.round(rgb.r / 255 * 100);
      } else {
        const gray = C.labToRgb(L, 0, 0).r;
        expectedW = Math.round(gray / 255 * 100);
      }
      const vals = Panels.readVals();

      assert.strictEqual(vals.w, expectedW,
        `B/W should derive from color (expected ${expectedW}, got ${vals.w})`);
    });
  });

  /* -----------------------------------------------------------------------
   * 2. Triplo LAB dentro do sRGB sobrevive o ciclo inteiro sem alterar números
   * --------------------------------------------------------------------- */
  describe('Triplo LAB dentro do sRGB sobrevive o ciclo inteiro', () => {

    it('triplo alcançável preserva valores após ciclo completo (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 90 }),    // L (avoid extremes to stay in sRGB)
          fc.integer({ min: -40, max: 40 }),   // a (moderate range stays in sRGB)
          fc.integer({ min: -40, max: 40 }),   // b
          (L, a, b) => {
            // Only test triples that are in sRGB
            fc.pre(!naoAlcancavelEmSRGB(L, a, b));

            S.state.sliderMode = 'LAB';
            S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };

            // Apply the in-sRGB triple
            applyTriple(L, a, b);

            // Fire intercurrent event
            S.setLimit({ enabled: false });

            // Read vals: for in-sRGB triples, deriving from the color gives
            // back the same numbers (within ±1 rounding), so the full cycle works
            const after = Panels.readVals();

            assert.ok(Math.abs(after.L - L) <= 1,
              `L should be ~${L} (got ${after.L})`);
            assert.ok(Math.abs(after.a - a) <= 1,
              `a should be ~${a} (got ${after.a})`);
            assert.ok(Math.abs(after.b - b) <= 1,
              `b should be ~${b} (got ${after.b})`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /* -----------------------------------------------------------------------
   * 3. Escrita que muda a cor faz canais LAB descreverem a nova cor
   * --------------------------------------------------------------------- */
  describe('Escrita que muda a cor faz canais LAB descreverem a nova cor', () => {

    it('setRgb com cor nova invalida o triplo e canais descrevem a nova cor (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          (r, g, b) => {
            S.state.sliderMode = 'LAB';

            // Create a LAB latch with extreme values
            applyTriple(100, 127, 127);

            // Write a new color via wheel/palette/hex/host/peer path
            S.setRgb(r, g, b, { reason: 'color' });
            Panels.dropLatchIfExternal('color');

            // LAB channels must now describe the new color
            const rgb = S.getRgb();
            const expected = C.rgbToLab(rgb.r, rgb.g, rgb.b);
            const vals = Panels.readVals();

            assert.strictEqual(vals.L, expected.L,
              `L should describe new color: expected ${expected.L}, got ${vals.L}`);
            assert.strictEqual(vals.a, expected.a,
              `a should describe new color: expected ${expected.a}, got ${vals.a}`);
            assert.strictEqual(vals.b, expected.b,
              `b should describe new color: expected ${expected.b}, got ${vals.b}`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('host origin invalidates latch', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(100, -128, 127);

      S.setRgb(50, 100, 200, { reason: 'host' });
      Panels.dropLatchIfExternal('host');

      const rgb = S.getRgb();
      const expected = C.rgbToLab(rgb.r, rgb.g, rgb.b);
      const vals = Panels.readVals();

      assert.strictEqual(vals.L, expected.L);
      assert.strictEqual(vals.a, expected.a);
      assert.strictEqual(vals.b, expected.b);
    });

    it('peer origin invalidates latch', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(100, -128, 127);

      S.setRgb(200, 50, 100, { reason: 'peer' });
      Panels.dropLatchIfExternal('peer');

      const rgb = S.getRgb();
      const expected = C.rgbToLab(rgb.r, rgb.g, rgb.b);
      const vals = Panels.readVals();

      assert.strictEqual(vals.L, expected.L);
      assert.strictEqual(vals.a, expected.a);
      assert.strictEqual(vals.b, expected.b);
    });

    it('hex commit that changes color invalidates latch', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(100, 127, 127);

      // A hex that results in a different color
      S.setHex('336699', { reason: 'color' });
      Panels.dropLatchIfExternal('color');

      const rgb = S.getRgb();
      const expected = C.rgbToLab(rgb.r, rgb.g, rgb.b);
      const vals = Panels.readVals();

      assert.strictEqual(vals.L, expected.L);
      assert.strictEqual(vals.a, expected.a);
      assert.strictEqual(vals.b, expected.b);
    });
  });

  /* -----------------------------------------------------------------------
   * 4. Extremos dos canais LAB são aceitos e exibidos
   * --------------------------------------------------------------------- */
  describe('Extremos dos canais LAB são aceitos e exibidos', () => {

    const extremes = [
      { desc: 'L=100', ch: 'L', val: 100 },
      { desc: 'A=-128', ch: 'a', val: -128 },
      { desc: 'A=127', ch: 'a', val: 127 },
      { desc: 'B=-128', ch: 'b', val: -128 },
      { desc: 'B=127', ch: 'b', val: 127 }
    ];

    for (const { desc, ch, val } of extremes) {
      it(`aceita e exibe ${desc}`, () => {
        S.state.sliderMode = 'LAB';

        // Start with a base triple
        applyTriple(50, 0, 0);

        // Apply the extreme value
        Panels.applyChannel('LAB', ch, val);

        const vals = Panels.readVals();
        assert.strictEqual(vals[ch], val,
          `${desc}: expected ${val}, got ${vals[ch]}`);
      });
    }

    it('all extremes simultaneously (property)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(0, 100),                  // L extremes
          fc.constantFrom(-128, 127),               // a extremes
          fc.constantFrom(-128, 127),               // b extremes
          (L, a, b) => {
            S.state.sliderMode = 'LAB';
            applyTriple(L, a, b);

            const vals = Panels.readVals();
            assert.strictEqual(vals.L, L, `L should be ${L}, got ${vals.L}`);
            assert.strictEqual(vals.a, a, `a should be ${a}, got ${vals.a}`);
            assert.strictEqual(vals.b, b, `b should be ${b}, got ${vals.b}`);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /* -----------------------------------------------------------------------
   * 5. CMYK com K=100 preserva C, M, Y mesmo quando cor colapsa em preto
   * --------------------------------------------------------------------- */
  describe('CMYK com K=100 preserva C, M, Y', () => {

    it('preserva C, M, Y com K=100 (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (c, m, y) => {
            S.state.sliderMode = 'CMYK';

            // Apply CMYK with K=100
            Panels.applyChannel('CMYK', 'c', c);
            Panels.applyChannel('CMYK', 'm', m);
            Panels.applyChannel('CMYK', 'y', y);
            Panels.applyChannel('CMYK', 'k', 100);

            // Color must be black
            const rgb = S.getRgb();
            assert.strictEqual(rgb.r, 0, 'R must be 0 with K=100');
            assert.strictEqual(rgb.g, 0, 'G must be 0 with K=100');
            assert.strictEqual(rgb.b, 0, 'B must be 0 with K=100');

            // But C, M, Y must be preserved via latch
            const vals = Panels.readVals();
            assert.strictEqual(vals.c, c, `C should be ${c}, got ${vals.c}`);
            assert.strictEqual(vals.m, m, `M should be ${m}, got ${vals.m}`);
            assert.strictEqual(vals.y, y, `Y should be ${y}, got ${vals.y}`);
            assert.strictEqual(vals.k, 100, `K should be 100, got ${vals.k}`);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /* -----------------------------------------------------------------------
   * 6. Latch de um modo não se aplica a outro modo
   * --------------------------------------------------------------------- */
  describe('Latch de um modo não se aplica a outro modo', () => {

    it('latch LAB não vale em CMYK (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: -128, max: 127 }),
          fc.integer({ min: -128, max: 127 }),
          (L, a, b) => {
            S.state.sliderMode = 'LAB';
            applyTriple(L, a, b);

            // Switch to CMYK: should derive from color, not use LAB latch
            S.state.sliderMode = 'CMYK';
            const rgb = S.getRgb();
            const expected = C.rgbToCmyk(rgb.r, rgb.g, rgb.b);
            const vals = Panels.readVals();

            assert.strictEqual(vals.c, expected.c, `C should derive from color`);
            assert.strictEqual(vals.m, expected.m, `M should derive from color`);
            assert.strictEqual(vals.y, expected.y, `Y should derive from color`);
            assert.strictEqual(vals.k, expected.k, `K should derive from color`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('latch CMYK não vale em LAB', () => {
      S.state.sliderMode = 'CMYK';
      Panels.applyChannel('CMYK', 'c', 80);
      Panels.applyChannel('CMYK', 'm', 20);
      Panels.applyChannel('CMYK', 'y', 60);
      Panels.applyChannel('CMYK', 'k', 50);

      // Switch to LAB: should derive from color
      S.state.sliderMode = 'LAB';
      const rgb = S.getRgb();
      const expected = C.rgbToLab(rgb.r, rgb.g, rgb.b);
      const vals = Panels.readVals();

      assert.strictEqual(vals.L, expected.L, `L should derive from color`);
      assert.strictEqual(vals.a, expected.a, `a should derive from color`);
      assert.strictEqual(vals.b, expected.b, `b should derive from color`);
    });

    it('latch LAB não vale em RGB', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(100, 127, 127);

      S.state.sliderMode = 'RGB';
      const rgb = S.getRgb();
      const vals = Panels.readVals();

      assert.strictEqual(vals.r, rgb.r);
      assert.strictEqual(vals.g, rgb.g);
      assert.strictEqual(vals.b, rgb.b);
    });
  });

  /* -----------------------------------------------------------------------
   * 7. Histórico, hex e RGB enviado usam o valor recortado, nunca o triplo
   * --------------------------------------------------------------------- */
  describe('Histórico, hex e RGB enviado usam valor recortado', () => {

    it('getRgb retorna o valor recortado, não o triplo LAB', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(100, 127, 127);

      // The RGB must be the clipped version
      const rgb = S.getRgb();
      const expectedRgb = C.labToRgb(100, 127, 127);

      assert.strictEqual(rgb.r, expectedRgb.r,
        `R should be clipped value ${expectedRgb.r}, got ${rgb.r}`);
      assert.strictEqual(rgb.g, expectedRgb.g,
        `G should be clipped value ${expectedRgb.g}, got ${rgb.g}`);
      assert.strictEqual(rgb.b, expectedRgb.b,
        `B should be clipped value ${expectedRgb.b}, got ${rgb.b}`);
    });

    it('getHex retorna hex do valor recortado (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: -128, max: 127 }),
          fc.integer({ min: -128, max: 127 }),
          (L, a, b) => {
            S.state.sliderMode = 'LAB';
            applyTriple(L, a, b);

            const hex = S.getHex();
            const rgb = S.getRgb();
            const expectedHex = C.rgbToHex(rgb.r, rgb.g, rgb.b);

            assert.strictEqual(hex, expectedHex,
              `Hex should represent clipped RGB, expected ${expectedHex}, got ${hex}`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('histórico grava o HSV correspondente ao RGB recortado', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(100, 127, 127);
      S.pushHistory();

      const idx = S.state.historyIndex;
      const entry = S.state.history[idx];

      // The history entry should be the HSV of the clipped color
      const hsv = S.getHsv();
      assert.strictEqual(entry.h, hsv.h, 'History H should match current HSV');
      assert.strictEqual(entry.s, hsv.s, 'History S should match current HSV');
      assert.strictEqual(entry.v, hsv.v, 'History V should match current HSV');
    });
  });

  /* -----------------------------------------------------------------------
   * 8. applyChannel rejeita valor não numérico e devolve false
   * --------------------------------------------------------------------- */
  describe('applyChannel rejeita valor não numérico', () => {

    it('retorna false para null', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(50, 0, 0);
      const before = Panels.readVals();

      const result = Panels.applyChannel('LAB', 'L', null);

      assert.strictEqual(result, false);
      const after = Panels.readVals();
      assert.strictEqual(after.L, before.L, 'L should not change');
    });

    it('retorna false para NaN', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(50, 0, 0);
      const before = Panels.readVals();

      const result = Panels.applyChannel('LAB', 'a', NaN);

      assert.strictEqual(result, false);
      const after = Panels.readVals();
      assert.strictEqual(after.a, before.a, 'a should not change');
    });

    it('retorna false para Infinity', () => {
      S.state.sliderMode = 'LAB';
      applyTriple(50, 10, -10);
      const before = Panels.readVals();

      const result = Panels.applyChannel('LAB', 'b', Infinity);

      assert.strictEqual(result, false);
      const after = Panels.readVals();
      assert.strictEqual(after.b, before.b, 'b should not change');
    });

    it('retorna false para undefined', () => {
      S.state.sliderMode = 'RGB';
      S.setRgb(100, 150, 200, { reason: 'color' });
      Panels.dropLatchIfExternal('color');

      const before = Panels.readVals();
      const result = Panels.applyChannel('RGB', 'r', undefined);

      assert.strictEqual(result, false);
      const after = Panels.readVals();
      assert.strictEqual(after.r, before.r, 'r should not change');
    });

    it('rejeita valores não numéricos para todos os modos (property)', () => {
      const invalidValues = [null, NaN, Infinity, -Infinity, undefined];
      const modes = ['RGB', 'HSV', 'LAB', 'CMYK', 'B/W'];

      fc.assert(
        fc.property(
          fc.constantFrom(...modes),
          fc.constantFrom(...invalidValues),
          (mode, badVal) => {
            S.state.sliderMode = mode;
            const modeObj = Panels.MODES[mode];
            const ch = modeObj.channels[0];

            const result = Panels.applyChannel(mode, ch.key, badVal);
            assert.strictEqual(result, false,
              `applyChannel(${mode}, ${ch.key}, ${badVal}) should return false`);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
