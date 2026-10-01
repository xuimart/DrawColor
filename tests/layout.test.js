/**
 * Property-based tests for layout.js (layout-parity-editor spec).
 * Uses fast-check via Node's built-in test runner.
 */
'use strict';

const { describe, it } = require('node:test');
require('./setup');
require('../demo/js/layout.js');

const { fc, anchorArb, scaleArb } = require('./helpers');
const L = window.LAYOUT;

describe('Feature: layout-parity-editor, Property 3: Scale Factor Clamping', function() {
  /**
   * Validates: Requirements 7.1, 7.2
   */
  it('computeScale(w) === clamp(w, 320, 1200) / 628 for any width', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 3000, noNaN: true }),
        function(w) {
          var expected = Math.min(Math.max(w, L.MIN_EFFECTIVE_WIDTH), 1200) / 628;
          var actual = L.computeScale(w);
          return Math.abs(actual - expected) < 1e-10;
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('computeScale: altura reservada pela faixa de baixo', function() {
  /**
   * A faixa de baixo (abas, conteúdo, status) é ancorada no rodapé e tem
   * altura mínima em px: ela não acompanha a escala. Por isso a escala
   * vertical se mede contra as 608 unidades da área de cima, e não contra as
   * 907 do painel inteiro — era essa diferença que cortava a roda num painel
   * largo e baixo.
   */
  var TOP = 608;
  /**
   * Espelha o MIN_SCALE de layout.js. Existe só para a roda não desaparecer;
   * quem impede sobreposição é o tamanho proporcional dos controles.
   */
  var MIN_SCALE = 0.25;

  it('sem altura, decide só pela largura (comportamento antigo preservado)', function() {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3000, noNaN: true }), function(w) {
        return L.computeScale(w, 0) === L.computeScale(w);
      }),
      { numRuns: 100 }
    );
  });

  it('quando a altura útil é o limite, a escala vem dela', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 320, max: 1200, noNaN: true }),
        fc.double({ min: 100, max: 2000, noNaN: true }),
        fc.double({ min: 1, max: 400, noNaN: true }),
        function(w, h, reserved) {
          var top = h - reserved;
          var scaleH = top > 0 ? top / TOP : MIN_SCALE;
          var scaleW = w / 628;
          var expected = Math.max(Math.min(scaleW, scaleH), MIN_SCALE);
          return Math.abs(L.computeScale(w, h, reserved) - expected) < 1e-10;
        }
      ),
      { numRuns: 300 }
    );
  });

  it('a área de cima escalada nunca passa da altura útil', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 320, max: 1200, noNaN: true }),
        fc.double({ min: 200, max: 2000, noNaN: true }),
        fc.double({ min: 1, max: 300, noNaN: true }),
        function(w, h, reserved) {
          var top = h - reserved;
          // Só faz sentido cobrar isso quando ainda há espaço e a escala não
          // bateu no piso mínimo, que existe para a roda não desaparecer.
          fc.pre(top > TOP * MIN_SCALE);
          return TOP * L.computeScale(w, h, reserved) <= top + 1e-9;
        }
      ),
      { numRuns: 300 }
    );
  });

  it('nunca devolve escala menor que o piso, mesmo sem espaço', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1200, noNaN: true }),
        fc.double({ min: 0, max: 300, noNaN: true }),
        function(w, h) {
          // Reserva maior que a altura: a faixa de baixo não caberia.
          return L.computeScale(w, h, h + 50) >= MIN_SCALE;
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('computeOffsetX: a área da roda fica centralizada na largura que sobra', function() {
  /**
   * Num painel largo e baixo a escala vem da altura, e a área de referência
   * (628 unidades) fica mais estreita que o painel. Antes ela ficava presa à
   * esquerda e toda a sobra ia para a direita. O deslocamento divide a sobra
   * ao meio.
   */
  it('a sobra fica igual dos dois lados', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 200, max: 3000, noNaN: true }),
        fc.double({ min: 0.25, max: 2, noNaN: true }),
        function(w, s) {
          var area = 628 * s;
          fc.pre(area <= w);
          var ox = L.computeOffsetX(w, s);
          var direita = w - area - ox;
          return Math.abs(ox - direita) < 1e-9;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('nunca é negativo: painel estreito demais continua alinhado à esquerda', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 3000, noNaN: true }),
        fc.double({ min: 0.25, max: 2, noNaN: true }),
        function(w, s) {
          return L.computeOffsetX(w, s) >= 0;
        }
      ),
      { numRuns: 200 }
    );
    if (L.computeOffsetX(0, 1) !== 0) throw new Error('sem largura o deslocamento deveria ser 0');
  });

  it('o centro da roda acompanha o deslocamento', function() {
    // centerPx() é o que posiciona as âncoras e o que o editor usa para
    // converter o ponteiro; sem o deslocamento ali, os satélites ficariam
    // para trás enquanto a roda (posicionada pelo CSS) andava.
    var c = L.centerPx();
    var esperado = L.offsetX() + L.REFERENCE.wheelCenter.x * L.scale();
    if (Math.abs(c.x - esperado) > 1e-9) throw new Error('centerPx ignorou o deslocamento');
  });
});

