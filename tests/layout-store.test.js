'use strict';

require('./setup.js');

// Mock localStorage for LayoutStore tests
var store = {};
globalThis.localStorage = {
  getItem: function(key) { return store[key] || null; },
  setItem: function(key, value) { store[key] = String(value); },
  removeItem: function(key) { delete store[key]; },
  clear: function() { store = {}; }
};

require('../demo/js/layout.js');
require('../demo/js/layout-store.js');

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { fc, anchorArb, CONTROL_IDS } = require('./helpers.js');

const LS = window.LayoutStore;
const L = window.LAYOUT;

describe('Feature: layout-parity-editor, Property 11: Profile Save/Load Round-Trip', function() {
  beforeEach(function() {
    store = {};  // Clear mock localStorage
    LS.init();   // Re-initialize
  });

  it('save then load reproduces identical anchors; missing ones filled from default', function() {
    fc.assert(
      fc.property(
        fc.subarray(CONTROL_IDS, { minLength: 1, maxLength: CONTROL_IDS.length }),
        fc.array(anchorArb, { minLength: 1, maxLength: CONTROL_IDS.length }),
        function(ids, anchors) {
          // Clear and re-init for isolation
          store = {};
          LS.init();

          // Create a user profile and activate it
          var name = LS.createProfile('Test');
          LS.activateProfile(name);

          // Set a subset of anchors in memory
          var count = Math.min(ids.length, anchors.length);
          for (var i = 0; i < count; i++) {
            LS.setAnchor(ids[i], anchors[i]);
          }

          // setAnchor uses a 500ms debounce, so the data is in memory but not yet persisted.
          // To force a persist, call activateProfile again (which calls persist() directly).
          LS.activateProfile(name);

          // Now re-init to simulate a fresh page load from localStorage
          LS.init();

          // Activate the saved profile
          LS.activateProfile(name);

          var loaded = LS.getActiveProfile();

          // Check: anchors that were set should be preserved
          for (var i = 0; i < count; i++) {
            var a = loaded.anchors[ids[i]];
            if (!a) return false;
            if (Math.abs(a.angle - anchors[i].angle) > 0.001) return false;
            if (Math.abs(a.radius - anchors[i].radius) > 0.001) return false;
          }

          // Check: all 18 control IDs must be present (missing ones filled from default)
          for (var j = 0; j < CONTROL_IDS.length; j++) {
            var id = CONTROL_IDS[j];
            if (!loaded.anchors[id]) return false;

            // If this control wasn't explicitly set, it should match the default
            var wasSet = false;
            for (var k = 0; k < count; k++) {
              if (ids[k] === id) { wasSet = true; break; }
            }
            if (!wasSet) {
              var def = L.ANCHORS[id];
              if (Math.abs(loaded.anchors[id].angle - def.angle) > 0.001) return false;
              if (Math.abs(loaded.anchors[id].radius - def.radius) > 0.001) return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: layout-parity-editor, Property 12: Name Validation and Deduplication', function() {
  beforeEach(function() {
    store = {};
    LS.init();
  });

  it('accepts names 1-40 chars, rejects 0 or >40', function() {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),                                    // empty: should reject
          fc.string({ minLength: 1, maxLength: 40 }),        // valid: should accept
          fc.string({ minLength: 41, maxLength: 80 })        // too long: should reject
        ),
        function(name) {
          store = {};
          LS.init();
          var result = LS.createProfile(name);
          if (name.length >= 1 && name.length <= 40) {
            return result !== null && typeof result === 'string';
          } else {
            return result === null;
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('duplicate names get unique suffix', function() {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(function(s) { return s.trim().length > 0; }),
        fc.integer({ min: 2, max: 5 }),
        function(name, count) {
          store = {};
          LS.init();
          var names = [];
          for (var i = 0; i < count; i++) {
            var created = LS.createProfile(name);
            if (created === null) return false;
            names.push(created);
          }
          // All names should be unique
          var unique = new Set(names);
          return unique.size === names.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: layout-parity-editor, Property 13: Reset Restores Default', function() {
  beforeEach(function() {
    store = {};
    LS.init();
  });

  it('after resetToDefault, all anchors match Default_Profile', function() {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.constantFrom(...CONTROL_IDS),
            anchor: anchorArb
          }),
          { minLength: 1, maxLength: 10 }
        ),
        function(modifications) {
          store = {};
          LS.init();
          
          // Create and activate a user profile
          var name = LS.createProfile('Modified');
          LS.activateProfile(name);
          
          // Apply random modifications
          for (var i = 0; i < modifications.length; i++) {
            LS.setAnchor(modifications[i].id, modifications[i].anchor);
          }
          
          // Reset to default
          LS.resetToDefault();
          
          var profile = LS.getActiveProfile();
          
          // All anchors should match default
          for (var j = 0; j < CONTROL_IDS.length; j++) {
            var id = CONTROL_IDS[j];
            var def = L.ANCHORS[id];
            var a = profile.anchors[id];
            if (!a || !def) return false;
            if (Math.abs(a.angle - def.angle) > 0.001) return false;
            if (Math.abs(a.radius - def.radius) > 0.001) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Regressão: nomes de perfil que colidem com membros de Object.prototype.
 *
 * O Requisito 10.6 manda aceitar qualquer nome de 1 a 40 caracteres. Com o
 * mapa de perfis em `{}`, '__proto__' viraria atribuição de protótipo em vez
 * de entrada, e 'constructor' / 'toString' / 'valueOf' apareceriam como já
 * existentes por herança — quebrando criação, ativação e deduplicação.
 * O mapa passou a ser Object.create(null).
 *
 * Validates: Requirements 10.6, 10.8
 */
describe('Feature: layout-parity-editor, Property 12b: Nomes que colidem com Object.prototype', function() {
  const DANGEROUS = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf'];

  beforeEach(function() {
    store = {};
    LS.init();
  });

  it('aceita esses nomes como perfis válidos', function() {
    DANGEROUS.forEach(function(name) {
      store = {};
      LS.init();
      const created = LS.createProfile(name);
      assert.strictEqual(created, name, name + ' deveria ser aceito como nome');
      assert.ok(LS.listProfiles().indexOf(name) !== -1, name + ' deveria estar na lista');
    });
  });

  it('deduplica esses nomes como qualquer outro', function() {
    DANGEROUS.forEach(function(name) {
      store = {};
      LS.init();
      const first = LS.createProfile(name);
      const second = LS.createProfile(name);
      assert.strictEqual(first, name);
      assert.strictEqual(second, name + ' (2)', name + ' deveria receber sufixo');
      assert.notStrictEqual(first, second);
    });
  });

  it('ativa e grava âncoras nesses perfis', function() {
    DANGEROUS.forEach(function(name) {
      store = {};
      LS.init();
      LS.createProfile(name);
      LS.activateProfile(name);
      assert.strictEqual(LS.getActiveProfile().name, name, name + ' deveria ativar');

      LS.setAnchor('harmony.1', { angle: 77, radius: 250 });
      const anchor = LS.getActiveProfile().anchors['harmony.1'];
      assert.strictEqual(anchor.angle, 77, name + ': âncora não foi gravada');
      assert.strictEqual(anchor.radius, 250);
    });
  });

  it('exclui esses perfis e volta para o padrão', function() {
    DANGEROUS.forEach(function(name) {
      store = {};
      LS.init();
      LS.createProfile(name);
      LS.activateProfile(name);
      LS.deleteProfile(name);

      assert.strictEqual(LS.getActiveProfile().name, LS.DEFAULT_PROFILE_NAME,
        name + ': deveria voltar ao perfil padrão');
      assert.ok(LS.listProfiles().indexOf(name) === -1, name + ': deveria ter saído da lista');
    });
  });

  it('não vaza para o protótipo global', function() {
    store = {};
    LS.init();
    LS.createProfile('__proto__');
    LS.activateProfile('__proto__');
    LS.setAnchor('harmony.1', { angle: 5, radius: 10 });

    assert.strictEqual({}.angle, undefined, 'Object.prototype foi poluído');
    assert.strictEqual([].angle, undefined, 'Array herdou poluição');
  });
});
