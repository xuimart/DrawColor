'use strict';

require('./setup.js');
require('../demo/js/layout.js');
require('../demo/js/layout-serializer.js');

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { fc, anchorArb, CONTROL_IDS, validNameArb } = require('./helpers.js');

const LZ = window.LayoutSerializer;

describe('Feature: layout-parity-editor, Property 14: Export/Import Round-Trip', function() {
  /**
   * Validates: Requirements 11.1, 11.2, 11.4
   */
  it('import(export(P)).anchors ≈ P.anchors within 0.001', function() {
    // Generate a full profile: name + all 18 anchors
    var profileArb = fc.record({
      name: validNameArb,
      anchors: fc.tuple(...CONTROL_IDS.map(function(id) {
        return fc.tuple(fc.constant(id), anchorArb);
      })).map(function(pairs) {
        var obj = {};
        pairs.forEach(function(p) { obj[p[0]] = p[1]; });
        return obj;
      })
    });

    fc.assert(
      fc.property(profileArb, function(profile) {
        var json = LZ.exportProfile(profile);
        var result = LZ.importProfile(json);
        
        if (!result.ok) return false;
        
        var imported = result.profile;
        var ids = Object.keys(profile.anchors);
        
        // Same set of control IDs
        if (Object.keys(imported.anchors).length !== ids.length) return false;
        
        // Values within 0.001 (due to toFixed(3))
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i];
          if (!imported.anchors[id]) return false;
          if (Math.abs(imported.anchors[id].angle - profile.anchors[id].angle) > 0.001) return false;
          if (Math.abs(imported.anchors[id].radius - profile.anchors[id].radius) > 0.001) return false;
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: layout-parity-editor, Property 16: Partial Import with Unknown Control IDs', function() {
  /**
   * Validates: Requirements 11.8
   */
  it('imports known IDs, discards unknown IDs, reports count', function() {
    fc.assert(
      fc.property(
        fc.subarray(CONTROL_IDS, { minLength: 1, maxLength: 10 }),
        // uniqueArray: IDs repetidos colapsariam como chave de objeto, o que
        // tornaria a contagem de descartados inverificável. '__proto__' fica
        // de fora porque atribuir essa chave não cria propriedade própria —
        // esse caso tem um teste dedicado abaixo.
        fc.uniqueArray(
          fc.string({ minLength: 3, maxLength: 20 }).filter(function(s) {
            return CONTROL_IDS.indexOf(s) === -1 && s !== '__proto__';
          }),
          { minLength: 1, maxLength: 5 }
        ),
        function(knownIds, unknownIds) {
          var controls = {};
          
          // Add known entries with valid values
          for (var i = 0; i < knownIds.length; i++) {
            controls[knownIds[i]] = { angle: 10 + i, radius: 100 + i };
          }
          
          // Add unknown entries with valid values
          for (var j = 0; j < unknownIds.length; j++) {
            controls[unknownIds[j]] = { angle: 20 + j, radius: 200 + j };
          }
          
          var json = JSON.stringify({
            version: 1,
            name: 'mixed',
            controls: controls
          });
          
          var result = LZ.importProfile(json);
          
          if (!result.ok) return false;
          
          /**
           * hasOwnProperty, não acesso truthy: IDs gerados como
           * 'isPrototypeOf' ou 'toLocaleString' existem em Object.prototype,
           * então `anchors[id]` devolveria a função herdada e o teste
           * concluiria que a chave foi importada quando não foi.
           */
          var own = function (obj, key) {
            return Object.prototype.hasOwnProperty.call(obj, key);
          };

          // Known IDs should be imported
          for (var k = 0; k < knownIds.length; k++) {
            if (!own(result.profile.anchors, knownIds[k])) return false;
          }

          // Unknown IDs should not be in the result
          for (var m = 0; m < unknownIds.length; m++) {
            if (own(result.profile.anchors, unknownIds[m])) return false;
          }
          
          // Discarded count should match unknown count
          if (result.discarded !== unknownIds.length) return false;
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: layout-parity-editor, Property 15: Invalid Import Rejection', function() {
  /**
   * Validates: Requirements 11.5, 11.6, 11.7
   */
  it('rejects non-JSON text', function() {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter(function(s) {
          try { JSON.parse(s); return false; } catch(e) { return true; }
        }),
        function(text) {
          var result = LZ.importProfile(text);
          return result.ok === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects JSON with wrong version', function() {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        function(version) {
          var json = JSON.stringify({ version: version, name: 'test', controls: {} });
          var result = LZ.importProfile(json);
          return result.ok === false;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects JSON with out-of-range angle or radius', function() {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1000, max: -0.001, noNaN: true }),
          fc.double({ min: 360.001, max: 1000, noNaN: true })
        ),
        fc.oneof(
          fc.double({ min: -1000, max: -0.001, noNaN: true }),
          fc.double({ min: 700.001, max: 2000, noNaN: true })
        ),
        function(badAngle, badRadius) {
          // Test bad angle
          var json1 = JSON.stringify({
            version: 1,
            name: 'test',
            controls: { 'harmony.1': { angle: badAngle, radius: 100 } }
          });
          var r1 = LZ.importProfile(json1);

          // Test bad radius
          var json2 = JSON.stringify({
            version: 1,
            name: 'test',
            controls: { 'harmony.1': { angle: 10, radius: badRadius } }
          });
          var r2 = LZ.importProfile(json2);

          return r1.ok === false && r2.ok === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Regressão: prototype pollution via JSON importado.
 *
 * A implementação original testava IDs conhecidos com `knownSet[id]` sobre um
 * objeto literal. Para id = '__proto__' isso devolve Object.prototype, que é
 * truthy, então a entrada era tratada como ID válido e gravada em `anchors`.
 * Chaves herdadas como 'constructor', 'toString' e 'valueOf' tinham o mesmo
 * problema. JSON.parse cria essas chaves como propriedades próprias, então
 * elas chegam ao laço de importação.
 *
 * Validates: Requirements 11.8
 */
describe('Feature: layout-parity-editor, Property 16b: Prototype keys are not valid control IDs', function() {
  it('descarta __proto__ e outras chaves herdadas sem poluir o protótipo', function() {
    var dangerous = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'];

    dangerous.forEach(function(key) {
      // JSON montado como texto: JSON.parse cria a chave como propriedade
      // própria, ao contrário de uma atribuição direta.
      var json = '{"version":1,"name":"evil","controls":{' +
        JSON.stringify(key) + ':{"angle":10,"radius":100},' +
        '"harmony.1":{"angle":20,"radius":200}}}';

      var result = LZ.importProfile(json);

      assert.strictEqual(result.ok, true, key + ': import deveria ter sucesso');
      assert.strictEqual(result.discarded, 1, key + ': deveria descartar 1 entrada');
      assert.ok(result.profile.anchors['harmony.1'], key + ': harmony.1 deveria entrar');

      // A chave perigosa não virou âncora própria
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(result.profile.anchors, key),
        false,
        key + ': não deveria existir como âncora'
      );
    });

    // O protótipo global segue intacto
    assert.strictEqual({}.angle, undefined, 'Object.prototype foi poluído');
    assert.strictEqual({}.radius, undefined, 'Object.prototype foi poluído');
  });
});
