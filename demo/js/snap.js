window.SnapEngine = (function() {
  'use strict';

  /**
   * Snap an anchor's angle and radius to nearby grid/control values.
   *
   * @param {Object} anchor - { angle: number, radius: number }
   * @param {Object[]} visibleAnchors - Array of { angle, radius } for other visible controls
   * @param {Object} modifiers - { altKey: boolean }
   * @returns {Object} { anchor: { angle, radius }, snappedAngle: boolean, snappedRadius: boolean, snapRadius?: number }
   */
  function snap(anchor, visibleAnchors, modifiers) {
    // If alt key is held, bypass all snapping
    if (modifiers && modifiers.altKey) {
      return { anchor: { angle: anchor.angle, radius: anchor.radius }, snappedAngle: false, snappedRadius: false };
    }

    var angle = anchor.angle;
    var radius = anchor.radius;
    var snappedAngle = false;
    var snappedRadius = false;
    var snapRadius;

    // Angle snap: round to nearest multiple of 5° if within 2.5°
    var nearest5 = Math.round(angle / 5) * 5;
    // Handle 360 → 0 wrap
    if (nearest5 >= 360) nearest5 = nearest5 - 360;
    if (nearest5 < 0) nearest5 = nearest5 + 360;

    // Compute shortest angular distance handling wrap-around
    var diff = angle - nearest5;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    if (Math.abs(diff) <= 2.5) {
      angle = nearest5;
      snappedAngle = true;
    }

    // Radius snap: snap to nearest visible control radius if within 6 units
    if (visibleAnchors && visibleAnchors.length > 0) {
      var closestDist = Infinity;
      var closestRadius = radius;
      for (var i = 0; i < visibleAnchors.length; i++) {
        var d = Math.abs(radius - visibleAnchors[i].radius);
        if (d < closestDist) {
          closestDist = d;
          closestRadius = visibleAnchors[i].radius;
        }
      }
      if (closestDist <= 6) {
        radius = closestRadius;
        snappedRadius = true;
        snapRadius = closestRadius;
      }
    }

    var result = { anchor: { angle: angle, radius: radius }, snappedAngle: snappedAngle, snappedRadius: snappedRadius };
    if (snapRadius !== undefined) {
      result.snapRadius = snapRadius;
    }
    return result;
  }

  return { snap: snap };
})();
