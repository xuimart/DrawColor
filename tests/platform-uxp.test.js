/**
 * Testes de integração do Platform Adapter no runtime UXP.
 *
 * O UXP não é executável em CI, então simulamos os dois módulos que ele
 * injeta — `uxp` e `photoshop` — interceptando Module._load. Isso exercita o
 * caminho real do adapter: detecção de ambiente, carga assíncrona do estado,
 * cache síncrono, flush para "disco" e a ponte de cor com o host.
 */
'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

require('./setup.js');

/* ---------------- Mocks dos módulos do UXP ---------------- */

// Sistema de arquivos falso do plugin: nome -> conteúdo
let files = {};

const uxpMock = {
  storage: {
    localFileSystem: {
      getDataFolder: async () => ({
        getEntry: async (name) => {
          if (!Object.prototype.hasOwnProperty.call(files, name)) {
            throw new Error('ENOENT');
          }
          return { read: async () => files[name] };
        },
        createFile: async (name) => ({
          write: async (text) => { files[name] = text; }
        })
      })
    }
  }
};

// Photoshop falso: foreground legível e batchPlay registrando as escritas
let foreground = { rgb: { red: 10, green: 20, blue: 30 } };
let batchPlayCalls = [];

const psMock = {
  app: {
    get foregroundColor() { return foreground; }
  },
  action: {
    batchPlay: async (commands) => { batchPlayCalls.push(commands); return []; }
  },
  core: {
    executeAsModal: async (fn) => fn()
  }
};

const origLoad = Module._load;

before(() => {
  Module._load = function (request) {
    if (request === 'uxp') return uxpMock;
    if (request === 'photoshop') return psMock;
    return origLoad.apply(this, arguments);
  };
});

/**
 * Os módulos do núcleo são IIFEs que publicam em `window.X` e não usam
 * module.exports, então require() devolve um objeto vazio. Este mapa diz de
 * qual global cada módulo é dono.
 */
const GLOBALS = {
  'platform.js': 'Platform',
  'color.js': 'Color',
  'state.js': 'AppState',
  'layout.js': 'LAYOUT',
  'layout-store.js': 'LayoutStore',
  'layout-serializer.js': 'LayoutSerializer',
  'ps-bridge.js': 'PSBridge'
};

/** Recarrega um módulo do núcleo, descartando o cache do require. */
function reload(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
  const name = GLOBALS[rel];
  return name ? window[name] : undefined;
}

function freshPlatform() {
  delete globalThis.Platform;
  delete window.Platform;
  reload('platform.js');
  return window.Platform;
}

/* ---------------- Detecção de ambiente ---------------- */

describe('Platform Adapter: detecção de ambiente', () => {
  it('reconhece o runtime UXP pela presença do módulo uxp', () => {
    const P = freshPlatform();
    assert.strictEqual(P.env, 'uxp');
    assert.strictEqual(P.isUxp, true);
    assert.strictEqual(P.isWeb, false);
  });

  it('marca SVG e resize de CSS como indisponíveis no UXP', () => {
    const P = freshPlatform();
    assert.strictEqual(P.capabilities.svg, false);
    assert.strictEqual(P.capabilities.cssResize, false);
    assert.strictEqual(P.capabilities.hostColor, true);
  });
});

/* ---------------- Storage: cache síncrono sobre IO assíncrono ---------------- */

describe('Platform Adapter: storage no UXP', () => {
  beforeEach(() => { files = {}; });

  it('ready() resolve mesmo sem arquivo de estado prévio', async () => {
    const P = freshPlatform();
    await P.ready();
    assert.strictEqual(P.storage.getItem('inexistente'), null);
  });

  it('getItem é síncrono depois de ready(), como localStorage', async () => {
    files['drawcolor-state.json'] = JSON.stringify({ chave: 'valor' });
    const P = freshPlatform();
    await P.ready();
    // Sem await: os call sites existentes dependem de leitura síncrona.
    assert.strictEqual(P.storage.getItem('chave'), 'valor');
  });

  it('setItem + flushNow grava o estado no arquivo do plugin', async () => {
    const P = freshPlatform();
    await P.ready();

    P.storage.setItem('perfil', 'meu-layout');
    P.storage.flushNow();

    // flushUxp encadeia promises; cede o event loop para elas concluírem.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    assert.ok(files['drawcolor-state.json'], 'arquivo de estado não foi criado');
    assert.strictEqual(JSON.parse(files['drawcolor-state.json']).perfil, 'meu-layout');
  });

  it('estado sobrevive a um ciclo de recarga do painel', async () => {
    const P1 = freshPlatform();
    await P1.ready();
    P1.storage.setItem('layout_active', 'Meu Layout');
    P1.storage.flushNow();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // Simula fechar e reabrir o painel: instância nova, mesmo "disco".
    const P2 = freshPlatform();
    await P2.ready();
    assert.strictEqual(P2.storage.getItem('layout_active'), 'Meu Layout');
  });

  it('removeItem apaga a chave do estado persistido', async () => {
    const P = freshPlatform();
    await P.ready();
    P.storage.setItem('temp', 'x');
    P.storage.removeItem('temp');
    P.storage.flushNow();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    assert.strictEqual(P.storage.getItem('temp'), null);
  });
});

