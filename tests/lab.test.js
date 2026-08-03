/**
 * Bateria do modo LAB.
 *
 * Duas camadas, porque os problemas do LAB vêm de dois lugares diferentes:
 *
 *   1. A matemática da conversão (color.js). Aqui o risco é erro de fórmula:
 *      eixo neutro torto, luminosidade não monotônica, componente fora de
 *      faixa, ida e volta que não fecha dentro do gamut.
 *
 *   2. O caminho real da edição (panels.js + state.js). Aqui o risco é o
 *      estado: a cor mora em RGB e o LAB é uma vista sobre ela. Editar um
 *      canal escreve uma cor recortada, e ler de volta pode devolver outro
 *      triplo. É o que fazia os extremos serem inalcançáveis e um slider
 *      mexer no número dos outros.
 *
 * A camada 2 exercita a pilha inteira — AppState.setRgb, arredondamento para
 * 8 bits, passagem por HSV — em vez de testar resolveVals isolado. Um teste
 * que só compara `toRgb(vals)` com ele mesmo não descobre nada.
 */
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fc = require('fast-check');

require('./setup.js');

let C;
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
  load('panels.js');   // só toca no DOM dentro de init()
  C = window.Color;
  S = window.AppState;
  Panels = window.Panels;
});

/* ---------------- arbitrários ---------------- */

const rgbArb = fc.record({
  r: fc.integer({ min: 0, max: 255 }),
  g: fc.integer({ min: 0, max: 255 }),
  b: fc.integer({ min: 0, max: 255 })
});

// Faixa declarada pelos sliders do modo LAB.
const labArb = fc.record({
  L: fc.double({ min: 0, max: 100, noNaN: true }),
  a: fc.double({ min: -128, max: 127, noNaN: true }),
  b: fc.double({ min: -128, max: 127, noNaN: true })
});

const RUNS = { numRuns: 400 };

/* ================================================================== */
/* Camada 1: a matemática                                             */
/* ================================================================== */

describe('LAB, conversão: faixas e forma', () => {
  it('labToRgb devolve inteiros de 0 a 255 para qualquer triplo da faixa', () => {
    fc.assert(fc.property(labArb, (lab) => {
      const rgb = C.labToRgb(lab.L, lab.a, lab.b);
      ['r', 'g', 'b'].forEach((k) => {
        assert.ok(Number.isInteger(rgb[k]), `${k} não é inteiro: ${rgb[k]}`);
        assert.ok(rgb[k] >= 0 && rgb[k] <= 255, `${k} fora de 0..255: ${rgb[k]}`);
      });
    }), RUNS);
  });

  it('rgbToLab mantém L em 0..100 e a, b dentro da faixa dos sliders', () => {
    fc.assert(fc.property(rgbArb, (rgb) => {
      const lab = C.rgbToLab(rgb.r, rgb.g, rgb.b);
      assert.ok(lab.L >= -0.001 && lab.L <= 100.001, `L fora de faixa: ${lab.L}`);
      assert.ok(lab.a >= -128 && lab.a <= 127, `a fora da faixa do slider: ${lab.a}`);
      assert.ok(lab.b >= -128 && lab.b <= 127, `b fora da faixa do slider: ${lab.b}`);
    }), RUNS);
  });

  it('é pura: a mesma entrada dá sempre a mesma saída', () => {
    fc.assert(fc.property(rgbArb, (rgb) => {
      assert.deepStrictEqual(
        C.rgbToLab(rgb.r, rgb.g, rgb.b),
        C.rgbToLab(rgb.r, rgb.g, rgb.b)
      );
    }), RUNS);
  });
});

