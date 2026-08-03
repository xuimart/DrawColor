# Implementation Plan: Layout Parity & Editor

## Overview

This plan implements visual parity with the Figma reference frame and a drag-based layout editor for the Color Wheel panel demo. The work is structured as: (1) extend the existing `layout.js` with anchor normalization and bounds clamping, (2) create the SnapEngine pure function module, (3) create the LayoutStore persistence module, (4) create the LayoutSerializer import/export module, (5) create the LayoutEditor drag/keyboard orchestration module, (6) update CSS with theme tokens and parity metrics, and (7) wire everything together in `main.js` and `index.html`.

All code is vanilla JS IIFE modules loaded via `<script>` tags. Property-based tests use fast-check via Node test runner.

## Tasks

- [x] 1. Extend layout.js with normalizeAnchor and clampAnchorToBounds
  - [x] 1.1 Implement normalizeAnchor and clampAnchorToBounds in demo/js/layout.js
    - Add `normalizeAnchor(anchor)` that clamps angle to [0, 360) and radius to [0, 700]
    - Add `clampAnchorToBounds(anchor, controlSize, scale)` that ensures center ± half diameter stays within [0, 628*scale] × [0, 907*scale]
    - Export both functions on `window.LAYOUT`
    - _Requirements: 3.1, 3.2, 7.6, 8.6_

  - [x]* 1.2 Write property test: Anchor ↔ Screen Coordinate Round-Trip
    - **Property 1: Anchor ↔ Screen Coordinate Round-Trip**
    - Generate random points within panel bounds and scale factors in [320/628, 1200/628]
    - Assert `anchorToPoint(pointToAnchor(p, c, s), c, s) ≈ p` within 0.01 units
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [x]* 1.3 Write property test: Scale Factor Clamping
    - **Property 3: Scale Factor Clamping**
    - Generate random width values including values below 320 and above 1200
    - Assert `computeScale(w) === clamp(w, 320, 1200) / 628`
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 1.4 Write property test: Proportional Scaling Invariant
    - **Property 4: Proportional Scaling Invariant**
    - Generate random pairs of measurements `a, b` and scale factors
    - Assert `|(a*s)/(b*s) - a/b| / (a/b) ≤ 0.005` and panel aspect ratio = 907/628
    - **Validates: Requirements 7.4, 7.5**

  - [x]* 1.5 Write property test: Controls Within Panel Bounds
    - **Property 5: Controls Within Panel Bounds**
    - Generate random anchors (angle ∈ [0,360), radius ∈ [0,700]) and scale factors
    - After `clampAnchorToBounds`, assert control rectangle is entirely within panel bounds
    - **Validates: Requirements 7.6, 8.6**

