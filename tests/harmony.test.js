/**
 * Esquemas de harmonia e ferramentas da máscara de gamut.
 *
 * O teste central aqui é estrutural: cada esquema precisa ter um lugar no arco.
 * `main.js` monta os botões na ordem da lista e usa o índice para escolher a
 * âncora (`harmony.` + (i+1)). Um esquema além do número de âncoras gera um
 * botão sem posição, encalhado no canto do painel — foi o que quase aconteceu
 * ao acrescentar o análogo acentuado.
 *
 * O segundo grupo cobre a máscara: as ferramentas saíram do arco porque não
 * cabiam nele, e ganharam um botão de restaurar.
 */
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

let S;
let L;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

before(() => {
  load('color.js');
  load('state.js');
  load('layout.js');
  // wheel.js e panels.js só tocam no DOM dentro de init(); carregar é seguro e
  // dá acesso à geometria dos marcadores e à escrita dos canais.
  load('wheel.js');
  load('panels.js');
  S = window.AppState;
  L = window.LAYOUT;
});

describe('Harmonia: cada esquema tem lugar no arco', () => {
  it('há uma âncora harmony.N para cada esquema da lista', () => {
    S.HARMONY_SCHEMES.forEach((scheme, i) => {
      const id = 'harmony.' + (i + 1);
      assert.ok(
        L.ANCHORS[id],
        `o esquema "${scheme.label}" cairia em ${id}, que não existe: ` +
        'o botão ficaria sem posição'
      );
    });
  });

  it('o número de esquemas não passa o de âncoras do arco', () => {
    const slots = Object.keys(L.ANCHORS).filter((id) => id.startsWith('harmony.')).length;
    assert.ok(
      S.HARMONY_SCHEMES.length <= slots,
      `${S.HARMONY_SCHEMES.length} esquemas para ${slots} lugares`
    );
  });

  it('as máscaras também couberam nas mesmas âncoras', () => {
    // main.js reaproveita o arco de harmonias para os formatos de máscara.
    const slots = Object.keys(L.ANCHORS).filter((id) => id.startsWith('harmony.')).length;
    assert.ok(S.MASK_KINDS.length <= slots);
  });
});

describe('Harmonia: o conjunto da referência', () => {
  const byId = () => {
    const map = {};
    S.HARMONY_SCHEMES.forEach((s) => { map[s.id] = s; });
    return map;
  };

  it('inclui mono, complementar, análogo, análogo acentuado, triádico e tetrádico', () => {
    const map = byId();
    ['none', 'comp', 'analog', 'accent', 'triad', 'tetra'].forEach((id) => {
      assert.ok(map[id], `esquema ausente: ${id}`);
    });
  });

  it('mono não tem marcadores secundários', () => {
    assert.deepStrictEqual(byId().none.offsets, []);
  });

  it('o análogo acentuado é o análogo mais o complementar', () => {
    const map = byId();
    const esperado = map.analog.offsets.concat(map.comp.offsets);
    assert.deepStrictEqual(map.accent.offsets, esperado);
  });

  it('todo offset está na faixa de -180 a 360 e não repete o principal', () => {
    S.HARMONY_SCHEMES.forEach((scheme) => {
      const vistos = new Set();
      scheme.offsets.forEach((off) => {
        assert.ok(off >= -180 && off <= 360, `${scheme.id}: offset fora de faixa ${off}`);
        const norm = ((off % 360) + 360) % 360;
        assert.notStrictEqual(norm, 0, `${scheme.id}: offset coincide com o matiz principal`);
        assert.ok(!vistos.has(norm), `${scheme.id}: offset repetido ${off}`);
        vistos.add(norm);
      });
    });
  });

  it('setScheme aceita todos os ids da lista e rejeita desconhecido', () => {
    S.HARMONY_SCHEMES.forEach((scheme) => {
      S.setScheme(scheme.id);
      assert.strictEqual(S.state.scheme, scheme.id);
    });

    S.setScheme('accent');
    S.setScheme('inexistente');
    assert.strictEqual(S.state.scheme, 'accent', 'um id inválido trocou o esquema');
  });

  it('os matizes derivados acompanham o esquema e o matiz atual', () => {
    S.setHsv({ h: 100, s: 50, v: 50 });
    S.setScheme('accent');

    const hues = S.getHarmonyHues();
    assert.deepStrictEqual(hues, [130, 70, 280]);
  });
});

