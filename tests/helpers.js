/**
 * Shared test helpers and fast-check arbitraries for layout parity tests.
 */
'use strict';

const fc = require('fast-check');

// Valid anchor arbitrary
const anchorArb = fc.record({
  angle: fc.double({ min: 0, max: 359.999, noNaN: true }),
  radius: fc.double({ min: 0, max: 700, noNaN: true })
});

// Scale factor arbitrary (valid range)
const scaleArb = fc.double({ min: 320 / 628, max: 1200 / 628, noNaN: true });

// Width arbitrary (including out-of-range values)
const widthArb = fc.double({ min: 0, max: 2000, noNaN: true });

// Point within panel bounds (for a given scale)
function pointInPanelArb(scale) {
  const s = scale || 1;
  return fc.record({
    x: fc.double({ min: 0, max: 628 * s, noNaN: true }),
    y: fc.double({ min: 0, max: 907 * s, noNaN: true })
  });
}

// Profile name arbitrary (valid: 1-40 chars)
const validNameArb = fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0);

// Invalid name arbitrary (0 or >40 chars)
const invalidNameArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 41, maxLength: 80 })
);

/** Ids dos controles móveis, na mesma composição de LAYOUT.ANCHORS. */
const CONTROL_IDS = [
  'harmony.1', 'harmony.2', 'harmony.3', 'harmony.4', 'harmony.5', 'harmony.6',
  'sat.gamutmask', 'sat.shape', 'hex.field',
  'history.redo', 'history.undo',
  'rail.dial.temperature', 'rail.dial.brightness', 'rail.lumlock', 'rail.valuecheck',
  'swatch.fg', 'swatch.bg', 'swatch.swap'
];

// Generate a valid profile (todas as âncoras conhecidas)
const fullProfileArb = fc.record({
  name: validNameArb,
  anchors: fc.constant(CONTROL_IDS).chain(ids => {
    const entries = ids.map(id => fc.tuple(fc.constant(id), anchorArb));
    return fc.tuple(...entries).map(pairs => {
      const obj = {};
      pairs.forEach(([id, anchor]) => { obj[id] = anchor; });
      return obj;
    });
  })
});

// Generate a partial profile (subset of anchors)
const partialProfileArb = fc.record({
  name: validNameArb,
  anchors: fc.subarray(CONTROL_IDS, { minLength: 1 }).chain(ids => {
    const entries = ids.map(id => fc.tuple(fc.constant(id), anchorArb));
    return fc.tuple(...entries).map(pairs => {
      const obj = {};
      pairs.forEach(([id, anchor]) => { obj[id] = anchor; });
      return obj;
    });
  })
});

module.exports = {
  fc,
  anchorArb,
  scaleArb,
  widthArb,
  pointInPanelArb,
  validNameArb,
  invalidNameArb,
  CONTROL_IDS,
  fullProfileArb,
  partialProfileArb
};