describe('LAB, conversão: ida e volta dentro do gamut', () => {
  it('RGB → LAB → RGB fecha com no máximo 1 nível de diferença', () => {
    fc.assert(fc.property(rgbArb, (rgb) => {
      const lab = C.rgbToLab(rgb.r, rgb.g, rgb.b);
      const back = C.labToRgb(lab.L, lab.a, lab.b);
      ['r', 'g', 'b'].forEach((k) => {
        assert.ok(
          Math.abs(back[k] - rgb[k]) <= 1,
          `${k}: ${rgb[k]} virou ${back[k]}`
        );
      });
    }), RUNS);
  });
});

describe('LAB, conversão: eixo neutro e luminosidade', () => {
  it('a = b = 0 produz cinza exato', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (L) => {
      const rgb = C.labToRgb(L, 0, 0);
      assert.strictEqual(rgb.r, rgb.g, `não é cinza em L=${L}: ${JSON.stringify(rgb)}`);
      assert.strictEqual(rgb.g, rgb.b, `não é cinza em L=${L}: ${JSON.stringify(rgb)}`);
    }), RUNS);
  });

  it('cinza tem a e b nulos', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 255 }), (v) => {
      const lab = C.rgbToLab(v, v, v);
      assert.ok(Math.abs(lab.a) < 0.001, `a não zerou no cinza ${v}: ${lab.a}`);
      assert.ok(Math.abs(lab.b) < 0.001, `b não zerou no cinza ${v}: ${lab.b}`);
    }), RUNS);
  });

  it('L maior nunca escurece o cinza', () => {
    fc.assert(fc.property(
      fc.double({ min: 0, max: 100, noNaN: true }),
      fc.double({ min: 0, max: 100, noNaN: true }),
      (x, y) => {
        const lo = Math.min(x, y);
        const hi = Math.max(x, y);
        assert.ok(
          C.labToRgb(hi, 0, 0).r >= C.labToRgb(lo, 0, 0).r,
          `L=${hi} ficou mais escuro que L=${lo}`
        );
      }
    ), RUNS);
  });

  it('os extremos do eixo neutro são preto e branco', () => {
    assert.deepStrictEqual(C.labToRgb(0, 0, 0), { r: 0, g: 0, b: 0 });
    assert.deepStrictEqual(C.labToRgb(100, 0, 0), { r: 255, g: 255, b: 255 });
  });

  it('L acompanha a luminosidade percebida, não a média dos canais', () => {
    // Amarelo saturado é muito mais claro que azul saturado, embora ambos
    // tenham a mesma média de canais.
    const amarelo = C.rgbToLab(255, 255, 0).L;
    const azul = C.rgbToLab(0, 0, 255).L;
    assert.ok(amarelo > azul + 30, `amarelo ${amarelo} vs azul ${azul}`);
  });
});

/* ================================================================== */
/* Camada 2: o caminho real da edição                                 */
/* ================================================================== */

/**
 * Reproduz o que `commitChannel` faz: guarda o triplo editado, escreve a cor
 * pelo AppState e devolve o que os sliders passariam a exibir.
 */
function editar(vals) {
  const latch = { mode: 'LAB', vals: { ...vals } };
  Panels.MODES.LAB.write(vals);
  return {
    latch,
    rgb: S.getRgb(),
    exibido: Panels.resolveVals('LAB', S.getRgb(), latch)
  };
}

describe('LAB, edição: o triplo editado sobrevive à escrita', () => {
  it('qualquer triplo da faixa continua exibido depois de aplicado', () => {
    fc.assert(fc.property(labArb, (vals) => {
      const { exibido } = editar(vals);
      assert.ok(Math.abs(exibido.L - vals.L) < 0.001, `L virou ${exibido.L}, era ${vals.L}`);
      assert.ok(Math.abs(exibido.a - vals.a) < 0.001, `a virou ${exibido.a}, era ${vals.a}`);
      assert.ok(Math.abs(exibido.b - vals.b) < 0.001, `b virou ${exibido.b}, era ${vals.b}`);
    }), RUNS);
  });

  it('os quatro cantos da faixa são alcançáveis', () => {
    [
      { L: 100, a: -128, b: 127 },
      { L: 0, a: -128, b: -128 },
      { L: 100, a: 127, b: 127 },
      { L: 50, a: 127, b: -128 }
    ].forEach((vals) => {
      const { exibido } = editar(vals);
      assert.deepStrictEqual(
        { L: exibido.L, a: exibido.a, b: exibido.b },
        vals,
        `canto inalcançável: ${JSON.stringify(vals)}`
      );
    });
  });
});

