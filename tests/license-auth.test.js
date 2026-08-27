/**
 * Tests for License Module — auth session management (task 7.1).
 *
 * Verifica:
 *   - init() carrega sessão do storage e decide status
 *   - login() em modo web gera sessão fake e persiste
 *   - logout() limpa sessão e muda status para unauthenticated
 *   - getToken() retorna token ou null
 *   - isAuthenticated() retorna boolean correto
 *   - onStatusChange() notifica listeners
 *   - getStatus() reflete o estado atual
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

const PLATFORM_PATH = require.resolve(path.join(__dirname, '..', 'demo', 'js', 'platform.js'));
const LICENSE_PATH = require.resolve(path.join(__dirname, '..', 'demo', 'js', 'license.js'));

/** localStorage falso */
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

function freshModules() {
  delete require.cache[PLATFORM_PATH];
  delete require.cache[LICENSE_PATH];
  delete window.Platform;
  delete window.License;
  delete window.Overlay;
  delete window.Fingerprint;
  require(PLATFORM_PATH);
  require(LICENSE_PATH);
  return { Platform: window.Platform, License: window.License };
}

let savedLocalStorage;

beforeEach(() => {
  savedLocalStorage = globalThis.localStorage;
  globalThis.localStorage = fakeLocalStorage();
});

afterEach(() => {
  globalThis.localStorage = savedLocalStorage;
  delete window.Platform;
  delete window.License;
  delete window.Overlay;
  delete window.Fingerprint;
});

/* ---- init() ---- */

describe('License Module: init()', () => {
  it('sets status to unauthenticated when no session stored', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    assert.strictEqual(License.getStatus(), 'unauthenticated');
    assert.strictEqual(License.isAuthenticated(), false);
  });

  it('loads existing valid session from storage and stays authenticated', async () => {
    const ls = fakeLocalStorage();
    const session = {
      uid: 'test-uid',
      email: 'test@example.com',
      refreshToken: 'refresh-123',
      lastTokenRefresh: Date.now()
    };
    // Platform stores everything in a unified JSON object under 'drawcolor-state.json'
    const stateObj = { 'drawcolor-auth-session': JSON.stringify(session) };
    ls.setItem('drawcolor-state.json', JSON.stringify(stateObj));
    globalThis.localStorage = ls;

    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();

    assert.strictEqual(License.isAuthenticated(), true);
    assert.strictEqual(License.getToken(), 'refresh-123');
    assert.strictEqual(License.getEmail(), 'test@example.com');
  });

  it('treats malformed session JSON as unauthenticated', async () => {
    const ls = fakeLocalStorage();
    const stateObj = { 'drawcolor-auth-session': 'not valid json{{{' };
    ls.setItem('drawcolor-state.json', JSON.stringify(stateObj));
    globalThis.localStorage = ls;

    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();

    assert.strictEqual(License.isAuthenticated(), false);
    assert.strictEqual(License.getStatus(), 'unauthenticated');
  });

  it('treats session missing required fields as unauthenticated', async () => {
    const ls = fakeLocalStorage();
    const incomplete = { uid: 'x', email: 'a@b.com' }; // missing refreshToken
    const stateObj = { 'drawcolor-auth-session': JSON.stringify(incomplete) };
    ls.setItem('drawcolor-state.json', JSON.stringify(stateObj));
    globalThis.localStorage = ls;

    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();

    assert.strictEqual(License.isAuthenticated(), false);
    assert.strictEqual(License.getStatus(), 'unauthenticated');
  });

  it('calls Overlay.show with login type when no session', async () => {
    const { License, Platform } = freshModules();
    let overlayState = null;
    window.Overlay = { show: (s) => { overlayState = s; }, hide: () => {} };
    await Platform.ready();
    await License.init();

    assert.deepStrictEqual(overlayState, { type: 'login' });
  });
});

/* ---- login() ---- */

