'use strict';

require('./setup.js');
require('../demo/js/layout.js');
require('../demo/js/snap.js');

const { describe, it } = require('node:test');
const { fc } = require('./helpers.js');

const SE = window.SnapEngine;

/**
 * Property 7: Angle Snap Threshold
 * Validates: Requirements 9.1
 *
 * Every angle in [0, 360) is at most 2.5° from its nearest 5° multiple
 * (the midpoint between two multiples is exactly 2.5°), so the snap
 * threshold of ≤ 2.5° means every angle will always snap.
 */
describe('Feature: layout-parity-editor, Property 7: Angle Snap Threshold', function() {
  it('snaps to nearest 5° iff distance ≤ 2.5°', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 359.999, noNaN: true }),
        function(angle) {
          var anchor = { angle: angle, radius: 200 };
          var result = SE.snap(anchor, [], { altKey: false });

          // Find nearest 5° multiple
          var nearest5 = Math.round(angle / 5) * 5;
          if (nearest5 >= 360) nearest5 = 0;

          // Every angle snaps to nearest 5° since max distance is always ≤ 2.5°
          return result.snappedAngle === true && result.anchor.angle === nearest5;
        }
      ),
      { numRuns: 500 }
    );
  });
});

/**
 * Property 8: Radius Snap to Nearest Visible Control
 * Validates: Requirements 9.2
 *
 * The snap engine rounds the radius to the nearest visible control radius
 * when the distance is ≤ 6 units, otherwise leaves it unchanged.
 */
describe('Feature: layout-parity-editor, Property 8: Radius Snap to Nearest Visible Control', function() {
  it('snaps radius to nearest visible control radius iff distance ≤ 6', function() {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 700, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 700, noNaN: true }), { minLength: 1, maxLength: 10 }),
        function(radius, visibleRadii) {
          var anchor = { angle: 45, radius: radius }; // use 45° (a 5° multiple) to avoid angle snap changing things
          var visibleAnchors = visibleRadii.map(function(r) { return { angle: 0, radius: r }; });
          var result = SE.snap(anchor, visibleAnchors, { altKey: false });

          // Find closest visible radius
          var closestDist = Infinity;
          var closestRadius = radius;
          for (var i = 0; i < visibleRadii.length; i++) {
            var d = Math.abs(radius - visibleRadii[i]);
            if (d < closestDist) {
              closestDist = d;
              closestRadius = visibleRadii[i];
            }
          }

          if (closestDist <= 6) {
            return result.snappedRadius === true && result.anchor.radius === closestRadius;
          } else {
            return result.snappedRadius === false && result.anchor.radius === radius;
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});

/**
 * Property 9: Snap Idempotence
 * Validates: Requirements 9.5
 *
 * Applying snap twice produces the same result as applying it once.
 * snap(snap(a, V, m), V, m) === snap(a, V, m)
 */
describe('Feature: layout-parity-editor, Property 9: Snap Idempotence', function() {
  it('snap(snap(a, V, m), V, m) === snap(a, V, m)', function() {
    var anchorArb = fc.record({
      angle: fc.double({ min: 0, max: 359.999, noNaN: true }),
      radius: fc.double({ min: 0, max: 700, noNaN: true })
    });
    var visibleArb = fc.array(anchorArb, { minLength: 0, maxLength: 8 });

    fc.assert(
      fc.property(
        anchorArb,
        visibleArb,
        function(anchor, visible) {
          var modifiers = { altKey: false };
          var first = SE.snap(anchor, visible, modifiers);
          var second = SE.snap(first.anchor, visible, modifiers);
          return first.anchor.angle === second.anchor.angle &&
                 first.anchor.radius === second.anchor.radius;
        }
      ),
      { numRuns: 300 }
    );
  });
});

/**
 * Property 10: Alt Key Disables Snap
 * Validates: Requirements 9.6
 *
 * When altKey is true, the snap engine returns the anchor unchanged
 * with no snapping applied.
 */
describe('Feature: layout-parity-editor, Property 10: Alt Key Disables Snap', function() {
  it('snap returns anchor unchanged when altKey is true', function() {
    var anchorArb = fc.record({
      angle: fc.double({ min: 0, max: 359.999, noNaN: true }),
      radius: fc.double({ min: 0, max: 700, noNaN: true })
    });
    var visibleArb = fc.array(anchorArb, { minLength: 0, maxLength: 8 });
    
    fc.assert(
      fc.property(
        anchorArb,
        visibleArb,
        function(anchor, visible) {
          var result = SE.snap(anchor, visible, { altKey: true });
          return result.anchor.angle === anchor.angle &&
                 result.anchor.radius === anchor.radius &&
                 result.snappedAngle === false &&
                 result.snappedRadius === false;
        }
      ),
      { numRuns: 300 }
    );
  });
});
