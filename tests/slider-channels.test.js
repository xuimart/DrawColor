/**
 * Independência dos canais nos modos LAB e CMYK.
 *
 * O estado da cor no DrawColor é RGB. Em LAB e CMYK a volta RGB → canais não é
 * a inversa da ida: LAB descreve cores fora do sRGB e `labToRgb` recorta por
 * componente; CMYK com K alto colapsa C, M e Y. Derivar os canais da cor a cada
 * leitura, nesses modos, faz mover um slider mudar o número dos outros.
 *
 * Estes testes fixam as duas metades do contrato: primeiro que a ida e volta
 * realmente perde informação (é o motivo do latch existir), depois que o latch
 * preserva o que foi editado e é descartado quando a cor vem de outro lugar.
 */
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

let C;
let Panels;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

before(() => {
  // panels.js só toca no DOM dentro de init(); carregar é seguro.
  load('color.js');
  load('state.js');
  load('panels.js');
  C = window.Color;
  Panels = window.Panels;
});

describe('LAB: a ida e volta pelo RGB perde os extremos', () => {
  it('um triplo fora do sRGB não sobrevive ao arredondamento', () => {
    // Verde puro em LAB, bem fora do que o sRGB alcança.
    const rgb = C.labToRgb(100, -128, 127);
    const back = C.rgbToLab(rgb.r, rgb.g, rgb.b);

    assert.ok(
      Math.abs(back.a - (-128)) > 1,
      'se a volta fosse fiel, o latch seria desnecessário — reveja o teste'
    );
  });
});

describe('resolveVals: independência dos canais', () => {
  const LAB_EXTREME = { L: 100, a: -128, b: 127 };

  it('sem latch, os canais são derivados da cor', () => {
    const rgb = { r: 10, g: 200, b: 40 };
    const vals = Panels.resolveVals('LAB', rgb, null);
    assert.deepStrictEqual(vals, C.rgbToLab(10, 200, 40));
  });

  it('com latch válido, devolve exatamente o que foi editado', () => {
    const rgb = C.labToRgb(LAB_EXTREME.L, LAB_EXTREME.a, LAB_EXTREME.b);
    const vals = Panels.resolveVals('LAB', rgb, { mode: 'LAB', vals: LAB_EXTREME });

    assert.strictEqual(vals.a, -128, 'o extremo do canal A não se manteve');
    assert.strictEqual(vals.b, 127);
    assert.strictEqual(vals.L, 100);
  });

  it('editar um canal não altera os outros', () => {
    // Estado: usuário deixou A em -128. Agora move só o L.
    let current = { mode: 'LAB', vals: { ...LAB_EXTREME } };

    const next = { ...Panels.resolveVals('LAB', C.labToRgb(100, -128, 127), current), L: 40 };
    current = { mode: 'LAB', vals: next };

    const seen = Panels.resolveVals('LAB', C.labToRgb(40, -128, 127), current);
    assert.strictEqual(seen.L, 40);
    assert.strictEqual(seen.a, -128, 'mover L mexeu no A');
    assert.strictEqual(seen.b, 127, 'mover L mexeu no B');
  });

  it('descarta o triplo quando a cor veio de outra origem', () => {
    /**
     * O critério agora é: uma escrita de cor sem ownership declarada (sem
     * opts.channels) invalida o triplo no AppState. Não se usa mais a
     * inspeção de origem via subscriber.
     */
    const S = window.AppState;
    S.state.sliderMode = 'LAB';

    Panels.applyChannel('LAB', 'L', LAB_EXTREME.L);
    Panels.applyChannel('LAB', 'a', LAB_EXTREME.a);
    Panels.applyChannel('LAB', 'b', LAB_EXTREME.b);
    assert.strictEqual(Panels.readVals().a, LAB_EXTREME.a);

    // Write a color without declaring channels ownership — invalidates the triple
    S.setRgb(3, 7, 200, { reason: 'color' });

    assert.strictEqual(S.getChannels(), null, 'channels should be null after write without ownership');

    const rgb = S.getRgb();
    assert.deepStrictEqual(Panels.readVals(), C.rgbToLab(rgb.r, rgb.g, rgb.b));
  });

  it('não aplica latch de um modo em outro', () => {
    const rgb = C.labToRgb(LAB_EXTREME.L, LAB_EXTREME.a, LAB_EXTREME.b);
    const vals = Panels.resolveVals('CMYK', rgb, { mode: 'LAB', vals: LAB_EXTREME });
    assert.deepStrictEqual(vals, C.rgbToCmyk(rgb.r, rgb.g, rgb.b));
  });

  it('modos reversíveis ignoram latch e seguem a cor', () => {
    const rgb = { r: 1, g: 2, b: 3 };
    const vals = Panels.resolveVals('RGB', rgb, { mode: 'RGB', vals: { r: 9, g: 9, b: 9 } });
    assert.deepStrictEqual(vals, { r: 1, g: 2, b: 3 });
  });

  it('CMYK preserva C, M e Y quando K vai a 100 e a cor colapsa em preto', () => {
    const vals = { c: 100, m: 0, y: 100, k: 100 };
    const rgb = C.cmykToRgb(vals.c, vals.m, vals.y, vals.k);
    assert.deepStrictEqual(rgb, { r: 0, g: 0, b: 0 });

    // Derivar do preto devolveria C, M e Y zerados.
    assert.deepStrictEqual(C.rgbToCmyk(0, 0, 0), { c: 0, m: 0, y: 0, k: 100 });

    const seen = Panels.resolveVals('CMYK', rgb, { mode: 'CMYK', vals });
    assert.strictEqual(seen.c, 100, 'C foi perdido ao passar pelo preto');
    assert.strictEqual(seen.y, 100);
  });
});

describe('sameRgb: folga de arredondamento', () => {
  it('aceita 1 nível de diferença por componente', () => {
    // A cor passa por HSV dentro do AppState e volta arredondada para 8 bits.
    assert.strictEqual(Panels.sameRgb({ r: 10, g: 20, b: 30 }, { r: 11, g: 19, b: 30 }), true);
  });

  it('rejeita diferenças maiores', () => {
    assert.strictEqual(Panels.sameRgb({ r: 10, g: 20, b: 30 }, { r: 13, g: 20, b: 30 }), false);
  });

  it('trata ausência de cor como diferente', () => {
    assert.strictEqual(Panels.sameRgb(null, { r: 0, g: 0, b: 0 }), false);
  });
});
