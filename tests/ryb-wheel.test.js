/**
 * ryb-wheel.test.js — A roda do pintor (RYB) e o que ela muda na teoria das cores.
 *
 * O plugin guarda cor em HSV, que é a roda da LUZ: ali o oposto do vermelho é o
 * ciano. O pintor trabalha na roda RYB, onde o oposto do vermelho é o verde. As
 * duas rodas contêm as mesmas cores; o que muda é ONDE cada matiz fica, e por
 * consequência para onde toda harmonia aponta.
 *
 * A separação que estes testes protegem:
 *
 *   MATIZ  — o valor de H, que define a cor. Vive em HSV, sempre.
 *   ÂNGULO — a posição desse matiz na roda que o usuário vê. Depende do espaço.
 *
 * Todo o programa fala em termos de `hueToAngle`/`angleToHue`. Se algum
 * consumidor voltar a assumir que ângulo é matiz, o modo RYB fica "meio
 * aplicado" — o anel numa ordem, os marcadores em outra — e é exatamente esse
 * tipo de regressão silenciosa que os testes abaixo pegam.
 */
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

let C;
let S;
let W;
/**
 * O espaço padrão, lido antes de qualquer teste mexer nele.
 *
 * Recarregar `state.js` no meio da suíte não serve para observar o padrão:
 * `wheel.js` guarda a referência do AppState no carregamento, e um estado novo
 * deixa os dois olhando objetos diferentes — a roda passa a desenhar a partir
 * de um estado que os testes não controlam mais.
 */
let espacoInicial;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

before(() => {
  load('color.js');
  load('state.js');
  load('layout.js');
  load('wheel.js');
  C = window.Color;
  S = window.AppState;
  W = window.Wheel;
  espacoInicial = S.state.wheelSpace;
});

