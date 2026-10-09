/**
 * theme.js — Tema do painel: cor de fundo, cor de destaque e "acompanhar o
 * Photoshop".
 *
 * Os tokens de cor do styles.css (--panel-bg, --divider, --text-primary...)
 * são todos calculados aqui a partir de duas cores: o fundo e o destaque.
 * Calcular em JS, e não com color-mix() no CSS, é de propósito: o CEF do
 * Photoshop 2021 (Chromium 74) não conhece color-mix().
 *
 * O resultado vai para um <style id="dc-theme"> com especificidade maior que
 * a do styles.css (`:root:root, .panel.panel`), então vence em qualquer ordem
 * de folha — inclusive depois que css-compat.js reescreve as folhas.
 *
 * O tema "Xuimart" usa os valores originais, exatos, do styles.css.
 *
 * Persistência: localStorage, síncrono (mesma razão do idioma: o tema tem que
 * estar decidido antes do primeiro desenho, e o Platform.storage do UXP é
 * assíncrono). As duas janelas do CEP conversam por evento do CSXS.
 */
window.Theme = (function () {
  'use strict';

  var STORAGE_KEY = 'drawcolor-theme';
  var EVT_THEME = 'com.drawcolor.theme';
  var EVT_HELLO = 'com.drawcolor.theme.hello';

  /** Fundos disponíveis. `xuimart` é o original. */
  var BASES = [
    { id: 'xuimart', color: '#181822' },
    { id: 'graphite', color: '#262626' },
    { id: 'black', color: '#111111' },
    { id: 'gray', color: '#3c3c3c' },
    { id: 'light', color: '#d6d6d6' }
  ];

  /** Cores de destaque (borda de aba ativa, botão ligado, foco). */
  var ACCENTS = [
    { id: 'red', color: '#de2246' },
    { id: 'blue', color: '#2f80ed' },
    { id: 'green', color: '#27ae60' },
    { id: 'orange', color: '#f2994a' },
    { id: 'purple', color: '#9b51e0' }
  ];

  var DEFAULT = { base: 'xuimart', accent: 'red', follow: false };

  /** Valores exatos do styles.css: o tema Xuimart não é aproximado. */
  var XUIMART = {
    '--panel-bg': '#181822',
    '--surface-raised': '#20202e',
    '--divider': '#37374b',
    '--button-face': '#2a2a3a',
    '--button-face-end': '#20202e',
    '--icon-stroke': '#c8c8e0',
    '--text-primary': '#f0f0ff',
    '--text-dim': '#8c8ca5',
    '--input-bg': '#0e0e14',
    '--input-border': '#37374b',
    '--leader-line': '#8c8ca5',
    '--tab-active-bg': '#20202e',
    '--header-title': '#f0f0ff',
    '--bg-app': '#0e0e14',
    '--pressed-bg': '#35485c',
    '--wheel-hole': '#2b2b2b'
  };

  /** Níveis de interface do Photoshop, para o UXP (que só dá o nome). */
  var PS_LEVELS = {
    darkest: '#323232',
    dark: '#535353',
    light: '#b8b8b8',
    lightest: '#f0f0f0'
  };

  var config = load();
  var hostColor = null;        // fundo lido do Photoshop (modo acompanhar)
  var current = {};            // tokens aplicados
  var styleEl = null;
  var listeners = [];
  var cs = null;
  var selfId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------------- cores ---------------- */

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function toHex(c) {
    function h(v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }

  function mix(a, b, t) {
    return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
  }

  /** Luminância relativa (sRGB), 0..1. */
  function luminance(c) {
    function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }

  function isLight(hex) {
    var c = hexToRgb(hex);
    return !!c && luminance(c) > 0.32;
  }

  /**
   * Todos os tokens a partir do fundo. Os passos (5%, 10%, 18%...) repetem as
   * distâncias do tema original entre fundo, superfícies e divisores.
   */
  function derive(bgHex) {
    var bg = hexToRgb(bgHex) || hexToRgb('#181822');
    var light = luminance(bg) > 0.32;
    var fg = light ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    var text = light ? hexToRgb('#1c1c1f') : hexToRgb('#f0f0f2');

    return {
      '--panel-bg': toHex(bg),
      '--surface-raised': toHex(mix(bg, fg, light ? 0.07 : 0.05)),
      '--divider': toHex(mix(bg, fg, light ? 0.22 : 0.17)),
      '--button-face': toHex(mix(bg, fg, light ? 0.12 : 0.10)),
      '--button-face-end': toHex(mix(bg, fg, light ? 0.07 : 0.05)),
      '--icon-stroke': toHex(mix(bg, text, 0.8)),
      '--text-primary': toHex(text),
      '--text-dim': toHex(mix(bg, text, 0.55)),
      '--input-bg': toHex(light ? mix(bg, { r: 255, g: 255, b: 255 }, 0.55) : mix(bg, { r: 0, g: 0, b: 0 }, 0.4)),
      '--input-border': toHex(mix(bg, fg, light ? 0.22 : 0.17)),
      '--leader-line': toHex(mix(bg, text, 0.55)),
      '--tab-active-bg': toHex(mix(bg, fg, light ? 0.07 : 0.05)),
      '--header-title': toHex(text),
      '--bg-app': toHex(light ? mix(bg, { r: 0, g: 0, b: 0 }, 0.08) : mix(bg, { r: 0, g: 0, b: 0 }, 0.4)),
      '--wheel-hole': toHex(mix(bg, fg, light ? 0.10 : 0.08))
    };
  }

  function findColor(list, id, fallback) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].color;
    return fallback;
  }

  /** Cor de fundo efetiva: a do Photoshop no modo acompanhar, senão a escolhida. */
  function baseColor() {
    if (config.follow && hostColor) return hostColor;
    return findColor(BASES, config.base, '#181822');
  }

  function accentColor() {
    return findColor(ACCENTS, config.accent, '#de2246');
  }

  function tokens() {
    var t;
    var useOriginal = !(config.follow && hostColor) && config.base === 'xuimart';
    if (useOriginal) {
      t = {};
      for (var k in XUIMART) t[k] = XUIMART[k];
    } else {
      t = derive(baseColor());
    }
    var acc = accentColor();
    t['--accent'] = acc;
    t['--tab-active-border'] = acc;
    t['--focus'] = acc;
    // Botão ligado: o original (#35485c) só vale para o par Xuimart + vermelho.
    if (!(useOriginal && config.accent === 'red')) {
      t['--pressed-bg'] = toHex(mix(hexToRgb(t['--panel-bg']), hexToRgb(acc), 0.3));
    }
    return t;
  }

  /* ---------------- aplicação ---------------- */

  function apply() {
    current = tokens();
    var decl = '';
    for (var k in current) decl += k + ':' + current[k] + ';';
    var css = ':root:root,.panel.panel{' + decl + '}';

    if (typeof document === 'undefined' || !document.documentElement) return;
    if (!styleEl) {
      styleEl = document.getElementById('dc-theme') || document.createElement('style');
      styleEl.id = 'dc-theme';
      (document.head || document.documentElement).appendChild(styleEl);
    }
    if (styleEl.textContent !== css) styleEl.textContent = css;

    // Ícones de canvas são desenhados para fundo escuro; no claro o CSS os
    // inverte (ver html[data-tone="light"] no styles.css).
    document.documentElement.setAttribute('data-tone', isLight(current['--panel-bg']) ? 'light' : 'dark');

    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](config); } catch (e) { /* ignora ouvinte quebrado */ }
    }
  }

  /* ---------------- persistência ---------------- */

  function sanitize(c) {
    c = c || {};
    return {
      base: findColor(BASES, c.base, null) ? c.base : DEFAULT.base,
      accent: findColor(ACCENTS, c.accent, null) ? c.accent : DEFAULT.accent,
      follow: c.follow === true
    };
  }

  function load() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* sem storage ou JSON velho */ }
    return sanitize(DEFAULT);
  }

  function save() {
    try {
      if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) { /* sem storage */ }
  }

  /* ---------------- Photoshop ---------------- */

  function rgbObjToHex(c) {
    if (!c) return null;
    var r = c.red, g = c.green, b = c.blue;
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return null;
    return toHex({ r: r, g: g, b: b });
  }

  /** Fundo atual da interface do Photoshop, ou null se não der para saber. */
  function readHost() {
    // CEP: appSkinInfo traz a cor exata do fundo dos painéis.
    try {
      if (cs && cs.getHostEnvironment) {
        var env = cs.getHostEnvironment();
        var skin = env && env.appSkinInfo;
        var bg = skin && skin.panelBackgroundColor && skin.panelBackgroundColor.color;
        var hex = rgbObjToHex(bg);
        if (hex) return hex;
      }
    } catch (e) { /* segue */ }

    // UXP: a variável do host é exata; o nome do tema é o plano B.
    try {
      if (window.Platform && window.Platform.isUxp) {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--uxp-host-background-color').trim();
        if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
        var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
        if (m) return toHex({ r: +m[1], g: +m[2], b: +m[3] });
        var th = document.theme && document.theme.getCurrent && document.theme.getCurrent();
        if (th && PS_LEVELS[th]) return PS_LEVELS[th];
      }
    } catch (e) { /* segue */ }
    return null;
  }

  function refreshHost() {
    var h = readHost();
    if (h !== hostColor) {
      hostColor = h;
      if (config.follow) apply();
    }
  }

  function watchHost() {
    try {
      if (cs && cs.addEventListener) {
        cs.addEventListener('com.adobe.csxs.events.ThemeColorChanged', refreshHost);
      }
    } catch (e) { /* sem evento */ }
    try {
      if (document.theme && document.theme.onUpdated && document.theme.onUpdated.addListener) {
        document.theme.onUpdated.addListener(refreshHost);
      }
    } catch (e) { /* sem API de tema */ }
  }

  /* ---------------- janelas do CEP ---------------- */

  function isToolsWindow() {
    return !!(document.body && document.body.classList.contains('shell-tools'));
  }

  function broadcast() {
    if (!cs || typeof window.CSEvent !== 'function') return;
    try {
      var evt = new window.CSEvent(EVT_THEME, 'APPLICATION');
      evt.data = JSON.stringify({ from: selfId, base: config.base, accent: config.accent, follow: config.follow });
      cs.dispatchEvent(evt);
    } catch (e) { /* janela do outro lado fechada */ }
  }

  function onPeerTheme(raw) {
    try {
      var msg = JSON.parse(raw && raw.data !== undefined ? raw.data : raw);
      if (!msg || msg.from === selfId) return;
      var next = sanitize(msg);
      if (next.base === config.base && next.accent === config.accent && next.follow === config.follow) return;
      config = next;
      save();
      if (config.follow) hostColor = readHost();
      apply();
    } catch (e) { /* mensagem malformada */ }
  }

  function onHello(raw) {
    try {
      var msg = JSON.parse(raw && raw.data !== undefined ? raw.data : raw);
      if (msg && msg.from === selfId) return;
    } catch (e) { /* sem origem: responde mesmo assim */ }
    // Quem manda no tema é o painel principal (é ele que tem o menu).
    if (!isToolsWindow()) broadcast();
  }

  function initBus() {
    if (!window.Platform || !window.Platform.isCep || typeof window.CSInterface !== 'function') return;
    try {
      cs = new window.CSInterface();
      cs.addEventListener(EVT_THEME, onPeerTheme);
      cs.addEventListener(EVT_HELLO, onHello);
      // A janela de ferramentas pergunta o tema ao abrir: localStorage pode
      // não ser compartilhado entre as duas extensões.
      if (isToolsWindow() && typeof window.CSEvent === 'function') {
        var evt = new window.CSEvent(EVT_HELLO, 'APPLICATION');
        evt.data = JSON.stringify({ from: selfId });
        cs.dispatchEvent(evt);
      }
    } catch (e) { cs = null; }
  }

  /* ---------------- API ---------------- */

  function set(partial) {
    var next = sanitize({
      base: partial.base !== undefined ? partial.base : config.base,
      accent: partial.accent !== undefined ? partial.accent : config.accent,
      follow: partial.follow !== undefined ? partial.follow : config.follow
    });
    config = next;
    save();
    if (config.follow) hostColor = readHost();
    apply();
    broadcast();
  }

  function get() {
    return { base: config.base, accent: config.accent, follow: config.follow };
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function holeColor() {
    return current['--wheel-hole'] || '#2b2b2b';
  }

  /**
   * Monta os botões de fundo e destaque no menu e liga o "acompanhar".
   * Chamado pelo initMenu do main.js.
   */
  function initMenu() {
    var bases = document.getElementById('themeBases');
    var accents = document.getElementById('themeAccents');
    var follow = document.getElementById('optThemeFollow');
    var t = function (k) { return window.I18N ? window.I18N.t(k) : k; };

    function build(host, list, kind) {
      if (!host) return;
      host.innerHTML = '';
      list.forEach(function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'theme-swatch';
        b.setAttribute('role', 'radio');
        b.dataset.id = item.id;
        b.style.background = item.color;
        var label = t('theme.' + kind + '.' + item.id);
        b.title = label;
        b.setAttribute('aria-label', label);
        b.addEventListener('click', function () {
          var p = {};
          p[kind] = item.id;
          set(p);
        });
        host.appendChild(b);
      });
    }

    function sync() {
      [[bases, 'base'], [accents, 'accent']].forEach(function (pair) {
        if (!pair[0]) return;
        var btns = pair[0].querySelectorAll('.theme-swatch');
        for (var i = 0; i < btns.length; i++) {
          btns[i].setAttribute('aria-checked', String(btns[i].dataset.id === config[pair[1]]));
        }
      });
      if (bases) bases.setAttribute('aria-disabled', String(config.follow));
      if (follow && follow.checked !== config.follow) follow.checked = config.follow;
    }

    function relabel() {
      build(bases, BASES, 'base');
      build(accents, ACCENTS, 'accent');
      sync();
    }

    if (follow) follow.addEventListener('change', function () { set({ follow: follow.checked }); });
    onChange(sync);
    if (window.I18N && window.I18N.onChange) window.I18N.onChange(relabel);
    relabel();
  }

  function init() {
    initBus();
    hostColor = readHost();
    watchHost();
    apply();
  }

  // Aplica já no carregamento, antes do primeiro desenho do painel.
  try { init(); } catch (e) {
    if (window.console && console.error) console.error('[DrawColor] theme init:', e);
  }

  return {
    get: get,
    set: set,
    onChange: onChange,
    initMenu: initMenu,
    holeColor: holeColor,
    // expostos para teste
    derive: derive,
    tokens: tokens,
    isLight: isLight,
    BASES: BASES,
    ACCENTS: ACCENTS
  };
})();