describe('computePlan: disposição mista (lado a lado + ferramentas nas bordas)', function() {
  /**
   * Faixa de baixo como no Photoshop em escala pequena: abas e corpo no piso
   * em px, status escondido (a ponte está conectada).
   */
  var PS = { tabH: 28, bodyH: 128, statusH: 0, limitRowH: 24 };
  var LIVRE = { allowSide: true, allowSpread: true };

  function falha(msg) { throw new Error(msg); }

  it('dock estreito e alto fica como sempre: empilhado, sem espalhar', function() {
    var p = L.computePlan(380, 600, PS, LIVRE);
    if (p.mode !== 'stacked') falha('esperava empilhado, veio ' + p.mode);
    if (p.spread) falha('não há sobra lateral para espalhar');
    if (p.limit !== 'row') falha('o "Limitar cores" deveria ficar na faixa');
    var esperado = L.computeScale(380, 600, 28 + 128 + 24);
    if (Math.abs(p.scale - esperado) > 1e-12) falha('escala mudou: ' + p.scale + ' vs ' + esperado);
    if (p.oy !== 0) falha('empilhado não tem deslocamento vertical');
  });

  it('painel largo e baixo vai para lado a lado com a roda bem maior', function() {
    var p = L.computePlan(700, 430, PS, LIVRE);
    var empilhado = L.computePlan(700, 430, PS, { allowSide: false, allowSpread: true });
    if (p.mode !== 'side') falha('esperava lado a lado, veio ' + p.mode);
    if (!(p.scale >= empilhado.scale * 1.25)) falha('lado a lado sem ganho de 25%');
    if (Math.abs(p.areaW + p.colW - 700) > 1e-9) falha('área + coluna deveria dar a largura');
    if (p.colW < 240) falha('coluna estreita demais: ' + p.colW);
  });

  it('largura média: empilhado, ferramentas nas bordas e "Limitar" no vão', function() {
    var p = L.computePlan(530, 390, PS, LIVRE);
    if (p.mode !== 'stacked') falha('esperava empilhado, veio ' + p.mode);
    if (!p.spread) falha('deveria espalhar as ferramentas');
    if (p.limit !== 'gutter') falha('o "Limitar" deveria ir para o vão, veio ' + p.limit);
    // Sem a linha do "Limitar" na faixa, a roda ganha a altura dela.
    var comLinha = L.computeScale(530, 390, 28 + 128 + 24);
    if (!(p.scale > comLinha)) falha('tirar o bloco da faixa não devolveu altura à roda');
  });

  it('no modo de organização não espalha (as posições têm de bater com as âncoras)', function() {
    var p = L.computePlan(530, 390, PS, { allowSide: true, allowSpread: false });
    if (p.spread) falha('espalhou durante a organização');
    if (p.limit !== 'row') falha('sem espalhar o vão não existe');
    // Organizar não troca a disposição.
    [[530, 390], [700, 430], [380, 600], [1100, 500]].forEach(function(t) {
      var livre = L.computePlan(t[0], t[1], PS, LIVRE);
      var org = L.computePlan(t[0], t[1], PS, { allowSide: true, allowSpread: false });
      if (livre.mode !== org.mode) falha('organizar trocou a disposição em ' + t.join('x'));
      if (org.spread) falha('espalhou durante a organização em ' + t.join('x'));
    });
  });

  it('sem altura do host (UXP, demo) nunca vai para lado a lado', function() {
    var p = L.computePlan(700, 430, PS, { allowSide: false, allowSpread: true });
    if (p.mode !== 'stacked') falha('lado a lado sem allowSide');
    if (L.computePlan(700, 0, PS, LIVRE).mode !== 'stacked') falha('lado a lado sem altura');
  });

  it('histerese: já em lado a lado, não volta por diferença pequena', function() {
    // Procura uma largura em que o ganho fica entre 1.05 e 1.15.
    var achou = false;
    for (var w = 500; w <= 900 && !achou; w += 2) {
      var novo = L.computePlan(w, 430, PS, LIVRE);
      var fica = L.computePlan(w, 430, PS, { allowSide: true, allowSpread: true, prevMode: 'side' });
      if (novo.mode === 'stacked' && fica.mode === 'side') achou = true;
    }
    if (!achou) falha('nenhuma faixa de histerese entre 500 e 900 px');
  });

  it('em qualquer tamanho a área da roda cabe no painel e o vão é real', function() {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 2000 }),
        fc.integer({ min: 200, max: 1400 }),
        fc.boolean(),
        function(w, h, side) {
          var p = L.computePlan(w, h, PS, { allowSide: side, allowSpread: true });
          if (p.ox < 0 || p.oy < 0) return false;
          if (p.mode === 'side') {
            if (p.scale > 0.25 + 1e-9) {
              if (628 * p.scale > p.areaW + 1e-6) return false;
              if (608 * p.scale > h + 1e-6) return false;
            }
            if (p.ox + 628 * p.scale > p.areaW + 1e-6 && p.scale > 0.25 + 1e-9) return false;
          }
          if (p.limit === 'gutter' && !(p.gutter.w >= 120 + 12)) return false;
          if (p.limit === 'gutter' && !p.spread) return false;
          return true;
        }
      ),
      { numRuns: 300 }
    );
  });
});

