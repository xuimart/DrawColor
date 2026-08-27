/**
 * Property-based tests for the Coolorus-style harmony model.
 * Validates correctness properties from the design document.
 */
'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fc = require('fast-check');

require('./setup.js');

let S;

function load(rel) {
  const full = require.resolve(path.join(__dirname, '..', 'demo', 'js', rel));
  delete require.cache[full];
  require(full);
}

before(() => {
  load('color.js');
  load('state.js');
  load('layout.js');
  load('wheel.js');
  load('panels.js');
  S = window.AppState;
});

const RUNS = { numRuns: 200 };

/** Arbitraries */
const hueArb = fc.double({ min: 0, max: 360, noNaN: true });
const deltaArb = fc.double({ min: -720, max: 720, noNaN: true });
const svArb = fc.double({ min: 0, max: 100, noNaN: true });
const phiArb = fc.double({ min: 0, max: 180, noNaN: true });
const schemeArb = fc.constantFrom('none', 'comp', 'triad', 'tetra', 'analog', 'accent');
const adjustableSchemeArb = fc.constantFrom('tetra', 'analog', 'accent');

/** Helper: angular distance (shortest path) */
function angleDist(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** Helper: set up state with a scheme and refHue */
function setupScheme(scheme, refHue) {
  S.setHsv({ h: refHue, s: 100, v: 100 });
  S.setScheme(scheme);
  // Ensure refHue is set
  S.state.refHue = refHue;
  S.recomputeMarkerHues();
}

describe('Property 1: Rigid Body Invariant', () => {
  it('rotation preserves inter-marker angular distances', () => {
    fc.assert(fc.property(
      schemeArb, hueArb, deltaArb,
      (scheme, refHue, delta) => {
        if (scheme === 'none') return; // mono has only 1 marker
        setupScheme(scheme, refHue);

        const before = S.getMarkers().map(m => m.hue);
        const beforeDists = [];
        for (let i = 0; i < before.length; i++) {
          for (let j = i + 1; j < before.length; j++) {
            beforeDists.push(angleDist(before[i], before[j]));
          }
        }

        S.rotateSet(delta);

        const after = S.getMarkers().map(m => m.hue);
        const afterDists = [];
        for (let i = 0; i < after.length; i++) {
          for (let j = i + 1; j < after.length; j++) {
            afterDists.push(angleDist(after[i], after[j]));
          }
        }

        for (let k = 0; k < beforeDists.length; k++) {
          assert.ok(
            Math.abs(beforeDists[k] - afterDists[k]) < 0.001,
            `Angular distance changed: ${beforeDists[k]} → ${afterDists[k]}`
          );
        }
      }
    ), RUNS);
  });
});

describe('Property 2: φ Independence from refHue', () => {
  it('rotateSet never changes schemePhi; setSchemePhi never changes refHue', () => {
    fc.assert(fc.property(
      adjustableSchemeArb, hueArb, deltaArb, phiArb,
      (scheme, refHue, delta, phi) => {
        setupScheme(scheme, refHue);
        const phiBefore = { ...S.state.schemePhi };

        S.rotateSet(delta);
        assert.deepStrictEqual(S.state.schemePhi, phiBefore,
          'rotateSet changed schemePhi');

        const refBefore = S.state.refHue;
        S.setSchemePhi(scheme, phi);
        assert.strictEqual(S.state.refHue, refBefore,
          'setSchemePhi changed refHue');
      }
    ), RUNS);
  });
});

describe('Property 3: S/V Isolation', () => {
  it('rotateSet, setSchemePhi, setActiveMarker all preserve every marker S/V', () => {
    fc.assert(fc.property(
      adjustableSchemeArb, hueArb, deltaArb, phiArb,
      (scheme, refHue, delta, phi) => {
        setupScheme(scheme, refHue);

        // Set unique S/V per marker
        S.getMarkers().forEach((m, i) => {
          S.setSV(m.id, 20 + i * 15, 30 + i * 10);
        });
        const svBefore = S.getMarkers().map(m => ({ id: m.id, s: m.s, v: m.v }));

        // rotateSet should preserve S/V
        S.rotateSet(delta);
        let svAfter = S.getMarkers().map(m => ({ id: m.id, s: m.s, v: m.v }));
        assert.deepStrictEqual(svAfter, svBefore, 'rotateSet changed S/V');

        // setSchemePhi should preserve S/V
        S.setSchemePhi(scheme, phi);
        svAfter = S.getMarkers().map(m => ({ id: m.id, s: m.s, v: m.v }));
        assert.deepStrictEqual(svAfter, svBefore, 'setSchemePhi changed S/V');

        // setActiveMarker should preserve S/V
        const markers = S.getMarkers();
        if (markers.length > 1) {
          S.setActiveMarker(markers[1].id);
          svAfter = S.getMarkers().map(m => ({ id: m.id, s: m.s, v: m.v }));
          assert.deepStrictEqual(svAfter, svBefore, 'setActiveMarker changed S/V');
        }
      }
    ), RUNS);
  });
});

describe('Property 4: Quick Swap Geometry Preservation', () => {
  it('setActiveMarker does not alter any marker hue, refHue, or schemePhi', () => {
    fc.assert(fc.property(
      schemeArb, hueArb,
      (scheme, refHue) => {
        if (scheme === 'none') return;
        setupScheme(scheme, refHue);

        const huesBefore = S.getMarkers().map(m => m.hue);
        const refBefore = S.state.refHue;
        const phiBefore = { ...S.state.schemePhi };

        const markers = S.getMarkers();
        if (markers.length > 1) {
          S.setActiveMarker(markers[1].id);
        }

        assert.deepStrictEqual(
          S.getMarkers().map(m => m.hue), huesBefore,
          'setActiveMarker changed marker hues'
        );
        assert.strictEqual(S.state.refHue, refBefore, 'setActiveMarker changed refHue');
        assert.deepStrictEqual(S.state.schemePhi, phiBefore, 'setActiveMarker changed schemePhi');
      }
    ), RUNS);
  });
});

describe('Property 5: φ Clamping', () => {
  it('stored φ is always within scheme valid range', () => {
    fc.assert(fc.property(
      adjustableSchemeArb, phiArb,
      (scheme, phi) => {
        setupScheme(scheme, 0);
        S.setSchemePhi(scheme, phi);

        const range = S.SCHEME_DEFS[scheme].phiRange;
        const stored = S.state.schemePhi[scheme];
        assert.ok(stored >= range[0] && stored <= range[1],
          `φ=${stored} outside range [${range[0]}, ${range[1]}]`);
      }
    ), RUNS);
  });
});

describe('Property 6: Marker Count Consistency', () => {
  it('marker count equals scheme offset count after setScheme', () => {
    fc.assert(fc.property(
      schemeArb, hueArb,
      (scheme, refHue) => {
        setupScheme(scheme, refHue);
        const phi = S.state.schemePhi[scheme] || 0;
        const expected = S.SCHEME_DEFS[scheme].offsets(phi).length;
        assert.strictEqual(S.getMarkers().length, expected,
          `Marker count ${S.getMarkers().length} != expected ${expected} for scheme ${scheme}`);
      }
    ), RUNS);
  });
});

describe('Property 7: Single Active Invariant', () => {
  it('exactly one marker has isActive === true after any operation', () => {
    fc.assert(fc.property(
      schemeArb, hueArb, deltaArb, phiArb,
      (scheme, refHue, delta, phi) => {
        setupScheme(scheme, refHue);

        function checkSingle(context) {
          const active = S.getMarkers().filter(m => m.isActive);
          assert.strictEqual(active.length, 1,
            `${context}: ${active.length} active markers`);
        }

        checkSingle('after setup');

        S.rotateSet(delta);
        checkSingle('after rotateSet');

        if (S.hasDeformHandle()) {
          S.setSchemePhi(scheme, phi);
          checkSingle('after setSchemePhi');
        }

        const markers = S.getMarkers();
        if (markers.length > 1) {
          S.setActiveMarker(markers[markers.length - 1].id);
          checkSingle('after setActiveMarker');
        }
      }
    ), RUNS);
  });
});

describe('Property 8: Hue Derivation', () => {
  it('marker[i].hue === (refHue + offsets(phi)[i]) mod 360', () => {
    fc.assert(fc.property(
      schemeArb, hueArb,
      (scheme, refHue) => {
        setupScheme(scheme, refHue);
        const phi = S.state.schemePhi[scheme] || 0;
        const offsets = S.SCHEME_DEFS[scheme].offsets(phi);
        const markers = S.getMarkers();

        for (let i = 0; i < markers.length; i++) {
          const expected = ((refHue + offsets[i]) % 360 + 360) % 360;
          assert.ok(
            Math.abs(markers[i].hue - expected) < 0.001,
            `Marker ${i}: hue ${markers[i].hue} != expected ${expected}`
          );
        }
      }
    ), RUNS);
  });
});

describe('Property 9: Handle Visibility', () => {
  it('hasDeformHandle() returns true iff scheme is analog, accent, or tetra', () => {
    fc.assert(fc.property(
      schemeArb, hueArb,
      (scheme, refHue) => {
        setupScheme(scheme, refHue);
        const shouldHave = ['analog', 'accent', 'tetra'].includes(scheme);
        assert.strictEqual(S.hasDeformHandle(), shouldHave,
          `hasDeformHandle() for ${scheme} should be ${shouldHave}`);
      }
    ), RUNS);
  });
});

describe('Property 10: Rotation Commutativity', () => {
  it('rotateSet(a); rotateSet(b) produces same refHue as rotateSet(a + b)', () => {
    fc.assert(fc.property(
      schemeArb, hueArb, deltaArb, deltaArb,
      (scheme, refHue, a, b) => {
        // Path 1: two separate rotations
        setupScheme(scheme, refHue);
        S.rotateSet(a);
        S.rotateSet(b);
        const hue1 = S.state.refHue;

        // Path 2: single combined rotation
        setupScheme(scheme, refHue);
        S.rotateSet(a + b);
        const hue2 = S.state.refHue;

        // Compare with angular tolerance (floating point)
        const diff = angleDist(hue1, hue2);
        assert.ok(diff < 0.001,
          `rotateSet(${a})+rotateSet(${b}) gave ${hue1}, rotateSet(${a+b}) gave ${hue2}`);
      }
    ), RUNS);
  });
});