/** Distância angular mais curta, sempre positiva. */
function dist(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

describe('RYB: a conversão é uma bijeção', () => {
  it('posição → matiz → posição volta ao mesmo ponto', () => {
    for (let a = 0; a < 360; a += 0.25) {
      const volta = C.hueToRyb(C.rybToHue(a));
      assert.ok(dist(volta, a) < 1e-9,
        `posição ${a}° virou ${volta}° na ida e volta`);
    }
  });

  it('matiz → posição → matiz volta ao mesmo matiz', () => {
    for (let h = 0; h < 360; h += 0.25) {
      const volta = C.rybToHue(C.hueToRyb(h));
      assert.ok(dist(volta, h) < 1e-9,
        `matiz ${h}° virou ${volta}° na ida e volta`);
    }
  });

  /**
   * Sem monotonicidade a função não teria inversa, e a roda passaria a ter
   * duas posições para o mesmo matiz — marcador impossível de posicionar.
   */
  it('a tabela é estritamente crescente', () => {
    const t = C.RYB_HUE_TABLE;
    for (let i = 1; i < t.length; i++) {
      assert.ok(t[i] > t[i - 1],
        `tabela não cresce em ${i}: ${t[i - 1]} → ${t[i]}`);
    }
    assert.strictEqual(t[0], 0, 'a tabela deveria começar em 0');
    assert.strictEqual(t[t.length - 1], 360, 'a tabela deveria fechar em 360');
  });
});

describe('RYB: as primárias do pintor caem onde deveriam', () => {
  /**
   * Vermelho, amarelo e azul igualmente espaçados — é a definição da roda RYB.
   * Se algum deles sair de lugar, o triádico deixa de dar as primárias e a
   * roda perde o sentido de existir.
   */
  it('vermelho, amarelo e azul ficam a 120° um do outro', () => {
    assert.ok(dist(C.rybToHue(0), 0) < 1e-9, 'posição 0 deveria ser o vermelho (H 0)');
    assert.ok(dist(C.rybToHue(120), 60) < 1e-9, 'posição 120 deveria ser o amarelo (H 60)');
    assert.ok(dist(C.rybToHue(240), 240) < 1e-9, 'posição 240 deveria ser o azul (H 240)');
  });

  it('cada primária tem a secundária certa como complementar', () => {
    // Meia volta na roda do pintor, e o resultado em matiz HSV.
    const pares = [
      [0, 120, 'vermelho', 'verde'],
      [120, 285, 'amarelo', 'violeta'],
      [240, 30, 'azul', 'laranja']
    ];

    pares.forEach(([posicao, matizEsperado, de, para]) => {
      const comp = C.rybToHue(posicao + 180);
      assert.ok(dist(comp, matizEsperado) < 1e-9,
        `o complementar do ${de} deveria ser o ${para} (H ${matizEsperado}), deu H ${comp.toFixed(1)}`);
    });
  });
});

describe('Espaço da roda: o estado escolhe, os conversores traduzem', () => {
  it('no RGB os conversores são identidade', () => {
    S.setWheelSpace('rgb');
    for (let h = 0; h < 360; h += 7) {
      assert.strictEqual(S.hueToAngle(h), h, `hueToAngle mexeu no matiz ${h}`);
      assert.strictEqual(S.angleToHue(h), h, `angleToHue mexeu na posição ${h}`);
    }
  });

  it('um espaço desconhecido é ignorado, sem deixar o estado inválido', () => {
    S.setWheelSpace('ryb');
    S.setWheelSpace('lab-imaginario');
    assert.strictEqual(S.state.wheelSpace, 'ryb');
  });

  it('o padrão é a roda RGB', () => {
    assert.strictEqual(espacoInicial, 'rgb');
  });
});

describe('Harmonia: o esquema segue a roda escolhida', () => {
  function huesDe(espaco, esquema, matizBase) {
    S.setWheelSpace(espaco);
    S.setHsv({ h: matizBase, s: 100, v: 100 });
    S.setScheme(esquema);
    S.resetHarmony();
    return [S.getHsv().h].concat(S.getHarmonyHues());
  }

  it('o complementar do vermelho é o ciano no RGB e o verde no RYB', () => {
    const rgb = huesDe('rgb', 'comp', 0);
    assert.ok(dist(rgb[1], 180) < 1e-6, `RGB deveria dar ciano, deu ${rgb[1].toFixed(1)}`);

    const ryb = huesDe('ryb', 'comp', 0);
    assert.ok(dist(ryb[1], 120) < 1e-6, `RYB deveria dar verde, deu ${ryb[1].toFixed(1)}`);
  });

  /**
   * O teste que resume tudo: na roda do pintor o triádico a partir do vermelho
   * devolve exatamente vermelho, amarelo e azul.
   */
  it('o triádico no RYB devolve as três primárias do pintor', () => {
    const hues = huesDe('ryb', 'triad', 0);
    const esperado = [0, 60, 240];

    esperado.forEach((matiz) => {
      const achou = hues.some((h) => dist(h, matiz) < 1e-6);
      assert.ok(achou, `faltou o matiz ${matiz} no triádico RYB: ${hues.map((h) => h.toFixed(0))}`);
    });
  });

  it('o triádico no RGB devolve as três primárias da luz', () => {
    const hues = huesDe('rgb', 'triad', 0);
    [0, 120, 240].forEach((matiz) => {
      const achou = hues.some((h) => dist(h, matiz) < 1e-6);
      assert.ok(achou, `faltou o matiz ${matiz} no triádico RGB`);
    });
  });

  it('o tetrádico mantém os dois eixos opostos nas duas rodas', () => {
    ['rgb', 'ryb'].forEach((espaco) => {
      S.setWheelSpace(espaco);
      S.setHsv({ h: 40, s: 100, v: 100 });
      S.setScheme('tetra');
      S.resetHarmony();

      // A oposição é uma propriedade dos OFFSETS, que vivem no espaço da roda.
      const off = S.getHarmonyOffsets();
      assert.strictEqual(off[1], 180, `${espaco}: o eixo fixo deixou de ser oposto`);
      assert.strictEqual(off[2] - off[0], 180, `${espaco}: o eixo móvel deixou de ser oposto`);
    });
  });
});

describe('Limite de cores: os setores são iguais na roda que se vê', () => {
  it('a paleta limitada traz posições igualmente espaçadas', () => {
    ['rgb', 'ryb'].forEach((espaco) => {
      S.setWheelSpace(espaco);
      S.setLimit({ enabled: true, hueSteps: 12, svSteps: 0 });

      const pal = S.getLimitedPalette();
      assert.strictEqual(pal.length, 12, `${espaco}: a paleta deveria ter 12 matizes`);
      assert.strictEqual(new Set(pal.map((h) => h.toFixed(6))).size, 12,
        `${espaco}: a paleta tem matiz repetido`);

      // Igualmente espaçados em POSIÇÃO, não em matiz.
      pal.forEach((h, i) => {
        const esperado = i * 30;
        assert.ok(dist(S.hueToAngle(h), esperado) < 1e-6,
          `${espaco}: o matiz ${i} deveria estar na posição ${esperado}`);
      });

      S.setLimit({ enabled: false });
    });
  });

  it('quantizar encaixa na posição mais próxima, e é idempotente', () => {
    ['rgb', 'ryb'].forEach((espaco) => {
      S.setWheelSpace(espaco);
      for (let h = 0; h < 360; h += 3) {
        const uma = S.quantizeHue(h, 12);
        const duas = S.quantizeHue(uma, 12);
        assert.ok(dist(uma, duas) < 1e-6,
          `${espaco}: quantizar duas vezes mudou o matiz ${h}`);

        // O resultado tem de cair num múltiplo de 30 na roda.
        const resto = S.hueToAngle(uma) % 30;
        const perto = Math.min(resto, 30 - resto);
        assert.ok(perto < 1e-6,
          `${espaco}: o matiz ${h} caiu fora dos setores (posição ${S.hueToAngle(uma)})`);
      }
    });
  });
});

describe('Roda: desenho e interação concordam', () => {
  /**
   * A regressão que este teste existe para pegar: o anel usa `angleToHue` e os
   * marcadores usam `hueToAngle`. Se um dos dois for esquecido, o marcador
   * aponta para uma faixa de cor diferente da que ele representa — o defeito
   * fica visível mas nenhum teste de unidade o notaria.
   */
  it('o marcador de um matiz cai na posição de onde aquele matiz é escolhido', () => {
    const G = W.geometry;

    ['rgb', 'ryb'].forEach((espaco) => {
      S.setWheelSpace(espaco);
      S.setWheelRotation(0);

      for (let h = 0; h < 360; h += 5) {
        const p = G.hueMarkerPos(h, G.MARKER_TRACK_R);
        // O mesmo caminho que applyRing faz ao receber um clique nesse ponto.
        const escolhido = S.angleToHue(G.screenAngle(p) - S.state.wheelRotation);
        assert.ok(dist(escolhido, h) < 1e-6,
          `${espaco}: marcador do matiz ${h} devolve ${escolhido.toFixed(2)} ao ser clicado`);
      }
    });
  });

  it('o disco concorda com o anel: mesmo matiz, mesma posição angular', () => {
    ['rgb', 'ryb'].forEach((espaco) => {
      S.setWheelSpace(espaco);

      for (let h = 0; h < 360; h += 9) {
        const d = S.hsToDisc(h, 100);
        const volta = S.discToHs(d.u, d.v);
        assert.ok(dist(volta.h, h) < 1e-6,
          `${espaco}: o disco perdeu o matiz ${h} (voltou ${volta.h.toFixed(2)})`);
      }
    });
  });
});
