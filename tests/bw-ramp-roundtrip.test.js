/**
 * Bug Condition Exploration: Round-trip do canal K diverge por escala L* vs 8-bit.
 *
 * Este teste DEVE FALHAR no código não corrigido — a falha confirma que o bug existe.
 * NÃO tente corrigir o teste ou o código quando ele falhar.
 *
 * O canal K lê via L* (rgbToLab) e escreve via porcentagem linear de cinza 8-bit
 * (Math.round(w/100*255)). Como L* não é proporcional ao nível de cinza, a ida e
 * volta perde o valor. Além disso, getBwRamp gera N amostras sem incluir o preto (0).
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 */
'use strict';

const { describe, it, before } = require('node:test');
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

describe('Bug Condition: Round-trip do canal K (B/W)', () => {

  it('1a: Property — fromRgb(toRgb({w})).w rounded === w for all w ∈ [0, 100]', () => {
    /**
     * Validates: Requirements 2.1, 2.2
     *
     * For all integer values w in [0, 100], writing w to the B/W channel
     * and reading it back should return exactly w.
     *
     * Bug condition: toRgb uses Math.round(w/100*255) (8-bit linear),
     * but fromRgb uses rgbToLab().L (perceptual L*). These scales diverge,
     * so the round-trip loses the value.
     */
    const mode = Panels.MODES['B/W'];

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (w) => {
          const rgb = mode.toRgb({ w });
          const readBack = mode.fromRgb(rgb);
          const readW = Math.round(readBack.w);

          assert.strictEqual(readW, w,
            `Round-trip failed: wrote w=${w}, toRgb=${JSON.stringify(rgb)}, ` +
            `fromRgb.w=${readBack.w}, rounded=${readW}`);
        }
      ),
      { numRuns: 101 }  // Cover all 101 values
    );
  });

  it('1b: Property — getBwRamp() devolve N amostras de 100 até Math.round(100/N)', () => {
    /**
     * Validates: Requirements 1.3, 2.3
     *
     * Para todo N de 1 a 15 — qualquer contagem que o artista pode escolher —
     * a rampa deve ter exatamente N amostras, com o primeiro nível em 100
     * (branco puro) e o último em Math.round(100/N).
     *
     * O preto puro não faz parte da régua: quem quer preto digita 0 no campo K.
     *
     * A contagem é definida via S.setBwSteps para o teste passar pelo mesmo
     * clamp que a interface usa, em vez de escrever o estado direto.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        (N) => {
          S.setBwSteps(N);
          assert.strictEqual(S.state.bwSteps, N,
            `setBwSteps(${N}) deveria aceitar o valor sem alterar`);
          const ramp = S.getBwRamp();

          // N amostras, uma por degrau exibido
          assert.strictEqual(ramp.length, N,
            `Esperado ${N} amostras para N=${N}, veio ${ramp.length}`);

          // A primeira amostra é o branco puro (nível 100)
          assert.strictEqual(ramp[0].level, 100,
            `O primeiro nível deveria ser 100, veio ${ramp[0].level}`);

          // A última amostra é o menor degrau da régua: Math.round(100/N)
          const expectedLast = Math.round(100 - (N - 1) * (100 / N));
          assert.strictEqual(ramp[ramp.length - 1].level, expectedLast,
            `O último nível deveria ser ${expectedLast}, veio ${ramp[ramp.length - 1].level}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('1d: Property — todo nível da régua é Math.round(100 - i * 100/N)', () => {
    /**
     * Validates: Requirements 2.1, 2.3
     *
     * A régua divide 100 em N partes iguais. Cada nível é arredondado para
     * inteiro: Math.round(100 - i * 100/N), para i de 0 a N−1.
     *
     * O segundo nível é verificado à parte porque é exatamente o degrau do
     * relato original: com N=10 ele tem de ser 90, não 89.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        (N) => {
          S.setBwSteps(N);
          const ramp = S.getBwRamp();
          const passo = 100 / N;

          assert.strictEqual(ramp.length, N,
            `N=${N}: esperado ${N} amostras, veio ${ramp.length}`);

          ramp.forEach((tone, i) => {
            const esperado = Math.round(100 - i * passo);
            assert.strictEqual(tone.level, esperado,
              `N=${N}: nível do índice ${i} deveria ser ${esperado}, veio ${tone.level}`);
          });

          // Segundo degrau com N=10: deve ser 90.
          if (N >= 2) {
            const segundoEsperado = Math.round(100 - passo);
            assert.strictEqual(ramp[1].level, segundoEsperado,
              `N=${N}: o segundo nível deveria ser ${segundoEsperado}, veio ${ramp[1].level}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('1c: Property — for all tones in ramp, fromRgb(tone.rgb).w rounded === tone.level', () => {
    /**
     * Validates: Requirements 1.1, 2.1, 2.2
     *
     * For each tone in the ramp, reading back the tone's RGB through fromRgb
     * should return exactly that tone's level. This is the direct test of
     * "clicking a ramp step shows the correct K value".
     *
     * Bug condition: getBwRamp uses labToRgb(level, 0, 0) which produces
     * RGB values that, when read back through fromRgb (which uses rgbToLab),
     * don't return the original level due to L*→RGB→L* rounding.
     */
    const mode = Panels.MODES['B/W'];

    fc.assert(
      fc.property(
        fc.constantFrom(...S.BW_STEP_OPTIONS),
        (N) => {
          S.setBwSteps(N);
          const ramp = S.getBwRamp();

          for (const tone of ramp) {
            const readBack = mode.fromRgb({ r: tone.r, g: tone.g, b: tone.b });
            const readW = Math.round(readBack.w);

            assert.strictEqual(readW, tone.level,
              `Ramp tone mismatch (N=${N}): level=${tone.level}, ` +
              `rgb=(${tone.r},${tone.g},${tone.b}), ` +
              `fromRgb.w=${readBack.w}, rounded=${readW}`);
          }
        }
      ),
      { numRuns: 23 }  // Cover all values from BW_MIN to BW_MAX
    );
  });
});
