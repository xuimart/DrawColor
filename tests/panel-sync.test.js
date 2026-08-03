/**
 * PanelSync: ponte de cor entre o painel ancorado e a janela Modeless.
 *
 * As duas janelas são instâncias separadas da extensão, sem JS em comum. O que
 * as liga é o barramento de eventos do CSXS. Aqui simulamos esse barramento:
 * `dispatchEvent` entrega a mensagem a todos os listeners registrados,
 * inclusive ao da própria janela que despachou — que é justamente o
 * comportamento capaz de criar um loop se a marca de origem falhar.
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

let listeners = {};
let dispatched = [];
let savedLocalStorage;

/** Barramento falso: dispatch alimenta todos os listeners do mesmo tipo. */
function installCepMock() {
  listeners = {};
  dispatched = [];

  window.__adobe_cep__ = {
    evalScript: (_script, cb) => cb(''),
    getHostEnvironment: () => JSON.stringify({ appName: 'PHXS', appVersion: '26.0.0' }),
    getExtensionId: () => 'com.drawcolor.colorwheel.panel',
    requestOpenExtension: (id) => { dispatched.push({ open: id }); },
    dispatchEvent: (event) => {
      dispatched.push(event);
      (listeners[event.type] || []).forEach((fn) => fn(event));
    },
    addEventListener: (type, fn) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    }
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
  'panel-sync.js': 'PanelSync'
};

function reload(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
  const name = GLOBALS[rel];
  return name ? window[name] : undefined;
}

function loadCsInterface() {
  const full = require.resolve(path.join(__dirname, '..', 'cep', 'lib', 'CSInterface.js'));
  delete require.cache[full];
  require(full);
}

/** Sobe o núcleo na ordem do index.html e devolve estado + ponte. */
async function boot() {
  delete window.Platform;
  delete globalThis.Platform;
  const P = reload('platform.js');
  await P.ready();
  reload('color.js');
  const S = reload('state.js');
  const Sync = reload('panel-sync.js');
  return { S, Sync };
}

beforeEach(() => {
  savedLocalStorage = globalThis.localStorage;
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
  delete window.CSEvent;
  delete globalThis.CSEvent;
});

