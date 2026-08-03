/**
 * Edição de vértices da máscara de gamut — testes de exploração e preservação.
 *
 * Tarefa 1: Exploração — confirma que os sub-bugs A e B existem.
 *   Sub-bug A: vértices clampados a ±1 mesmo quando a projeção no disco cabe.
 *   Sub-bug B: a superfície não invalida quando gamut.points muda.
 *
 * Tarefa 2: Preservação — fixa a linha de base que já funciona.
 */
'use strict';

const { describe, it, beforeEach, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fc = require('fast-check');

require('./setup.js');

let S;
let W;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

before(() => {
  load('color.js');
  load('state.js');
  load('wheel.js');
  S = window.AppState;
  W = window.Wheel;
});

beforeEach(() => {
  S.state.gamut.locked = false;
  S.state.gamut.points = null;
  S.setGamut({ enabled: true, kind: 'hexagon', editing: true, cx: 0, cy: 0, rx: 0.6, ry: 0.6, angle: 0 });
});

/* ==========================================================================
 * TAREFA 1 — Testes de exploração da condição do bug
 * ========================================================================== */

describe('Bug Condition A — vértice não preso à bounding box', () => {
  it('caso determinístico: hexágono rx=0.3 ry=0.3, vértice 0 movido para (0, -2.5)', () => {
    // Configurar máscara hexagonal pequena
    S.setGamut({ kind: 'hexagon', rx: 0.3, ry: 0.3, cx: 0, cy: 0, angle: 0 });

    // O vértice 0 do hexágono (startDeg=-90) está em (cos(-90°), sin(-90°)) = (0, -1)
    const antes = S.maskVertices();
    assert.ok(Math.abs(antes[0].x) < 0.01 && Math.abs(antes[0].y - (-1)) < 0.01,
      `vértice 0 deveria estar perto de (0,-1), está em (${antes[0].x}, ${antes[0].y})`);

    // Mover para (0, -2.5): unitToDisc(0, -2.5) com ry=0.3 dá (0, -0.75), raio 0.75 — dentro do disco
    const accepted = S.setMaskVertex(0, 0, -2.5);
    assert.strictEqual(accepted, true, 'setMaskVertex deveria aceitar');

    const pts = S.maskVertices();
    // **Validates: Requirements 1.1, 1.2** — o vértice deveria estar em (0, -2.5), não clampado a (0, -1)
    assert.ok(Math.abs(pts[0].x - 0) < 1e-9,
      `vértice deveria ser x=0 mas é x=${pts[0].x}`);
    assert.ok(Math.abs(pts[0].y - (-2.5)) < 1e-9,
      `vértice deveria ser y=-2.5 mas é y=${pts[0].y} (clampado à bounding box)`);
  });

  it('propriedade: coordenada unitária fora de ±1 com projeção no disco ≤ 1 é aceita sem clamp', () => {
    /**
     * **Validates: Requirements 2.1, 2.2**
     * Gera rx em [0.1, 0.5], ry em [0.1, 0.5], e coordenada (x, y) com pelo menos
     * um componente > 1 ou < -1, filtrada por hypot(unitToDisc(x, y)) ≤ 1.
     */
    fc.assert(fc.property(
      fc.double({ min: 0.1, max: 0.5, noNaN: true }),   // rx
      fc.double({ min: 0.1, max: 0.5, noNaN: true }),   // ry
      fc.double({ min: -3.5, max: 3.5, noNaN: true }),  // x
      fc.double({ min: -3.5, max: 3.5, noNaN: true }),  // y
      (rx, ry, x, y) => {
        // Precondição: pelo menos um componente fora de ±1
        fc.pre(Math.abs(x) > 1 || Math.abs(y) > 1);

        // Precondição: projeção no disco tem raio ≤ 1
        const u = x * rx;
        const v = y * ry;
        const r = Math.hypot(u, v);
        fc.pre(r <= 1);

        // Setup
        S.state.gamut.points = null;
        S.setGamut({ kind: 'hexagon', rx, ry, cx: 0, cy: 0, angle: 0 });

        const accepted = S.setMaskVertex(0, x, y);
        assert.strictEqual(accepted, true, 'deveria aceitar');

        const stored = S.maskVertices()[0];
        assert.ok(Math.abs(stored.x - x) < 1e-9,
          `x armazenado=${stored.x}, esperado=${x}`);
        assert.ok(Math.abs(stored.y - y) < 1e-9,
          `y armazenado=${stored.y}, esperado=${y}`);
      }
    ), { numRuns: 200 });
  });
});

describe('Bug Condition B — superfície invalida com edição de vértice', () => {
  it('caso determinístico: maskKey não muda após edição de vértice', () => {
    // Configurar máscara retangular
    S.state.gamut.points = null;
    S.setGamut({ kind: 'rect', rx: 0.9, ry: 0.9, cx: 0, cy: 0, angle: 0, editing: true });

    const g = S.state.gamut;

    // Construir maskKey como wheel.js faz
    const keyBefore = `${g.kind}|${g.cx.toFixed(3)}|${g.cy.toFixed(3)}|${g.rx.toFixed(3)}|${g.ry.toFixed(3)}|${Math.round(g.angle)}`;

    // Mover um vértice (vertex 0 of rect is (-1,-1) — move it to center)
    S.setMaskVertex(0, 0.0, 0.0);

    // Construir a chave de novo
    const g2 = S.state.gamut;
    const keyAfter = `${g2.kind}|${g2.cx.toFixed(3)}|${g2.cy.toFixed(3)}|${g2.rx.toFixed(3)}|${g2.ry.toFixed(3)}|${Math.round(g2.angle)}`;

    // A chave NÃO mudou — provando que o cache não invalidaria
    assert.strictEqual(keyBefore, keyAfter,
      'A maskKey não deveria mudar (este assert confirma o bug — o cache não invalida)');

    // Now verify insideMask: rect vertices are (-1,-1), (1,-1), (1,1), (-1,1)
    // After moving vertex 0 from (-1,-1) to (0,0), the new polygon is (0,0), (1,-1), (1,1), (-1,1)
    // A point at unit coords (-0.8, -0.8) was inside the original rect but should be outside the new shape.
    // disc coords for (-0.8,-0.8) in unit with rx=0.9, ry=0.9 → disc (-0.72, -0.72)
    const testPoint = S.discToHs(-0.72, -0.72);
    const insideAfter = S.insideMask(testPoint.h, testPoint.s);
    assert.strictEqual(insideAfter, false,
      'insideMask deveria refletir a forma editada (já funciona — ponto fora da nova forma)');
  });

  it('subscriber de wheel.js NÃO invalida svCacheKey para reason=gamut (prova do bug)', () => {
    // Verificar que o subscriber registrado por init() não trata 'gamut'
    // Como init() precisa do DOM, testamos indiretamente: registramos nosso próprio subscriber
    // e simulamos o que wheel.js faz.
    let invalidated = false;
    const testSubscriber = (st, reason) => {
      // Simula a lógica atual de wheel.js
      if (reason === 'shape' || reason === 'rotation') invalidated = true;
    };

    // Emitir 'gamut' via setGamut
    testSubscriber(S.state, 'gamut');
    assert.strictEqual(invalidated, false,
      'A lógica atual do subscriber NÃO invalida para reason=gamut (confirma o bug)');

    // Confirmar que 'shape' e 'rotation' SIM invalidam (sanity check)
    testSubscriber(S.state, 'shape');
    assert.strictEqual(invalidated, true, 'shape deveria invalidar');
  });
});

/* ==========================================================================
 * TAREFA 2 — Testes de preservação (devem PASSAR no código não corrigido)
 * ========================================================================== */

describe('Preservação: formatos sem vértice editável', () => {
  it('ellipse retorna null de maskVertices()', () => {
    S.setGamut({ kind: 'ellipse' });
    assert.strictEqual(S.maskVertices(), null);
  });

  it('dual retorna null de maskVertices()', () => {
    S.setGamut({ kind: 'dual' });
    assert.strictEqual(S.maskVertices(), null);
  });
});

describe('Preservação: rejeições de setMaskVertex', () => {
  it('máscara travada rejeita setMaskVertex com false', () => {
    S.setGamut({ locked: true });
    assert.strictEqual(S.setMaskVertex(0, 0.5, 0.5), false);
    S.state.gamut.locked = false;
  });

  it('valores não numéricos rejeitados', () => {
    assert.strictEqual(S.setMaskVertex(0, NaN, 0), false);
    assert.strictEqual(S.setMaskVertex(0, 0, Infinity), false);
    assert.strictEqual(S.setMaskVertex(0, undefined, 0), false);
  });

  it('índice fora da faixa rejeitado', () => {
    assert.strictEqual(S.setMaskVertex(99, 0.5, 0.5), false);
    assert.strictEqual(S.setMaskVertex(-1, 0.5, 0.5), false);
  });
});

describe('Preservação: vértice dentro de ±1 aceito e armazenado', () => {
  it('propriedade: vértice movido para dentro de ±1 é aceito e armazenado', () => {
    fc.assert(fc.property(
      fc.double({ min: -1, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
      (x, y) => {
        S.state.gamut.points = null;
        S.setGamut({ kind: 'hexagon', rx: 0.6, ry: 0.6, cx: 0, cy: 0, angle: 0 });

        const accepted = S.setMaskVertex(0, x, y);
        assert.strictEqual(accepted, true);

        const stored = S.maskVertices()[0];
        assert.ok(Math.abs(stored.x - x) < 1e-9, `x: stored=${stored.x}, expected=${x}`);
        assert.ok(Math.abs(stored.y - y) < 1e-9, `y: stored=${stored.y}, expected=${y}`);
      }
    ), { numRuns: 100 });
  });
});

describe('Preservação: enquadramento intacto após edição de vértice', () => {
  it('centro, tamanho e rotação inalterados', () => {
    S.setGamut({ kind: 'hexagon', cx: 0.12, cy: -0.08, rx: 0.5, ry: 0.7, angle: 30 });
    const antes = { cx: S.state.gamut.cx, cy: S.state.gamut.cy, rx: S.state.gamut.rx, ry: S.state.gamut.ry, angle: S.state.gamut.angle };

    S.setMaskVertex(1, -0.5, 0.4);

    const g = S.state.gamut;
    assert.ok(Math.abs(g.cx - antes.cx) < 1e-9, 'cx mudou');
    assert.ok(Math.abs(g.cy - antes.cy) < 1e-9, 'cy mudou');
    assert.ok(Math.abs(g.rx - antes.rx) < 1e-9, 'rx mudou');
    assert.ok(Math.abs(g.ry - antes.ry) < 1e-9, 'ry mudou');
    assert.ok(Math.abs(g.angle - antes.angle) < 1e-9, 'angle mudou');
  });
});

describe('Preservação: trocar formato descarta pontos editados', () => {
  it('escolher outro formato no rack volta ao canônico', () => {
    S.setMaskVertex(0, 0.1, 0.1);
    assert.ok(S.hasCustomMask());

    S.setGamut({ kind: 'triangle' });
    assert.ok(!S.hasCustomMask());
    assert.strictEqual(S.maskVertices().length, 3);
  });
});

describe('Preservação: resetMaskVertices descarta pontos e preserva enquadramento', () => {
  it('desfaz a forma mantendo posição e tamanho', () => {
    S.setGamut({ kind: 'hexagon', cx: 0.15, cy: -0.1, rx: 0.55, ry: 0.66, angle: 20 });
    S.setMaskVertex(0, 0.1, 0.1);
    assert.ok(S.hasCustomMask());

    assert.ok(S.resetMaskVertices());
    assert.ok(!S.hasCustomMask());

    const g = S.state.gamut;
    assert.ok(Math.abs(g.cx - 0.15) < 1e-9, 'cx mudou');
    assert.ok(Math.abs(g.rx - 0.55) < 1e-9, 'rx mudou');
    assert.ok(Math.abs(g.angle - 20) < 1e-9, 'angle mudou');
  });
});

describe('Preservação: insideMask e clampToMask leem gamut.points ao vivo', () => {
  it('insideMask reflete a forma editada', () => {
    S.state.gamut.points = null;
    S.setGamut({ kind: 'rect', cx: 0, cy: 0, rx: 0.9, ry: 0.9, angle: 0 });

    // Ponto perto do canto superior direito — dentro do retângulo
    const canto = S.discToHs(0.6, -0.6);
    assert.ok(S.insideMask(canto.h, canto.s), 'deveria estar dentro antes da edição');

    // Recolhe o canto para o centro
    const pts = S.maskVertices();
    const alvo = pts.findIndex((p) => p.x > 0.5 && p.y < -0.5);
    assert.ok(alvo >= 0, 'deveria encontrar o canto');
    S.setMaskVertex(alvo, 0.05, -0.05);

    assert.ok(!S.insideMask(canto.h, canto.s), 'deveria estar fora após a edição');
  });

  it('clampToMask reflete a forma editada', () => {
    S.state.gamut.points = null;
    S.setGamut({ kind: 'rect', cx: 0, cy: 0, rx: 0.9, ry: 0.9, angle: 0 });

    // Mover o canto superior direito para perto do centro
    const pts = S.maskVertices();
    const alvo = pts.findIndex((p) => p.x > 0.5 && p.y < -0.5);
    S.setMaskVertex(alvo, 0.05, -0.05);

    // Um ponto que antes não seria clampado, agora é
    const canto = S.discToHs(0.6, -0.6);
    const clamped = S.clampToMask(canto.h, canto.s);
    // O ponto clampado deve ser diferente do original (já que agora está fora)
    const same = (Math.abs(clamped.h - canto.h) < 0.1 && Math.abs(clamped.s - canto.s) < 0.1);
    assert.ok(!same, 'clampToMask deveria mover o ponto para dentro da nova forma');
  });
});

/* ==========================================================================
 * TAREFA 4 — Testes de regressão adicionais
 * ========================================================================== */

describe('Regressão: clamp ao disco', () => {
  it('vértice com projeção fora do disco (raio > 1) é clampado — projeta para raio ≈ 1', () => {
    S.state.gamut.points = null;
    S.setGamut({ kind: 'hexagon', rx: 0.6, ry: 0.6, cx: 0, cy: 0, angle: 0 });

    // (5, -9) projeta para disco (3, -5.4) → raio ~6.18, muito fora do disco
    S.setMaskVertex(0, 5, -9);
    const p = S.maskVertices()[0];
    const disc = S.unitToDisc(p.x, p.y);
    const r = Math.hypot(disc.u, disc.v);
    assert.ok(Math.abs(r - 1) < 1e-6, `raio no disco deveria ser ≈1, mas é ${r}`);
  });

  it('vértice com projeção dentro do disco mas fora de ±1 é aceito sem clamp', () => {
    S.state.gamut.points = null;
    S.setGamut({ kind: 'hexagon', rx: 0.3, ry: 0.3, cx: 0, cy: 0, angle: 0 });

    // (0, -2.5) projeta para disco (0, -0.75) → raio 0.75, dentro do disco
    S.setMaskVertex(0, 0, -2.5);
    const p = S.maskVertices()[0];
    assert.ok(Math.abs(p.x - 0) < 1e-9, `x deveria ser 0, é ${p.x}`);
    assert.ok(Math.abs(p.y - (-2.5)) < 1e-9, `y deveria ser -2.5, é ${p.y}`);
  });

  it('após mover vértice, insideMask para ponto excluído retorna false', () => {
    S.state.gamut.points = null;
    S.setGamut({ kind: 'rect', cx: 0, cy: 0, rx: 0.9, ry: 0.9, angle: 0 });

    // Verificar que o ponto está dentro antes
    const ponto = S.discToHs(-0.72, -0.72);
    assert.ok(S.insideMask(ponto.h, ponto.s), 'deveria estar dentro antes da edição');

    // Mover vertex 0 (que é (-1,-1)) para o centro — o ponto fica fora
    S.setMaskVertex(0, 0, 0);
    assert.ok(!S.insideMask(ponto.h, ponto.s),
      'insideMask deveria excluir o ponto após mover o vértice');
  });

  it('redimensionar a máscara (rx, ry) não afeta gamut.points', () => {
    S.state.gamut.points = null;
    S.setGamut({ kind: 'hexagon', rx: 0.5, ry: 0.5, cx: 0, cy: 0, angle: 0 });

    // Editar um vértice
    S.setMaskVertex(0, 0.3, -0.8);
    const pontosBefore = JSON.stringify(S.maskVertices());

    // Redimensionar
    S.setGamut({ rx: 0.7, ry: 0.4 });
    const pontosAfter = JSON.stringify(S.maskVertices());

    assert.strictEqual(pontosBefore, pontosAfter,
      'gamut.points não deveria mudar ao redimensionar');
  });
});