describe('Máscara de gamut: ferramentas fora do arco', () => {
  it('editar e travar não ocupam mais âncoras adjacentes', () => {
    // Elas estavam em 98.2° e 91.0°, no mesmo raio dos botões de 44 unidades,
    // e se sobrepunham. Agora vivem num popout ancorado no botão da máscara.
    assert.strictEqual(typeof L.ADJACENT, 'object', 'ADJACENT deixou de ser exportado');
    assert.ok(!L.ADJACENT['#gamutEditBtn'],
      'gamutEditBtn voltou para o arco, onde não cabe');
    assert.ok(!L.ADJACENT['#gamutLockBtn'],
      'gamutLockBtn voltou para o arco, onde não cabe');
  });

  it('as ferramentas da máscara não teriam onde caber no arco', () => {
    /**
     * O arco não é uma fila com espaço sobrando: cada botão de harmonia ocupa
     * 44 unidades e os vizinhos mais próximos ficam a pouco mais que isso. Três
     * botões de 34 a mais precisariam de 102 unidades de folga contígua em
     * algum vão — e o menor vão entre controles vizinhos não chega perto disso.
     *
     * Vale para qualquer arranjo, e é por isso que a medida é tirada da tabela
     * e não escrita à mão: a organização mudou depois deste teste nascer.
     */
    const ids = Object.keys(L.ANCHORS);
    let menorVao = Infinity;

    ids.forEach((a) => {
      ids.forEach((b) => {
        if (a >= b) return;
        const pa = ponto(a), pb = ponto(b);
        menorVao = Math.min(menorVao, Math.hypot(pa.x - pb.x, pa.y - pb.y));
      });
    });

    assert.ok(menorVao < 3 * 34,
      `há um vão de ${menorVao.toFixed(1)} unidades; talvez caibam as ferramentas`);
  });
});

describe('Máscara de gamut: restaurar', () => {
  it('resetGamut recentraliza e devolve o tamanho padrão do formato', () => {
    S.setGamut({ enabled: true, kind: 'ellipse' });
    S.setGamut({ cx: 0.3, cy: -0.2, angle: 45 });

    assert.notStrictEqual(S.state.gamut.cx, 0);

    S.resetGamut();

    assert.strictEqual(S.state.gamut.cx, 0);
    assert.strictEqual(S.state.gamut.cy, 0);
    assert.strictEqual(S.state.gamut.angle, 0);
  });

  it('restaura para cada formato de máscara', () => {
    S.MASK_KINDS.forEach((kind) => {
      S.setGamut({ enabled: true, kind });
      S.setGamut({ cx: 0.2, cy: 0.2, angle: 30 });
      S.resetGamut();

      const g = S.state.gamut;
      assert.strictEqual(g.cx, 0, `cx não voltou em ${kind}`);
      assert.strictEqual(g.cy, 0, `cy não voltou em ${kind}`);
      assert.strictEqual(g.angle, 0, `angle não voltou em ${kind}`);
      assert.ok(g.rx > 0 && g.ry > 0, `tamanho inválido em ${kind}`);
    });
  });
});

