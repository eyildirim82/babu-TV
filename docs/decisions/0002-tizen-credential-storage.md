# ADR 0002 — Tizen Provider Credential Storage

**Status:** Accepted for M2 implementation; runtime verification gate pending

## Context

BabuşTV provider configuration can contain Xtream server URLs, usernames/passwords, or credential-bearing M3U playlist URLs. These values must not be stored in ordinary IndexedDB/localStorage or emitted to logs.

The initial M2 plan considered the Tizen KeyManager API because the Tizen API reference still describes it as a secure repository. A fresh distribution-policy check found a conflict: Samsung TV Seller Office pre-test guidance states that the `keymanager` API is no longer available for distributable TV applications.

Samsung's Product API also exposes WidgetData as application secure storage. `read`, `write`, and `remove` are available from Tizen 4.0, use the public `http://developer.samsung.com/privilege/widgetdata` privilege, and support up to 20,000 characters of stored data. BabuşTV targets Tizen 5.0+.

Official references checked for this decision:

- Samsung WidgetData API: `https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/widgetdata-api.html`
- Samsung TV Seller Office application registration / pre-test guidance: `https://developer.samsung.com/tv-seller-office/guides/applications/registering-application.html`
- Tizen KeyManager API reference: `https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/keymanager-api.html`

## Decision

1. **Samsung WidgetData is the primary production credential-store candidate for BabuşTV on Tizen.**
2. The package declares only the public WidgetData privilege required for this storage path; it does not declare the legacy KeyManager privilege.
3. Provider credentials are accessed only through the app-level `CredentialStore` abstraction.
4. All provider credentials are stored in one provider-scoped JSON document inside WidgetData. The implementation enforces the documented 20,000-character limit before calling the native write API.
5. A missing WidgetData document is treated as an empty credential store. When the last provider credential is removed, the native WidgetData document is removed.
6. Native WidgetData errors are translated into fixed, sanitized application errors. Native error text or serialized credential payloads are never surfaced or logged.
7. If WidgetData is unavailable, persistent credential saving **fails closed**. There is no plaintext localStorage/IndexedDB fallback from Provider Core.
8. We do **not** claim WidgetData is hardware-backed, TEE-backed, or equivalent to a platform keychain beyond Samsung's documented "application secure storage" behavior.
9. KeyManager is not shipped as BabuşTV's production credential adapter. It may be re-evaluated only as a sideload/research alternative after a separate compatibility and distribution review.

## Runtime Verification Gate

M2 is not considered fully complete until WidgetData has been probed on at least one Tizen runtime. The preferred matrix is:

- Tizen Emulator, where the Samsung Product API is available;
- Samsung Remote Test Lab, when a compatible TV is available;
- the next available physical Samsung TV.

For each available target, record only the runtime/device class and pass/fail result for:

1. `webapis.widgetdata` presence;
2. privilege/access success;
3. write a synthetic credential document;
4. read it back;
5. restart/relaunch the app and read it again;
6. replace the document;
7. remove it;
8. confirm a later read reports absence;
9. confirm failures do not expose the synthetic credential value.

Do not record real provider credentials in the evidence.

### Current runtime evidence

- Emulator: **pending**
- Remote Test Lab: **pending**
- Physical TV: **pending**

### M2D checkpoint — 2026-09-08

No Tizen runtime was available in the implementation/CI environment at this checkpoint, so the mandatory WidgetData runtime probe remains **not yet satisfied**. No pass result has been inferred from unit tests, browser behavior, packaging, or Samsung documentation.

Automated evidence at this checkpoint verifies only the code boundary:

- the WidgetData credential adapter is exercised through deterministic injected fakes;
- unavailable WidgetData fails closed;
- native failures are converted to fixed sanitized errors;
- the documented 20,000-character capacity is enforced before native write;
- the Tizen package declares the public WidgetData privilege and does not declare the KeyManager privilege;
- M2 ordinary structured persistence contains only non-secret provider/catalog/app-state stores and has no credential store;
- structured provider/catalog repositories whitelist normalized fields so credential-shaped and raw-stream-shaped extra properties are not persisted;
- Provider Core has no plaintext credential fallback to IndexedDB or localStorage.

Therefore the M2 Provider Core code may reach a merge checkpoint with this gate explicitly pending, but **M2 must not be described as fully complete until at least one Tizen runtime probe passes**.

## Transitional legacy boundary

The inherited EN TV Player UI remains intentionally operational through M2 and is not yet wired to Provider Core. Its legacy `player/src/config.js` settings path still persists inherited playlist configuration in `localStorage` until the later UI/onboarding migration replaces that path.

This legacy compatibility path is **not** the Provider Core credential-storage fallback and must never be used as one. Consequently:

- the secure-storage claim at the M2 checkpoint applies to the new Provider Core credential boundary, not to every inherited pre-migration UI setting path;
- BabuşTV must not claim that all legacy playlist configuration is securely persisted while that inherited path remains;
- when onboarding/provider management is migrated to Provider Core, credential-bearing provider configuration must go through `CredentialStore`, and the legacy localStorage playlist persistence path must not become the source of truth for provider credentials.

## Consequences

- M2 unit/CI tests can verify the credential abstraction and callback/error behavior without a TV by injecting a deterministic WidgetData fake.
- A future Store-distributed build does not depend on the KeyManager API that current Seller Office guidance flags as unavailable.
- Credential capacity is intentionally bounded. A user with enough providers/very long provider URLs to exceed the WidgetData document limit receives a safe capacity error rather than an insecure fallback.
- Ordinary provider metadata and catalog persistence remain separate from this secure-storage document and must not contain credentials or credential-bearing URLs.
- Release/hardware validation must preserve this ADR's distinction between automated boundary evidence and actual Tizen runtime evidence.
