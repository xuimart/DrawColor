# Implementation Plan: Firebase Licensing

## Overview

Implementação do sistema de licenciamento para o DrawColor usando Firebase. O backend (Cloud Functions) será em Python. O módulo cliente (license.js) continua em JavaScript vanilla, integrando-se ao plugin existente (CEP/UXP). Os testes de propriedade usam `fast-check` com o test runner do Node.js (padrão do projeto).

## Tasks

- [x] 1. Set up Firebase backend project structure
  - [x] 1.1 Create Firebase project directory and initialize Cloud Functions with Python runtime
    - Create `firebase/` directory at project root
    - Initialize Firebase project with `firebase init` config files (`firebase.json`, `.firebaserc`)
    - Set up Cloud Functions with Python 3.11+ runtime (`functions/main.py`, `functions/requirements.txt`)
    - Add `firebase-admin`, `firebase-functions`, `flask`, `gunicorn` to requirements
    - Create `firestore.rules` denying all direct client access to `users` collection
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 1.2 Define Firestore data models and validation helpers
    - Create `functions/models.py` with user document schema: email (str), trialStart (datetime), paid (bool), machines (list of dicts with id, name, lastSeen), createdAt (datetime)
    - Create `functions/validators.py` with input validation (token presence, machineId format)
    - Implement helper to create a new user document with default values
    - Implement helper to serialize/deserialize Firestore timestamps
    - _Requirements: 11.1, 11.2, 11.3, 2.1_

  - [x]* 1.3 Write property test for user document structure (Property 1)
    - **Property 1: User Document Structure Invariant**
    - **Validates: Requirements 2.1, 11.1, 11.3**