describe('Harmonia: abrir e fechar o esquema mantendo a composição', () => {
  function comEsquema(id) {
    S.resetHarmony();
    S.setScheme(id);
    S.resetHarmony();
    return S.getHarmonyOffsets();
  }

  it('o análogo continua simétrico ao ser aberto por um braço', () => {
    const antes = comEsquema('analog');            // [30, -30]
    assert.deepStrictEqual(antes, [30, -30]);

    S.spreadHarmony(0, 60);

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], 60);
    assert.strictEqual(depois[1], -60, 'o outro braço não acompanhou');
  });

  it('fechar também é uniforme', () => {
    comEsquema('analog');
    S.spreadHarmony(0, 20);
    assert.deepStrictEqual(S.getHarmonyOffsets(), [20, -20]);
  });

  it('fechar demais para no mínimo, sem os marcadores se cobrirem', () => {
    // O mínimo vem da geometria dos marcadores: abaixo dele dois círculos se
    // sobrepõem na pista e um deles fica impossível de pegar.
    comEsquema('analog');
    S.spreadHarmony(0, 1);

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], S.MIN_HARMONY_GAP);
    assert.strictEqual(depois[1], -S.MIN_HARMONY_GAP);

    const entreBracos = Math.abs(depois[0] - depois[1]);
    assert.ok(entreBracos >= S.MIN_HARMONY_GAP,
      `braços a ${entreBracos}° um do outro: eles se cobrem`);
  });

  it('a proporção entre braços desiguais é preservada', () => {
    comEsquema('tetra');                            // [90, 180, 270]
    S.spreadHarmony(0, 45);                         // fator 0,5

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], 45);
    // 180 é o eixo complementar: fica parado.
    assert.strictEqual(depois[1], 180);
    // 270 é o espelho de 90: vai para o espelho do novo ângulo, não para
    // 270 × 0,5 = 135, que desmancharia a simetria do quadrado.
    assert.strictEqual(depois[2], -45);
  });

  it('o eixo complementar não abre junto', () => {
    comEsquema('accent');                           // [30, -30, 180]
    S.spreadHarmony(0, 45);

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], 45);
    assert.strictEqual(depois[1], -45);
    assert.strictEqual(depois[2], 180, 'o complementar girou e desfez o acento');
  });

  it('arrastar o próprio complementar cai no ajuste individual', () => {
    comEsquema('accent');
    S.spreadHarmony(2, 170);

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[2], 170);
    assert.strictEqual(depois[0], 30, 'os análogos se mexeram sem motivo');
    assert.strictEqual(depois[1], -30);
  });

  it('o ajuste individual continua disponível', () => {
    comEsquema('analog');
    S.setHarmonyOffset(0, 80);

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], 80);
    assert.strictEqual(depois[1], -30, 'o ajuste individual mexeu no outro braço');
  });

  it('nenhum braço colide com o matiz principal', () => {
    comEsquema('analog');
    S.spreadHarmony(0, 0);

    S.getHarmonyOffsets().forEach((off) => {
      assert.ok(Math.abs(off) >= S.MIN_HARMONY_GAP, `braço colado no principal: ${off}`);
    });
  });

  it('índice fora da faixa não altera nada', () => {
    const antes = comEsquema('analog');
    S.spreadHarmony(9, 60);
    assert.deepStrictEqual(S.getHarmonyOffsets(), antes);
  });

  it('girar o matiz principal move o conjunto inteiro junto', () => {
    comEsquema('triad');                            // [120, -120]
    S.setHsv({ h: 0, s: 50, v: 50 });
    const partida = S.getHarmonyHues();

    S.setHsv({ h: 40, s: 50, v: 50 });
    const chegada = S.getHarmonyHues();

    chegada.forEach((hue, i) => {
      const esperado = (partida[i] + 40) % 360;
      assert.ok(Math.abs(hue - esperado) < 1e-9,
        `o braço ${i} não acompanhou a rotação: ${hue} vs ${esperado}`);
    });
  });

  it('restaurar devolve os ângulos canônicos depois de abrir', () => {
    comEsquema('analog');
    S.spreadHarmony(0, 75);
    assert.ok(S.isHarmonyEdited());

    S.resetHarmony();
    assert.deepStrictEqual(S.getHarmonyOffsets(), [30, -30]);
    assert.ok(!S.isHarmonyEdited());
  });
});

