/**
 * Testes de integração de ponteiro para wheel.js.
 *
 * Os testes anteriores só exercitavam state.js diretamente — nenhum chamava
 * de fato onPointerDown/Move/Up. Isso deixou a interação real sem cobertura:
 * os bugs relatados ("clico e o marcador salta", "não consigo arrastar")
 * nunca foram provados nem corrigidos com uma simulação de ponteiro de
 * verdade. Este arquivo cria um DOM/canvas mínimo o suficiente para o
 * módulo rodar init() e despachar eventos pointerdown/move/up reais.
 */
'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

let S;
let W;
let canvasEl;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

/** Contexto 2D falso, suficiente para não lançar em nenhuma chamada usada. */
function fakeCtx() {
  const noop = () => {};
  const ctx = {
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    setTransform: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arc: noop, ellipse: noop, rect: noop, fill: noop, stroke: noop,
    clip: noop, clearRect: noop, drawImage: noop, setLineDash: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: noop,
    measureText: () => ({ width: 0 }),
    fillText: noop, fillRect: noop
  };
  return ctx;
}

/** Canvas falso com getContext, getBoundingClientRect e captura de ponteiro. */
function fakeCanvas(displayWidthPx) {
  const listeners = {};
  const el = {
    tagName: 'CANVAS',
    width: 0, height: 0,
    style: {},
    _captured: new Set(),
    getContext: () => fakeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: displayWidthPx, height: displayWidthPx }),
    addEventListener: (type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener: (type, fn) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((f) => f !== fn);
    },
    setPointerCapture: function (id) { this._captured.add(id); },
    releasePointerCapture: function (id) { this._captured.delete(id); },
    hasPointerCapture: function (id) { return this._captured.has(id); },
    dispatch: (type, evt) => {
      (listeners[type] || []).forEach((fn) => fn(evt));
    }
  };
  return el;
}

/** Constrói um evento de ponteiro em coordenadas de TELA (px reais). */
function pointerEvt(clientX, clientY, extra) {
  return Object.assign({
    clientX: clientX, clientY: clientY, pointerId: 1,
    shiftKey: false, altKey: false, ctrlKey: false,
    preventDefault: function () {}
  }, extra || {});
}

before(() => {
  load('color.js');
  load('state.js');
  S = window.AppState;

  // wheel.js só toca no DOM dentro de init(); os elementos precisam existir
  // antes dessa chamada.
  canvasEl = fakeCanvas(300); // roda exibida a 300px reais (menor que as 426 unidades internas)

  const byId = { wheel: canvasEl };
  document.getElementById = (id) => (byId[id] !== undefined ? byId[id] : null);
  document.createElement = (tag) => {
    if (tag === 'canvas') {
      const off = fakeCanvas(426);
      return off;
    }
    return { style: {}, setAttribute: () => {}, appendChild: () => {} };
  };

  load('wheel.js');
  W = window.Wheel;
  W.init();
});

/** Centro do canvas em coordenadas de TELA (px reais), dado o rect mockado. */
const rect = () => canvasEl.getBoundingClientRect();

/** Converte um ponto em unidades internas (0-426) para px de tela real. */
function toScreenPx(canvasUnitX, canvasUnitY) {
  const r = rect();
  const scale = r.width / W.geometry.SIZE;
  return {
    clientX: r.left + canvasUnitX * scale,
    clientY: r.top + canvasUnitY * scale
  };
}

/** Posição de tela (px reais) de um matiz na pista dos marcadores. */
function markerScreenPos(hue) {
  const g = W.geometry;
  const a = (hue - 90) * Math.PI / 180;
  const ux = g.CX + g.MARKER_TRACK_R * Math.cos(a);
  const uy = g.CY + g.MARKER_TRACK_R * Math.sin(a);
  return toScreenPx(ux, uy);
}

beforeEach(() => {
  S.state.scheme = 'none';
  S.state.refHue = 90;
  S.state.hsv = { h: 90, s: 100, v: 100 };
  S.state.markers = [{ id: 'master', role: 'master', hue: 90, s: 100, v: 100, isActive: true }];
  S.state.activeMarkerId = 'master';
  S.state.wheelRotation = 0;
});

describe('Wheel: clique seco num marcador secundário troca a cor ativa sem mover nada', () => {
  it('setScheme + clique no secundário chama setActiveMarker, refHue não muda', () => {
    S.setScheme('triad');   // markers: master(90), sec-0(210), sec-1(330)
    const refAntes = S.state.refHue;
    const huesAntes = S.getMarkers().map((m) => m.hue);

    const sec = S.getMarkers().find((m) => m.role === 'secondary');
    const pos = markerScreenPos(sec.hue);

    canvasEl.dispatch('pointerdown', pointerEvt(pos.clientX, pos.clientY));
    // Sem pointermove: é um clique seco.
    canvasEl.dispatch('pointerup', pointerEvt(pos.clientX, pos.clientY));

    assert.strictEqual(S.state.activeMarkerId, sec.id,
      'o clique não trocou o marcador ativo');
    assert.strictEqual(S.state.refHue, refAntes,
      'o clique seco moveu o refHue — a constelação girou sem o usuário arrastar');
    assert.deepStrictEqual(S.getMarkers().map((m) => m.hue), huesAntes,
      'o clique seco mudou os matizes dos marcadores');
  });
});

