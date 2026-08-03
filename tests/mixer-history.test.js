/**
 * Histórico durante o arraste das barras do mixer.
 *
 * O histórico serve para voltar a uma cor que o artista escolheu. Se cada
 * `pointermove` gravar, atravessar uma barra deixa dezenas de cores quase
 * idênticas na fila e empurra fora as que interessavam — o limite é 50.
 *
 * A regra é: o arraste inteiro vale uma cor, gravada ao soltar. Estes testes
 * exercitam as funções de amostragem reais das barras, que é onde o commit
 * indevido morava.
 */
'use strict';

const { describe, it, beforeEach, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

let S;
let Panels;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

before(() => {
  load('color.js');
  load('state.js');
  load('panels.js');
  S = window.AppState;
  Panels = window.Panels;
});

beforeEach(() => {
  S.state.lumLock = false;
  S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };
  S.setHsv({ h: 200, s: 60, v: 60 }, { reason: 'test' });
  S.state.history = [];
  S.state.historyIndex = -1;
  S.pushHistory();
});

const tamanho = () => S.state.history.length;

/**
 * Atravessa uma barra como um arraste faria e solta no fim.
 *
 * `base` é capturada uma vez, no início, como o pointerdown do trilho faz. É
 * o que impede a amostragem de acumular deslocamento a cada passo.
 */
function arrastar(sample, passos, ate) {
  const base = S.getHsv();
  const fim = ate === undefined ? 1 : ate;
  for (let i = 0; i <= passos; i++) sample((i / passos) * fim, base);
  S.pushHistory();   // é o que o pointerup do trilho faz
}

describe('Mixer: o arraste vale uma cor no histórico', () => {
  it('a barra do blender não grava durante o movimento', () => {
    const antes = tamanho();
    const base = S.getHsv();

    for (let i = 0; i <= 20; i++) Panels.sampleBlender(i / 20, 'saturation', base);

    assert.strictEqual(tamanho(), antes,
      'a amostragem gravou no histórico antes de soltar');
  });

  it('grava exatamente uma cor ao soltar', () => {
    const antes = tamanho();
    arrastar((t, base) => Panels.sampleBlender(t, 'saturation', base), 20);
    assert.strictEqual(tamanho(), antes + 1);
  });

  it('vale para os três modos do blender', () => {
    // Em temperatura a barra desloca o matiz: parar em 0,8 garante que a cor
    // final é outra, senão o histórico dedupa e o teste não mede nada.
    [['saturation', 1], ['brightness', 1], ['temperature', 0.8]].forEach(([mode, ate]) => {
      const antes = tamanho();
      arrastar((t, base) => Panels.sampleBlender(t, mode, base), 15, ate);
      assert.strictEqual(tamanho(), antes + 1, `modo ${mode} não gravou uma cor`);
    });
  });

  it('vale para os três modos de shades & tones', () => {
    ['shades', 'tints', 'tones'].forEach((mode) => {
      const antes = tamanho();
      arrastar((t, base) => Panels.sampleShades(t, mode, base), 15);
      assert.strictEqual(tamanho(), antes + 1, `modo ${mode} não gravou uma cor`);
    });
  });

  it('vale para a barra de esquema', () => {
    const antes = tamanho();
    // A barra cobre 360°: soltar em 1 volta à cor de partida de propósito.
    arrastar((t, base) => Panels.sampleScheme(t, base), 15, 0.7);
    assert.strictEqual(tamanho(), antes + 1);
  });

  it('a cor gravada é a do ponto onde soltou', () => {
    Panels.sampleShades(0.25, 'shades', S.getHsv());
    const soltou = S.getHsv();
    S.pushHistory();

    const gravada = S.state.history[S.state.historyIndex];
    assert.ok(Math.abs(gravada.v - soltou.v) < 1e-9);
    assert.ok(Math.abs(gravada.s - soltou.s) < 1e-9);
    assert.ok(Math.abs(gravada.h - soltou.h) < 1e-9);
  });

  it('vários arrastes seguidos deixam uma cor cada', () => {
    const antes = tamanho();

    arrastar((t, base) => Panels.sampleBlender(t, 'saturation', base), 10, 0.9);
    // 0,35 e não 0,6: em 0,6 o valor daria 60, que é o que a cor já tem, e o
    // histórico dedupa — o teste mediria a coincidência, não a regra.
    arrastar((t, base) => Panels.sampleShades(t, 'shades', base), 10, 0.35);
    arrastar((t, base) => Panels.sampleScheme(t, base), 10, 0.3);

    assert.strictEqual(tamanho(), antes + 3);
  });

  it('soltar sem ter movido não duplica a cor atual', () => {
    const antes = tamanho();
    S.pushHistory();
    assert.strictEqual(tamanho(), antes, 'duplicata consecutiva entrou na fila');
  });

  it('ir e voltar no trilho desfaz: a posição mapeia a cor, não acumula', () => {
    // Este é o teste da catraca. Antes a amostragem lia a cor atual, então
    // cada passo somava deslocamento e voltar ao ponto de partida do trilho
    // deixava uma cor diferente da inicial.
    const partida = S.getHsv();
    const base = S.getHsv();
    const antes = tamanho();

    [0.2, 0.5, 0.9, 0.5, 0.2, 0].forEach((t) => Panels.sampleScheme(t, base));
    S.pushHistory();

    const fim = S.getHsv();
    assert.ok(Math.abs(fim.h - partida.h) < 1e-9,
      `voltar ao início do trilho deu outro matiz: ${fim.h} vs ${partida.h}`);
    assert.strictEqual(tamanho(), antes, 'gravou uma cor igual à que já estava');
  });

  it('a mesma posição do trilho dá sempre a mesma cor', () => {
    const base = S.getHsv();

    Panels.sampleBlender(0.35, 'temperature', base);
    const primeira = S.getHsv();

    Panels.sampleBlender(0.9, 'temperature', base);
    Panels.sampleBlender(0.35, 'temperature', base);
    const segunda = S.getHsv();

    assert.ok(Math.abs(segunda.h - primeira.h) < 1e-9,
      `a posição 0,35 deu ${segunda.h} depois de ter dado ${primeira.h}`);
  });

  it('o histórico continua navegável depois do arraste', () => {
    const partida = S.getHsv();

    arrastar((t, base) => Panels.sampleBlender(t, 'brightness', base), 12);
    assert.ok(S.canUndo(), 'nada para desfazer depois do arraste');

    S.undo();
    const voltou = S.getHsv();
    assert.ok(Math.abs(voltou.h - partida.h) < 1e-9);
    assert.ok(Math.abs(voltou.s - partida.s) < 1e-9);
    assert.ok(Math.abs(voltou.v - partida.v) < 1e-9);
  });

  it('um arraste longo não consome a fila do histórico', () => {
    // Antes, 60 passos de arraste estouravam o limite de 50 e apagavam tudo
    // que o artista havia guardado.
    for (let i = 0; i < 5; i++) {
      S.setHsv({ h: i * 30, s: 50, v: 50 }, { reason: 'test' });
      S.pushHistory();
    }
    const guardadas = tamanho();

    arrastar((t, base) => Panels.sampleBlender(t, 'saturation', base), 60);

    assert.strictEqual(tamanho(), guardadas + 1,
      'o arraste encheu a fila e descartou cores guardadas');
  });
});