/**
 * Forma de cada controle no espaço de referência, vinda do CSS.
 *
 * Quase todos são discos e basta o diâmetro. O campo hex é a exceção: uma
 * caixa larga e baixa.
 *
 * As medidas são em unidades de referência, sem piso em px, porque é assim que
 * o CSS as escreve. Essa é a propriedade que garante a ausência de
 * sobreposição em qualquer escala: tamanho e distância escalam pelo mesmo
 * fator, então verificar em escala 1 basta.
 */
const FORMAS = {
  'harmony.1': { d: 44 }, 'harmony.2': { d: 44 }, 'harmony.3': { d: 44 },
  'harmony.4': { d: 44 }, 'harmony.5': { d: 44 }, 'harmony.6': { d: 44 },
  'history.redo': { d: 44 }, 'history.undo': { d: 44 },
  'rail.dial.temperature': { d: 44 }, 'rail.dial.brightness': { d: 44 },
  'rail.lumlock': { d: 44 }, 'rail.valuecheck': { d: 44 },
  'swatch.fg': { d: 92 }, 'swatch.bg': { d: 72 }, 'swatch.swap': { d: 26 },
  'sat.gamutmask': { d: 44 }, 'sat.shape': { d: 44 },
  'hex.field': { w: 100, h: 36 }
};

/** Meia largura e meia altura da caixa que envolve o controle. */
function meias(id) {
  const f = FORMAS[id];
  return f.d ? { x: f.d / 2, y: f.d / 2 } : { x: f.w / 2, y: f.h / 2 };
}

/**
 * Folga entre dois controles. Positiva significa separados.
 *
 * Discos comparam por distância entre centros; onde há caixa a conta é por
 * eixo, que é o que descreve um retângulo. Usar distância entre centros para
 * caixas superestimaria a folga nas diagonais.
 */
function folga(a, b) {
  const pa = ponto(a), pb = ponto(b);
  const fa = FORMAS[a], fb = FORMAS[b];

  if (fa.d && fb.d) {
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) - (fa.d + fb.d) / 2;
  }

  const ma = meias(a), mb = meias(b);
  const vaoX = Math.abs(pa.x - pb.x) - (ma.x + mb.x);
  const vaoY = Math.abs(pa.y - pb.y) - (ma.y + mb.y);
  // Dois retângulos estão separados quando se afastam em pelo menos um eixo
  return Math.max(vaoX, vaoY);
}

/** Ponto de uma âncora no espaço de referência (escala 1). */
function ponto(id) {
  const a = L.ANCHORS[id];
  const c = L.REFERENCE.wheelCenter;
  const rad = a.angle * Math.PI / 180;
  return {
    x: c.x + a.radius * Math.sin(rad),
    y: c.y - a.radius * Math.cos(rad)
  };
}