describe('Wheel: arrastar um marcador de verdade rotaciona a constelação', () => {
  it('pointerdown no marcador + pointermove tangencial de 40px reais gira o conjunto', () => {
    S.setScheme('comp');    // markers: master(90), sec-0(270)
    const master = S.getMarkers().find((m) => m.role === 'master');
    const startPos = markerScreenPos(master.hue);

    canvasEl.dispatch('pointerdown', pointerEvt(startPos.clientX, startPos.clientY));

    // hue=90 fica à direita do centro (ângulo medido com 0 no topo); mover
    // o ponteiro na vertical (eixo Y) é o deslocamento TANGENCIAL ao anel
    // nesse ponto — o que corresponde a girar o anel, não a se afastar dele.
    const movedPos = { clientX: startPos.clientX, clientY: startPos.clientY + 40 };
    canvasEl.dispatch('pointermove', pointerEvt(movedPos.clientX, movedPos.clientY));

    const refDepoisDoArrasto = S.state.refHue;

    canvasEl.dispatch('pointerup', pointerEvt(movedPos.clientX, movedPos.clientY));

    assert.notStrictEqual(refDepoisDoArrasto, 90,
      'arrastar tangencialmente 40px reais não girou a constelação — o arraste não está funcionando');
  });

  it('um tremor de poucos pixels reais NÃO deve girar nada (limiar de clique)', () => {
    S.setScheme('comp');
    const master = S.getMarkers().find((m) => m.role === 'master');
    const startPos = markerScreenPos(master.hue);

    canvasEl.dispatch('pointerdown', pointerEvt(startPos.clientX, startPos.clientY));

    // 1px real de tremor, na direção tangencial (eixo Y neste ponto) —
    // bem abaixo do limiar de 3px reais.
    const jitterPos = { clientX: startPos.clientX, clientY: startPos.clientY + 1 };
    canvasEl.dispatch('pointermove', pointerEvt(jitterPos.clientX, jitterPos.clientY));

    assert.strictEqual(S.state.refHue, 90,
      'um tremor de 1px real já girou a constelação — o limiar de clique está errado');

    canvasEl.dispatch('pointerup', pointerEvt(jitterPos.clientX, jitterPos.clientY));
  });
});

describe('Wheel: pickMarker acerta o alvo visual depois de um quick-swap', () => {
  it('depois do swap, o clique no NOVO marcador ativo (agora grande) acerta ele', () => {
    S.setScheme('triad');
    const sec = S.getMarkers().find((m) => m.role === 'secondary');

    // Quick swap: sec vira o marcador ativo (desenhado grande).
    S.setActiveMarker(sec.id);
    assert.ok(S.getMarkers().find((m) => m.id === sec.id).isActive);

    const pos = markerScreenPos(sec.hue);
    canvasEl.dispatch('pointerdown', pointerEvt(pos.clientX, pos.clientY));
    canvasEl.dispatch('pointerup', pointerEvt(pos.clientX, pos.clientY));

    // Não deveria ter entrado em modo mask/rotate/etc — apenas processado
    // como marcador. O teste de fumaça aqui é que nada lançou exceção e
    // dragMode foi limpo (indireto: nova sequência de eventos funciona).
    const master = S.getMarkers().find((m) => m.role === 'master');
    const posMaster = markerScreenPos(master.hue);
    canvasEl.dispatch('pointerdown', pointerEvt(posMaster.clientX, posMaster.clientY));
    canvasEl.dispatch('pointerup', pointerEvt(posMaster.clientX, posMaster.clientY));

    assert.strictEqual(S.state.activeMarkerId, 'master',
      'clicar no marcador master (agora pequeno) não trocou a cor ativa de volta');
  });
});

describe('Wheel: clicar no master depois de um quick-swap volta a cor para ele', () => {
  it('swap para secundário e depois clique no master restaura o master como ativo', () => {
    S.setScheme('triad');
    const sec = S.getMarkers().find((m) => m.role === 'secondary');
    S.setActiveMarker(sec.id);
    assert.strictEqual(S.state.activeMarkerId, sec.id);

    const master = S.getMarkers().find((m) => m.role === 'master');
    const pos = markerScreenPos(master.hue);
    canvasEl.dispatch('pointerdown', pointerEvt(pos.clientX, pos.clientY));
    canvasEl.dispatch('pointerup', pointerEvt(pos.clientX, pos.clientY));

    assert.strictEqual(S.state.activeMarkerId, 'master',
      'clicar no marcador master não trocou a cor ativa de volta para ele');
  });
});

describe('Wheel: handle de deformação não compete com o marcador +φ', () => {
  it('em análogo, clicar exatamente no marcador +φ NÃO deve cair no handle', () => {
    S.setScheme('analog');
    S.setSchemePhi('analog', 30);

    const markers = S.getMarkers();
    const plusPhi = markers.find((m) => m.role === 'secondary' && Math.abs(m.hue - (S.state.refHue + 30)) < 0.01);
    assert.ok(plusPhi, 'não achei o marcador +φ — setup do teste está errado');

    const refAntes = S.state.refHue;
    const phiAntes = S.state.schemePhi.analog;

    const pos = markerScreenPos(plusPhi.hue);
    canvasEl.dispatch('pointerdown', pointerEvt(pos.clientX, pos.clientY));
    canvasEl.dispatch('pointerup', pointerEvt(pos.clientX, pos.clientY));

    // Se o clique caiu no handle por engano, isso teria virado quick swap
    // do jeito errado ou não teria disparado setActiveMarker nenhum.
    assert.strictEqual(S.state.activeMarkerId, plusPhi.id,
      'o clique no marcador +φ não trocou a cor ativa — pode ter caído no handle de deformação');
    assert.strictEqual(S.state.refHue, refAntes, 'refHue mudou num clique seco');
    assert.strictEqual(S.state.schemePhi.analog, phiAntes, 'φ mudou num clique seco no marcador');
  });
});