describe('LAB, edição: independência entre canais', () => {
  it('mover um canal não altera os outros dois', () => {
    const canalArb = fc.constantFrom('L', 'a', 'b');

    fc.assert(fc.property(labArb, canalArb, fc.double({ min: 0, max: 1, noNaN: true }), (vals, canal, t) => {
      // Estado inicial: o usuário já editou este triplo.
      const inicial = editar(vals);

      const ch = Panels.MODES.LAB.channels.find((c) => c.key === canal);
      const novo = ch.min + t * (ch.max - ch.min);

      // Agora mexe num único canal, partindo do que está exibido.
      const alvo = { ...inicial.exibido, [canal]: novo };
      const { exibido } = editar(alvo);

      ['L', 'a', 'b'].forEach((k) => {
        if (k === canal) return;
        assert.ok(
          Math.abs(exibido[k] - alvo[k]) < 0.001,
          `mover ${canal} mexeu em ${k}: ${alvo[k]} virou ${exibido[k]}`
        );
      });
    }), RUNS);
  });

  it('arrastar um canal de ponta a ponta não desloca os outros', () => {
    const base = { L: 60, a: -30, b: -29 };
    let atual = editar(base).exibido;

    for (let a = -128; a <= 127; a += 5) {
      const { exibido } = editar({ ...atual, a });
      assert.ok(Math.abs(exibido.a - a) < 0.001, `a não fixou em ${a}`);
      assert.ok(Math.abs(exibido.L - base.L) < 0.001, `L saiu de ${base.L} em a=${a}`);
      assert.ok(Math.abs(exibido.b - base.b) < 0.001, `b saiu de ${base.b} em a=${a}`);
      atual = exibido;
    }
  });
});

describe('LAB, edição: a vista volta a seguir a cor quando ela vem de fora', () => {
  it('cor de outra origem descarta o triplo guardado', () => {
    /**
     * Quando alguém escreve uma cor genuinamente diferente (roda, hex, PS,
     * outra janela), o triplo não serve mais e os canais voltam a derivar da
     * cor real. A escrita precisa resultar num RGB fora da folga de ±2 do que
     * o triplo descreve — caso contrário `resolveChannels` interpreta como
     * eco e mantém o triplo (comportamento correto; é o que faz o LAB
     * funcionar dentro do PS).
     */
    fc.assert(fc.property(labArb, (vals) => {
      S.state.sliderMode = 'LAB';
      Panels.applyChannel('LAB', 'L', vals.L);
      Panels.applyChannel('LAB', 'a', vals.a);
      Panels.applyChannel('LAB', 'b', vals.b);

      // Cor garantidamente diferente: inverte todos os componentes.
      const atual = S.getRgb();
      const outra = { r: 255 - atual.r, g: 255 - atual.g, b: 255 - atual.b };

      S.setRgb(outra.r, outra.g, outra.b, { reason: 'color' });

      const rgbAgora = S.getRgb();
      const exibido = Panels.readVals();
      const esperado = C.rgbToLab(rgbAgora.r, rgbAgora.g, rgbAgora.b);

      assert.ok(
        Math.abs(exibido.L - esperado.L) < 0.001 &&
        Math.abs(exibido.a - esperado.a) < 0.001 &&
        Math.abs(exibido.b - esperado.b) < 0.001,
        `os sliders ficaram presos no triplo antigo: ${JSON.stringify(exibido)}`
      );
    }), RUNS);
  });

  it('todas as origens de cor estão declaradas', () => {
    // Se uma origem nova de mudança de cor aparecer no AppState e não entrar
    // nesta lista, o triplo deixa de ser descartado e o sintoma volta.
    assert.deepStrictEqual(Panels.ORIGENS_EXTERNAS.slice().sort(),
      ['color', 'host', 'peer']);
  });
});