describe('Layout: geometria da organização, seja ela qual for', () => {
  it('nenhum par de controles se sobrepõe, exceto os swatches', () => {
    /**
     * foreground e background se sobrepõem por desenho: um sobre o outro, como
     * no Photoshop. Todo o resto precisa ficar separado, senão os cliques
     * disputam a mesma área — foi o que aconteceu com as ferramentas da
     * máscara antes de virarem popout, e com máscara e forma antes de virarem
     * uma pilha só.
     */
    const ids = Object.keys(FORMAS);

    ids.forEach((a) => {
      ids.forEach((b) => {
        if (a >= b) return;
        if (a === 'swatch.bg' && b === 'swatch.fg') return;
        if (a === 'swatch.fg' && b === 'swatch.bg') return;

        assert.ok(folga(a, b) >= 0,
          `${a} e ${b} se sobrepõem: folga de ${folga(a, b).toFixed(1)} unidades`);
      });
    });
  });

  it('todo controle cabe dentro do painel', () => {
    const { width, height } = L.REFERENCE;

    Object.keys(FORMAS).forEach((id) => {
      const p = ponto(id), m = meias(id);
      assert.ok(p.x - m.x >= 0 && p.x + m.x <= width,
        `${id} passa da borda lateral: centro em x=${p.x.toFixed(0)}`);
      assert.ok(p.y - m.y >= 0 && p.y + m.y <= height,
        `${id} passa da borda vertical: centro em y=${p.y.toFixed(0)}`);
    });
  });

  it('nenhum controle invade a faixa das abas para baixo', () => {
    // A faixa de baixo é ancorada no rodapé por código: um controle da roda
    // ali seria coberto por ela.
    Object.keys(FORMAS).forEach((id) => {
      const p = ponto(id), m = meias(id);
      assert.ok(p.y + m.y <= 612,
        `${id} entra na faixa das abas (y ${(p.y + m.y).toFixed(0)})`);
    });
  });

  it('não encosta em nenhum outro controle', () => {
    /**
     * O problema original era o hex compartilhar setor com os botões de forma e
     * máscara, com o popout da máscara abrindo em cima dele. A regra que
     * sobrevive a qualquer reorganização é esta: nenhum controle encosta no
     * campo. O tamanho de cada um vem do CSS.
     */
    Object.keys(FORMAS).forEach((id) => {
      if (id === 'hex.field') return;
      assert.ok(folga(id, 'hex.field') > 0,
        `hex encosta em ${id}: folga de ${folga(id, 'hex.field').toFixed(1)}`);
    });
  });

  it('cabe dentro do painel', () => {
    const h = ponto('hex.field');
    // O "#" fica 16 unidades à esquerda do campo.
    assert.ok(h.x - 100 / 2 - 16 > 0, 'o hex passa da borda esquerda');
    assert.ok(h.x + 100 / 2 < L.REFERENCE.width, 'o hex passa da borda direita');
    assert.ok(h.y - 36 / 2 > 0, 'o hex passa da borda de cima');
  });
});

describe('Harmonia: marcadores nunca se cobrem na pista', () => {
  /**
   * Dois marcadores no mesmo ponto da pista deixam um deles inalcançável: o
   * clique acerta sempre o mesmo, e arrastar move o esquema todo — os dois
   * seguem colados e o esquema parece travado.
   *
   * A separação mínima é geométrica: na pista (raio ~188) um secundário tem 16
   * de raio mais 2 de borda, então 36 unidades de arco, cerca de 11°.
   */
  function separacoes() {
    const offsets = S.getHarmonyOffsets();
    const pares = [];
    // Contra o matiz principal, que está no offset zero.
    offsets.forEach((off) => pares.push(Math.abs(S.normalizeOffset(off))));
    // E entre si.
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        let d = Math.abs(offsets[i] - offsets[j]) % 360;
        if (d > 180) d = 360 - d;
        pares.push(d);
      }
    }
    return pares;
  }

  function conferir(contexto) {
    separacoes().forEach((d) => {
      assert.ok(d >= S.MIN_HARMONY_GAP - 1e-9,
        `${contexto}: dois marcadores a ${d.toFixed(1)}°, mínimo ${S.MIN_HARMONY_GAP}`);
    });
  }

  it('os esquemas canônicos já nascem separados', () => {
    S.HARMONY_SCHEMES.forEach((scheme) => {
      S.setScheme(scheme.id);
      S.resetHarmony();
      conferir(`esquema ${scheme.id}`);
    });
  });

  it('fechar o esquema até o limite mantém a separação', () => {
    ['analog', 'accent', 'triad', 'tetra'].forEach((id) => {
      S.setScheme(id);
      S.resetHarmony();

      [40, 20, 10, 5, 1, 0].forEach((alvo) => {
        S.spreadHarmony(0, alvo);
        conferir(`${id} fechado em ${alvo}`);
      });
    });
  });

  it('o ajuste individual também não deixa um braço colar no outro', () => {
    S.setScheme('accent');
    S.resetHarmony();

    // Tenta empurrar o primeiro braço para cima do segundo.
    const offsets = S.getHarmonyOffsets();
    S.setHarmonyOffset(0, offsets[1]);
    conferir('ajuste individual sobre o vizinho');

    // E o braço movido fica onde foi pedido; quem cede é o vizinho.
    assert.strictEqual(S.getHarmonyOffsets()[0], S.normalizeOffset(offsets[1]));
  });

  it('varrer um braço por toda a volta nunca gera coincidência', () => {
    S.setScheme('tetra');
    S.resetHarmony();

    for (let deg = -180; deg <= 180; deg += 7) {
      S.setHarmonyOffset(0, deg);
      conferir(`braço em ${deg}°`);
    }
  });
});