describe('PanelSync: ponte entre as janelas da extensão', () => {
  it('ativa no CEP quando o barramento de eventos existe', async () => {
    const { Sync } = await boot();
    assert.strictEqual(Sync.init(), true);
    assert.strictEqual(Sync.isActive(), true);
    Sync.stop();
  });

  it('não ativa fora do CEP: não há segunda janela', async () => {
    delete window.__adobe_cep__;
    const { Sync } = await boot();
    assert.strictEqual(Sync.init(), false);
    assert.strictEqual(Sync.isActive(), false);
  });

  it('não ativa quando o host não oferece barramento de eventos', async () => {
    delete window.__adobe_cep__.dispatchEvent;
    const { Sync } = await boot();
    assert.strictEqual(Sync.init(), false);
  });

  it('publica a cor quando ela muda localmente', async () => {
    const { S, Sync } = await boot();
    Sync.init();
    dispatched = [];

    S.setHsv({ h: 210, s: 80, v: 60 });
    await new Promise((r) => setTimeout(r, 80));

    const msgs = dispatched.filter((e) => e.type === Sync.EVENT_TYPE);
    assert.strictEqual(msgs.length, 1);
    const payload = JSON.parse(msgs[0].data);
    assert.ok(Math.abs(payload.h - 210) < 0.001);
    assert.ok(Math.abs(payload.s - 80) < 0.001);
    assert.ok(Math.abs(payload.v - 60) < 0.001);
    Sync.stop();
  });

  it('agrupa um arraste numa única publicação', async () => {
    const { S, Sync } = await boot();
    Sync.init();
    dispatched = [];

    S.setHsv({ h: 10, s: 50, v: 50 });
    S.setHsv({ h: 20, s: 50, v: 50 });
    S.setHsv({ h: 30, s: 50, v: 50 });
    await new Promise((r) => setTimeout(r, 90));

    const msgs = dispatched.filter((e) => e.type === Sync.EVENT_TYPE);
    assert.strictEqual(msgs.length, 1, 'debounce não agrupou as publicações');
    Sync.stop();
  });

  it('ignora a própria mensagem de volta, sem loop', async () => {
    const { S, Sync } = await boot();
    Sync.init();

    S.setHsv({ h: 120, s: 70, v: 70 });
    await new Promise((r) => setTimeout(r, 80));

    // O barramento entregou o evento de volta ao próprio remetente. Se a marca
    // de origem falhasse, aplicar a cor geraria uma nova publicação.
    dispatched = [];
    await new Promise((r) => setTimeout(r, 80));
    const echo = dispatched.filter((e) => e.type === Sync.EVENT_TYPE);
    assert.strictEqual(echo.length, 0, 'houve eco entre as janelas');
    Sync.stop();
  });

  it('aplica a cor recebida da outra janela', async () => {
    const { S, Sync } = await boot();
    Sync.init();

    const applied = Sync.receive(JSON.stringify({ from: 'outra-janela', h: 300, s: 40, v: 90 }));
    assert.strictEqual(applied, true);

    const hsv = S.getHsv();
    assert.ok(Math.abs(hsv.h - 300) < 0.001);
    assert.ok(Math.abs(hsv.s - 40) < 0.001);
    assert.ok(Math.abs(hsv.v - 90) < 0.001);
    Sync.stop();
  });

  it('não republica a cor que veio da outra janela', async () => {
    const { Sync } = await boot();
    Sync.init();
    dispatched = [];

    Sync.receive(JSON.stringify({ from: 'outra-janela', h: 45, s: 55, v: 65 }));
    await new Promise((r) => setTimeout(r, 80));

    const msgs = dispatched.filter((e) => e.type === Sync.EVENT_TYPE);
    assert.strictEqual(msgs.length, 0, 'a cor do par foi reenviada, criando ping-pong');
    Sync.stop();
  });

  it('descarta payload malformado sem lançar', async () => {
    const { Sync } = await boot();
    Sync.init();

    assert.strictEqual(Sync.parse(null), null);
    assert.strictEqual(Sync.parse(''), null);
    assert.strictEqual(Sync.parse('não é json'), null);
    assert.strictEqual(Sync.parse('{"from":"x"}'), null);
    assert.strictEqual(Sync.parse('{"from":"x","h":"210","s":1,"v":1}'), null);
    assert.strictEqual(Sync.parse('[1,2,3]'), null);
    assert.strictEqual(Sync.receive('{"from":"x","h":null,"s":1,"v":1}'), false);
    Sync.stop();
  });

  it('aceita o evento no formato que o CEP entrega, com data em string', async () => {
    const { S, Sync } = await boot();
    Sync.init();

    Sync.receive({ type: Sync.EVENT_TYPE, data: JSON.stringify({ from: 'par', h: 15, s: 25, v: 35 }) });

    const hsv = S.getHsv();
    assert.ok(Math.abs(hsv.h - 15) < 0.001);
    Sync.stop();
  });
});

describe('CSInterface: superfície usada pela janela Modeless', () => {
  it('requestOpenExtension delega para a ponte nativa', () => {
    const cs = new window.CSInterface();
    assert.strictEqual(cs.requestOpenExtension('com.drawcolor.colorwheel.tools', ''), true);
    assert.deepStrictEqual(dispatched[0], { open: 'com.drawcolor.colorwheel.tools' });
  });

  it('serializa data de objeto para string ao despachar', () => {
    const cs = new window.CSInterface();
    const evt = new window.CSEvent('com.drawcolor.teste', 'APPLICATION');
    evt.data = { a: 1 };
    cs.dispatchEvent(evt);
    assert.strictEqual(typeof dispatched[0].data, 'string');
    assert.deepStrictEqual(JSON.parse(dispatched[0].data), { a: 1 });
  });

  it('reporta falha quando a ponte nativa não existe, em vez de lançar', () => {
    delete window.__adobe_cep__;
    const cs = new window.CSInterface();
    assert.strictEqual(cs.requestOpenExtension('x'), false);
    assert.strictEqual(cs.dispatchEvent(new window.CSEvent('t', 'APPLICATION')), false);
    assert.strictEqual(cs.addEventListener('t', () => {}), false);
  });
});