- [x] 2. Create SnapEngine module (demo/js/snap.js)
  - [x] 2.1 Implement SnapEngine with angle and radius snapping logic
    - Create `demo/js/snap.js` as IIFE exposing `window.SnapEngine`
    - Implement `snap(anchor, visibleAnchors, modifiers)` as pure function
    - Angle snap: round to nearest 5° multiple if distance ≤ 2.5°
    - Radius snap: round to nearest visible control radius if distance ≤ 6 units
    - Return snap metadata (snappedAngle, snappedRadius, snapRadius)
    - If `modifiers.altKey === true`, return anchor unchanged
    - _Requirements: 9.1, 9.2, 9.5, 9.6_

  - [x]* 2.2 Write property test: Angle Snap Threshold
    - **Property 7: Angle Snap Threshold**
    - Generate random angles in [0, 360)
    - Assert snap rounds to nearest 5° iff distance ≤ 2.5°, otherwise unchanged
    - **Validates: Requirements 9.1**

  - [x]* 2.3 Write property test: Radius Snap to Nearest Visible Control
    - **Property 8: Radius Snap to Nearest Visible Control**
    - Generate random radii and sets of visible control radii
    - Assert snap rounds to nearest visible radius iff distance ≤ 6, otherwise unchanged
    - **Validates: Requirements 9.2**

  - [x]* 2.4 Write property test: Snap Idempotence
    - **Property 9: Snap Idempotence**
    - Generate random anchors and sets of visible anchors
    - Assert `snap(snap(a, V, m), V, m) === snap(a, V, m)`
    - **Validates: Requirements 9.5**

  - [x]* 2.5 Write property test: Alt Key Disables Snap
    - **Property 10: Alt Key Disables Snap**
    - Generate random anchors with `altKey: true`
    - Assert `snap(a, V, { altKey: true })` returns `a` unchanged
    - **Validates: Requirements 9.6**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create LayoutStore module (demo/js/layout-store.js)
  - [x] 4.1 Implement LayoutStore with profile CRUD and localStorage persistence
    - Create `demo/js/layout-store.js` as IIFE exposing `window.LayoutStore`
    - Implement `init()`, `getActiveProfile()`, `setAnchor(controlId, anchor)`
    - Implement `createProfile(name)`, `renameProfile(old, new)`, `activateProfile(name)`, `deleteProfile(name)`
    - Implement `resetToDefault()`, `listProfiles()`, `subscribe(fn)`
    - Default profile is read-only; names 1-40 chars; duplicates get numeric suffix
    - Auto-save to localStorage within 500ms of `setAnchor`
    - On load, fill missing anchors from Default_Profile
    - On delete active, activate Default_Profile
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x]* 4.2 Write property test: Profile Save/Load Round-Trip
    - **Property 11: Profile Save/Load Round-Trip**
    - Generate valid profiles with subsets of anchors
    - Assert save then load reproduces identical anchors; missing ones filled from default
    - **Validates: Requirements 10.3, 10.5**

  - [x]* 4.3 Write property test: Name Validation and Deduplication
    - **Property 12: Name Validation and Deduplication**
    - Generate strings of various lengths (0, 1-40, >40)
    - Assert 1-40 accepted, 0 or >40 rejected, duplicates get unique suffix
    - **Validates: Requirements 10.6, 10.8**

  - [x]* 4.4 Write property test: Reset Restores Default
    - **Property 13: Reset Restores Default**
    - Generate randomly modified profiles
    - After `resetToDefault()`, assert all anchors match Default_Profile
    - **Validates: Requirements 10.9**

- [x] 5. Create LayoutSerializer module (demo/js/layout-serializer.js)
  - [x] 5.1 Implement LayoutSerializer with export and import logic
    - Create `demo/js/layout-serializer.js` as IIFE exposing `window.LayoutSerializer`
    - Implement `exportProfile(profile)` returning JSON string with version, name, controls
    - Implement `importProfile(jsonText)` returning `{ ok, profile?, error?, discarded? }`
    - Serialize angles/radii with `toFixed(3)`
    - Validate: JSON syntax, version === 1, angle ∈ [0,360], radius ∈ [0,700]
    - Unknown control IDs: discard silently, report count
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x]* 5.2 Write property test: Export/Import Round-Trip
    - **Property 14: Export/Import Round-Trip**
    - Generate valid complete profiles
    - Assert `import(export(P)).anchors ≈ P.anchors` within 0.001 units
    - **Validates: Requirements 11.1, 11.2, 11.4**

  - [x]* 5.3 Write property test: Invalid Import Rejection
    - **Property 15: Invalid Import Rejection**
    - Generate (a) non-JSON text, (b) valid JSON with wrong version, (c) out-of-range values
    - Assert `importProfile` returns `{ ok: false }` and does not modify active profile
    - **Validates: Requirements 11.5, 11.6, 11.7**

  - [x]* 5.4 Write property test: Partial Import with Unknown Control IDs
    - **Property 16: Partial Import with Unknown Control IDs**
    - Generate valid JSON with mix of known and unknown control IDs
    - Assert known IDs imported, unknown discarded, count reported
    - **Validates: Requirements 11.8**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create LayoutEditor module (demo/js/layout-editor.js)
  - [x] 7.1 Implement LayoutEditor with drag mode, pointer handling, and guides
    - Create `demo/js/layout-editor.js` as IIFE exposing `window.LayoutEditor`
    - Implement `init()`, `toggle()`, `isEditing()`
    - On enter: add `.layout-editing` class, show accent outlines, update status bar
    - On exit: remove outlines, restore control actions
    - Drag: pointerdown → pointermove (update each frame) → pointerup (convert, snap, clamp, save)
    - Draw arc/radial guides during active snap
    - Overlap detection: post-drop check, add `.overlap-warn` class when `dist < sumRadii`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.3, 9.4_

  - [x] 7.2 Implement keyboard accessibility for LayoutEditor
    - Tab navigation between Movable_Controls in document order
    - Arrow keys: move 1 unit (Shift: 10 units) in key direction
    - Convert new screen position via `pointToAnchor`, save to LayoutStore
    - Focus indicator: 2px ring in `--focus` token color
    - Announce mode changes and anchor updates via aria-live region
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x]* 7.3 Write property test: Overlap Detection Correctness
    - **Property 6: Overlap Detection Correctness**
    - Generate pairs of center positions and sizes
    - Assert overlap reported iff `dist(centerA, centerB) < radiusA + radiusB`
    - **Validates: Requirements 8.8**

  - [x]* 7.4 Write property test: Hidden Control Anchor Preservation
    - **Property 2: Hidden Control Anchor Preservation**
    - Generate sequences of show/hide toggles
    - Assert stored anchor remains unchanged regardless of visibility
    - **Validates: Requirements 3.6**

  - [x]* 7.5 Write property test: Keyboard Nudge
    - **Property 17: Keyboard Nudge**
    - Generate anchors and arrow key sequences (with/without Shift)
    - Assert screen position changes by exactly `step` units in key direction
    - Assert resulting anchor equals `pointToAnchor` of new position
    - **Validates: Requirements 12.2, 12.3**