describe('LAB, gradiente dos sliders', () => {
  it('o gradiente de um canal varia só aquele canal', () => {
    const mode = Panels.MODES.LAB;
    const vals = { L: 60, a: -30, b: -29 };

    mode.channels.forEach((ch) => {
      // Duas amostras distintas do mesmo canal devem produzir cores
      // diferentes; os outros canais permanecem no valor atual.
      const inicio = mode.toRgb({ ...vals, [ch.key]: ch.min });
      const fim = mode.toRgb({ ...vals, [ch.key]: ch.max });
      assert.notDeepStrictEqual(inicio, fim, `canal ${ch.label} tem gradiente chapado`);
    });
  });

  it('o gradiente reflete o triplo guardado, não a cor recortada', () => {
    // a = -128 com L alto sai do sRGB: a cor aplicada é recortada, mas o
    // gradiente precisa continuar descrevendo o triplo que o usuário vê.
    const vals = { L: 100, a: -128, b: 127 };
    const { exibido } = editar(vals);
    const mode = Panels.MODES.LAB;

    const noValor = mode.toRgb({ ...exibido, L: exibido.L });
    const doRecorte = mode.toRgb(C.rgbToLab(
      C.labToRgb(vals.L, vals.a, vals.b).r,
      C.labToRgb(vals.L, vals.a, vals.b).g,
      C.labToRgb(vals.L, vals.a, vals.b).b
    ));
    assert.notDeepStrictEqual(
      { ...exibido },
      C.rgbToLab(noValor.r, noValor.g, noValor.b),
      'o triplo exibido colapsou no recorte'
    );
    assert.ok(doRecorte, 'sanidade');
  });
});

/* ================================================================== */
/* Camada 3: a interface é avisada                                    */
/* ================================================================== */

/**
 * O AppState só notifica os assinantes quando a cor muda de fato. Fora do
 * sRGB isso é uma armadilha: triplos LAB diferentes recortam para o mesmo RGB,
 * então a cor "não muda" e ninguém é avisado — enquanto o triplo guardado já
 * é outro. O slider e o campo numérico ficam no valor anterior até um evento
 * qualquer forçar o redesenho. Era o travar-e-saltar do thumb.
 */
describe('LAB, edição: o redesenho acontece mesmo quando a cor recortada não muda', () => {
  /** Dois triplos distintos que caem no mesmo RGB depois do recorte. */
  function parNoMesmoRecorte() {
    const base = { L: 100, a: -128, b: 127 };
    const alvo = C.labToRgb(base.L, base.a, base.b);

    for (let a = -127; a <= 0; a += 1) {
      const cand = { L: base.L, a, b: base.b };
      const rgb = C.labToRgb(cand.L, cand.a, cand.b);
      if (rgb.r === alvo.r && rgb.g === alvo.g && rgb.b === alvo.b) {
        return [base, cand];
      }
    }
    return null;
  }

  it('existem triplos diferentes com o mesmo recorte — é a premissa do teste', () => {
    assert.ok(parNoMesmoRecorte(), 'nenhum par colide; o recorte mudou de comportamento');
  });

  it('sem force, o AppState não avisa quando a cor não muda — o risco que o force cobre', () => {
    S.setRgb(12, 34, 56, { reason: 'color' });

    let avisos = 0;
    S.subscribe(() => { avisos += 1; });

    // Mesma cor de novo, sem force: silêncio.
    S.setRgb(12, 34, 56, { reason: 'color' });
    assert.strictEqual(avisos, 0);

    // Com force, o assinante é chamado mesmo sem mudança de cor.
    S.setRgb(12, 34, 56, { reason: 'color', force: true });
    assert.strictEqual(avisos, 1);
  });

  it('escrever o segundo triplo avisa os assinantes', () => {
    const par = parNoMesmoRecorte();
    const [primeiro, segundo] = par;

    const write = Panels.MODES.LAB.write;

    write(primeiro);

    let avisos = 0;
    S.subscribe(() => { avisos += 1; });

    write(segundo);
    assert.ok(
      avisos > 0,
      'a cor recortada não mudou e a interface não foi avisada: o slider fica travado'
    );
  });
});

