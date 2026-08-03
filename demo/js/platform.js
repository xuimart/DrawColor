/**
 * platform.js — Platform Adapter.
 *
 * Uma única interface para os recursos que diferem entre os três ambientes
 * onde este código roda: navegador (demo), CEP (Photoshop 21-25) e
 * UXP (Photoshop 22+).
 *
 * O problema central que este módulo resolve: o UXP não tem `localStorage`.
 * Tem apenas `sessionStorage` (que morre ao fechar o painel) e um sistema de
 * arquivos assíncrono. Os módulos existentes (`layout-store`, `palettes`,
 * `docking`) leem storage de forma síncrona durante o init.
 *
 * A solução é um cache em memória:
 *   - No boot, `ready()` carrega o JSON do disco de uma vez (async).
 *   - `storage.getItem` lê do cache (síncrono) — call sites não mudam.
 *   - `storage.setItem` escreve no cache (síncrono) e agenda um flush
 *     debounced para o disco.
 *
 * Por isso `main.js` deve esperar `Platform.ready()` antes de inicializar.
 */
window.Platform = (function () {
  'use strict';

  var FLUSH_DELAY = 400;
  var STATE_FILE = 'drawcolor-state.json';

  /* ---------------- Detecção de ambiente ---------------- */

  function detect() {
    // UXP expõe `require` global com o módulo 'uxp' disponível.
    if (typeof require === 'function') {
      try {
        var uxp = require('uxp');
        if (uxp && uxp.storage && uxp.storage.localFileSystem) return 'uxp';
      } catch (e) { /* não é UXP */ }
    }
    /**
     * O CEP é Chromium completo. A marca confiável do host é o objeto
     * injetado `__adobe_cep__`, não `window.CSInterface`: o CSInterface é só
     * uma biblioteca e estaria presente também se o bundle CEP fosse aberto
     * num navegador comum, gerando falso positivo.
     */
    if (typeof window.__adobe_cep__ !== 'undefined') return 'cep';
    return 'web';
  }

  var env = detect();

  /* ---------------- Cache de storage ---------------- */

  var cache = {};
  var flushTimer = null;
  var persistAvailable = true;
  var dataFolder = null;

  function scheduleFlush() {
    if (!persistAvailable) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_DELAY);
  }

  function flush() {
    flushTimer = null;
    if (env === 'uxp') {
      flushUxp();
    } else {
      try {
        window.localStorage.setItem(STATE_FILE, JSON.stringify(cache));
      } catch (e) {
        persistAvailable = false;
      }
    }
  }

  function flushUxp() {
    if (!dataFolder) return;
    var payload = JSON.stringify(cache);
    dataFolder.createFile(STATE_FILE, { overwrite: true })
      .then(function (file) { return file.write(payload); })
      .catch(function () { persistAvailable = false; });
  }

  /**
   * Storage síncrono com a mesma assinatura de localStorage, para que os
   * módulos existentes não precisem virar async.
   */
  var storage = {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
    },
    setItem: function (key, value) {
      cache[key] = String(value);
      scheduleFlush();
    },
    removeItem: function (key) {
      delete cache[key];
      scheduleFlush();
    },
    /** Força a gravação imediata, sem esperar o debounce. */
    flushNow: function () {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
    },
    isPersistent: function () { return persistAvailable; }
  };

  /* ---------------- Boot: carrega o estado do disco ---------------- */

  function loadWeb() {
    try {
      var raw = window.localStorage.getItem(STATE_FILE);
      if (raw) cache = JSON.parse(raw) || {};
      // Migração: chaves antigas gravadas direto em localStorage.
      migrateLegacyKeys();
    } catch (e) {
      persistAvailable = false;
    }
  }

  /**
   * Versões anteriores gravavam cada módulo em sua própria chave de
   * localStorage. Traz esses valores para o cache unificado, uma vez.
   */
  function migrateLegacyKeys() {
    var legacy = [
      'layout_profiles',
      'layout_active',
      'colorWheelPlugin.palettes.v1',
      'colorWheelPlugin.docking.v1'
    ];
    for (var i = 0; i < legacy.length; i++) {
      var k = legacy[i];
      if (Object.prototype.hasOwnProperty.call(cache, k)) continue;
      try {
        var v = window.localStorage.getItem(k);
        if (v !== null) cache[k] = v;
      } catch (e) { /* ignora */ }
    }
  }

  function loadUxp() {
    var fs = require('uxp').storage.localFileSystem;
    return fs.getDataFolder()
      .then(function (folder) {
        dataFolder = folder;
        return folder.getEntry(STATE_FILE).catch(function () { return null; });
      })
      .then(function (entry) {
        if (!entry) return null;
        return entry.read();
      })
      .then(function (text) {
        if (text) {
          try { cache = JSON.parse(text) || {}; } catch (e) { cache = {}; }
        }
      })
      .catch(function () {
        persistAvailable = false;
      });
  }

  var readyPromise = null;

  /**
   * Resolve quando o estado persistido estiver no cache. Deve ser aguardado
   * antes de qualquer módulo chamar `storage.getItem`.
   */
  function ready() {
    if (readyPromise) return readyPromise;
    if (env === 'uxp') {
      readyPromise = loadUxp();
    } else {
      loadWeb();
      readyPromise = Promise.resolve();
    }
    return readyPromise;
  }

  /* ---------------- Observação de redimensionamento ---------------- */

  /**
   * O UXP nem sempre expõe ResizeObserver. Cai para polling do clientWidth,
   * que é barato e suficiente porque só recalcula quando a medida muda.
   */
  function observeResize(el, callback) {
    if (!el) return function () {};

    if (typeof window.ResizeObserver === 'function') {
      var ro = new window.ResizeObserver(callback);
      ro.observe(el);
      return function () { ro.disconnect(); };
    }

    var lastW = el.clientWidth;
    var lastH = el.clientHeight;
    var id = setInterval(function () {
      if (el.clientWidth !== lastW || el.clientHeight !== lastH) {
        lastW = el.clientWidth;
        lastH = el.clientHeight;
        callback();
      }
    }, 200);
    return function () { clearInterval(id); };
  }

  /* ---------------- Capacidades ---------------- */

  /**
   * Detecta suporte a <input type="range">. Onde o tipo não existe, o
   * navegador/runtime rebaixa a propriedade `type` para 'text'.
   */
  function detectRangeInput() {
    try {
      var probe = document.createElement('input');
      probe.setAttribute('type', 'range');
      return probe.type === 'range';
    } catch (e) {
      return false;
    }
  }

  var capabilities = {
    // UXP tem suporte limitado a SVG; as guias de encaixe usam div no UXP.
    svg: env !== 'uxp',
    // Só o CEP e o navegador têm redimensionamento nativo via CSS resize.
    cssResize: env !== 'uxp',
    hostColor: env === 'uxp' || env === 'cep',
    rangeInput: detectRangeInput()
  };

  /* ---------------- Polyfill de input[type=range] ---------------- */

  /**
   * Substitui um <input type="range"> por um slider de divs quando o runtime
   * não renderiza o tipo nativo (caso do UXP em várias versões).
   *
   * O input original continua no DOM, apenas oculto, servindo de portador do
   * valor. Assim `el.value` e o evento 'input' seguem funcionando e quem
   * consome o slider não precisa mudar nada.
   */
  function polyfillRange(input) {
    if (!input || capabilities.rangeInput) return;
    if (input.getAttribute('data-range-polyfilled') === '1') return;
    input.setAttribute('data-range-polyfilled', '1');

    var min = parseFloat(input.getAttribute('min'));
    var max = parseFloat(input.getAttribute('max'));
    var step = parseFloat(input.getAttribute('step'));
    if (isNaN(min)) min = 0;
    if (isNaN(max)) max = 100;
    if (isNaN(step) || step <= 0) step = 1;

    input.style.display = 'none';

    var track = document.createElement('div');
    track.className = 'range-fallback';
    var thumb = document.createElement('div');
    thumb.className = 'range-fallback-thumb';
    track.appendChild(thumb);
    if (input.nextSibling) {
      input.parentNode.insertBefore(track, input.nextSibling);
    } else {
      input.parentNode.appendChild(track);
    }

    function quantize(v) {
      var snapped = min + Math.round((v - min) / step) * step;
      return Math.max(min, Math.min(max, snapped));
    }

    function paint() {
      var v = parseFloat(input.value);
      if (isNaN(v)) v = min;
      var pct = max === min ? 0 : ((v - min) / (max - min)) * 100;
      thumb.style.left = pct + '%';
    }

    function emitFrom(clientX) {
      var rect = track.getBoundingClientRect();
      if (!rect.width) return;
      var ratio = (clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));
      input.value = String(quantize(min + ratio * (max - min)));
      paint();
      // Reaproveita o mesmo evento que o range nativo dispararia.
      try {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) {
        var ev = document.createEvent('Event');
        ev.initEvent('input', true, true);
        input.dispatchEvent(ev);
      }
    }

    var dragging = false;
    track.addEventListener('pointerdown', function (e) {
      dragging = true;
      if (track.setPointerCapture) {
        try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      }
      emitFrom(e.clientX);
    });
    track.addEventListener('pointermove', function (e) {
      if (dragging) emitFrom(e.clientX);
    });
    track.addEventListener('pointerup', function () { dragging = false; });
    track.addEventListener('pointercancel', function () { dragging = false; });

    paint();
  }

  return {
    env: env,
    isUxp: env === 'uxp',
    isCep: env === 'cep',
    isWeb: env === 'web',
    capabilities: capabilities,
    storage: storage,
    ready: ready,
    observeResize: observeResize,
    polyfillRange: polyfillRange
  };
})();
