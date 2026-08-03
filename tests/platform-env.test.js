/**
 * Detecção de ambiente do Platform Adapter fora do UXP.
 *
 * Cobre dois pontos que já causaram bug:
 *   - CEP deve ser reconhecido pelo objeto injetado `__adobe_cep__`, não por
 *     `window.CSInterface`. O CSInterface é apenas uma biblioteca e estaria
 *     presente também se o bundle CEP fosse aberto num navegador, o que daria
 *     falso positivo e faria o PSBridge tentar falar com um host inexistente.
 *   - No navegador puro o adapter precisa cair em localStorage e reportar
 *     `hostColor: false`, para a demo seguir funcionando isolada.
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

const PLATFORM = require.resolve(path.join(__dirname, '..', 'demo', 'js', 'platform.js'));

/** Recarrega o adapter para reavaliar a detecção de ambiente. */
function freshPlatform() {
  delete require.cache[PLATFORM];
  delete window.Platform;
  require(PLATFORM);
  return window.Platform;
}

/** localStorage falso, para o caminho web. */
function fakeLocalStorage() {
  const map = {};
  return {
    _map: map,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: (k) => { delete map[k]; },
    clear: () => { Object.keys(map).forEach((k) => delete map[k]); }
  };
}

let savedLocalStorage;

beforeEach(() => {
  savedLocalStorage = globalThis.localStorage;
  delete globalThis.__adobe_cep__;
  delete window.__adobe_cep__;
  delete globalThis.CSInterface;
  delete window.CSInterface;
});

afterEach(() => {
  globalThis.localStorage = savedLocalStorage;
  delete globalThis.__adobe_cep__;
  delete window.__adobe_cep__;
  delete globalThis.CSInterface;
  delete window.CSInterface;
});

/* ---------------- Navegador ---------------- */

describe('Platform Adapter: ambiente web', () => {
  it('detecta web quando não há uxp nem host CEP', async () => {
    globalThis.localStorage = fakeLocalStorage();
    const P = freshPlatform();
    assert.strictEqual(P.env, 'web');
    assert.strictEqual(P.isWeb, true);
    assert.strictEqual(P.isCep, false);
    assert.strictEqual(P.isUxp, false);
  });

  it('reporta hostColor falso: sem Photoshop não há cor de host', () => {
    globalThis.localStorage = fakeLocalStorage();
    const P = freshPlatform();
    assert.strictEqual(P.capabilities.hostColor, false);
  });

  it('habilita SVG e resize de CSS no navegador', () => {
    globalThis.localStorage = fakeLocalStorage();
    const P = freshPlatform();
    assert.strictEqual(P.capabilities.svg, true);
    assert.strictEqual(P.capabilities.cssResize, true);
  });

  it('persiste em localStorage e relê depois de recarregar', async () => {
    const ls = fakeLocalStorage();
    globalThis.localStorage = ls;

    const P1 = freshPlatform();
    await P1.ready();
    P1.storage.setItem('layout_active', 'Perfil Web');
    P1.storage.flushNow();

    globalThis.localStorage = ls;
    const P2 = freshPlatform();
    await P2.ready();
    assert.strictEqual(P2.storage.getItem('layout_active'), 'Perfil Web');
  });

  it('migra chaves antigas gravadas soltas em localStorage', async () => {
    const ls = fakeLocalStorage();
    // Estado no formato anterior: uma chave por módulo.
    ls.setItem('layout_active', 'Legado');
    ls.setItem('colorWheelPlugin.palettes.v1', '{"palettes":[]}');
    globalThis.localStorage = ls;

    const P = freshPlatform();
    await P.ready();

    assert.strictEqual(P.storage.getItem('layout_active'), 'Legado');
    assert.strictEqual(P.storage.getItem('colorWheelPlugin.palettes.v1'), '{"palettes":[]}');
  });

  it('não quebra quando localStorage lança (modo privado)', async () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('acesso negado'); },
      setItem: () => { throw new Error('acesso negado'); },
      removeItem: () => {}
    };
    const P = freshPlatform();
    await P.ready();
    assert.strictEqual(P.storage.isPersistent(), false);
    // Segue utilizável em memória.
    P.storage.setItem('x', '1');
    assert.strictEqual(P.storage.getItem('x'), '1');
  });
});

/* ---------------- CEP ---------------- */

describe('Platform Adapter: ambiente CEP', () => {
  it('detecta CEP pelo objeto injetado __adobe_cep__', () => {
    globalThis.localStorage = fakeLocalStorage();
    window.__adobe_cep__ = { evalScript: () => {} };

    const P = freshPlatform();
    assert.strictEqual(P.env, 'cep');
    assert.strictEqual(P.isCep, true);
    assert.strictEqual(P.capabilities.hostColor, true);
  });

  it('CSInterface presente sem host NÃO conta como CEP', () => {
    globalThis.localStorage = fakeLocalStorage();
    // Cenário do bug: a biblioteca carregada, mas nenhum host por trás.
    window.CSInterface = function () {};

    const P = freshPlatform();
    assert.strictEqual(P.env, 'web', 'CSInterface sozinho não deve indicar CEP');
    assert.strictEqual(P.isCep, false);
  });

  it('no CEP mantém SVG e resize, que o Chromium suporta', () => {
    globalThis.localStorage = fakeLocalStorage();
    window.__adobe_cep__ = { evalScript: () => {} };

    const P = freshPlatform();
    assert.strictEqual(P.capabilities.svg, true);
    assert.strictEqual(P.capabilities.cssResize, true);
  });
});

/* ---------------- Polyfill de range ---------------- */

describe('Platform Adapter: polyfill de input[type=range]', () => {
  it('detecta ausência de suporte a range no runtime simulado', () => {
    globalThis.localStorage = fakeLocalStorage();
    const P = freshPlatform();
    assert.strictEqual(P.capabilities.rangeInput, false);
  });

  it('marca o input como convertido e o oculta', () => {
    globalThis.localStorage = fakeLocalStorage();
    const P = freshPlatform();

    const input = document.createElement('input');
    input.setAttribute('type', 'range');
    input.setAttribute('min', '6');
    input.setAttribute('max', '70');
    input.setAttribute('step', '1');
    input.parentNode = document.createElement('div');

    P.polyfillRange(input);

    assert.strictEqual(input.getAttribute('data-range-polyfilled'), '1');
    assert.strictEqual(input.style.display, 'none');
  });

  it('é idempotente: aplicar duas vezes não duplica o slider', () => {
    globalThis.localStorage = fakeLocalStorage();
    const P = freshPlatform();

    const parent = document.createElement('div');
    let appended = 0;
    parent.appendChild = function () { appended++; };

    const input = document.createElement('input');
    input.setAttribute('type', 'range');
    input.parentNode = parent;

    P.polyfillRange(input);
    P.polyfillRange(input);

    assert.strictEqual(appended, 1, 'o slider foi inserido mais de uma vez');
  });

  it('ignora entrada nula sem lançar', () => {
    globalThis.localStorage = fakeLocalStorage();
    const P = freshPlatform();
    assert.doesNotThrow(() => P.polyfillRange(null));
    assert.doesNotThrow(() => P.polyfillRange(undefined));
  });
});