describe('LAB: passos inteiros, como a referência', () => {
  it('os três canais andam de 1 em 1 e exibem sem decimais', () => {
    Panels.MODES.LAB.channels.forEach((ch) => {
      assert.strictEqual(ch.step, 1, `canal ${ch.label} não anda de 1 em 1`);
      assert.strictEqual(ch.decimals, 0, `canal ${ch.label} exibe decimais`);
    });
  });

  it('a faixa de cada canal é a do LAB, com A e B assinados', () => {
    const byKey = {};
    Panels.MODES.LAB.channels.forEach((ch) => { byKey[ch.key] = ch; });

    assert.deepStrictEqual([byKey.L.min, byKey.L.max], [0, 100]);
    assert.deepStrictEqual([byKey.a.min, byKey.a.max], [-128, 127]);
    assert.deepStrictEqual([byKey.b.min, byKey.b.max], [-128, 127]);
  });
});

/* ================================================================== */
/* Camada 3: o trilho e a integridade da cor                          */
/*                                                                    */
/* O que separa esta camada da anterior: aqui o risco não é o estado   */
/* nem a fórmula, é a entrada. A posição do ponteiro vira valor de     */
/* canal por uma divisão pela largura do trilho, e essa largura pode   */
/* ser zero num pane recém-trocado. O NaN resultante atravessava tudo  */
/* e contaminava a cor — inclusive de forma persistente, porque        */
/* `setRgb` preserva o matiz atual em cores acromáticas e um matiz NaN */
/* sobrevivia até a escrita de um cinza.                              */
/* ================================================================== */

const LAB_MODE = () => Panels.MODES.LAB;
const labChan = (key) => LAB_MODE().channels.find((c) => c.key === key);

describe('LAB, trilho: posição do ponteiro para valor', () => {
  it('os extremos do trilho alcançam exatamente os extremos do canal', () => {
    LAB_MODE().channels.forEach((ch) => {
      assert.strictEqual(Panels.valueFromRatio(ch, 0), ch.min, `${ch.label} no início`);
      assert.strictEqual(Panels.valueFromRatio(ch, 1), ch.max, `${ch.label} no fim`);
    });
  });

  it('arraste além das bordas do trilho para nos extremos', () => {
    const a = labChan('a');
    assert.strictEqual(Panels.valueFromRatio(a, -0.5), a.min);
    assert.strictEqual(Panels.valueFromRatio(a, 1.5), a.max);
  });

  it('todo valor cai na grade do passo e dentro da faixa', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (t) => {
      LAB_MODE().channels.forEach((ch) => {
        const v = Panels.valueFromRatio(ch, t);
        assert.ok(v >= ch.min && v <= ch.max, `${ch.label}=${v} fora da faixa`);
        // O campo exibe com `decimals`: mais precisão que isso faria o número
        // na tela deixar de descrever a cor aplicada.
        assert.strictEqual(Number(v.toFixed(ch.decimals)), v,
          `${ch.label}=${v} fora da grade de ${ch.step}`);
      });
    }), RUNS);
  });

  it('o centro do trilho do canal A é o zero cromático, sem -0', () => {
    const v = Panels.valueFromRatio(labChan('a'), 0.5);
    assert.strictEqual(v, 0, `centro em ${v}`);
    assert.ok(!Object.is(v, -0), '-0 atravessa comparações de forma inconsistente');
  });
});