describe('License Module: login() web mode', () => {
  it('generates a fake session and becomes authenticated', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();

    const result = await License.login();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.email, 'demo@drawcolor.test');
    assert.strictEqual(License.isAuthenticated(), true);
    assert.strictEqual(License.getStatus(), 'trial');
  });

  it('persists session to Platform.storage', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    await License.login();

    const stored = Platform.storage.getItem('drawcolor-auth-session');
    assert.ok(stored, 'session should be stored');
    const parsed = JSON.parse(stored);
    assert.strictEqual(parsed.email, 'demo@drawcolor.test');
    assert.ok(parsed.uid.startsWith('web-demo-uid-'));
    assert.ok(parsed.refreshToken.startsWith('fake-refresh-token-'));
    assert.strictEqual(typeof parsed.lastTokenRefresh, 'number');
  });

  it('hides overlay after successful login', async () => {
    const { License, Platform } = freshModules();
    let hidden = false;
    window.Overlay = { show: () => {}, hide: () => { hidden = true; } };
    await Platform.ready();
    await License.init();
    await License.login();

    assert.strictEqual(hidden, true);
  });
});

/* ---- logout() ---- */

describe('License Module: logout()', () => {
  it('clears session and sets status to unauthenticated', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    await License.login(); // authenticate first

    assert.strictEqual(License.isAuthenticated(), true);

    License.logout();

    assert.strictEqual(License.isAuthenticated(), false);
    assert.strictEqual(License.getStatus(), 'unauthenticated');
    assert.strictEqual(License.getToken(), null);
    assert.strictEqual(License.getEmail(), null);
  });

  it('removes session from Platform.storage', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    await License.login();

    License.logout();

    const stored = Platform.storage.getItem('drawcolor-auth-session');
    assert.strictEqual(stored, null);
  });

  it('shows overlay with login type after logout', async () => {
    const { License, Platform } = freshModules();
    let overlayState = null;
    window.Overlay = { show: (s) => { overlayState = s; }, hide: () => {} };
    await Platform.ready();
    await License.init();
    await License.login();

    License.logout();
    assert.deepStrictEqual(overlayState, { type: 'login' });
  });
});

/* ---- getToken() & isAuthenticated() ---- */

describe('License Module: getToken() and isAuthenticated()', () => {
  it('getToken returns null when not authenticated', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    assert.strictEqual(License.getToken(), null);
  });

  it('getToken returns token after login', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    await License.login();
    const token = License.getToken();
    assert.ok(token);
    assert.ok(token.startsWith('fake-refresh-token-'));
  });

  it('isAuthenticated is false before login', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    assert.strictEqual(License.isAuthenticated(), false);
  });

  it('isAuthenticated is true after login', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    await License.login();
    assert.strictEqual(License.isAuthenticated(), true);
  });
});

/* ---- onStatusChange() ---- */

describe('License Module: onStatusChange()', () => {
  it('notifies listener when status changes via login', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();

    const changes = [];
    License.onStatusChange((status) => changes.push(status));

    await License.login();
    assert.ok(changes.includes('trial'));
  });

  it('notifies listener when status changes via logout', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    await License.login();

    const changes = [];
    License.onStatusChange((status) => changes.push(status));

    License.logout();
    assert.ok(changes.includes('unauthenticated'));
  });

  it('does not notify when same status is set again', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();

    const changes = [];
    License.onStatusChange((status) => changes.push(status));

    await License.init(); // sets 'unauthenticated' — but it starts as unauthenticated
    // No notification because status didn't change from its initial value
    assert.strictEqual(changes.length, 0);
  });

  it('ignores non-function callbacks', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    assert.doesNotThrow(() => {
      License.onStatusChange(null);
      License.onStatusChange(42);
      License.onStatusChange('not a fn');
    });
  });
});

/* ---- getStatus() ---- */

describe('License Module: getStatus()', () => {
  it('returns unauthenticated as initial status', async () => {
    const { License } = freshModules();
    assert.strictEqual(License.getStatus(), 'unauthenticated');
  });

  it('returns trial after web login', async () => {
    const { License, Platform } = freshModules();
    await Platform.ready();
    await License.init();
    await License.login();
    assert.strictEqual(License.getStatus(), 'trial');
  });
});

/* ---- getMachineId() ---- */

describe('License Module: getMachineId()', () => {
  it('delegates to Fingerprint.generate() when available', () => {
    const { License } = freshModules();
    window.Fingerprint = { generate: () => 'test-host|test-user' };
    assert.strictEqual(License.getMachineId(), 'test-host|test-user');
  });

  it('returns unknown when Fingerprint is not available', () => {
    const { License } = freshModules();
    delete window.Fingerprint;
    assert.strictEqual(License.getMachineId(), 'unknown');
  });
});
