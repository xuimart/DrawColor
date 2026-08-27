/**
 * fingerprint.test.js — Unit tests for the Machine Fingerprint Generator.
 *
 * Testa a geração de fingerprint em cada ambiente (web, cep, uxp) e a
 * extração do display name (hostname).
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('./setup.js');

/* ---------------- Helpers ---------------- */

function reload(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
  return window[rel.replace('.js', '').replace(/^./, c => c.toUpperCase())];
}

function loadFingerprint() {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', 'fingerprint.js'));
  delete require.cache[full];
  require(full);
  return window.Fingerprint;
}

function freshPlatform() {
  delete window.Platform;
  delete globalThis.Platform;
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', 'platform.js'));
  delete require.cache[full];
  require(full);
  return window.Platform;
}

/* ---------------- Web environment (default) ---------------- */

describe('Fingerprint: Web (demo mode)', () => {
  beforeEach(() => {
    // Ensure clean environment — no CEP or UXP markers
    delete window.__adobe_cep__;
    delete globalThis.__adobe_cep__;
    freshPlatform();
  });

  afterEach(() => {
    delete window.Fingerprint;
  });

  it('generate() returns fixed web-demo|anonymous', () => {
    const FP = loadFingerprint();
    assert.strictEqual(FP.generate(), 'web-demo|anonymous');
  });

  it('getDisplayName() returns web-demo', () => {
    const FP = loadFingerprint();
    assert.strictEqual(FP.getDisplayName(), 'web-demo');
  });

  it('generate() is deterministic across multiple calls', () => {
    const FP = loadFingerprint();
    const a = FP.generate();
    const b = FP.generate();
    const c = FP.generate();
    assert.strictEqual(a, b);
    assert.strictEqual(b, c);
  });
});

/* ---------------- CEP environment ---------------- */

describe('Fingerprint: CEP environment', () => {
  let savedCepNode;

  beforeEach(() => {
    savedCepNode = globalThis.cep_node;

    // Mock CEP environment
    window.__adobe_cep__ = { evalScript: () => {}, getHostEnvironment: () => '{}' };
    globalThis.cep_node = {
      require: function (mod) {
        if (mod === 'os') {
          return {
            hostname: () => 'WORKSTATION-42',
            userInfo: () => ({ username: 'rafi' })
          };
        }
        throw new Error('Module not found: ' + mod);
      }
    };

    freshPlatform();
  });

  afterEach(() => {
    delete window.__adobe_cep__;
    delete globalThis.__adobe_cep__;
    globalThis.cep_node = savedCepNode;
    delete window.Fingerprint;
  });

  it('generate() returns hostname|username from cep_node os module', () => {
    const FP = loadFingerprint();
    assert.strictEqual(FP.generate(), 'WORKSTATION-42|rafi');
  });

  it('getDisplayName() returns hostname only', () => {
    const FP = loadFingerprint();
    assert.strictEqual(FP.getDisplayName(), 'WORKSTATION-42');
  });

  it('fingerprint format uses pipe separator', () => {
    const FP = loadFingerprint();
    const parts = FP.generate().split('|');
    assert.strictEqual(parts.length, 2);
    assert.strictEqual(parts[0], 'WORKSTATION-42');
    assert.strictEqual(parts[1], 'rafi');
  });
});

/* ---------------- UXP environment ---------------- */

describe('Fingerprint: UXP environment', () => {
  let savedPlatform;
  const os = require('os');
  const expectedHostname = os.hostname();
  const expectedUsername = os.userInfo().username;

  beforeEach(() => {
    // Remove CEP marker to avoid CEP detection
    delete window.__adobe_cep__;
    delete globalThis.__adobe_cep__;

    // Load platform first (will detect as 'web' in Node), then override env
    freshPlatform();
    savedPlatform = window.Platform;

    // Override Platform.env to simulate UXP detection
    // (actual UXP detection is tested in platform-uxp.test.js)
    window.Platform = Object.assign({}, savedPlatform, { env: 'uxp', isUxp: true, isWeb: false });
  });

  afterEach(() => {
    window.Platform = savedPlatform;
    delete window.Fingerprint;
  });

  it('generate() returns hostname|username from require os module', () => {
    // In UXP, require('os') works the same as Node. In the test environment,
    // the real os module is used — which proves the code path is correct.
    const FP = loadFingerprint();
    assert.strictEqual(FP.generate(), expectedHostname + '|' + expectedUsername);
  });

  it('getDisplayName() returns hostname only', () => {
    const FP = loadFingerprint();
    assert.strictEqual(FP.getDisplayName(), expectedHostname);
  });

  it('generate() does NOT return web-demo fallback', () => {
    const FP = loadFingerprint();
    assert.notStrictEqual(FP.generate(), 'web-demo|anonymous');
  });

  it('fingerprint uses pipe separator with two parts', () => {
    const FP = loadFingerprint();
    const parts = FP.generate().split('|');
    assert.strictEqual(parts.length, 2);
    assert.ok(parts[0].length > 0, 'hostname should not be empty');
    assert.ok(parts[1].length > 0, 'username should not be empty');
  });
});