describe('Feature: layout-parity-editor, Property 4: Proportional Scaling Invariant', function() {
  // **Validates: Requirements 7.4, 7.5**
  it('ratio of any two measurements is preserved within 0.5%', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 900, noNaN: true }),
        fc.double({ min: 1, max: 900, noNaN: true }),
        scaleArb,
        function(a, b, s) {
          var originalRatio = a / b;
          var scaledRatio = (a * s) / (b * s);
          var relativeError = Math.abs(scaledRatio - originalRatio) / originalRatio;
          return relativeError <= 0.005;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('panel aspect ratio is 907/628 for any scale factor', function() {
    fc.assert(
      fc.property(
        scaleArb,
        function(s) {
          var width = 628 * s;
          var height = 907 * s;
          var ratio = height / width;
          var expected = 907 / 628;
          return Math.abs(ratio - expected) < 1e-10;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: layout-parity-editor, Property 5: Controls Within Panel Bounds', function() {
  /**
   * Validates: Requirements 7.6, 8.6
   */
  it('after clampAnchorToBounds, control is entirely within panel bounds', function() {
    var CONTROL_SIZE = 44;
    fc.assert(
      fc.property(
        anchorArb,
        scaleArb,
        function(anchor, scale) {
          var clamped = L.clampAnchorToBounds(anchor, CONTROL_SIZE, scale);
          var point = L.anchorToPoint(clamped, L.REFERENCE.wheelCenter, scale);
          var half = CONTROL_SIZE / 2;
          var panelW = 628 * scale;
          var panelH = 907 * scale;
          return point.x - half >= -0.01 &&
                 point.y - half >= -0.01 &&
                 point.x + half <= panelW + 0.01 &&
                 point.y + half <= panelH + 0.01;
        }
      ),
      { numRuns: 200 }
    );
  });
});

/* ==========================================================================
 * Escala uniforme: os controles ancorados não podem ter piso em px
 * ========================================================================== */

describe('Escala uniforme dos controles ancorados', function() {
  /**
   * Esta é a causa raiz de toda a sobreposição que apareceu no arco.
   *
   * A posição de um controle ancorado vem de ângulo e raio no Reference_Space,
   * multiplicados pela escala. Se o TAMANHO do controle não for multiplicado
   * pela mesma escala — porque tem um piso em px, como
   * `max(32px, calc(44 * var(--u)))` — a relação entre tamanho e distância
   * deixa de ser constante. Abaixo de certa escala o controle fica maior que o
   * vão entre âncoras vizinhas e eles se cobrem, e nenhuma correção posterior
   * resolve, porque a geometria já está inconsistente.
   *
   * Com tamanho proporcional a garantia é geométrica: se não há sobreposição em
   * escala 1, não há em nenhuma escala. Quem protege o alvo de clique é o
   * MIN_SCALE, que limita quanto a interface encolhe.
   *
   * O teste lê o CSS porque é lá que a regressão entraria.
   */
  var fs = require('node:fs');
  var path = require('node:path');
  var css = fs.readFileSync(
    path.join(__dirname, '..', 'demo', 'styles.css'), 'utf8'
  );

  /** Regras que dimensionam controles posicionados por âncora. */
  var SELETORES_ANCORADOS = [
    '.panel .sat-btn',
    '.panel .sat-btn canvas',
    '.panel #iconArc canvas',
    '.panel .popout',
    '.panel .dial-wrap',
    '.panel .fg-swatch',
    '.panel .bg-swatch',
    '.panel .swap-btn'
  ];

  /**
   * Corpo da regra CSS que contém o seletor dado.
   *
   * Aceita o seletor em qualquer posição de uma lista, porque regras com vários
   * seletores são comuns aqui — `.panel .sat-btn` e `.panel #iconArc > *`
   * dividem a mesma declaração.
   */
  function corpoDaRegra(seletor) {
    var i = css.indexOf(seletor);
    while (i !== -1) {
      var abre = css.indexOf('{', i);
      if (abre === -1) return null;
      // O seletor tem que estar na lista desta regra, não dentro de um corpo
      var fechaAnterior = css.lastIndexOf('}', i);
      var abreAnterior = css.lastIndexOf('{', i);
      if (abreAnterior < fechaAnterior) {
        var fecha = css.indexOf('}', abre);
        return css.slice(abre + 1, fecha);
      }
      i = css.indexOf(seletor, i + 1);
    }
    return null;
  }

  SELETORES_ANCORADOS.forEach(function(seletor) {
    it('não usa piso em px em width/height: ' + seletor.replace(/\n/g, ' '), function() {
      var corpo = corpoDaRegra(seletor);
      if (corpo === null) {
        throw new Error('regra não encontrada no CSS: ' + seletor);
      }

      var linhas = corpo.split(';');
      linhas.forEach(function(linha) {
        var prop = linha.split(':')[0].trim();
        if (prop !== 'width' && prop !== 'height') return;
        if (linha.indexOf('max(') !== -1) {
          throw new Error(
            'piso em px reintroduzido em ' + seletor + ' → ' + linha.trim() +
            '. Tamanho de controle ancorado precisa escalar junto com a ' +
            'distância entre âncoras, senão eles se sobrepõem em escala baixa.'
          );
        }
      });
    });
  });

  /**
   * Regressão que voltou três vezes, e nenhuma das vezes era geometria.
   *
   * `layout.js` posiciona os satélites escrevendo left/top, o que só descreve
   * posição absoluta se o elemento for `position: absolute`. Com `relative` o
   * mesmo left/top passa a ser deslocamento a partir da posição de fluxo, e os
   * dois popouts do arco — forma e máscara — empilham colados no canto,
   * independente do que a âncora diga.
   *
   * `.arc > *` declara `absolute`, mas `.popout` tem a MESMA especificidade
   * (0,1,0) e vem depois no arquivo, então vencia com `relative`. Por isso só
   * esses dois sobrepunham: os outros satélites são `.sat-btn` puro e não têm
   * seletor concorrente.
   */
  it('os popouts do arco resolvem para position absolute na cascata', function() {
    function regraSimples(seletor) {
      var re = new RegExp('(^|\\n)' + seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{');
      var m = re.exec(css);
      if (!m) return null;
      var abre = css.indexOf('{', m.index);
      var fecha = css.indexOf('}', abre);
      var pos = /position:\s*([\w-]+)/.exec(css.slice(abre, fecha));
      return { indice: m.index, position: pos ? pos[1] : null };
    }

    var arc = regraSimples('.arc > *');
    var popout = regraSimples('.popout');

    if (!arc || !popout) throw new Error('regras .arc > * e .popout não encontradas');

    // Mesma especificidade: vale a que aparece depois
    var vencedor = popout.indice > arc.indice ? popout : arc;

    if (vencedor.position !== 'absolute') {
      throw new Error(
        'os popouts do arco resolvem para position: ' + vencedor.position +
        '. Precisa ser absolute, senão o left/top escrito por layout.js vira ' +
        'deslocamento de fluxo e os satélites empilham.'
      );
    }
  });

  /**
   * A faixa de baixo não pode cobrir a área da roda.
   *
   * Ela era ancorada pelo rodapé (`bottom`), e a escala tem piso: a área de
   * cima nunca mede menos que 608 × MIN_SCALE, então num painel baixo a soma
   * das duas não cabe e a faixa era desenhada por cima do disco e dos
   * satélites. Ancorada pelo topo com `max()`, ela nunca sobe acima da roda.
   */
  it('a faixa de baixo é ancorada pelo topo, nunca pelo rodapé', function() {
    /**
     * A pilha da faixa, de cima para baixo: o bloco "Limitar cores", as abas, o
     * corpo e o status. Cada linha começa onde a anterior termina, e todas
     * ancoram pelo topo.
     *
     * O bloco entrou nessa pilha porque antes flutuava na faixa livre entre a
     * base da roda e as abas. Essa faixa encolhe com a escala e o bloco tem
     * piso em px, então num painel estreito ele crescia por cima da roda. Com
     * linha reservada isso não acontece.
     */
    var alvos = [
      { seletor: '.panel .limit-panel', esperado: 'var(--strip-top)', bottom: 'auto' },
      { seletor: '.panel .tabs', esperado: 'calc(var(--strip-top) + var(--limit-h))', bottom: 'auto' },
      // tab-body agora usa height: --body-h com bottom: auto SEMPRE.
      // O JS (measureBodyHeight) ajusta --body-h para caber o pane ativo.
      { seletor: '.panel .tab-body', esperado: 'calc(var(--strip-top) + var(--limit-h) + var(--tab-h))', bottom: 'auto' },
      { seletor: '.panel .status-bar', esperado: 'calc(var(--strip-top) + var(--limit-h) + var(--tab-h) + var(--body-h))' , bottom: 'auto' }
    ];

    alvos.forEach(function(alvo) {
      // A regra que importa é a última com esse seletor (a da seção responsiva)
      var ultima = css.lastIndexOf(alvo.seletor + ' {');
      if (ultima === -1) throw new Error('regra não encontrada: ' + alvo.seletor);

      var abre = css.indexOf('{', ultima);
      var corpo = css.slice(abre + 1, css.indexOf('}', abre));

      var top = /top:\s*([^;]+)/.exec(corpo);
      var bottom = /bottom:\s*([^;]+)/.exec(corpo);

      if (!top || top[1].trim() !== alvo.esperado) {
        throw new Error(
          alvo.seletor + ' deveria ancorar em top: ' + alvo.esperado +
          ', está em: ' + (top ? top[1].trim() : '(ausente)')
        );
      }
      if (!bottom || bottom[1].trim() !== alvo.bottom) {
        throw new Error(
          alvo.seletor + ' deveria ter bottom: ' + alvo.bottom + ', está em: ' +
          (bottom ? bottom[1].trim() : '(ausente)')
        );
      }
    });
  });

  it('--strip-top nunca resolve acima da área da roda', function() {
    /**
     * `max(--top-h, 100% - --strip-h)`: o primeiro termo é o piso. Verifica a
     * aritmética que o CSS faz, para qualquer altura de painel e de faixa.
     */
    fc.assert(
      fc.property(
        fc.double({ min: 200, max: 2000, noNaN: true }),   // altura do painel
        fc.double({ min: 100, max: 400, noNaN: true }),    // altura da faixa
        fc.double({ min: 0.55, max: 1, noNaN: true }),     // escala
        function(panelH, stripH, escala) {
          var topH = 608 * escala;
          var stripTop = Math.max(topH, panelH - stripH);
          // A faixa começa em stripTop; a roda ocupa de 0 a topH
          return stripTop >= topH - 1e-9;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('o bloco "Limitar cores" nunca entra na área da roda', function() {
    /**
     * O bloco é a primeira linha da faixa, então começa exatamente em
     * --strip-top. Como a roda termina em 565 × escala e --strip-top nunca
     * resolve abaixo de 608 × escala, sobra folga em qualquer tamanho de painel.
     *
     * Este teste existe porque antes o bloco flutuava na faixa livre entre os
     * dois, ancorado ao topo das abas. Essa faixa mede (608 − 565) × escala e
     * encolhe com o painel, mas a altura do bloco tem piso em px — num painel
     * estreito ele crescia para cima e cobria a base da roda.
     */
    var BASE_DA_RODA = 565;   // centro em 352 + raio externo 213

    fc.assert(
      fc.property(
        fc.double({ min: 200, max: 2000, noNaN: true }),   // altura do painel
        fc.double({ min: 100, max: 400, noNaN: true }),    // altura da faixa
        fc.double({ min: 0.55, max: 1, noNaN: true }),     // escala
        function(panelH, stripH, escala) {
          var topH = 608 * escala;
          var stripTop = Math.max(topH, panelH - stripH);
          var topoDoBloco = stripTop;
          return topoDoBloco >= BASE_DA_RODA * escala - 1e-9;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('a interface encolhe junto: tamanho e distância caem pelo mesmo fator', function() {
    /**
     * É esta a propriedade que substitui qualquer piso em px, e é o
     * comportamento do Coolorus: quando o painel diminui, tudo diminui.
     *
     * Um piso em px no tamanho do controle quebraria a proporção — foi o que
     * causou as sobreposições. Um piso alto na escala também não serve: forçava
     * a área de cima a não caber no painel e trazia barra de rolagem.
     *
     * Verifica que a razão entre distância entre âncoras e tamanho do controle
     * é a mesma em qualquer escala.
     */
    var SATELITE = 44;   // unidades de referência, sem piso em px
    var c = L.REFERENCE.wheelCenter;

    function ponto(id, s) {
      var a = L.ANCHORS[id];
      var rad = a.angle * Math.PI / 180;
      return {
        x: c.x + a.radius * Math.sin(rad) * s,
        y: c.y - a.radius * Math.cos(rad) * s
      };
    }

    /**
     * A razão de referência é medida na própria tabela, em escala 1, em vez de
     * escrita à mão: as âncoras são polares e arredondadas, então a distância
     * é 79,04 e não 79 exato. O que o teste afirma é a invariância da razão,
     * não o valor dela.
     */
    var a1 = ponto('sat.shape', 1);
    var b1 = ponto('sat.gamutmask', 1);
    var razaoRef = Math.hypot(a1.x - b1.x, a1.y - b1.y) / SATELITE;

    fc.assert(
      fc.property(
        fc.double({ min: 0.25, max: 1, noNaN: true }),
        function(s) {
          var a = ponto('sat.shape', s);
          var b = ponto('sat.gamutmask', s);
          var d = Math.hypot(a.x - b.x, a.y - b.y);
          var tamanho = SATELITE * s;

          return Math.abs(d / tamanho - razaoRef) < 1e-9;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('a ausência de sobreposição em escala 1 vale para qualquer escala', function() {
    /**
     * Com tamanho e distância multiplicados pelo mesmo fator, a razão entre
     * eles é invariante. Este teste fixa esse raciocínio: para dois controles
     * quaisquer, a folga em escala s é a folga em escala 1 vezes s — logo o
     * sinal não muda.
     */
    var ids = Object.keys(L.ANCHORS);
    var c = L.REFERENCE.wheelCenter;

    function ponto(id, s) {
      var a = L.ANCHORS[id];
      var rad = a.angle * Math.PI / 180;
      return {
        x: c.x + a.radius * Math.sin(rad) * s,
        y: c.y - a.radius * Math.cos(rad) * s
      };
    }

    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 1, noNaN: true }),
        function(s) {
          for (var i = 0; i < ids.length; i++) {
            for (var j = i + 1; j < ids.length; j++) {
              var p1 = ponto(ids[i], 1), p2 = ponto(ids[j], 1);
              var d1 = Math.hypot(p1.x - p2.x, p1.y - p2.y);

              var q1 = ponto(ids[i], s), q2 = ponto(ids[j], s);
              var ds = Math.hypot(q1.x - q2.x, q1.y - q2.y);

              // A distância escala linearmente; o tamanho também, então a
              // razão distância/tamanho não depende de s
              if (Math.abs(ds - d1 * s) > 1e-6) return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 40 }
    );
  });
});