- [x] 2. Implement Cloud Function: /validate
  - [x] 2.1 Implement token verification and user lookup
    - Create `functions/main.py` with `/validate` endpoint
    - Verify Firebase ID token using `firebase_admin.auth.verify_id_token()`
    - Look up user document in Firestore by UID
    - If user not found on first login, create document with trialStart = now, paid = false, machines = []
    - Return HTTP 401 for invalid/expired tokens, HTTP 400 for missing machineId
    - _Requirements: 4.6, 4.7, 2.1, 2.2, 2.3_

  - [x]* 2.2 Write property test for registration idempotence (Property 2)
    - **Property 2: Registration Idempotence**
    - **Validates: Requirements 2.2**

  - [x] 2.3 Implement trial status calculation logic
    - In `/validate`, after user lookup: if `paid == False`, compare current time vs `trialStart + 14 days`
    - Return `{ status: "trial", daysLeft: N }` if within 14 days
    - Return `{ status: "expired" }` if past 14 days
    - Use server-side timestamp only (ignore any client-provided trial data)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x]* 2.4 Write property test for trial status calculation (Property 3)
    - **Property 3: Trial Status Calculation**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 2.5 Implement paid user validation with machine control
    - If `paid == True`: check if requesting machineId is already in machines list
    - If machine present: update `lastSeen`, return `{ status: "active" }`
    - If machine absent and `len(machines) < 2`: add machine entry, return `{ status: "active" }`
    - If machine absent and `len(machines) == 2`: return `{ status: "machine_limit", machines: [...] }`
    - Machine entry format: `{ id: machineId, name: hostname_part, lastSeen: now }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1_

  - [x]* 2.6 Write property test for paid user status (Property 4)
    - **Property 4: Paid User Status Determination**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x]* 2.7 Write property test for machine registration (Property 5)
    - **Property 5: Machine Registration on Successful Validation**
    - **Validates: Requirements 4.5**

  - [x]* 2.8 Write property test for machine count invariant (Property 6)
    - **Property 6: Machine Count Invariant**
    - **Validates: Requirements 5.1**

- [x] 3. Implement Cloud Function: /deactivate-machine
  - [x] 3.1 Implement machine deactivation endpoint
    - Create `/deactivate-machine` endpoint in `functions/main.py`
    - Verify token, look up user document
    - Find machine by machineId in machines array
    - Remove machine entry from array and save document
    - Return `{ success: true, message: "Machine deactivated" }`
    - Return HTTP 404 if machineId not found in user's machines list
    - _Requirements: 5.3, 5.4, 5.5_

  - [x]* 3.2 Write property test for machine deactivation (Property 7)
    - **Property 7: Machine Deactivation Removes Entry**
    - **Validates: Requirements 5.4**

- [x] 4. Implement Cloud Function: /purchase-webhook
  - [x] 4.1 Implement webhook endpoint with signature verification
    - Create `/purchase-webhook` endpoint in `functions/main.py`
    - Implement HMAC signature verification for each supported platform (Gumroad, Hotmart, Stripe)
    - Return HTTP 403 immediately if signature is invalid (no Firestore writes)
    - On valid signature: look up user by email in Firestore
    - If user exists: set `paid = True`
    - If user does not exist: create document with `paid = True`, `trialStart = now`, empty machines
    - Return HTTP 200 with success response
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 4.2 Write property test for webhook activation (Property 11)
    - **Property 11: Webhook Activation**
    - **Validates: Requirements 9.1, 9.2**

  - [x]* 4.3 Write property test for webhook signature enforcement (Property 12)
    - **Property 12: Webhook Signature Enforcement**
    - **Validates: Requirements 9.3, 9.4**

- [x] 5. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement client-side fingerprint generator
  - [x] 6.1 Create fingerprint module in plugin
    - Create `demo/js/fingerprint.js`
    - Implement platform-aware fingerprint generation:
      - CEP: `cep_node.require('os').hostname() + '|' + cep_node.require('os').userInfo().username`
      - UXP: `require('os').hostname() + '|' + require('os').userInfo().username`
      - Web (demo): `'web-demo|anonymous'` (fixed value for demo mode)
    - Export `generate()` returning the fingerprint string
    - Export `getDisplayName()` returning hostname only (human-readable)
    - Integrate with `Platform.env` detection from existing `platform.js`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 6.2 Write property test for fingerprint determinism (Property 8)
    - **Property 8: Fingerprint Determinism**
    - **Validates: Requirements 6.3, 6.4**

- [x] 7. Implement client-side License Module
  - [x] 7.1 Create license module with auth session management
    - Create `demo/js/license.js`
    - Implement `init()`: check stored auth session, if valid → validate, if not → show login overlay
    - Implement `login()`: open external browser OAuth flow, capture token via localhost redirect
    - Implement `logout()`: clear stored session, show login overlay
    - Implement `getToken()`, `isAuthenticated()` helpers
    - Store auth session (uid, email, refreshToken, lastTokenRefresh) in Platform.storage
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 12.1, 12.3_

  - [x] 7.2 Implement validation and caching logic
    - Implement `validate()`: POST to Cloud Function /validate with {token, machineId}
    - On success: cache result (status, timestamp, daysLeft) via Platform.storage
    - Implement `getCachedStatus()`: return cached validation if exists
    - Implement offline fallback: if validate times out (>5s) or fails, check cache age
    - If cache < 4 hours: use cached status (grace period)
    - If cache >= 4 hours: set status to `offline_expired`
    - Implement `onStatusChange(callback)` for reactive UI updates
    - _Requirements: 4.1, 7.1, 7.2, 7.3, 7.4, 7.5, 12.2, 12.4, 12.5_

  - [x]* 7.3 Write property test for cache validity threshold (Property 9)
    - **Property 9: Cache Validity Threshold**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x] 7.4 Implement machine deactivation from client
    - Implement `deactivateMachine(machineId)`: POST to /deactivate-machine
    - On success: re-validate to refresh status
    - On error: surface error message to overlay
    - _Requirements: 5.2, 5.3_

- [x] 8. Implement Overlay UI controller
  - [x] 8.1 Create overlay HTML/CSS and controller logic
    - Create overlay DOM structure in `demo/index.html` (login, expired, machine_limit, offline_expired states)
    - Create `demo/js/overlay.js` with `show(state)`, `hide()`, `isVisible()` methods
    - Implement login state: "Ative sua conta" + "Login com Google" button
    - Implement expired state: "Trial expirado — Compre sua licença" + store link button
    - Implement machine_limit state: machine list with deactivation buttons
    - Implement offline_expired state: "Conecte à internet para revalidar"
    - Implement anti-tamper: re-inject overlay if removed from DOM, use MutationObserver
    - Block pointer events on underlying plugin controls when overlay is visible
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x]* 8.2 Write property test for overlay status mapping (Property 10)
    - **Property 10: Overlay Reflects License Status**
    - **Validates: Requirements 8.6, 8.4**

- [x] 9. Integrate License Module into plugin boot sequence
  - [x] 9.1 Wire license module into main.js initialization
    - Import license.js and overlay.js in `demo/index.html`
    - In `main.js` init flow: after `Platform.ready()`, call `License.init()` before other module init
    - Subscribe to `License.onStatusChange` to show/hide overlay
    - When status is `trial`: show days remaining badge in status bar
    - When status is `trial` or `active`: proceed with normal plugin init (wheel, panels, etc.)
    - When status blocks: show overlay, skip interactive init
    - _Requirements: 12.1, 12.2, 12.5, 3.4, 8.6_

- [x] 10. Deploy Firestore security rules
  - [x] 10.1 Write and validate Firestore security rules
    - Create `firebase/firestore.rules` denying all client read/write on `users` collection
    - Rules should match: `match /users/{uid} { allow read, write: if false; }`
    - Ensure Cloud Functions use Admin SDK (bypasses security rules)
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 11. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The Cloud Functions backend is Python; the client-side license module is JavaScript (matching the existing project)
- Property-based tests use `fast-check` with Node's built-in test runner (project standard)
- The OAuth localhost redirect flow is the recommended approach for embedded environments (CEP/UXP) where native popups are not supported

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "6.1"] },
    { "id": 2, "tasks": ["1.3", "2.1", "6.2"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4", "2.5"] },
    { "id": 5, "tasks": ["2.6", "2.7", "2.8", "3.1", "4.1"] },
    { "id": 6, "tasks": ["3.2", "4.2", "4.3"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2", "7.4", "8.1"] },
    { "id": 9, "tasks": ["7.3", "8.2", "9.1", "10.1"] }
  ]
}
```