/* ---------------- LayoutStore sobre o adapter ---------------- */

describe('LayoutStore persiste através do Platform Adapter no UXP', () => {
  beforeEach(() => { files = {}; });

  it('grava e recarrega um perfil sem localStorage disponível', async () => {
    const P = freshPlatform();
    await P.ready();

    reload('layout.js');
    const LS = reload('layout-store.js');

    LS.init();
    const name = LS.createProfile('Perfil UXP');
    LS.activateProfile(name);
    LS.setAnchor('harmony.1', { angle: 42, radius: 300 });

    /**
     * Há dois debounces em série: o LayoutStore agrupa setAnchor por 500ms
     * (Requisito 10.2) e só então chama o adapter, que agrupa a escrita em
     * disco por mais 400ms. Esperar o caminho real valida os dois.
     */
    await new Promise((r) => setTimeout(r, 650));
    P.storage.flushNow();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // Novo ciclo: adapter e store recarregados, lendo do mesmo "disco".
    const P2 = freshPlatform();
    await P2.ready();
    reload('layout.js');
    const LS2 = reload('layout-store.js');
    LS2.init();
    LS2.activateProfile(name);

    const anchor = LS2.getActiveProfile().anchors['harmony.1'];
    assert.ok(anchor, 'âncora não foi recarregada');
    assert.strictEqual(anchor.angle, 42);
    assert.strictEqual(anchor.radius, 300);
  });
});

/* ---------------- PSBridge ---------------- */

describe('PSBridge: ponte de cor com o Photoshop', () => {
  beforeEach(() => {
    files = {};
    batchPlayCalls = [];
    foreground = { rgb: { red: 10, green: 20, blue: 30 } };
  });

  it('conecta e adota a cor de foreground atual do Photoshop', async () => {
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

  it('escreve via batchPlay usando o canal verde como "grain"', async () => {
    const P = freshPlatform();
    await P.ready();

    reload('color.js');
    reload('state.js');
    const B = reload('ps-bridge.js');

    B.init();
    batchPlayCalls = [];
    B.push({ r: 200, g: 100, b: 50 });

    assert.strictEqual(batchPlayCalls.length, 1);
    const descriptor = batchPlayCalls[0][0];
    assert.strictEqual(descriptor._obj, 'set');
    assert.strictEqual(descriptor.to._obj, 'RGBColor');
    assert.strictEqual(descriptor.to.red, 200);
    // O descritor de ação do Photoshop nomeia o canal verde de `grain`.
    assert.strictEqual(descriptor.to.grain, 100);
    assert.strictEqual(descriptor.to.blue, 50);

    B.stop();
  });

  it('não reenvia ao Photoshop a cor que veio dele', async () => {
    const P = freshPlatform();
    await P.ready();

    reload('color.js');
    const S = reload('state.js');
    const B = reload('ps-bridge.js');

    B.init();
    batchPlayCalls = [];

    // Mudança marcada como originada no host: não deve gerar escrita.
    S.setRgb(1, 2, 3, { reason: 'host' });
    await new Promise((r) => setTimeout(r, 120));

    assert.strictEqual(batchPlayCalls.length, 0, 'houve loop de escrita para o host');

    B.stop();
  });

  it('uma mudança local gera exatamente uma escrita, com debounce', async () => {
    const P = freshPlatform();
    await P.ready();

    reload('color.js');
    const S = reload('state.js');
    const B = reload('ps-bridge.js');

    B.init();
    batchPlayCalls = [];

    // Simula arraste: várias mudanças em rajada.
    S.setRgb(10, 10, 10);
    S.setRgb(20, 20, 20);
    S.setRgb(30, 30, 30);
    await new Promise((r) => setTimeout(r, 150));

    assert.strictEqual(batchPlayCalls.length, 1, 'debounce não agrupou as escritas');

    B.stop();
  });
});
