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

  it('o tetrádico abre e fecha mantendo os dois eixos opostos', () => {
    comEsquema('tetra');                            // [90, 180, 270] — φ = 90
    assert.deepStrictEqual(S.getHarmonyOffsets(), [90, 180, 270]);

    S.spreadHarmony(0, 45);                         // fecha o eixo móvel para 45°

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], 45, 'o eixo móvel não acompanhou o arraste');
    assert.strictEqual(depois[1], 180, 'o eixo fixo se mexeu');
    assert.strictEqual(depois[2], 225, 'o par do eixo móvel deixou de ser oposto');

    // A invariante do esquema: cada eixo é um par de complementares.
    assert.strictEqual(depois[2] - depois[0], 180, 'eixo móvel não está oposto');
  });

  it('o eixo fixo do tetrádico não abre: arrastá-lo não muda φ', () => {
    comEsquema('tetra');
    S.spreadHarmony(1, 120);                        // índice 1 é o complementar do principal

    assert.deepStrictEqual(S.getHarmonyOffsets(), [90, 180, 270],
      'mexer no eixo fixo alterou a abertura');
  });

  /**
   * A amplitude de giro do eixo móvel do tetrádico é de 90°, não de 180°.
   *
   * O eixo móvel nasce perpendicular ao fixo (φ=90, o quadrado) e fecha até a
   * folga mínima. O que ele não pode é ATRAVESSAR o eixo fixo e aparecer do
   * outro lado — foi o defeito relatado, e vinha de uma decisão minha de abrir
   * a faixa até 150° por um argumento geométrico que não corresponde ao
   * comportamento da referência.
   */
  it('o eixo móvel do tetrádico gira no máximo 90°, sem atravessar o fixo', () => {
    assert.strictEqual(S.TETRA_PHI_MAX, 90, 'o teto do tetrádico saiu de 90°');

    comEsquema('tetra');

    // Fechar em direção ao eixo fixo funciona até a folga mínima.
    [75, 45, 20, S.TETRA_PHI_MIN].forEach((alvo) => {
      S.setHarmonyOffset(0, alvo);
      assert.strictEqual(S.getPhi('tetra'), alvo, `fechar em ${alvo}° não pegou`);
    });

    // Nenhum arraste consegue pôr φ fora da faixa — nem passando de 90, nem
    // atravessando o eixo fixo pelo outro lado.
    for (let cursor = -360; cursor <= 720; cursor += 3) {
      S.setHarmonyOffset(0, cursor);
      const phi = S.getPhi('tetra');
      assert.ok(phi >= S.TETRA_PHI_MIN - 1e-9 && phi <= S.TETRA_PHI_MAX + 1e-9,
        `cursor em ${cursor}° levou φ para ${phi}°, fora de [${S.TETRA_PHI_MIN}, ${S.TETRA_PHI_MAX}]`);

      // E os dois eixos seguem sendo pares opostos, sempre.
      const off = S.getHarmonyOffsets();
      assert.strictEqual(off[1], 180, 'o eixo fixo se mexeu');
      assert.strictEqual(off[2] - off[0], 180, 'o eixo móvel deixou de ser oposto');
    }
  });

  it('passar do perpendicular trava em 90, sem pular para o outro extremo', () => {
    comEsquema('tetra');

    // Logo depois de 90 a borda mais próxima é o próprio 90.
    [95, 110, 130].forEach((cursor) => {
      S.setHarmonyOffset(0, cursor);
      assert.strictEqual(S.getPhi('tetra'), 90,
        `cursor em ${cursor}° deveria encostar em 90°`);
    });

    // Já perto do eixo fixo pelo outro lado, a borda próxima é o mínimo.
    [165, 175].forEach((cursor) => {
      S.setHarmonyOffset(0, cursor);
      assert.strictEqual(S.getPhi('tetra'), S.TETRA_PHI_MIN,
        `cursor em ${cursor}° deveria encostar no mínimo`);
    });
  });

  it('o eixo complementar não abre junto', () => {
    comEsquema('accent');                           // [30, -30, 180]
    S.spreadHarmony(0, 45);

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], 45);
    assert.strictEqual(depois[1], -45);
    assert.strictEqual(depois[2], 180, 'o complementar girou e desfez o acento');
  });

  /**
   * O defeito relatado no análogo acentuado.
   *
   * O braço de 180° É o acento: é ele que dá nome ao esquema. Antes ele podia
   * ser arrastado como um braço qualquer, e arrastá-lo para 120° punha o quarto
   * marcador no magenta em vez do complementar — quatro matizes sem relação
   * entre si, e o esquema deixava de ser um análogo acentuado.
   *
   * Agora esse estado não é representável: a forma vem de φ, e o 180 é
   * estrutural. Arrastar aquele marcador na roda gira o conjunto (ver wheel.js),
   * o que é o gesto útil ali.
   */
  it('o complementar do acentuado é estrutural e não se move', () => {
    comEsquema('accent');

    [120, 90, 250, 0, -60].forEach((alvo) => {
      S.spreadHarmony(2, alvo);
      const depois = S.getHarmonyOffsets();
      assert.strictEqual(depois[2], 180,
        `arrastar o acento para ${alvo}° tirou o complementar dos 180°`);
      assert.strictEqual(depois[0], 30, 'os análogos se mexeram sem motivo');
      assert.strictEqual(depois[1], -30);
    });
  });

  /**
   * Não existe ajuste individual nos esquemas ajustáveis, e isso é a definição
   * deles: mover um braço sozinho desmancharia a relação que dá nome ao
   * esquema. Qualquer pedido sobre um braço de abertura vira ajuste de φ, e a
   * simetria se mantém.
   */
  it('mexer um braço do análogo ajusta a abertura, mantendo a simetria', () => {
    comEsquema('analog');
    S.setHarmonyOffset(0, 45);

    const depois = S.getHarmonyOffsets();
    assert.strictEqual(depois[0], 45);
    assert.strictEqual(depois[1], -45, 'o análogo deixou de ser simétrico');
  });

  it('o espelho também ajusta a abertura, pelo módulo do ângulo', () => {
    comEsquema('analog');
    S.setHarmonyOffset(1, -50);

    assert.deepStrictEqual(S.getHarmonyOffsets(), [50, -50]);
  });

  /**
   * O teto da abertura é a LINHA RETA: braços a ±90° do principal, 180° entre
   * eles. Passando disso a figura se dobraria para trás, com os braços
   * voltando a se aproximar pelo outro lado.
   */
  it('os braços do análogo abrem até formar uma linha reta', () => {
    assert.strictEqual(S.MAX_ANALOG_SPREAD, 90,
      'o teto deixou de ser a linha reta');

    comEsquema('analog');
    S.setHarmonyOffset(0, 90);

    const off = S.getHarmonyOffsets();
    assert.deepStrictEqual(off, [90, -90]);
    assert.strictEqual(Math.abs(off[0] - off[1]), 180,
      'os braços não chegaram aos 180° de abertura');
  });

  it('no acentuado, a abertura máxima distribui os quatro marcadores por igual', () => {
    comEsquema('accent');
    S.setHarmonyOffset(0, 90);

    assert.deepStrictEqual(S.getHarmonyOffsets(), [90, -90, 180]);

    // Principal em 0 mais os três braços: 0, 90, 180, 270.
    S.setActiveMarker(null);
    S.setHsv({ h: 0, s: 100, v: 100 });
    const todos = [S.getRefHue()].concat(S.getHarmonyHues())
      .map((h) => Math.round(((h % 360) + 360) % 360))
      .sort((a, b) => a - b);
    assert.deepStrictEqual(todos, [0, 90, 180, 270]);
  });

  /**
   * Só ângulos que de fato passam do máximo. Um cursor em 300°, por exemplo,
   * equivale a −60°: é o braço posicionado 60° no lado espelho, uma abertura
   * legítima, e não uma tentativa de passar do limite.
   */
  it('arrastar além do máximo encosta na linha reta, sem dobrar', () => {
    comEsquema('accent');

    [120, 160, 200].forEach((cursor) => {
      S.setHarmonyOffset(0, cursor);
      const off = S.getHarmonyOffsets();
      assert.strictEqual(off[0], 90, `cursor em ${cursor}° passou do máximo`);
      assert.strictEqual(off[1], -90, 'a simetria se perdeu no limite');
      assert.strictEqual(off[2], 180, 'o acento saiu dos 180°');
    });
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

  it('fechar a abertura ao máximo não deixa um braço colar no outro', () => {
    S.setScheme('accent');
    S.resetHarmony();

    // Tenta colapsar a abertura até zero; o mínimo de φ tem de segurar.
    [10, 5, 1, 0, -5].forEach((alvo) => {
      S.setHarmonyOffset(0, alvo);
      conferir(`abertura pedida em ${alvo}`);
    });

    const depois = S.getHarmonyOffsets();
    assert.ok(Math.abs(depois[0]) >= S.MIN_HARMONY_GAP,
      'a abertura passou do mínimo geométrico');
    assert.strictEqual(depois[0], -depois[1], 'a simetria se perdeu ao fechar');
    assert.strictEqual(depois[2], 180, 'o acento saiu dos 180° ao fechar');
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

/**
 * A âncora da constelação (refHue).
 *
 * Este grupo existe por causa de um defeito que voltou duas vezes: clicar num
 * marcador secundário girava o esquema inteiro, e o clique seguinte girava de
 * novo — um ciclo que destruía a composição sem o usuário arrastar nada.
 *
 * A causa era o marcador principal SER a cor. Adotar um secundário o promovia a
 * principal, e todos os outros se recolocavam em torno dele. As tentativas
 * anteriores compensaram caso a caso, por simetria do esquema, e por isso
 * funcionaram no complementar, no triádico e no tetrádico mas continuaram
 * quebradas no análogo e no acentuado.
 *
 * A correção separa a ÂNCORA (de onde os offsets partem) da COR (o que está
 * sendo editado). Os testes abaixo cobrem a invariante que sustenta isso, em
 * todos os esquemas e não só nos simétricos.
 */
describe('Harmonia: a âncora separa a constelação da cor', () => {
  const TODOS = ['comp', 'analog', 'accent', 'triad', 'tetra'];

  /** O conjunto de matizes na roda, normalizado para comparação. */
  function constelacao() {
    return [S.getRefHue()].concat(S.getHarmonyHues())
      .map((h) => Math.round(((h % 360) + 360) % 360))
      .sort((a, b) => a - b)
      .join(',');
  }

  /**
   * Isola o estado antes de cada cenário.
   *
   * A máscara de gamut precisa ficar desligada de propósito: os grupos de teste
   * anteriores deste arquivo a deixam ativa, e `applyGamutMask` recorta o matiz
   * sempre que está habilitada. Um matiz recortado faria estes testes falharem
   * por um motivo que nada tem a ver com a âncora.
   */
  function preparar(id, matiz) {
    S.setGamut({ enabled: false });
    S.setLimit({ enabled: false });
    S.setLuminosityLock(false);
    S.setActiveMarker(null);
    S.setHsv({ h: matiz, s: 100, v: 100 });
    S.setScheme(id);
    S.resetHarmony();
  }

  it('clicar num secundário não move a constelação, em nenhum esquema', () => {
    TODOS.forEach((id) => {
      preparar(id, 30);
      const antes = constelacao();

      S.getHarmonyHues().forEach((_, i) => {
        S.adoptHarmonyMarker(i);
        assert.strictEqual(constelacao(), antes,
          `${id}: adotar o secundário ${i} moveu a figura (${antes} → ${constelacao()})`);
      });
    });
  });

  /**
   * O sintoma exato relatado: "eu nem arrasto, só clico e ele se movimenta
   * sozinho, nesse ciclo infinito". Cliques repetidos precisam ser inertes.
   */
  it('cliques repetidos não acumulam rotação', () => {
    TODOS.forEach((id) => {
      preparar(id, 30);
      const antes = constelacao();

      for (let volta = 0; volta < 12; volta++) {
        S.adoptHarmonyMarker(volta % S.getHarmonyHues().length);
      }

      assert.strictEqual(constelacao(), antes,
        `${id}: 12 cliques giraram a figura`);
    });
  });

  it('clicar num secundário adota a cor dele', () => {
    preparar('accent', 30);
    const hues = S.getHarmonyHues();

    hues.forEach((hue, i) => {
      S.adoptHarmonyMarker(i);
      assert.ok(Math.abs(S.getHsv().h - hue) < 1e-9,
        `a cor não virou o matiz do secundário ${i}`);
      assert.strictEqual(S.state.activeSecondary, i, 'o marcador ativo não acompanhou');
    });
  });

  it('mudar a cor gira o conjunto inteiro, preservando os ângulos relativos', () => {
    TODOS.forEach((id) => {
      preparar(id, 30);

      const relativos = (base, hues) => hues
        .map((h) => Math.round((((h - base) % 360) + 360) % 360))
        .join(',');

      const antes = relativos(S.getRefHue(), S.getHarmonyHues());

      S.setHsv({ h: 200, s: 100, v: 100 });

      const depois = relativos(S.getRefHue(), S.getHarmonyHues());
      assert.strictEqual(depois, antes,
        `${id}: girar deformou o esquema (${antes} → ${depois})`);
    });
  });

  /**
   * A regra que substituiu a tentativa anterior, e a razão da troca.
   *
   * Antes a âncora era deduzida da cor ("âncora = matiz menos offset do
   * ativo"), o que fazia a constelação girar junto para manter o marcador ativo
   * sob a cor. Parecia elegante, mas transformava TODA escrita de cor numa
   * rotação — inclusive as que o usuário não pede, vindas da sincronização
   * entre painéis, da leitura de volta do Photoshop e do histórico.
   *
   * Agora a âncora é autoritativa: com um secundário ativo, escrever cor não
   * move nada. Quem gira o esquema é só o gesto de girar.
   */
  it('com um secundário ativo, escrever cor não move a constelação', () => {
    preparar('analog', 30);
    S.adoptHarmonyMarker(0);
    const antes = constelacao();

    S.setHsv({ h: 250, s: 100, v: 100 });

    assert.strictEqual(constelacao(), antes,
      'a cor arrastou a constelação — a âncora voltou a ser derivada da cor');
  });

  it('trocar para um esquema com menos braços solta o marcador ativo', () => {
    preparar('tetra', 30);
    S.adoptHarmonyMarker(2);
    assert.strictEqual(S.state.activeSecondary, 2);

    // Complementar tem um secundário só: o índice 2 deixa de existir.
    S.setScheme('comp');
    assert.strictEqual(S.state.activeSecondary, null,
      'um índice inexistente ficou ativo e a âncora sairia do lugar');
  });

  it('índice inválido não troca o marcador ativo nem move nada', () => {
    preparar('triad', 30);
    const antes = constelacao();

    S.setActiveMarker(99);
    S.adoptHarmonyMarker(99);
    S.adoptHarmonyMarker(-1);

    assert.strictEqual(S.state.activeSecondary, null);
    assert.strictEqual(constelacao(), antes);
  });

  /**
   * Este é o teste que faltava, e é o motivo de o defeito ter sobrevivido a
   * três correções: nenhum caminho que ESCREVE COR de fora era exercitado.
   *
   * No Photoshop real três deles disparam sozinhos, sem o usuário pedir:
   *
   *   - `panel-sync.js` transmite {h,s,v} entre os dois painéis do CEP;
   *   - `ps-bridge.js` lê a cor de volta do Photoshop, com arredondamento da
   *     ida e volta RGB, o que muda o matiz em um grau ou dois;
   *   - o histórico restaura {h,s,v}.
   *
   * Enquanto a âncora era derivada da cor, cada um deles virava uma rotação
   * disfarçada — e é isso que o usuário via como "clico e os outros pulam, num
   * ciclo infinito". A âncora precisa ignorar essas escritas quando um
   * secundário está ativo.
   */
  it('escrever cor de fora não move a constelação com um secundário ativo', () => {
    TODOS.forEach((id) => {
      preparar(id, 30);
      S.adoptHarmonyMarker(0);
      const antes = constelacao();

      // panel-sync: o par reenvia a mesma cor com origem própria.
      const cor = S.getHsv();
      S.setHsv({ h: cor.h, s: cor.s, v: cor.v }, { reason: 'peer', relock: true });
      assert.strictEqual(constelacao(), antes, `${id}: panel-sync girou o esquema`);

      // ps-bridge: a cor volta do Photoshop com um desvio de arredondamento.
      const rgb = S.getRgb();
      S.setRgb(rgb.r + 1, rgb.g, rgb.b, { reason: 'host' });
      assert.strictEqual(constelacao(), antes, `${id}: a ponte do Photoshop girou o esquema`);
    });
  });

  it('girar move a âncora e preserva os ângulos relativos', () => {
    const relativos = () => {
      const base = S.getRefHue();
      return S.getHarmonyHues()
        .map((h) => Math.round((((h - base) % 360) + 360) % 360))
        .join(',');
    };

    TODOS.forEach((id) => {
      preparar(id, 30);
      const forma = relativos();

      // O gesto de girar: âncora explícita, marcador principal ativo.
      S.setActiveMarker(null);
      S.setRefHue(200);
      S.setHsv({ h: 200, s: 100, v: 100 });

      assert.strictEqual(Math.round(S.getRefHue()), 200, `${id}: a âncora não girou`);
      assert.strictEqual(relativos(), forma, `${id}: girar deformou o esquema`);
    });
  });

  it('arrastar um secundário em forma fixa põe ele sob o cursor sem deformar', () => {
    preparar('triad', 0);
    const forma = S.getHarmonyOffsets().slice();

    S.setActiveMarker(0);
    S.rotateSetTo(90, 0);

    assert.ok(Math.abs(S.getHarmonyHues()[0] - 90) < 1e-9,
      'o marcador agarrado não ficou no ângulo pedido');
    assert.deepStrictEqual(S.getHarmonyOffsets(), forma,
      'a forma do triádico mudou ao ser girada');
  });

  it('trocar de esquema reancora na cor atual e volta ao principal', () => {
    preparar('analog', 30);
    S.adoptHarmonyMarker(1);

    S.setHsv({ h: 270, s: 100, v: 100 });
    S.setScheme('tetra');

    assert.strictEqual(S.state.activeSecondary, null, 'o ativo não voltou ao principal');
    assert.ok(Math.abs(S.getRefHue() - S.getHsv().h) < 1e-9,
      'o esquema novo não nasceu em volta da cor atual');
  });
});
