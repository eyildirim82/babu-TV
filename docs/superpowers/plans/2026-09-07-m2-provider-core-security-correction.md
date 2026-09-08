# BabuşTV M2 Provider Core — Secure-Storage Correction

**Status:** Normative correction. This file has higher precedence than `2026-09-07-m2-provider-core.md` and `2026-09-07-m2-provider-core-self-review.md` wherever credential-storage details conflict.

## Why this correction exists

The original M2 plan selected Tizen KeyManager as the primary secure-storage candidate. A fresh check of Samsung's current TV distribution guidance found that Seller Office pre-test documentation states the `keymanager` API is no longer available for distributable TV applications, even though the lower-level Tizen API reference still documents the API.

Samsung WidgetData is documented as application secure storage, uses a public Samsung privilege, and exposes `read`, `write`, and `remove` from Tizen 4.0. BabuşTV targets Tizen 5.0+.

Therefore the production candidate changes from KeyManager to WidgetData before M2A is completed.

## Corrected M2A Task 1

**Production files:**

- `player/src/credentials/contracts.ts`
- `player/src/credentials/memory-credential-store.ts`
- `player/src/credentials/samsung-widgetdata-credential-store.ts`
- `tizen/config.xml`

**Tests:**

- `player/test-ts/credential-store.test.ts`
- `player/test-ts/credential-platform-config.test.ts`

**Decision record:**

- `docs/decisions/0002-tizen-credential-storage.md`

The earlier planned `player/src/credentials/tizen-keymanager-credential-store.ts` is **not** part of the accepted production design and must not remain in the final M2A diff.

## Corrected rules

- `CredentialStore` remains platform-agnostic.
- `SamsungWidgetDataCredentialStore` is the Tizen production candidate.
- WidgetData uses one secure JSON document containing provider-scoped credentials.
- A missing native document means an empty credential store.
- Removing the final provider removes the native document.
- The implementation enforces WidgetData's documented 20,000-character limit.
- Native callback errors are converted to fixed sanitized errors; native error text is never propagated.
- `tizen/config.xml` declares `http://developer.samsung.com/privilege/widgetdata`.
- The inherited `$WEBAPIS/webapis/webapis.js` bootstrap remains required.
- There is no plaintext fallback to IndexedDB/localStorage.
- If WidgetData is unavailable, persistence fails closed.
- KeyManager remains research-only unless a later ADR explicitly reverses this decision after distribution and runtime review.
- No hardware-backed/TEE security claim is allowed.

## Corrected runtime gate

Before M2 is called fully complete, probe WidgetData on the first available Tizen runtime and record:

- API presence;
- write/read;
- persistence across app relaunch;
- replace;
- remove;
- post-remove absence;
- sanitized failure behavior.

Preferred targets remain Emulator -> Remote Test Lab -> physical Samsung TV as available. Lack of hardware may leave this gate pending, but no insecure fallback may be introduced to bypass it.
