/**
 * Setup shim for running browser IIFE modules in Node.
 * Each module writes to `window.XXX`; we alias globalThis as window
 * so the same code works in both environments.
 */
'use strict';

if (typeof window === 'undefined') {
  globalThis.window = globalThis;
}

// Shim for document (modules may reference it during load but won't use DOM in tests)
if (typeof document === 'undefined') {
  globalThis.document = {
    getElementById: function() { return null; },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; }
  };
}

// Shim for requestAnimationFrame
if (typeof requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = function(fn) { return setTimeout(fn, 16); };
  globalThis.cancelAnimationFrame = function(id) { clearTimeout(id); };
}

// Shim for ResizeObserver
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * createElement mínimo.
 *
 * Modela deliberadamente um runtime SEM suporte a <input type="range">:
 * setAttribute('type','range') não promove `.type` para 'range'. É assim que
 * o UXP se comporta em várias versões, e é o caminho que o polyfill do
 * Platform Adapter precisa exercitar.
 */
if (typeof globalThis.document.createElement !== 'function') {
  globalThis.document.createElement = function (tag) {
    return {
      tagName: String(tag).toUpperCase(),
      type: '',
      hidden: false,
      className: '',
      style: {},
      parentNode: null,
      nextSibling: null,
      _attrs: {},
      setAttribute: function (k, v) {
        this._attrs[k] = String(v);
        // 'range' não é reconhecido: permanece como tipo vazio.
        if (k === 'type' && v !== 'range') this.type = String(v);
      },
      getAttribute: function (k) {
        return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
      },
      appendChild: function () {},
      insertBefore: function () {},
      addEventListener: function () {},
      dispatchEvent: function () { return true; },
      getBoundingClientRect: function () {
        return { left: 0, top: 0, width: 0, height: 0 };
      }
    };
  };
}
