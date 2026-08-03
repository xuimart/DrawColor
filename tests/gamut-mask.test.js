/**
 * Máscara de gamut: edição livre por vértices e as alças de edição.
 *
 * Dois assuntos:
 *
 *   1. Vértices. Mover um vértice congela a figura como polígono livre. O que
 *      precisa continuar valendo é que a edição muda a FORMA e não o
 *      enquadramento — centro, tamanho e rotação seguem intactos — e que
 *      trocar de formato no rack ou restaurar descarta a figura editada,
 *      senão o rack pararia de responder.
 *
 *   2. Alças. A caixa de edição é traçada ligando os cantos. Ligar todas as
 *      alças na ordem do array desenhava um emaranhado de linhas cruzando a
 *      máscara, porque a lista tem os quatro cantos e depois os meios de lado.
 */
'use strict';

const { describe, it, beforeEach, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

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
  load('wheel.js');   // só toca no DOM dentro de init()
  S = window.AppState;
  W = window.Wheel;
});

beforeEach(() => {
  S.state.gamut.locked = false;
  S.state.gamut.points = null;
  S.setGamut({ enabled: true, kind: 'hexagon', editing: true, cx: 0, cy: 0, angle: 0 });
});

describe('Máscara: quais formatos têm vértice', () => {
  it('polígonos expõem um vértice por canto', () => {
    const esperado = { triangle: 3, rect: 4, diamond: 4, hexagon: 6 };

    Object.keys(esperado).forEach((kind) => {
      S.setGamut({ kind });
      const pts = S.maskVertices();
      assert.ok(pts, `${kind} deveria ter vértices`);
      assert.strictEqual(pts.length, esperado[kind], `${kind}`);
    });
  });

  it('elipse e lobos duplos não têm vértice para pegar', () => {
    ['ellipse', 'dual'].forEach((kind) => {
      S.setGamut({ kind });
      assert.strictEqual(S.maskVertices(), null, kind);
    });
  });

  it('os vértices ficam no espaço unitário, dentro de ±1', () => {
    ['triangle', 'rect', 'diamond', 'hexagon'].forEach((kind) => {
      S.setGamut({ kind });
      S.maskVertices().forEach((p) => {
        assert.ok(Math.abs(p.x) <= 1 + 1e-9 && Math.abs(p.y) <= 1 + 1e-9,
          `${kind}: vértice fora da caixa ${JSON.stringify(p)}`);
      });
    });
  });
});

describe('Máscara: mover um vértice muda a forma, não o enquadramento', () => {
  it('o vértice vai para onde foi pedido', () => {
    assert.ok(S.setMaskVertex(0, 0.5, -0.25));

    const pts = S.maskVertices();
    assert.ok(Math.abs(pts[0].x - 0.5) < 1e-9);
    assert.ok(Math.abs(pts[0].y - (-0.25)) < 1e-9);
  });

  it('os outros vértices não se movem', () => {
    const antes = S.maskVertices();
    S.setMaskVertex(2, 0.1, 0.9);
    const depois = S.maskVertices();

    depois.forEach((p, i) => {
      if (i === 2) return;
      assert.ok(Math.abs(p.x - antes[i].x) < 1e-9 && Math.abs(p.y - antes[i].y) < 1e-9,
        `o vértice ${i} escorregou`);
    });
  });

  it('centro, tamanho e rotação seguem intactos', () => {
    S.setGamut({ cx: 0.12, cy: -0.08, rx: 0.5, ry: 0.7, angle: 30 });
    const antes = { ...S.state.gamut };

    S.setMaskVertex(1, -0.9, 0.4);

    const g = S.state.gamut;
    assert.ok(Math.abs(g.cx - antes.cx) < 1e-9, 'o centro se mexeu');
    assert.ok(Math.abs(g.cy - antes.cy) < 1e-9, 'o centro se mexeu');
    assert.ok(Math.abs(g.rx - antes.rx) < 1e-9, 'rx mudou');
    assert.ok(Math.abs(g.ry - antes.ry) < 1e-9, 'ry mudou');
    assert.ok(Math.abs(g.angle - antes.angle) < 1e-9, 'o ângulo mudou');
  });

  it('a figura editada passa a valer para o que está dentro da máscara', () => {
    /**
     * Não basta guardar o ponto: inside e clamp precisam ler a figura nova,
     * senão a máscara desenhada e a máscara que restringe a cor divergem.
     */
    S.setGamut({ kind: 'rect', cx: 0, cy: 0, rx: 0.9, ry: 0.9, angle: 0 });

    // Um ponto perto do canto superior direito, dentro do retângulo.
    const canto = S.discToHs(0.6, -0.6);
    assert.ok(S.insideMask(canto.h, canto.s), 'o retângulo deveria conter o canto');

    // Recolhe aquele canto para o centro: o ponto fica fora.
    const pts = S.maskVertices();
    const alvo = pts.findIndex((p) => p.x > 0.5 && p.y < -0.5);
    assert.ok(alvo >= 0, 'não achei o canto superior direito');
    S.setMaskVertex(alvo, 0.05, -0.05);

    assert.ok(!S.insideMask(canto.h, canto.s),
      'a máscara continuou aceitando um ponto que a forma nova exclui');
  });

  it('vértice fora do disco é recolhido para o raio 1 do disco', () => {
    S.setMaskVertex(0, 5, -9);
    const p = S.maskVertices()[0];
    // Após a correção, o vértice é clampado ao disco (raio 1), não à bounding box ±1.
    // A coordenada armazenada deve projetar para raio ≈ 1 no disco.
    const disc = S.unitToDisc(p.x, p.y);
    const r = Math.hypot(disc.u, disc.v);
    assert.ok(Math.abs(r - 1) < 1e-6, `raio no disco deveria ser ≈1, mas é ${r}`);
    // E não deve estar no valor antigo ±1
    assert.ok(!(p.x === 1 && p.y === -1), 'não deveria estar clampado à bounding box');
  });

  it('valor não numérico é recusado e a forma não muda', () => {
    const antes = JSON.stringify(S.maskVertices());
    assert.strictEqual(S.setMaskVertex(0, NaN, 0), false);
    assert.strictEqual(S.setMaskVertex(0, 0, Infinity), false);
    assert.strictEqual(JSON.stringify(S.maskVertices()), antes);
  });

  it('índice fora da faixa é recusado', () => {
    assert.strictEqual(S.setMaskVertex(99, 0.5, 0.5), false);
    assert.strictEqual(S.setMaskVertex(-1, 0.5, 0.5), false);
  });

  it('máscara travada não aceita edição de vértice', () => {
    S.setMaskVertex(0, 0.4, 0.4);
    const antes = JSON.stringify(S.maskVertices());

    S.setGamut({ locked: true });
    assert.strictEqual(S.setMaskVertex(0, -0.9, -0.9), false);
    assert.strictEqual(JSON.stringify(S.maskVertices()), antes);

    S.state.gamut.locked = false;
  });
});

