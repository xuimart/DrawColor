# Implementation Plan

## Overview

Correção do mismatch de escala entre o canal K, a régua de valores B/W e a função de leitura `fromRgb`. O workflow segue a metodologia exploratória de bugfix: primeiro escreve testes PBT que demonstram o bug, depois implementa a correção, e verifica que o bug está resolvido sem regredir outros modos.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Round-trip do canal K diverge por escala L* vs 8-bit
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Use fast-check to generate integer values `w` ∈ [0, 100] and verify round-trip; also verify `getBwRamp` coverage and consistency
  - Create file `tests/bw-ramp-roundtrip.test.js` using Node test runner + fast-check
  - Import modules via setup.js shim (same pattern as `slider-channels.test.js`)
  - Test 1a: Property — for all `w` ∈ [0, 100] integer, `fromRgb(toRgb({w})).w` rounded === `w` (from Bug Condition `isBugCondition` in design)
  - Test 1b: Property — for all `N` ∈ [BW_MIN, BW_MAX], `getBwRamp()` returns N+1 samples with levels covering 100 down to 0
  - Test 1c: Property — for all tones in the ramp, `fromRgb({r: tone.r, g: tone.g, b: tone.b}).w` rounded === `tone.level`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - confirms bug exists via counterexamples like `w=50` → readback 54, `w=90` → readback 91, ramp missing level 0)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Modos RGB, HSV, LAB e CMYK inalterados
  - **IMPORTANT**: Follow observation-first methodology
  - Create file `tests/bw-ramp-preservation.test.js` using Node test runner + fast-check
  - Observe: `MODES.RGB.fromRgb({r,g,b})` returns `{r,g,b}` identity on unfixed code
  - Observe: `MODES.HSV.fromRgb` and `toRgb` produce same results on unfixed code
  - Observe: `MODES.LAB.fromRgb` and `toRgb` produce same results on unfixed code
  - Observe: `MODES.CMYK.fromRgb` and `toRgb` produce same results on unfixed code
  - Test 2a: Property — for all RGB in [0,255]³, `MODES.RGB.fromRgb(rgb)` === `rgb` (identity)
  - Test 2b: Property — for all RGB in [0,255]³, `MODES.HSV.toRgb(MODES.HSV.fromRgb(rgb))` is within ±1 per component of original
  - Test 2c: Property — for all RGB in [0,255]³, `MODES.LAB.fromRgb(rgb)` matches `C.rgbToLab(r,g,b)` and LAB round-trip is ±1
  - Test 2d: Property — for all RGB in [0,255]³, `MODES.CMYK.fromRgb(rgb)` matches `C.rgbToCmyk(r,g,b)` and CMYK round-trip is ±1
  - Test 2e: Unit — `setBwSteps` clamps to BW_MIN (2) and BW_MAX (24)
  - Verify all tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 3. Fix for B/W ramp value scale mismatch

  - [x] 3.1 Fix `getBwRamp` in `demo/js/state.js`
    - Change loop to interpret `bwSteps` as number of intervals (N), generating N+1 samples
    - Replace formula: `level = Math.round((N - i) * 100 / N)` for `i` from 0 to N
    - Replace `C.labToRgb(level, 0, 0)` with direct 8-bit conversion: `const g = Math.round(level / 100 * 255); { level, r: g, g: g, b: g }`
    - Keep BW_MIN = 2 and BW_MAX = 24 unchanged
    - _Bug_Condition: isBugCondition(input) — getBwRamp uses labToRgb producing RGB that doesn't round-trip through fromRgb_
    - _Expected_Behavior: getBwRamp returns N+1 samples with levels = Math.round((N-i)*100/N), RGB = Math.round(level/100*255) replicated_
    - _Preservation: BW_MIN and BW_MAX limits unchanged; fillFromBwRamp consumes array as before_
    - _Requirements: 2.3, 2.7, 3.4, 3.5_

  - [x] 3.2 Fix `fromRgb` in `MODES['B/W']` in `demo/js/panels.js`
    - For achromatic colors (r === g === b): return `{ w: Math.round(r / 255 * 100) }`
    - For chromatic colors (r ≠ g or r ≠ b): convert via L* then map to 8-bit scale: `Math.round(C.labToRgb(C.rgbToLab(r,g,b).L, 0, 0).r / 255 * 100)`
    - Keep `toRgb` and `write` unchanged (already correct)
    - _Bug_Condition: fromRgb uses L* scale directly, toRgb uses 8-bit linear — scales diverge_
    - _Expected_Behavior: fromRgb(toRgb({w})).w === w for all integer w ∈ [0,100]_
    - _Preservation: toRgb and write remain identical; chromatic colors still use perceptual mapping_
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

  - [x] 3.3 Fix `refreshBwRamp` in `demo/js/panels.js`
    - Compute current gray level in same 8-bit scale: for achromatic `Math.round(cur.r / 255 * 100)`, for chromatic `Math.round(C.labToRgb(C.rgbToLab(cur.r, cur.g, cur.b).L, 0, 0).r / 255 * 100)`
    - Compare with `tone.level` instead of comparing with `currentL` (L*)
    - Adjust tolerance: `closestDist < 50 / (ramp.length - 1)` (half-step between levels)
    - Update count label: display `ramp.length` (which is N+1) instead of `S.state.bwSteps`
    - _Bug_Condition: refreshBwRamp compares tone.level (linear scale) with currentL (L* scale)_
    - _Expected_Behavior: highlight matches the correct step for the current color_
    - _Preservation: Button click behavior, undo/redo, BW_MIN/BW_MAX disable logic unchanged_
    - _Requirements: 2.4, 2.7, 2.8, 3.6, 3.8, 3.10_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Round-trip do canal K exato em escala 8-bit
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run `node --test tests/bw-ramp-roundtrip.test.js`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — round-trip is exact, ramp has N+1 samples including 0 and 100)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Modos RGB, HSV, LAB e CMYK inalterados
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run `node --test tests/bw-ramp-preservation.test.js`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in other modes)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `node --test tests/*.test.js`
  - Confirm `bw-ramp-roundtrip.test.js` passes (fix checking)
  - Confirm `bw-ramp-preservation.test.js` passes (preservation checking)
  - Confirm `slider-channels.test.js` passes (existing LAB/CMYK independence tests)
  - Confirm all other test files pass (no unintended regressions)
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "tasks": ["1", "2"] },
    { "tasks": ["3.1", "3.2", "3.3"] },
    { "tasks": ["3.4", "3.5"] },
    { "tasks": ["4"] }
  ]
}
```

## Notes

- O projeto usa Node test runner (`node:test`) com fast-check 3.22.0 para property-based testing
- O shim `tests/setup.js` cria o ambiente `window` para os módulos IIFE do browser
- Tasks 1 e 2 são independentes entre si e podem ser executadas em qualquer ordem
- Task 3 (implementação) depende de ambas para que os testes existam antes do fix
- A escala unificada é **porcentagem de cinza 8-bit**: `level` ∈ [0, 100] inteiro, RGB = `Math.round(level / 100 * 255)` replicado