- [x] 8. Update CSS for theme tokens and visual parity metrics
  - [x] 8.1 Add missing theme tokens and parity CSS to demo/styles.css
    - Ensure all 16 theme tokens from Requirement 6 are defined as CSS custom properties
    - Add `--u: calc(1px * var(--scale))` unit variable
    - Apply `calc(N * var(--u))` for fixed metrics (bands, dividers, tabs, sliders, status bar)
    - Ensure panel dimensions use aspect ratio 907/628
    - Add `.layout-editing` styles (accent outlines on `[data-layout]`)
    - Add `.overlap-warn` styles (warn token outlines)
    - Add focus indicator styles for keyboard navigation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 9. Wire modules together in index.html and main.js
  - [x] 9.1 Add script tags for new modules in correct dependency order
    - Add `<script src="js/snap.js"></script>` after layout.js
    - Add `<script src="js/layout-store.js"></script>` after snap.js
    - Add `<script src="js/layout-serializer.js"></script>` after layout-store.js
    - Add `<script src="js/layout-editor.js"></script>` after layout-serializer.js
    - _Requirements: all (module loading)_

  - [x] 9.2 Initialize LayoutStore and LayoutEditor in main.js boot sequence
    - Call `LayoutStore.init()` before `L.init()` so anchors are loaded from profile
    - Call `LayoutEditor.init()` after all modules are ready
    - Add layout editor toggle button to panel header or appropriate UI location
    - Subscribe to LayoutStore changes to trigger `L.applyLayout()`
    - _Requirements: 8.1, 10.3, 10.4_

- [x] 10. Set up test infrastructure and remaining property tests
  - [x] 10.1 Set up fast-check test runner with Node test infrastructure
    - Create `tests/` directory with package.json for fast-check dependency
    - Create test runner configuration for Node built-in test runner
    - Create shared test utilities (anchor generators, profile generators)
    - Ensure modules can be loaded in Node environment (globalThis shims)
    - _Requirements: all (testing infrastructure)_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All modules are vanilla JS IIFEs; no build step required
- fast-check tests run under Node's built-in test runner with a globalThis shim for `window.*`
- The script load order in index.html must match the dependency chain: color.js → state.js → layout.js → snap.js → layout-store.js → layout-serializer.js → layout-editor.js → wheel.js → panels.js → main.js

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "8.1", "10.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2"] }
  ]
}
```