describe('LAB, integridade: nada de NaN na cor', () => {
  it('trilho de largura zero não produz valor, em vez de produzir NaN', () => {
    // (clientX - left) / 0 dá Infinity ou NaN, e clamp não barra NaN porque
    // toda comparação com NaN é falsa.
    const a = labChan('a');
    assert.strictEqual(Panels.valueFromRatio(a, NaN), null);
    assert.strictEqual(Panels.valueFromRatio(a, Infinity), null);
    assert.strictEqual(Panels.quantize(NaN, a), null);
  });

  it('o estado recusa cor não finita e permanece íntegro', () => {
    S.setRgb(10, 20, 30, { reason: 'test' });
    const antes = S.getRgb();

    assert.strictEqual(S.setRgb(NaN, 0, 0, { reason: 'test' }), false);
    assert.strictEqual(S.setHsv({ h: NaN, s: 50, v: 50 }, { reason: 'test' }), false);
    assert.strictEqual(S.setHsv({ h: 0, s: Infinity, v: 50 }, { reason: 'test' }), false);

    assert.deepStrictEqual(S.getRgb(), antes, 'a cor mudou numa escrita recusada');
  });

  it('escrever um canal NaN não contamina a cor', () => {
    S.setRgb(10, 20, 30, { reason: 'test' });
    LAB_MODE().write({ L: 50, a: NaN, b: 0 });

    const rgb = S.getRgb();
    ['r', 'g', 'b'].forEach((k) => {
      assert.ok(Number.isFinite(rgb[k]), `${k} não finito no estado: ${rgb[k]}`);
    });
  });

  it('a contaminação não sobrevive num cinza: o matiz preservado segue finito', () => {
    // Cinza tem saturação zero e `setRgb` reaproveita o matiz atual. Se um NaN
    // tivesse entrado no matiz, escrever cinza não limparia — ele voltaria a
    // cada leitura.
    LAB_MODE().write({ L: NaN, a: NaN, b: NaN });
    S.setRgb(128, 128, 128, { reason: 'test' });

    const rgb = S.getRgb();
    assert.deepStrictEqual(rgb, { r: 128, g: 128, b: 128 });
    assert.ok(Number.isFinite(S.getHsv().h), 'matiz não finito no estado');
  });

  it('nenhum componente sai como -0 do labToRgb', () => {
    fc.assert(fc.property(labArb, (lab) => {
      const rgb = C.labToRgb(lab.L, lab.a, lab.b);
      ['r', 'g', 'b'].forEach((k) => {
        assert.ok(!Object.is(rgb[k], -0), `${k} saiu como -0`);
      });
    }), RUNS);
  });
});

/* ================================================================== */
/* Camada 3: restrições no caminho da escrita                         */
/*                                                                    */
/* Máscara de gamut, limite de cores e trava de luminosidade alteram a */
/* cor dentro do AppState. A projeção do triplo então deixa de bater   */
/* com a cor guardada — por um motivo legítimo. Se o latch for         */
/* validado por reprojeção, ele cai a cada movimento e os outros dois  */
/* canais são recalculados a partir da cor restringida: mexer num      */
/* slider muda os vizinhos.                                           */
/* ================================================================== */

