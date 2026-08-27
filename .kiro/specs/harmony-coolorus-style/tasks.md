# Implementation Plan: Harmony Coolorus-Style

## Overview

Refactor the DrawColor harmony system to replace `harmonyOffsets` with a `schemePhi` + `refHue` model. This introduces rigid-body rotation for all markers, deformation handles for adjustable-φ schemes, quick-swap to view any marker's S/V in the triangle, and per-marker independent saturation/value storage. The implementation modifies `state.js` for the data model and `wheel.js` for interaction, preserving backward compatibility with gamut masking, luminosity lock, temperature, and color limit.

## Tasks

- [x] 1. Refactor state model: schemePhi + refHue + markers
  - [x] 1.1 Add SCHEME_DEFS constant and new state shape to state.js
  - [x] 1.2 Implement recomputeMarkerHues() and rebuildMarkers()
  - [x] 1.3 Implement rotateSet(deltaAngle)
  - [x] 1.4 Implement setSchemePhi(schemeType, phi) with clamping
  - [x] 1.5 Implement setActiveMarker(markerId) for quick swap
  - [x] 1.6 Implement setSV(markerId, s, v) for per-marker S/V
  - [x] 1.7 Implement setScheme(type) with marker rebuild
  - [x] 1.8 Implement getMarkers(), hasDeformHandle(), getPhiRange() accessors

- [x] 2. Checkpoint - Validate state model

- [x] 3. Refactor wheel.js interaction for rigid-body rotation and handles
  - [x] 3.1 Implement pickMarker(point) and pickDeformHandle(point) hit-testing
  - [x] 3.2 Rewrite onPointerDown to route constellation-rotate, phi-adjust, and quick-swap
  - [x] 3.3 Rewrite onPointerMove for constellation-rotate and phi-adjust modes
  - [x] 3.4 Rewrite onPointerUp for quick-swap detection
  - [x] 3.5 Implement applySvForActiveMarker bridging SV drag to per-marker storage

- [x] 4. Checkpoint - Validate interaction refactor

- [x] 5. Update rendering for new marker model and deformation handles
  - [x] 5.1 Update render() to draw markers from state.getMarkers()
  - [x] 5.2 Implement deformation handle rendering
  - [x] 5.3 Update SV selector surface to use active marker's hue

- [x] 6. Backward compatibility: bridge old API to new model
  - [x] 6.1 Adapt getHarmonyHues() and getHarmonyOffsets() as compatibility wrappers
  - [x] 6.2 Wire gamut mask, luminosity lock, and temperature to active marker
  - [x] 6.3 Update pushHistory and undo/redo to serialize new state shape

- [x] 7. Checkpoint - Validate backward compatibility

- [x] 8. Property-based tests for correctness properties
  - [x]* 8.1 Write property test: Rigid Body Invariant (Property 1)
  - [x]* 8.2 Write property test: φ Independence from refHue (Property 2)
  - [x]* 8.3 Write property test: S/V Isolation (Property 3)
  - [x]* 8.4 Write property test: Quick Swap Geometry Preservation (Property 4)
  - [x]* 8.5 Write property test: φ Clamping (Property 5)
  - [x]* 8.6 Write property test: Marker Count Consistency (Property 6)
  - [x]* 8.7 Write property test: Single Active Invariant (Property 7)
  - [x]* 8.8 Write property test: Hue Derivation (Property 8)
  - [x]* 8.9 Write property test: Handle Visibility (Property 9)
  - [x]* 8.10 Write property test: Rotation Commutativity

- [x] 9. Update existing harmony.test.js for new API
  - [x] 9.1 Adapt existing test cases to new state model

- [x] 10. Final checkpoint - Full regression

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests in task 9 validate specific examples and edge cases
- The existing `harmony.test.js` must be adapted (task 9) since the underlying data model changes fundamentally
- `fast-check` is already available in `tests/node_modules` for property-based testing
- All code is vanilla JavaScript with browser globals (`window.AppState`, `window.Wheel`)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "1.6", "1.8"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.7"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.5"] },
    { "id": 5, "tasks": ["3.3", "3.4"] },
    { "id": 6, "tasks": ["5.1", "5.3"] },
    { "id": 7, "tasks": ["5.2", "6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3"] },
    { "id": 9, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10"] },
    { "id": 10, "tasks": ["9.1"] }
  ]
}
```