describe('Máscara: a figura editada é descartada quando deve', () => {
  it('escolher outro formato no rack volta ao formato canônico', () => {
    S.setMaskVertex(0, 0.1, 0.1);
    assert.ok(S.hasCustomMask());

    S.setGamut({ kind: 'triangle' });

    assert.ok(!S.hasCustomMask(), 'o rack não responderia: a figura antiga venceria');
    assert.strictEqual(S.maskVertices().length, 3);
  });

  it('escolher o mesmo formato não descarta o trabalho', () => {
    S.setMaskVertex(0, 0.2, 0.3);
    S.setGamut({ kind: 'hexagon' });
    assert.ok(S.hasCustomMask(), 'clicar no formato já ativo apagou a edição');
  });

  it('restaurar a máscara devolve a figura canônica', () => {
    S.setMaskVertex(0, 0.1, 0.1);
    S.setGamut({ cx: 0.2, cy: 0.2, angle: 45 });

    S.resetGamut();

    assert.ok(!S.hasCustomMask());
    assert.strictEqual(S.state.gamut.cx, 0);
    assert.strictEqual(S.state.gamut.angle, 0);
  });

  it('há como desfazer só a forma, mantendo posição e tamanho', () => {
    S.setGamut({ cx: 0.15, cy: -0.1, rx: 0.55, ry: 0.66, angle: 20 });
    S.setMaskVertex(0, 0.1, 0.1);

    assert.ok(S.resetMaskVertices());

    assert.ok(!S.hasCustomMask());
    const g = S.state.gamut;
    assert.ok(Math.abs(g.cx - 0.15) < 1e-9, 'a posição foi junto');
    assert.ok(Math.abs(g.rx - 0.55) < 1e-9, 'o tamanho foi junto');
    assert.ok(Math.abs(g.angle - 20) < 1e-9, 'a rotação foi junto');
  });

  it('desfazer a forma sem forma editada não faz nada', () => {
    assert.strictEqual(S.resetMaskVertices(), false);
  });
});

describe('Máscara: alças da caixa de edição', () => {
  it('são quatro cantos e quatro meios de lado', () => {
    const handles = W.geometry.maskHandles();
    const cantos = handles.filter((h) => h.axis === 'both');
    const meios = handles.filter((h) => h.axis !== 'both');

    assert.strictEqual(cantos.length, 4);
    assert.strictEqual(meios.length, 4);
  });

  it('os cantos, na ordem do array, fecham a caixa sem cruzar', () => {
    /**
     * É esta a propriedade que o desenho usa: o contorno liga os cantos na
     * ordem em que aparecem. Se a ordem não for a de um percurso pela borda,
     * o traço cruza a figura — que era exatamente o emaranhado relatado.
     *
     * Um percurso válido troca de sinal em um eixo por vez.
     */
    const cantos = W.geometry.maskHandles().filter((h) => h.axis === 'both');

    for (let i = 0; i < cantos.length; i++) {
      const a = cantos[i];
      const b = cantos[(i + 1) % cantos.length];
      const mudaX = a.sx !== b.sx;
      const mudaY = a.sy !== b.sy;

      assert.ok(mudaX !== mudaY,
        `os cantos ${i} e ${(i + 1) % cantos.length} não são vizinhos na borda: ` +
        `(${a.sx},${a.sy}) → (${b.sx},${b.sy})`
      );
    }
  });

  it('ligar todas as alças na ordem do array cruzaria a figura', () => {
    // Guarda o motivo da correção: o traço antigo usava esta lista inteira.
    const handles = W.geometry.maskHandles();
    let saltos = 0;

    for (let i = 0; i < handles.length; i++) {
      const a = handles[i];
      const b = handles[(i + 1) % handles.length];
      const mudaX = a.sx !== b.sx;
      const mudaY = a.sy !== b.sy;
      if (mudaX && mudaY) saltos++;
    }

    assert.ok(saltos > 0,
      'se nenhum salto cruza a figura, o desenho antigo não era o problema');
  });
});