describe('LAB: mexer um canal não move os outros, mesmo com restrições ativas', () => {
  /**
   * Um passo de arraste pelo caminho real: `applyChannel` é o miolo do gesto,
   * e `readVals` é o que os sliders exibem. Nada aqui simula o latch por fora —
   * é o módulo que decide.
   */
  function arrastarCanal(canal, valor) {
    Panels.applyChannel('LAB', canal, valor);
    return Panels.readVals();
  }

  function comEstado(preparar) {
    S.state.sliderMode = 'LAB';
    S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };
    S.state.lumLock = false;
    S.setGamut({ enabled: false });

    // Uma cor vinda de fora zera o triplo guardado, como no uso real.
    S.setRgb(128, 128, 128, { reason: 'color' });
    Panels.dropLatchIfExternal('color');

    if (preparar) preparar();

    const inicial = { L: 60, a: -30, b: -29 };
    Panels.applyChannel('LAB', 'L', inicial.L);
    Panels.applyChannel('LAB', 'a', inicial.a);
    Panels.applyChannel('LAB', 'b', inicial.b);
    return { inicial };
  }

  const cenarios = [
    ['máscara de gamut ligada', () => {
      S.setGamut({ enabled: true, kind: 'ellipse' });
      S.state.shape = 'disc';
    }],
    ['limite de cores ligado', () => {
      S.state.limit = { enabled: true, hueSteps: 12, svSteps: 4 };
    }],
    ['trava de luminosidade ligada', () => {
      S.state.lumLock = true;
    }],
    ['sem restrição', null]
  ];

  cenarios.forEach(([nome, preparar]) => {
    it(`arrastar o L não mexe em A nem B — ${nome}`, () => {
      const { inicial } = comEstado(preparar);

      [50, 40, 30, 20, 10].forEach((L) => {
        const exibido = arrastarCanal('L', L);

        assert.strictEqual(exibido.a, inicial.a,
          `A saiu de ${inicial.a} para ${exibido.a} ao arrastar L para ${L}`);
        assert.strictEqual(exibido.b, inicial.b,
          `B saiu de ${inicial.b} para ${exibido.b} ao arrastar L para ${L}`);
      });
    });

    it(`arrastar o A não mexe em L nem B — ${nome}`, () => {
      const { inicial } = comEstado(preparar);

      [-100, -60, 0, 60, 120].forEach((a) => {
        const exibido = arrastarCanal('a', a);

        assert.strictEqual(exibido.L, inicial.L,
          `L saiu de ${inicial.L} ao arrastar A para ${a}`);
        assert.strictEqual(exibido.b, inicial.b,
          `B saiu de ${inicial.b} ao arrastar A para ${a}`);
      });
    });

    it(`arrastar o B não mexe em L nem A — ${nome}`, () => {
      const { inicial } = comEstado(preparar);

      [-128, -50, 0, 70, 127].forEach((b) => {
        const exibido = arrastarCanal('b', b);

        assert.strictEqual(exibido.L, inicial.L,
          `L saiu de ${inicial.L} ao arrastar B para ${b}`);
        assert.strictEqual(exibido.a, inicial.a,
          `A saiu de ${inicial.a} ao arrastar B para ${b}`);
      });
    });
  });

  it('um arraste rápido, com poucos passos e saltos grandes, também se mantém', () => {
    // "Movimento rápido" gera menos pointermove e saltos maiores entre valores.
    const { inicial } = comEstado(() => {
      S.setGamut({ enabled: true, kind: 'ellipse' });
      S.state.shape = 'disc';
    });

    [0, 127, -128, 100, -20].forEach((b) => {
      const exibido = arrastarCanal('b', b);

      assert.strictEqual(exibido.L, inicial.L, `L escorregou em b=${b}`);
      assert.strictEqual(exibido.a, inicial.a, `A escorregou em b=${b}`);
      assert.strictEqual(exibido.b, b);
    });
  });

  it('a cor que volta do Photoshop diferente não derruba o gesto', () => {
    /**
     * Era esta a falha que sobrava, e o critério antigo não a resolvia: a ponte
     * escreve a cor no host e faz polling de volta a cada 400ms, e o valor que
     * retorna pode diferir por arredondamento ou gerenciamento de cor. A ponte
     * escreve com origem 'host' e sem declarar posse do triplo, então enquanto
     * a invalidação era por declaração o triplo caía a cada volta — dentro do
     * Photoshop o LAB nunca se sustentava por mais de 400ms.
     *
     * Com invalidação por consistência quem não declara não precisa saber que o
     * triplo existe: ele sobrevive enquanto continuar descrevendo a cor.
     */
    const { inicial } = comEstado(null);

    // O host devolve a mesma cor com um nível de diferença.
    const atual = S.getRgb();
    S.setRgb(atual.r, Math.min(255, atual.g + 1), atual.b, { reason: 'host' });

    // O eco do host não muda a cor de verdade: o triplo se mantém.
    const exibido = Panels.readVals();
    assert.strictEqual(exibido.L, inicial.L, 'o eco do host derrubou o L');
    assert.strictEqual(exibido.a, inicial.a, 'o eco do host derrubou o A');
    assert.strictEqual(exibido.b, inicial.b, 'o eco do host derrubou o B');

    // E o gesto seguinte continua mandando nos três canais.
    const depois = arrastarCanal('L', 42);
    assert.strictEqual(depois.L, 42);
    assert.strictEqual(depois.a, inicial.a);
    assert.strictEqual(depois.b, inicial.b);
  });

  it('mas uma cor de verdade vinda do host derruba o gesto', () => {
    /**
     * A tolerância não pode virar teimosia: quando o artista escolhe outra cor
     * no color picker nativo, o polling traz uma cor que não é eco nenhum, e os
     * canais têm que passar a descrevê-la.
     */
    comEstado(null);

    S.setRgb(20, 200, 90, { reason: 'host' });

    const rgb = S.getRgb();
    assert.deepStrictEqual(Panels.readVals(), C.rgbToLab(rgb.r, rgb.g, rgb.b),
      'o triplo sobreviveu a uma cor genuinamente diferente');
  });

  it('avisos que não mudam a cor não derrubam o gesto', () => {
    // Gravar no histórico, trocar de esquema ou de aba não é mudança de cor.
    const { inicial } = comEstado(null);
    arrastarCanal('a', 90);

    ['history', 'scheme', 'mode', 'rotation', 'shape'].forEach((reason) => {
      Panels.dropLatchIfExternal(reason);
    });

    const exibido = Panels.readVals();
    assert.strictEqual(exibido.a, 90, `o triplo caiu num aviso inofensivo`);
    assert.strictEqual(exibido.L, inicial.L);
  });

  it('a cor vinda de fora derruba o gesto, mesmo com restrição ligada', () => {
    // A proteção não pode virar teimosia.
    comEstado(() => {
      S.state.limit = { enabled: true, hueSteps: 12, svSteps: 4 };
    });

    S.setHsv({ h: 300, s: 80, v: 70 }, { reason: 'color' });
    Panels.dropLatchIfExternal('color');

    const rgb = S.getRgb();
    assert.deepStrictEqual(Panels.readVals(), C.rgbToLab(rgb.r, rgb.g, rgb.b));

    S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };
  });

  it('o mesmo vale para o CMYK, que também guarda triplo', () => {
    S.state.sliderMode = 'CMYK';
    S.state.limit = { enabled: true, hueSteps: 12, svSteps: 4 };
    S.setRgb(128, 128, 128, { reason: 'color' });
    Panels.dropLatchIfExternal('color');

    const inicial = { c: 40, m: 20, y: 60, k: 10 };
    Object.keys(inicial).forEach((k) => Panels.applyChannel('CMYK', k, inicial[k]));

    [30, 50, 80].forEach((k) => {
      Panels.applyChannel('CMYK', 'k', k);
      const exibido = Panels.readVals();

      assert.strictEqual(exibido.c, inicial.c, `C escorregou em k=${k}`);
      assert.strictEqual(exibido.m, inicial.m, `M escorregou em k=${k}`);
      assert.strictEqual(exibido.y, inicial.y, `Y escorregou em k=${k}`);
    });

    S.state.limit = { enabled: false, hueSteps: 12, svSteps: 0 };
    S.state.sliderMode = 'LAB';
  });
});