describe('Harmonia: o mínimo vem da geometria dos marcadores', () => {
  /**
   * Este teste existe porque baixar MIN_HARMONY_GAP passava sem ninguém notar:
   * os outros testes comparam contra o próprio valor da constante, então
   * acompanham qualquer mudança. Aqui a exigência é derivada do tamanho real
   * dos marcadores e do raio da pista, que é o que decide se dois círculos se
   * cobrem na tela.
   */
  const SEC_R = 16, SEC_BORDA = 2;
  const MAIN_R = 19, MAIN_BORDA = 3;

  function grausPara(distanciaEmUnidades, raioDaPista) {
    return (distanciaEmUnidades / raioDaPista) * 180 / Math.PI;
  }

  it('a separação declarada cobre secundário contra secundário e contra o principal', () => {
    const W = window.Wheel;
    assert.ok(W && W.geometry, 'wheel.js não expôs a geometria');

    const pista = W.geometry.MARKER_TRACK_R;
    assert.ok(pista > 0, 'raio da pista inválido');

    const entreSecundarios = grausPara(2 * (SEC_R + SEC_BORDA / 2), pista);
    const contraPrincipal = grausPara(
      (SEC_R + SEC_BORDA / 2) + (MAIN_R + MAIN_BORDA / 2),
      pista
    );
    const exigido = Math.max(entreSecundarios, contraPrincipal);

    assert.ok(
      S.MIN_HARMONY_GAP >= exigido,
      `MIN_HARMONY_GAP é ${S.MIN_HARMONY_GAP}° mas a geometria pede ` +
      `${exigido.toFixed(1)}° (pista de raio ${pista.toFixed(1)}, ` +
      `secundário ${SEC_R}+${SEC_BORDA}, principal ${MAIN_R}+${MAIN_BORDA})`
    );
  });
});

describe('Harmonia: a escrita dos sliders não se derruba', () => {
  it('a origem usada pela escrita do LAB não está entre as externas', () => {
    /**
     * A fiação que faltava fixar. O triplo editado é descartado quando chega
     * uma mudança de cor de origem externa; se a própria escrita do slider
     * usasse uma dessas origens, ela se derrubaria e os canais vizinhos
     * voltariam a ser recalculados a cada movimento — o sintoma relatado.
     */
    const Panels = window.Panels;
    const origens = [];

    S.subscribe((_st, reason) => origens.push(reason));

    S.state.sliderMode = 'LAB';
    Panels.applyChannel('LAB', 'a', -40);
    Panels.applyChannel('LAB', 'L', 55);

    assert.ok(origens.length > 0, 'a escrita não avisou ninguém');

    origens.forEach((reason) => {
      assert.ok(
        Panels.ORIGENS_EXTERNAS.indexOf(reason) === -1,
        `a escrita do slider avisou com origem "${reason}", que derruba o ` +
        'próprio triplo — os canais vizinhos vão escorregar'
      );
    });
  });

  it('o mesmo para o CMYK', () => {
    const Panels = window.Panels;
    const origens = [];

    S.subscribe((_st, reason) => origens.push(reason));

    S.state.sliderMode = 'CMYK';
    Panels.applyChannel('CMYK', 'k', 40);

    origens.forEach((reason) => {
      assert.ok(Panels.ORIGENS_EXTERNAS.indexOf(reason) === -1,
        `origem "${reason}" derruba o próprio triplo`);
    });

    S.state.sliderMode = 'LAB';
  });
});
