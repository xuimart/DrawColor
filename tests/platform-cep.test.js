/**
 * Shell CEP: shim de CSInterface e ponte de cor por ExtendScript.
 *
 * O CEP não é executável em CI, e nesta máquina não há Photoshop 21-25 para
 * testar de verdade — só 26+, onde a Adobe removeu o CEP. Então simulamos a
 * ponte nativa `__adobe_cep__` que o runtime injeta.
 *
 * A detecção de ambiente e o storage do CEP já são cobertos por
 * platform-env.test.js; aqui ficam só as partes exclusivas deste shell.
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

/* ---------------- Mock do runtime CEP ---------------- */

// Foreground do "Photoshop" e registro dos scripts avaliados
let hostForeground = { r: 10, g: 20, b: 30 };
let evaluated = [];
let savedLocalStorage;

function installCepMock() {
  evaluated = [];

  window.__adobe_cep__ = {
    evalScript: (script, cb) => {
      evaluated.push(script);

      // Leitura do foreground
      if (script.includes('app.foregroundColor.rgb') && script.includes('+ ","')) {
        cb(`${hostForeground.r},${hostForeground.g},${hostForeground.b}`);
        return;
      }

      // Escrita: aplica o ExtendScript recebido ao host falso
      if (script.includes('app.foregroundColor = c')) {
        const red = /c\.rgb\.red = (-?[\d.]+)/.exec(script);
        const green = /c\.rgb\.green = (-?[\d.]+)/.exec(script);
        const blue = /c\.rgb\.blue = (-?[\d.]+)/.exec(script);
        if (red && green && blue) {
          hostForeground = {
            r: Number(red[1]),
            g: Number(green[1]),
            b: Number(blue[1])
          };
        }
        cb('');
        return;
      }

      cb('');
    },
    getHostEnvironment: () => JSON.stringify({ appName: 'PHXS', appVersion: '21.0.0' }),
    getExtensionId: () => 'com.drawcolor.colorwheel.cep.panel'
  };
}

function installLocalStorage() {
  const map = {};
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: (k) => { delete map[k]; },
    clear: () => { Object.keys(map).forEach((k) => delete map[k]); }
  };
  window.localStorage = globalThis.localStorage;
}

const GLOBALS = {
  'platform.js': 'Platform',
  'color.js': 'Color',
  'state.js': 'AppState',
  'ps-bridge.js': 'PSBridge'
};

function reload(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
  const name = GLOBALS[rel];
  return name ? window[name] : undefined;
}

/** Carrega o shim de CSInterface do shell CEP, como o index.html faz. */
function loadCsInterface() {
  const full = require.resolve(path.join(__dirname, '..', 'cep', 'lib', 'CSInterface.js'));
  delete require.cache[full];
  require(full);
}

function freshPlatform() {
  delete window.Platform;
  delete globalThis.Platform;
  reload('platform.js');
  return window.Platform;
}

beforeEach(() => {
  savedLocalStorage = globalThis.localStorage;
  hostForeground = { r: 10, g: 20, b: 30 };
  installCepMock();
  installLocalStorage();
  loadCsInterface();
});

afterEach(() => {
  globalThis.localStorage = savedLocalStorage;
  delete window.__adobe_cep__;
  delete globalThis.__adobe_cep__;
  delete window.CSInterface;
  delete globalThis.CSInterface;
});

/* ---------------- Shim de CSInterface ---------------- */

describe('Shell CEP: shim de CSInterface', () => {
  it('expõe window.CSInterface depois de carregado', () => {
    assert.strictEqual(typeof window.CSInterface, 'function');
  });

  it('evalScript delega para a ponte nativa __adobe_cep__', () => {
    const cs = new window.CSInterface();
    let got = null;
    cs.evalScript('var x = 1;', (res) => { got = res; });
    assert.ok(evaluated.includes('var x = 1;'));
    assert.strictEqual(got, '');
  });

  it('getHostEnvironment devolve a versão do host já parseada', () => {
    const cs = new window.CSInterface();
    const env = cs.getHostEnvironment();
    assert.strictEqual(env.appName, 'PHXS');
    assert.strictEqual(env.appVersion, '21.0.0');
  });

  it('falha de forma explícita quando a ponte nativa não existe', () => {
    delete window.__adobe_cep__;
    const cs = new window.CSInterface();
    let got = null;
    cs.evalScript('qualquer', (res) => { got = res; });
    // Erro explícito, em vez de exceção ou silêncio.
    assert.strictEqual(got, 'EvalScript error.');
    assert.strictEqual(cs.getHostEnvironment(), null);
  });
});

/* ---------------- PSBridge via ExtendScript ---------------- */

describe('PSBridge no CEP: cor via ExtendScript', () => {
  it('conecta e adota a cor de foreground do host', async () => {
    const P = freshPlatform();
    await P.ready();
    reload('color.js');
    const S = reload('state.js');
    const B = reload('ps-bridge.js');

    B.init();
    assert.strictEqual(B.isConnected(), true);

    const rgb = S.getRgb();
    assert.strictEqual(rgb.r, 10);
    assert.strictEqual(rgb.g, 20);
    assert.strictEqual(rgb.b, 30);

    B.stop();
  });

  it('escreve o foreground montando um SolidColor em ExtendScript', async () => {
    const P = freshPlatform();
    await P.ready();
    reload('color.js');
    reload('state.js');
    const B = reload('ps-bridge.js');

    B.init();
    B.push({ r: 200, g: 100, b: 50 });

    const writes = evaluated.filter((s) => s.includes('app.foregroundColor = c'));
    assert.strictEqual(writes.length, 1);
    assert.match(writes[0], /new SolidColor\(\)/);
    // O host falso aplicou o script: confirma que os componentes chegaram.
    assert.deepStrictEqual(hostForeground, { r: 200, g: 100, b: 50 });

    B.stop();
  });

  it('não reenvia ao host a cor que veio dele', async () => {
    const P = freshPlatform();
    await P.ready();
    reload('color.js');
    const S = reload('state.js');
    const B = reload('ps-bridge.js');

    B.init();
    evaluated = [];

    S.setRgb(1, 2, 3, { reason: 'host' });
    await new Promise((r) => setTimeout(r, 120));

    const writes = evaluated.filter((s) => s.includes('app.foregroundColor = c'));
    assert.strictEqual(writes.length, 0, 'houve loop de escrita para o host');

    B.stop();
  });

  it('agrupa um arraste em uma única escrita', async () => {
    const P = freshPlatform();
    await P.ready();
    reload('color.js');
    const S = reload('state.js');
    const B = reload('ps-bridge.js');

    B.init();
    evaluated = [];

    S.setRgb(10, 10, 10);
    S.setRgb(20, 20, 20);
    S.setRgb(30, 30, 30);
    await new Promise((r) => setTimeout(r, 150));

    const writes = evaluated.filter((s) => s.includes('app.foregroundColor = c'));
    assert.strictEqual(writes.length, 1, 'debounce não agrupou as escritas');

    B.stop();
  });
});
