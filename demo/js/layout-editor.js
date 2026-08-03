/**
 * layout-editor.js — Layout_Editor (Requisitos 8, 9, 12).
 *
 * Orchestrates the Modo_De_Organização: drag-to-reposition controls,
 * snap guides, overlap detection, and keyboard accessibility.
 *
 * API pública em window.LayoutEditor:
 *   init(), toggle(), isEditing(), enterEditing(), exitEditing(), checkOverlaps()
 */
window.LayoutEditor = (function () {
  'use strict';

  var editing = false;
  var dragging = null; // { el, offsetX, offsetY, controlId }
  var liveRegion = null;

  /* -------- Helpers -------- */

  function panel() {
    return document.getElementById('panel');
  }

  function announceMode(msg) {
    if (liveRegion) {
      liveRegion.textContent = msg;
    }
  }

  function announceAnchor(anchor) {
    if (liveRegion) {
      var angle = anchor.angle.toFixed(1);
      var radius = anchor.radius.toFixed(1);
      liveRegion.textContent = 'Ângulo ' + angle + '°, raio ' + radius;
    }
  }

  function getMovableControls() {
    var p = panel();
    if (!p) return [];
    return Array.prototype.slice.call(p.querySelectorAll('[data-layout]'));
  }

  /* -------- Overlap Detection (Requisito 8.8) -------- */

  function checkOverlaps() {
    var controls = getMovableControls();
    // Remove existing overlap warnings
    for (var i = 0; i < controls.length; i++) {
      controls[i].classList.remove('overlap-warn');
    }
    // Check all pairs
    for (var a = 0; a < controls.length; a++) {
      for (var b = a + 1; b < controls.length; b++) {
        var elA = controls[a];
        var elB = controls[b];
        var ax = parseFloat(elA.style.left) || 0;
        var ay = parseFloat(elA.style.top) || 0;
        var bx = parseFloat(elB.style.left) || 0;
        var by = parseFloat(elB.style.top) || 0;
        var rA = elA.offsetWidth / 2 || 22;
        var rB = elB.offsetWidth / 2 || 22;
        var dist = Math.hypot(ax - bx, ay - by);
        if (dist < rA + rB) {
          elA.classList.add('overlap-warn');
          elB.classList.add('overlap-warn');
        }
      }
    }
  }

  /* -------- Snap Guides (Requisitos 9.3, 9.4) -------- */

  function clearGuides(p) {
    var existing = p.querySelectorAll('.snap-guide');
    for (var i = 0; i < existing.length; i++) {
      existing[i].remove();
    }
  }

  function drawGuides(snapResult, p) {
    clearGuides(p);
    var L = window.LAYOUT;
    var s = L.scale();
    var center = L.centerPx();

    if (snapResult.snappedRadius && snapResult.snapRadius !== undefined) {
      // Draw arc guide at snap radius
      var arcEl = document.createElement('div');
      arcEl.className = 'snap-guide snap-guide-arc';
      var r = snapResult.snapRadius * s;
      arcEl.style.width = (r * 2) + 'px';
      arcEl.style.height = (r * 2) + 'px';
      arcEl.style.left = (center.x - r) + 'px';
      arcEl.style.top = (center.y - r) + 'px';
      arcEl.style.borderRadius = '50%';
      arcEl.style.border = '1px solid var(--accent, #2d8cf0)';
      arcEl.style.position = 'absolute';
      arcEl.style.pointerEvents = 'none';
      p.appendChild(arcEl);
    }

    if (snapResult.snappedAngle) {
      /**
       * Linha guia radial como div rotacionada, não SVG: o UXP tem suporte
       * limitado a SVG. Uma div de 1 unidade de largura ancorada no centro e
       * girada pelo ângulo de encaixe é exatamente a mesma linha.
       *
       * A div nasce apontando para baixo, que é 180° na convenção de âncora
       * (0° no topo, sentido horário). Daí a rotação de `angle - 180`.
       */
      var len = 300 * s;
      var lineEl = document.createElement('div');
      lineEl.className = 'snap-guide snap-guide-radial';
      lineEl.style.position = 'absolute';
      lineEl.style.left = center.x + 'px';
      lineEl.style.top = center.y + 'px';
      lineEl.style.width = '1px';
      lineEl.style.height = len + 'px';
      lineEl.style.background = 'var(--accent, #2d8cf0)';
      lineEl.style.transformOrigin = '50% 0';
      lineEl.style.transform = 'rotate(' + (snapResult.anchor.angle - 180) + 'deg)';
      lineEl.style.pointerEvents = 'none';
      p.appendChild(lineEl);
    }
  }

  /* -------- Drag Handling (Requisitos 8.3, 8.4, 8.5, 8.6) -------- */

  function onPointerDown(e) {
    if (!editing) return;
    var target = e.target.closest('[data-layout]');
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    var controlId = target.getAttribute('data-layout');
    var rect = target.getBoundingClientRect();
    var panelRect = panel().getBoundingClientRect();

    // Offset from pointer to center of control (in panel coords)
    var centerX = parseFloat(target.style.left) || (rect.left - panelRect.left + rect.width / 2);
    var centerY = parseFloat(target.style.top) || (rect.top - panelRect.top + rect.height / 2);

    dragging = {
      el: target,
      controlId: controlId,
      offsetX: e.clientX - (panelRect.left + centerX),
      offsetY: e.clientY - (panelRect.top + centerY)
    };

    target.setPointerCapture(e.pointerId);
    target.classList.add('dragging');
  }

  function onPointerMove(e) {
    if (!dragging) return;

    var p = panel();
    var panelRect = p.getBoundingClientRect();
    var L = window.LAYOUT;
    var s = L.scale();
    var center = L.centerPx();

    // New position in panel coordinates
    var newX = e.clientX - panelRect.left - dragging.offsetX;
    var newY = e.clientY - panelRect.top - dragging.offsetY;

    // Position the element during drag
    dragging.el.style.left = newX.toFixed(2) + 'px';
    dragging.el.style.top = newY.toFixed(2) + 'px';

    // Show snap preview
    var rawAnchor = L.pointToAnchor({ x: newX, y: newY }, center, 1);
    var visibleAnchors = getVisibleAnchors(dragging.controlId);
    var snapResult = window.SnapEngine.snap(rawAnchor, visibleAnchors, { altKey: e.altKey });
    drawGuides(snapResult, p);
  }

  function onPointerUp(e) {
    if (!dragging) return;

    var p = panel();
    var panelRect = p.getBoundingClientRect();
    var L = window.LAYOUT;
    var s = L.scale();
    var center = L.centerPx();

    // Final position in panel coordinates
    var newX = e.clientX - panelRect.left - dragging.offsetX;
    var newY = e.clientY - panelRect.top - dragging.offsetY;

    // Convert to anchor
    var rawAnchor = L.pointToAnchor({ x: newX, y: newY }, center, 1);

    // Snap
    var visibleAnchors = getVisibleAnchors(dragging.controlId);
    var snapResult = window.SnapEngine.snap(rawAnchor, visibleAnchors, { altKey: e.altKey });

    // Clamp to bounds
    var controlSize = dragging.el.offsetWidth || 44;
    var clamped = L.clampAnchorToBounds(snapResult.anchor, controlSize, s);

    // Normalize
    var final = L.normalizeAnchor(clamped);

    // Save
    window.LayoutStore.setAnchor(dragging.controlId, final);

    // Clear guides and re-apply layout
    clearGuides(p);
    L.applyLayout();

    // Cleanup
    dragging.el.classList.remove('dragging');
    dragging.el.releasePointerCapture(e.pointerId);
    dragging = null;

    // Check overlaps
    checkOverlaps();
  }

  function getVisibleAnchors(excludeId) {
    var profile = window.LayoutStore.getActiveProfile();
    var anchors = [];
    var keys = Object.keys(profile.anchors);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === excludeId) continue;
      var el = panel().querySelector('[data-layout="' + keys[i] + '"]');
      if (el && el.offsetParent !== null) {
        anchors.push(profile.anchors[keys[i]]);
      }
    }
    return anchors;
  }

  /* -------- Keyboard Handling (Requisito 12) -------- */

  function onKeyDown(e) {
    if (!editing) return;
    var target = e.target.closest('[data-layout]');
    if (!target) return;

    var step = e.shiftKey ? 10 : 1;
    var dx = 0, dy = 0;

    switch (e.key) {
      case 'ArrowUp':    dy = -step; break;
      case 'ArrowDown':  dy = step; break;
      case 'ArrowLeft':  dx = -step; break;
      case 'ArrowRight': dx = step; break;
      default: return; // Not an arrow key, don't handle
    }

    e.preventDefault();

    var L = window.LAYOUT;
    var s = L.scale();
    var center = L.centerPx();
    var controlId = target.getAttribute('data-layout');

    // Get current position
    var currentX = parseFloat(target.style.left) || 0;
    var currentY = parseFloat(target.style.top) || 0;

    // Apply step (scaled)
    var newX = currentX + dx * s;
    var newY = currentY + dy * s;

    // Convert to anchor
    var rawAnchor = L.pointToAnchor({ x: newX, y: newY }, center, 1);

    // Clamp and normalize
    var clamped = L.clampAnchorToBounds(rawAnchor, 44, s);
    var final = L.normalizeAnchor(clamped);

    // Save
    window.LayoutStore.setAnchor(controlId, final);

    // Re-apply layout
    L.applyLayout();

    // Re-focus the control (applyLayout changes style but not DOM order)
    target.focus();

    // Announce
    announceAnchor(final);

    // Check overlaps
    checkOverlaps();
  }

  /* -------- Mode Toggle (Requisitos 8.1, 8.2, 8.7) -------- */

  function enterEditing() {
    editing = true;
    var p = panel();
    if (p) {
      p.classList.add('layout-editing');
    }
    // Make movable controls focusable for keyboard navigation
    var controls = getMovableControls();
    for (var i = 0; i < controls.length; i++) {
      controls[i].setAttribute('tabindex', '0');
    }
    announceMode('Modo de organização ativado');
  }

  function exitEditing() {
    editing = false;
    var p = panel();
    if (p) {
      p.classList.remove('layout-editing');
      clearGuides(p);
    }
    // Remove tabindex from controls
    var controls = getMovableControls();
    for (var i = 0; i < controls.length; i++) {
      controls[i].removeAttribute('tabindex');
      controls[i].classList.remove('overlap-warn');
    }
    announceMode('Modo de organização desativado');
  }

  function toggle() {
    if (editing) {
      exitEditing();
    } else {
      enterEditing();
    }
  }

  function isEditing() {
    return editing;
  }

  /* -------- Init -------- */

  function init() {
    var p = panel();
    if (!p) return;

    // Create aria-live region for announcements (Requisito 12.6, 12.7)
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    liveRegion.style.position = 'absolute';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    liveRegion.style.clip = 'rect(0,0,0,0)';
    liveRegion.style.whiteSpace = 'nowrap';
    p.appendChild(liveRegion);

    // Pointer events for drag (Requisitos 8.3, 8.4, 8.5)
    p.addEventListener('pointerdown', onPointerDown);
    p.addEventListener('pointermove', onPointerMove);
    p.addEventListener('pointerup', onPointerUp);

    // Keyboard events for accessibility (Requisito 12)
    p.addEventListener('keydown', onKeyDown);
  }

  return {
    init: init,
    toggle: toggle,
    isEditing: isEditing,
    enterEditing: enterEditing,
    exitEditing: exitEditing,
    checkOverlaps: checkOverlaps
  };
})();
