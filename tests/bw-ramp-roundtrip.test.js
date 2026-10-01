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

  it('1b: Property — getBwRamp() devolve N amostras do branco (100) ao preto (0)', () => {
    /**
     * Validates: Requirements 1.3, 2.3
     *
     * Para todo N de 2 a 15 — qualquer contagem que o artista pode escolher —
     * a rampa tem exatamente N amostras e as pontas são sempre os extremos:
     * branco puro na primeira, preto puro na última. Com 2 a régua é só
     * branco e preto; com 3 entra o cinza do meio.
     *
     * A contagem é definida via S.setBwSteps para o teste passar pelo mesmo
     * clamp que a interface usa, em vez de escrever o estado direto.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (N) => {
          S.setBwSteps(N);
          assert.strictEqual(S.state.bwSteps, N,
            `setBwSteps(${N}) deveria aceitar o valor sem alterar`);
          const ramp = S.getBwRamp();

          assert.strictEqual(ramp.length, N,
            `Esperado ${N} amostras para N=${N}, veio ${ramp.length}`);
          assert.strictEqual(ramp[0].level, 100,
            `O primeiro nível deveria ser 100, veio ${ramp[0].level}`);
          assert.strictEqual(ramp[ramp.length - 1].level, 0,
            `O último nível deveria ser 0 (preto), veio ${ramp[ramp.length - 1].level}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('1d: Property — todo nível da régua é Math.round(100 - i * 100/(N-1))', () => {
    /**
     * Validates: Requirements 2.1, 2.3
     *
     * Com os dois extremos fixos, a régua divide o intervalo em N−1 passos
     * iguais. Com N=3 o do meio é 50; com N=11 o passo é 10 e o segundo nível
     * tem de ser 90, não 89 — o degrau do relato original.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        (N) => {
          S.setBwSteps(N);
          const ramp = S.getBwRamp();
          const passo = 100 / (N - 1);

          ramp.forEach((tone, i) => {
            // `|| 0`: o último passo pode dar −1e−14 em ponto flutuante, e
            // Math.round disso é −0, que strictEqual distingue de 0.
            const esperado = Math.round(100 - i * passo) || 0;
            assert.strictEqual(tone.level, esperado,
              `N=${N}: nível do índice ${i} deveria ser ${esperado}, veio ${tone.level}`);
          });
        }
      ),
      { numRuns: 100 }
    );

    S.setBwSteps(3);
    assert.deepStrictEqual(S.getBwRamp().map((t) => t.level), [100, 50, 0]);
    S.setBwSteps(11);
    assert.strictEqual(S.getBwRamp()[1].level, 90);
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

/**
 * Grupos de valores: um quadrado da régua pode se dividir em vários tons.
 *
 * Os tons de um grupo ficam na faixa que o quadrado ocupa — da metade do
 * caminho até o vizinho mais claro à metade até o mais escuro — então nunca
 * invadem o vizinho, e a régua continua lida do claro para o escuro.
 */
describe('Grupos de valores dentro de um quadrado da régua', () => {
  it('o grupo divide o quadrado em k tons dentro da faixa dele, do claro ao escuro', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 15 }),
        fc.nat(),
        fc.integer({ min: 2, max: 8 }),
        (N, pick, k) => {
          S.setBwSteps(N);
          const i = pick % N;
          S.setBwGroup(i, k);

          const ramp = S.getBwRamp();
          const esperado = Math.min(k, S.bwGroupMax(i));
          const subs = ramp[i].subs || [ramp[i]];
          assert.strictEqual(subs.length, esperado,
            `N=${N}, quadrado ${i}: pediu ${k}, teto ${S.bwGroupMax(i)}, veio ${subs.length}`);

          // Sem tom repetido, e em ordem decrescente.
          for (let j = 1; j < subs.length; j++) {
            assert.ok(subs[j].level < subs[j - 1].level,
              `N=${N}, quadrado ${i}: tons fora de ordem ou repetidos ${subs.map((s) => s.level)}`);
          }

          // Dentro da faixa: não passa do vizinho de nenhum lado.
          const acima = i > 0 ? ramp[i - 1].level : 101;
          const abaixo = i < N - 1 ? ramp[i + 1].level : -1;
          subs.forEach((s) => {
            assert.ok(s.level < acima && s.level > abaixo,
              `N=${N}, quadrado ${i}: tom ${s.level} invadiu o vizinho (${acima}..${abaixo})`);
          });

          S.resetBwGroups();
        }
      ),
      { numRuns: 200 }
    );
  });

  it('cada tom de grupo também faz a ida e volta exata pelo canal K', () => {
    const mode = Panels.MODES['B/W'];
    S.setBwSteps(3);
    S.setBwGroup(1, 3);
    S.getBwRamp()[1].subs.forEach((t) => {
      assert.strictEqual(Math.round(mode.fromRgb(t).w), t.level);
    });
    S.resetBwGroups();
  });

  it('1 subdivisão desfaz o grupo, e o reset desfaz todos', () => {
    S.setBwSteps(5);
    S.setBwGroup(1, 3);
    S.setBwGroup(3, 2);
    assert.ok(S.hasBwGroups());

    S.setBwGroup(1, 1);
    assert.strictEqual(S.getBwRamp()[1].subs, undefined, 'o grupo não foi desfeito');
    assert.ok(S.hasBwGroups(), 'desfazer um grupo apagou os outros');

    S.resetBwGroups();
    assert.ok(!S.hasBwGroups());
  });

  it('mudar a contagem da régua descarta os grupos', () => {
    S.setBwSteps(5);
    S.setBwGroup(2, 3);
    S.setBwSteps(6);
    assert.ok(!S.hasBwGroups(), 'o grupo do índice 2 ficou preso a outro tom');
  });

  it('índice fora da régua é ignorado', () => {
    S.setBwSteps(4);
    S.setBwGroup(9, 3);
    S.setBwGroup(-1, 3);
    assert.ok(!S.hasBwGroups());
  });
});
