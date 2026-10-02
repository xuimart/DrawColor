/**
 * css-compat.js — Compatibilidade do CSS com o CEF antigo do Photoshop.
 *
 * Photoshop 22.x (2021) roda o CEP 10, cujo motor é o Chromium 74. Esse
 * Chromium não tem duas coisas que o styles.css usa:
 *
 *   - max()/min()/clamp() (chegaram no Chromium 79). O CSS usa max() para dar
 *     piso em px às medidas que escalam com --u. No Chromium 74 cada
 *     declaração com max() fica inválida na hora do cálculo: alturas caem
 *     para auto, paddings para 0 e --strip-top deixa de existir. A faixa de
 *     baixo (abas, sliders, linha MODE) sobe para o topo, toda amontoada.
 *
 *   - `gap` em flexbox (Chromium 84). Sem ele abas, sliders, botões de modo
 *     e o bloco "Limitar cores" ficam grudados.
 *
 * Só nos motores que não têm esses recursos, este módulo:
 *
 *   1. Reescreve o texto das folhas de estilo trocando cada
 *        max(Apx, calc(B * var(--u)))         por calc(B * var(--dc-uf-N))
 *        max(Apx, calc(B * var(--u) ± Cpx))   por calc(B * var(--dc-uf-N) ± Cpx)
 *      onde --dc-uf-N vale max(t, escala) px, com t = (A ∓ C) / B.
 *      Como B · max(t, u) ± C = max(A, B·u ± C), o valor final é idêntico.
 *
 *      Nas bordas, calc(B * var(--u)) ganha piso de 1px pelo mesmo caminho:
 *      o Chromium atual já arredonda borda fina para 1px, o 74 não.
 *
 *   2. Troca --strip-top, que depende de 100% e não cabe nesse molde, por
 *      --dc-strip-top: max(--top-h, altura do painel − --strip-h), medido aqui.
 *
 *   3. Mantém essas variáveis em dia quando a escala ou o painel mudam
 *      (layout.js chama sync() logo depois de escrever --scale).
 *
 *   4. Troca o gap dos contêineres flex por margem nos filhos (ver "gap em
 *      flexbox" mais abaixo).
 *
 * Em motores com max() e gap (CEP 11+, navegadores atuais) e no UXP não faz
 * nada: o CSS original vale como está.
 *
 * Para conferência: ?dc-compat=force liga tudo num motor moderno (a
 * renderização tem que sair igual à nativa), ?dc-compat=cssom força o passo
 * do max() pelo CSSOM e ?dc-compat=off desliga.
 */
(function () {
  'use strict';

  var NUM = '(-?(?:\\d+\\.?\\d*|\\.\\d+))';
  var RE_MAX_U = new RegExp(
    'max\\(\\s*' + NUM + 'px\\s*,\\s*calc\\(\\s*' + NUM +
    '\\s*\\*\\s*var\\(--u\\)\\s*(?:([+-])\\s*' + NUM + 'px\\s*)?\\)\\s*\\)',
    'g'
  );
  var RE_STRIP_TOP = /max\(\s*var\(--top-h\)\s*,\s*calc\(\s*100%\s*-\s*var\(--strip-h\)\s*\)\s*\)/g;
  // Declarações de borda/contorno e, dentro delas, as larguras em unidades.
  var RE_BORDER_DECL = /((?:^|[;{\s])(?:border(?:-top|-right|-bottom|-left)?(?:-width)?|outline(?:-width)?)\s*:\s*)([^;{}]*)/g;
  var RE_CALC_U = new RegExp('calc\\(\\s*' + NUM + '\\s*\\*\\s*var\\(--u\\)\\s*\\)', 'g');
  var RE_COMMENT = /\/\*[\s\S]*?\*\//g;
  // max( / min( / clamp( que sobraram; o [^a-z-] deixa minmax() de fora.
  var RE_LEFTOVER = /(^|[^a-z-])(max|min|clamp)\(/gi;

  /* ================================================================== */
  /* Transformação do max() (pura)                                      */
  /* ================================================================== */

  function newThresholds() {
    return { list: [], index: {} };
  }

  function thresholdIndex(th, t) {
    var key = t.toFixed(6);
    var i = th.index[key];
    if (i === undefined) {
      i = th.list.length;
      th.list.push(t);
      th.index[key] = i;
    }
    return i;
  }

  /**
   * Reescreve um texto de CSS. `th` acumula os limiares entre chamadas, para
   * que várias folhas compartilhem as mesmas variáveis.
   */
  function transform(cssText, th) {
    var out = String(cssText).replace(RE_MAX_U, function (m, a, b, sign, c) {
      var A = parseFloat(a);
      var B = parseFloat(b);
      var C = c ? parseFloat(c) : 0;
      if (sign === '-') C = -C;
      if (!(B > 0) || !isFinite(A) || !isFinite(C)) return m;

      var i = thresholdIndex(th, (A - C) / B);
      var expr = B + ' * var(--dc-uf-' + i + ')';
      if (C > 0) expr += ' + ' + C + 'px';
      else if (C < 0) expr += ' - ' + (-C) + 'px';
      return 'calc(' + expr + ')';
    });

    // Borda fina: o Chromium atual arredonda para 1px qualquer largura de
    // borda entre 0 e 1px; o 74 guarda o valor (0,25px num painel pequeno) e
    // a borda some. Mesmo truque do max(): B · max(1/B, u) = max(1px, B·u).
    out = out.replace(RE_BORDER_DECL, function (m, head, value) {
      return head + value.replace(RE_CALC_U, function (mm, b) {
        var B = parseFloat(b);
        if (!(B > 0)) return mm;
        return 'calc(' + B + ' * var(--dc-uf-' + thresholdIndex(th, 1 / B) + '))';
      });
    });

    return out.replace(RE_STRIP_TOP, 'var(--dc-strip-top, var(--top-h))');
  }

  /** Quantos max()/min()/clamp() ficaram sem tradução (fora de comentários). */
  function countLeftovers(cssText) {
    var m = String(cssText).replace(RE_COMMENT, '').match(RE_LEFTOVER);
    return m ? m.length : 0;
  }

  /* ================================================================== */
  /* Leitura das folhas                                                 */
  /* ================================================================== */

  /** file:///E:/a%20b/x.css → E:/a b/x.css ; file:///Users/x.css → /Users/x.css */
  function fileUrlToPath(href) {
    var m = /^file:\/\/(?:localhost)?(\/[^?#]*)/i.exec(String(href || ''));
    if (!m) return null;
    var p = decodeURIComponent(m[1]);
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
    return p;
  }

  var textCache = {};

  function readText(href) {
    if (Object.prototype.hasOwnProperty.call(textCache, href)) return textCache[href];
    var text = null;

    // 1) Node: no painel CEP (--enable-nodejs) é o caminho garantido, porque o
    //    CEF não lê arquivo local por XHR sem --allow-file-access-from-files.
    try {
      var req = (typeof window.require === 'function' && window.require) ||
        (window.cep_node && typeof window.cep_node.require === 'function' && window.cep_node.require);
      var p = req && fileUrlToPath(href);
      if (p) text = String(req('fs').readFileSync(p, 'utf8'));
    } catch (e) { text = null; }

    // 2) XHR síncrono: navegador e CEF com acesso a arquivo local.
    if (text == null) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', href, false);
        xhr.send(null);
        if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) text = xhr.responseText;
      } catch (e) { /* sem leitura */ }
    }

    textCache[href] = text;
    return text;
  }

  /* ================================================================== */
  /* Estado                                                             */
  /* ================================================================== */

  var th = newThresholds();
  var active = false;
  var reason = '';
  var replaced = [];
  var failed = [];
  var leftovers = 0;
  var varsStyle = null;
  var probe = null;
  var lastScale = null;
  var lastStrip = null;
  var syncing = false;

  function queryMode() {
    try {
      var m = /[?&]dc-compat=([a-z]+)/i.exec(window.location.search || '');
      return m ? m[1].toLowerCase() : '';
    } catch (e) {
      return '';
    }
  }

  function supportsMax() {
    try {
      return !!(window.CSS && window.CSS.supports && window.CSS.supports('width', 'max(1px, 2px)'));
    } catch (e) {
      return false;
    }
  }

  function headEl() {
    return document.head || document.documentElement;
  }

  function logError(where, e) {
    if (window.console && console.error) console.error('[DrawColor] css-compat ' + where + ':', e);
  }

  /* ================================================================== */
  /* Passo do max(): folhas                                             */
  /* ================================================================== */

  /** Caminho alternativo: reescreve regra a regra pelo CSSOM, na mesma posição. */
  function applyCssom(sheet) {
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return false; }
    if (!rules) return false;

    (function walk(list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.style && /max\(|var\(--u\)/.test(r.style.cssText)) {
          var before = r.style.cssText;
          var after = transform(before, th);
          if (after !== before) r.style.cssText = after;
          leftovers += countLeftovers(r.style.cssText);
        }
        if (r.cssRules) walk(r.cssRules);
      }
    })(rules);
    return true;
  }

  function applyToSheets(mode) {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var name = link.getAttribute('href') || '';
      var text = mode === 'cssom' ? null : readText(link.href);

      if (text == null) {
        if (link.sheet && applyCssom(link.sheet)) replaced.push(name + ' (cssom)');
        else failed.push(name);
        continue;
      }

      var out = transform(text, th);
      leftovers += countLeftovers(out);
      if (out === text) continue;

      // A cópia entra logo depois do <link> original, que é desligado: a ordem
      // da cascata entre as folhas continua a mesma.
      var style = document.createElement('style');
      style.setAttribute('data-dc-compat', name);
      style.textContent = out;
      link.parentNode.insertBefore(style, link.nextSibling);
      link.disabled = true;
      if (link.sheet) link.sheet.disabled = true;
      replaced.push(name);
    }
  }

  /* ================================================================== */
  /* Passo do max(): variáveis                                          */
  /* ================================================================== */

  function fmt(n) {
    return String(Math.round(n * 1e6) / 1e6);
  }

  function ufDecls(scale) {
    var s = '';
    for (var i = 0; i < th.list.length; i++) {
      s += '--dc-uf-' + i + ':' + fmt(Math.max(th.list[i], scale)) + 'px;';
    }
    return s;
  }

  function writeVars() {
    if (!varsStyle) {
      varsStyle = document.createElement('style');
      varsStyle.id = 'dc-compat-vars';
      headEl().appendChild(varsStyle);
    }
    // Mesma regra do --u no styles.css: fora do #panel a escala é 1.
    var css = ':root,.panel{' + ufDecls(1) + '}' +
      '#panel{' + ufDecls(lastScale || 1) +
      (lastStrip != null ? '--dc-strip-top:' + fmt(lastStrip) + 'px;' : '') + '}';
    if (varsStyle.textContent !== css) varsStyle.textContent = css;
  }

  /** max(--top-h, 100% − --strip-h), medido dentro do próprio #panel. */
  function measureStripTop(el) {
    if (!probe) {
      probe = document.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;left:0;top:0;width:0;margin:0;padding:0;' +
        'border:0;visibility:hidden;pointer-events:none;';
    }
    el.appendChild(probe);
    probe.style.height = 'var(--top-h)';
    var topH = probe.getBoundingClientRect().height;
    probe.style.height = 'calc(100% - var(--strip-h))';
    var rest = probe.getBoundingClientRect().height;
    el.removeChild(probe);
    return Math.max(topH, rest);
  }

  /** Chamado depois de cada escrita de --scale e em mudanças do #panel. */
  function sync() {
    if (!active || syncing) return;
    var el = document.getElementById('panel');
    if (!el) return;
    syncing = true;
    try {
      var scale = parseFloat(el.style.getPropertyValue('--scale'));
      if (!(scale > 0)) scale = 1;
      if (scale !== lastScale) {
        lastScale = scale;
        writeVars();
      }
      var st = measureStripTop(el);
      if (lastStrip == null || Math.abs(st - lastStrip) > 0.01) {
        lastStrip = st;
        writeVars();
      }
    } catch (e) {
      logError('sync', e);
    } finally {
      syncing = false;
    }
  }

  /* ================================================================== */
  /* gap em flexbox                                                     */
  /* ================================================================== */

  /**
   * Só onde o flexbox ignora `gap`, ele vira margem:
   *
   *   - candidatos: os seletores que declaram gap no CSS; de cada contêiner
   *     valem o gap e a direção computados pelo próprio motor (já com os pisos
   *     do max() traduzidos);
   *   - cada filho em fluxo, menos o primeiro, recebe no lado de entrada a
   *     margem que já tinha (lida com estas regras desligadas) MAIS o gap. O
   *     espaço entre dois filhos fica igual ao do gap nativo;
   *   - filho cuja margem desse lado é `auto` na cascata fica como está: é o
   *     que empurra o ⤢ das abas e os botões ☀/◐ da linha MODE à direita;
   *   - em linha que quebra, quem abre linha nova perde a margem lateral e
   *     todos das linhas seguintes ganham o row-gap por cima.
   */
  var gapActive = false;
  var gapForce = false;
  var gapSel = [];
  var gapSelAll = '';
  var marginDecls = [];
  var gapStyle = null;
  var gapPending = 0;
  var gapCss = '';
  var gapStats = { containers: 0, items: 0, runs: 0 };
  var autoCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  var gridCenterSel = [];
  var buttonGridFixed = false;

  /**
   * Antes do Chromium 83, <button> não vira contêiner grid: o
   * `place-items: center` dos botões redondos não centraliza o ícone (canvas
   * ou svg em display:block), que encosta à esquerda. A altura já sai certa,
   * porque o próprio botão centraliza o conteúdo na vertical.
   */
  function buttonGridWorks() {
    try {
      var b = document.createElement('button');
      b.style.cssText = 'display:grid;justify-items:center;position:absolute;visibility:hidden;' +
        'left:0;top:0;width:40px;height:20px;padding:0;border:0;margin:0;';
      var s = document.createElement('span');
      s.style.cssText = 'display:block;width:10px;height:10px;margin:0;';
      b.appendChild(s);
      document.body.appendChild(b);
      var ok = Math.abs(s.getBoundingClientRect().left - b.getBoundingClientRect().left - 15) < 1.5;
      b.parentNode.removeChild(b);
      return ok;
    } catch (e) {
      return true;
    }
  }

  /** Margem automática nas laterais centraliza o ícone como o grid faria. */
  function buttonGridCss() {
    var sels = [];
    gridCenterSel.forEach(function (s) {
      sels.push(s + ' > canvas', s + ' > svg', s + ' > img');
    });
    // !important: regras como `.panel .sat-btn canvas` têm especificidade
    // maior, e centralizar é justamente o que o place-items pedia.
    return sels.length ? sels.join(',') + '{margin-left:auto!important;margin-right:auto!important}' : '';
  }

  function supportsFlexGap() {
    try {
      var d = document.createElement('div');
      d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden;';
      d.appendChild(document.createElement('div'));
      d.appendChild(document.createElement('div'));
      document.body.appendChild(d);
      var ok = d.scrollHeight === 1;
      d.parentNode.removeChild(d);
      return ok;
    } catch (e) {
      return true; // na dúvida, não mexe
    }
  }

  /** Separa "a, b" nos seletores simples válidos neste motor. */
  function validSelectors(list) {
    var out = [];
    String(list).split(',').forEach(function (s) {
      s = s.trim();
      if (!s) return;
      try { document.querySelector(s); out.push(s); } catch (e) { /* inválido aqui */ }
    });
    return out;
  }

  /** Especificidade (a·10000 + b·100 + c), suficiente para os seletores do painel. */
  function specificity(sel) {
    var a = 0, b = 0, c = 0;
    var s = String(sel).replace(/:not\(([^()]*)\)/g, ' $1 ');
    s = s.replace(/::[\w-]+(\([^)]*\))?/g, function () { c++; return ' '; });
    s = s.replace(/\[[^\]]*\]/g, function () { b++; return ' '; });
    s = s.replace(/#[\w-]+/g, function () { a++; return ' '; });
    s = s.replace(/\.[\w-]+/g, function () { b++; return ' '; });
    s = s.replace(/:[\w-]+(\([^)]*\))?/g, function () { b++; return ' '; });
    c += (s.match(/[a-zA-Z][\w-]*/g) || []).length;
    return a * 10000 + b * 100 + c;
  }

  /** Divide "0 calc(1px + 2px)" em ["0", "calc(1px + 2px)"]. */
  function splitValues(v) {
    var out = [];
    var cur = '';
    var depth = 0;
    for (var i = 0; i < v.length; i++) {
      var ch = v.charAt(i);
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (/\s/.test(ch) && depth === 0) {
        if (cur) { out.push(cur); cur = ''; }
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /** margin-left / margin-top especificados num corpo de regra (o último vence). */
  function marginSides(body) {
    var out = { left: null, top: null };
    var re = /(?:^|[;{\s])(margin(?:-left|-top)?)\s*:\s*([^;}]+)/g;
    var m;
    while ((m = re.exec(body))) {
      var val = m[2].replace(/!important/i, '').trim();
      if (m[1] === 'margin-left') out.left = val;
      else if (m[1] === 'margin-top') out.top = val;
      else {
        var v = splitValues(val);
        if (!v.length) continue;
        out.top = v[0];
        out.left = v.length === 1 ? v[0] : (v.length < 4 ? v[1] : v[3]);
      }
    }
    return out;
  }

  function collectRules(cssText) {
    var text = String(cssText).replace(RE_COMMENT, '');
    var re = /([^{}]+)\{([^{}]*)\}/g;
    var m;
    while ((m = re.exec(text))) {
      var sel = m[1].trim();
      if (!sel || sel.charAt(0) === '@') continue;
      var body = m[2];
      var hasGap = /(?:^|[;\s])(?:row-|column-)?gap\s*:/.test(body);
      var ms = marginSides(body);
      var hasMargin = ms.left !== null || ms.top !== null;
      var gridCenter = /display\s*:\s*(?:inline-)?grid/.test(body) &&
        /(?:place|justify)-items\s*:\s*center/.test(body);
      if (!hasGap && !hasMargin && !gridCenter) continue;

      var parts = validSelectors(sel);
      if (!parts.length) continue;
      if (gridCenter) gridCenterSel = gridCenterSel.concat(parts);
      if (hasGap) gapSel = gapSel.concat(parts);
      if (hasMargin) {
        var order = marginDecls.length;
        for (var i = 0; i < parts.length; i++) {
          marginDecls.push({ sel: parts[i], spec: specificity(parts[i]), order: order, left: ms.left, top: ms.top });
        }
      }
    }
  }

  function cls(el) {
    return el && typeof el.className === 'string' ? el.className : '';
  }

  /** A margem deste lado é `auto` na cascata? */
  function isAutoMargin(el, side) {
    var inline = side === 'left' ? el.style.marginLeft : el.style.marginTop;
    if (inline) return inline === 'auto';

    var panel = document.getElementById('panel');
    var sig = cls(el) + '|' + cls(el.parentElement) + '|' + cls(panel) + '|' + cls(document.body);
    var c = autoCache && autoCache.get(el);
    if (c && c.sig === sig && c[side] !== undefined) return c[side];

    var best = null;
    for (var i = 0; i < marginDecls.length; i++) {
      var d = marginDecls[i];
      if (d[side] === null) continue;
      if (best && (d.spec < best.spec || (d.spec === best.spec && d.order < best.order))) continue;
      var ok = false;
      try { ok = el.matches(d.sel); } catch (e) { /* ignora */ }
      if (ok) best = d;
    }
    var v = !!best && best[side] === 'auto';

    if (autoCache) {
      if (!c || c.sig !== sig) { c = { sig: sig }; autoCache.set(el, c); }
      c[side] = v;
    }
    return v;
  }

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function writeGapStyle(css) {
    if (!gapStyle) {
      gapStyle = document.createElement('style');
      gapStyle.id = 'dc-compat-gap';
      headEl().appendChild(gapStyle);
    }
    if (gapCss !== css) {
      gapCss = css;
      gapStyle.textContent = css;
    }
    gapStyle.disabled = false;
  }

  /** Lê contêineres e filhos com as regras daqui desligadas. */
  function readPlans() {
    var plans = [];
    var seen = [];
    gapSel.forEach(function (sel) {
      var found;
      try { found = document.querySelectorAll(sel); } catch (e) { return; }
      for (var i = 0; i < found.length; i++) {
        var el = found[i];
        if (seen.indexOf(el) !== -1) continue;
        seen.push(el);

        var cs = getComputedStyle(el);
        if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
        var dir = cs.flexDirection;
        if (dir !== 'row' && dir !== 'column') continue;
        var col = dir === 'column';
        var g = parseFloat(cs.getPropertyValue(col ? 'row-gap' : 'column-gap'));
        var rg = parseFloat(cs.getPropertyValue('row-gap'));
        var wrap = !col && cs.flexWrap === 'wrap' && rg > 0;
        if (!(g > 0) && !wrap) continue;

        var side = col ? 'top' : 'left';
        var items = [];
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
          var ccs = getComputedStyle(c);
          if (ccs.display === 'none' || ccs.position === 'absolute' || ccs.position === 'fixed') continue;
          var lead = items.length > 0 && g > 0 && !isAutoMargin(c, side);
          items.push({
            el: c,
            add: lead ? round2(g) : 0,
            base: parseFloat(side === 'left' ? ccs.marginLeft : ccs.marginTop) || 0,
            baseTop: parseFloat(ccs.marginTop) || 0,
            lineStart: false,
            newLine: false
          });
        }
        plans.push({ el: el, side: side, items: items, wrap: wrap, rg: rg > 0 ? round2(rg) : 0 });
      }
    });
    return plans;
  }

  function clearExcept(attr, keep) {
    var old = document.querySelectorAll('[' + attr + ']');
    for (var i = 0; i < old.length; i++) {
      if (keep.indexOf(old[i]) === -1) old[i].removeAttribute(attr);
    }
  }

  function buildCss(plans) {
    var css = '';
    var keys = {};
    var keepI = [];
    var keepW = [];
    var count = 0;

    function rule(attr, key, prop, v) {
      var id = attr + '=' + key;
      if (keys[id]) return;
      keys[id] = true;
      css += '[' + attr + '="' + key + '"]{' + prop + ':' + v + 'px!important}';
    }

    plans.forEach(function (p) {
      p.items.forEach(function (it) {
        if (it.add && !it.lineStart) {
          var v = round2(it.base + it.add);
          var key = p.side.charAt(0) + v;
          rule('data-dc-fg-i', key, 'margin-' + p.side, v);
          setAttr(it.el, 'data-dc-fg-i', key);
          keepI.push(it.el);
          count++;
        }
        if (it.newLine && p.rg > 0) {
          var t = round2(it.baseTop + p.rg);
          var tk = 't' + t;
          rule('data-dc-fg-w', tk, 'margin-top', t);
          setAttr(it.el, 'data-dc-fg-w', tk);
          keepW.push(it.el);
        }
      });
    });

    if (gapForce) {
      plans.forEach(function (p) { setAttr(p.el, 'data-dc-fg-c', ''); });
      css += '[data-dc-fg-c]{column-gap:0!important;row-gap:0!important}';
    }
    if (buttonGridFixed) css += buttonGridCss();

    clearExcept('data-dc-fg-i', keepI);
    clearExcept('data-dc-fg-w', keepW);
    gapStats.items = count;
    return css;
  }

  /** Com as margens aplicadas, descobre quem abriu linha nova. */
  function wrapPass(plans) {
    var changed = false;
    plans.forEach(function (p) {
      if (!p.wrap) return;
      var prev = null;
      var line = 0;
      p.items.forEach(function (it) {
        var r = it.el.getBoundingClientRect();
        var starts = !!prev && r.top >= prev.bottom - 1;
        if (starts) line++;
        if (it.lineStart !== starts || it.newLine !== (line > 0)) changed = true;
        it.lineStart = starts;
        it.newLine = line > 0;
        prev = r;
      });
    });
    return changed;
  }

  function scanGaps() {
    gapPending = 0;
    if (!gapActive || !document.body) return;
    gapStats.runs++;
    try {
      if (gapStyle) gapStyle.disabled = true;
      var plans = readPlans();
      gapStats.containers = plans.length;
      writeGapStyle(buildCss(plans));
      if (wrapPass(plans)) writeGapStyle(buildCss(plans));
    } catch (e) {
      if (gapStyle) gapStyle.disabled = false;
      logError('gap', e);
    }
  }

  function scheduleGaps() {
    if (!gapActive || gapPending) return;
    gapPending = requestAnimationFrame(scanGaps);
  }

  /** A mudança neste nó pode alterar quem precisa de margem? */
  function relevant(node) {
    if (!node || node.nodeType !== 1 || node === probe || !gapSelAll) return false;
    try {
      if (node.matches(gapSelAll)) return true;
      var p = node.parentElement;
      if (p && p.matches(gapSelAll)) return true;
      return !!node.querySelector(gapSelAll);
    } catch (e) {
      return true;
    }
  }

  function onMutations(list) {
    for (var k = 0; k < list.length; k++) {
      var m = list[k];
      if (m.type === 'attributes') {
        // classList.toggle e `hidden = x` regravam o atributo mesmo sem mudar.
        if (m.oldValue === m.target.getAttribute(m.attributeName)) continue;
        if (relevant(m.target)) { scheduleGaps(); return; }
        continue;
      }
      var nodes = [].slice.call(m.addedNodes).concat([].slice.call(m.removedNodes));
      var onlyProbe = nodes.length > 0;
      for (var j = 0; j < nodes.length; j++) if (nodes[j] !== probe) onlyProbe = false;
      if (onlyProbe) continue;
      if (relevant(m.target)) { scheduleGaps(); return; }
      for (var n = 0; n < nodes.length; n++) {
        if (relevant(nodes[n])) { scheduleGaps(); return; }
      }
    }
  }

  /* ================================================================== */
  /* Boot                                                               */
  /* ================================================================== */

  function initMax(mode) {
    active = true;
    reason = supportsMax() ? 'forcado (' + mode + ')' : 'motor sem max()';
    applyToSheets(mode);
    writeVars();
    sync();

    // Mudanças que não passam por layout.js (--body-h, has-4ch, --status-h)
    // também mexem em --strip-h. As escritas daqui vão para um <style>, não
    // para o #panel, então o observador não realimenta.
    var el = document.getElementById('panel');
    if (el && typeof MutationObserver === 'function') {
      new MutationObserver(function () { sync(); scheduleGaps(); })
        .observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    window.addEventListener('resize', sync);
  }

  function initGap(mode) {
    gapForce = mode === 'force';
    if (!gapForce && supportsFlexGap()) return;
    gapActive = true;
    // Mesmo motor antigo (Chromium < 83/84): os dois ajustes andam juntos.
    buttonGridFixed = gapForce || !buttonGridWorks();

    // As folhas na ordem do documento: as copiadas pelo passo do max() valem
    // pela cópia; as outras são lidas do arquivo (ou do CSSOM, se der).
    var nodes = document.querySelectorAll('link[rel="stylesheet"], style[data-dc-compat]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tagName === 'STYLE') { collectRules(n.textContent); continue; }
      if (document.querySelector('style[data-dc-compat="' + (n.getAttribute('href') || '') + '"]')) continue;
      var txt = readText(n.href);
      if (txt == null) {
        try {
          var rules = n.sheet && n.sheet.cssRules;
          txt = '';
          for (var r = 0; rules && r < rules.length; r++) txt += rules[r].cssText + '\n';
        } catch (e) { txt = null; }
      }
      if (txt) collectRules(txt);
    }
    gapSelAll = gapSel.join(',');

    scanGaps();

    if (typeof MutationObserver === 'function') {
      new MutationObserver(onMutations).observe(document.body, {
        subtree: true, childList: true,
        attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden']
      });
    }
    window.addEventListener('resize', scheduleGaps);
  }

  function init() {
    var mode = queryMode();
    if (mode === 'off') { reason = 'desligado por parametro'; return; }
    if (window.Platform && window.Platform.isUxp) { reason = 'UXP (nao se aplica)'; return; }

    if (mode === 'force' || mode === 'cssom' || !supportsMax()) initMax(mode);
    else reason = 'motor com max()';

    try {
      initGap(mode);
    } catch (e) {
      logError('gap init', e);
    }
  }

  function describe() {
    var parts = [];
    if (!active) {
      parts.push('max(): inativo (' + reason + ')');
    } else {
      parts.push('max(): ATIVO (' + reason +
        ') folhas=' + (replaced.join(', ') || 'nenhuma') +
        (failed.length ? ' SEM-LEITURA=' + failed.join(', ') : '') +
        ' limiares=' + th.list.length +
        ' sobras=' + leftovers +
        ' escala=' + lastScale +
        ' strip-top=' + (lastStrip != null ? fmt(lastStrip) + 'px' : '?'));
    }
    parts.push('flex gap: ' + (gapActive
      ? 'ATIVO (seletores=' + gapSel.length + ' conteineres=' + gapStats.containers +
        ' itens=' + gapStats.items + ' passadas=' + gapStats.runs + ')'
      : 'nativo'));
    parts.push('grid em botao: ' + (buttonGridFixed ? 'AJUSTADO (' + gridCenterSel.length + ' seletores)' : 'nativo'));
    return parts.join(' | ');
  }

  window.CssCompat = {
    transform: transform,
    countLeftovers: countLeftovers,
    fileUrlToPath: fileUrlToPath,
    newThresholds: newThresholds,
    specificity: specificity,
    marginSides: marginSides,
    /** layout.js chama depois de escrever --scale. */
    sync: function () {
      sync();
      scheduleGaps();
    },
    describe: describe,
    isActive: function () { return active || gapActive; }
  };

  try {
    // Só com DOM de verdade (nos testes em Node o document é um esboço).
    if (typeof document !== 'undefined' && document.documentElement && document.body &&
        document.querySelectorAll && typeof document.createElement === 'function') {
      init();
    }
  } catch (e) {
    reason = 'falha no init: ' + (e && e.message ? e.message : e);
    logError('init', e);
  }
})();
