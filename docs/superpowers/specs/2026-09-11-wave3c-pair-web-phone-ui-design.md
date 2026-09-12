# BabuşTV V1 Wave 3C PAIR-WEB Phone UI Design

**Date:** 2026-09-11  
**Status:** Design direction approved; written spec requires Controller review before implementation planning  
**Repository:** `eyildirim82/babu-TV`  
**Controller production base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Pairing-core state:** PAIR-C, PAIR-S and PAIR-R merged/frozen on `main`

## 1. Purpose

PAIR-WEB freezes and implements the phone-side browser UI boundary for secure pairing without creating a second pairing protocol, relay API, provider transaction, or credential-storage architecture.

Target branch:

`feature/pairing-phone-ui`

PAIR-WEB owns a browser-mountable phone UI module. It does not own relay hosting/deployment, TV QR generation, TV session creation, TV decryption, CredentialStore writes, Provider Core registration/sync, or final onboarding integration. Those remain outside this lane; TV-side end-to-end handoff belongs to PAIR-I after PAIR-WEB merges.

## 2. Frozen pairing-core contracts consumed

PAIR-WEB consumes the already-merged contracts exactly:

- PAIR-C `encryptForPairingTv(tvPublicKey, plaintext)` -> authenticated `PairingCiphertextV1` using ephemeral P-256 ECDH + AES-256-GCM and authenticated context `babustv-pairing-v1`;
- PAIR-S session descriptors with opaque secure `sessionId`, `expiresAtMs`, and default five-minute TV-side lifetime;
- PAIR-R `PairingRelayClient.putCiphertext({ sessionId, ciphertext })` over HTTPS-only ciphertext relay transport.

PAIR-WEB never changes PAIR-C envelope fields, cryptographic algorithm, PAIR-S TTL semantics, relay paths, or relay error semantics.

## 3. Architectural decision

Use three focused modules plus scoped CSS:

```text
player/src/pairing/phone-payload.ts
player/src/pairing/phone-controller.ts
player/src/pairing/phone-view.ts
player/src/ui/pairing-phone.css
```

The controller owns the phone flow/state machine and depends on injected crypto/relay/time ports. The view owns safe browser DOM rendering and browser keyboard/accessibility interaction. The payload module owns the exact plaintext provider DTO and deterministic UTF-8 JSON serialization used immediately before encryption.

No framework, SPA router, storage library, QR library, or second network client is introduced.

## 4. Phone bootstrap contract

The phone page receives only public/opaque pairing bootstrap data produced by the TV/PAIR-I flow:

```ts
export interface PairingPhoneBootstrapV1 {
  version: 1;
  sessionId: string;
  expiresAtMs: number;
  tvPublicKey: JsonWebKey;
  relayBaseUrl: string;
}
```

Rules:

- `version` must be exactly `1`;
- `sessionId` is opaque, non-empty, and is never interpreted as credential data;
- `expiresAtMs` must be finite;
- `tvPublicKey` is public P-256 material consumed by PAIR-C; PAIR-WEB does not accept or retain a private key;
- `relayBaseUrl` is a public relay endpoint and must pass the existing PAIR-R HTTPS/user-info normalization rules;
- no provider credential, playlist URL, provider token, stream URL, or TV private key appears in bootstrap/QR data.

The phone controller validates the object fail-closed before accepting provider submission. Invalid version/session/time/relay shape maps to `INVALID_BOOTSTRAP`; expiry maps to the dedicated `expired` state; malformed/invalid TV public key discovered by PAIR-C maps to `INVALID_TV_KEY`.

PAIR-WEB consumes bootstrap as an injected object. This lane does not define how a hosted page parses QR/deep-link query parameters. A later host/PAIR-I composition may validate before constructing the object, but the phone controller still performs its own boundary validation and never trusts host parsing alone.

## 5. Exact provider plaintext payload

PAIR-WEB freezes one versioned plaintext DTO that maps directly to the existing provider onboarding inputs:

```ts
export type PairingProviderPayloadV1 =
  | {
      version: 1;
      credential: {
        kind: 'xtream';
        serverUrl: string;
        username: string;
        password: string;
      };
    }
  | {
      version: 1;
      credential: {
        kind: 'm3u';
        playlistUrl: string;
      };
    };
```

No provider ID, active-provider flag, catalog/channel/EPG data, relay URL, session ID, TV key, persistence key, or app settings are included in the plaintext provider payload.

The existing TV onboarding services remain responsible for creating provider IDs, deriving safe provider display names, registering/syncing providers, validating usable cache, activating the provider, and rollback/cleanup.

## 6. Serialization

`phone-payload.ts` provides exact encode/decode helpers for synthetic tests and future PAIR-I compatibility.

Encoding:

1. normalize only the fields already normalized by the corresponding existing onboarding path;
2. construct the exact DTO above with no extra keys;
3. `JSON.stringify()` the DTO;
4. encode the JSON as UTF-8 bytes with `TextEncoder`;
5. pass those bytes to the PAIR-C encryption port.

The decode helper must reject malformed JSON, unknown version, unknown provider kind, missing fields, non-string credential fields, and any extra keys at the top-level/credential level. It returns only the exact `PairingProviderPayloadV1` union. It exists for contract tests/future PAIR-I consumption; the phone UI itself does not decrypt.

Relay ciphertext is a string containing the serialized PAIR-C envelope:

```ts
JSON.stringify(pairingCiphertextV1)
```

PAIR-WEB does not base64-wrap, compress, sign, encrypt again, or add provider/session fields to the relay body. PAIR-R still receives exactly `{ ciphertext: string }` plus the opaque session ID request field.

## 7. Local validation

PAIR-WEB performs only bounded local validation needed to avoid obviously invalid submissions before encryption.

### Xtream

Match existing `XtreamOnboardingService` entry semantics:

- trim `serverUrl`, `username`, and `password`;
- all three must be non-empty;
- do not perform provider-network authentication or duplicate Provider Core profile validation on the phone.

PAIR-WEB must not silently impose a stricter provider protocol rule than the existing TV Xtream onboarding contract.

### M3U

Reuse the existing `validateM3uEntry()` contract:

- playlist URL required;
- syntactically valid URL;
- HTTP/HTTPS only;
- failure preserves the entered playlist URL for correction.

No credential-bearing URL is logged or copied into error text.

## 8. Controller state machine

The phone controller exposes a deterministic state suitable for DOM projection:

```ts
type PairingPhoneState =
  | { kind: 'choose-provider' }
  | { kind: 'xtream'; input: XtreamPhoneInput; error: PairingPhoneErrorCode | null }
  | { kind: 'm3u'; input: M3uPhoneInput; error: PairingPhoneErrorCode | null }
  | { kind: 'sending'; providerKind: 'xtream' | 'm3u' }
  | { kind: 'success' }
  | { kind: 'expired' }
  | { kind: 'error'; providerKind: 'xtream' | 'm3u' | null; code: PairingPhoneErrorCode };
```

The exact public error-code set is fixed and sanitized:

```ts
type PairingPhoneErrorCode =
  | 'INVALID_BOOTSTRAP'
  | 'REQUIRED'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'CRYPTO_UNAVAILABLE'
  | 'INVALID_TV_KEY'
  | 'RELAY_UNAVAILABLE'
  | 'NETWORK';
```

`INVALID_BOOTSTRAP` is allowed with `providerKind: null` before the user has selected a provider.

No native exception message, provider secret, endpoint query, session content, ciphertext, or decrypted/plaintext JSON is exposed in view state.

## 9. Submit flow

For an explicit user submit:

1. reject duplicate submit while state is `sending`;
2. validate bootstrap version/session/time/relay boundary; invalid -> `INVALID_BOOTSTRAP`, no crypto/relay call;
3. re-check `expiresAtMs` against injected `nowMs()`; expired -> `expired`, no crypto/relay call;
4. validate/normalize provider input;
5. encode exact `PairingProviderPayloadV1` to UTF-8 bytes;
6. call injected PAIR-C encryption with TV public key;
7. serialize the returned PAIR-C envelope to one ciphertext string;
8. call injected PAIR-R `putCiphertext({ sessionId, ciphertext })`;
9. on success, replace sensitive form state with `success` and clear references to plaintext inputs;
10. on failure, return to a sanitized error state while retaining only the in-memory form values needed for user retry.

The phone never calls relay `createSession()`; the TV owns session creation and relay-session creation before the QR/bootstrap is presented.

The phone never polls/decrypts its own payload.

## 10. Sensitive-data lifetime

Provider data exists only in DOM input values and controller memory for the active phone page.

PAIR-WEB must not:

- use `localStorage`, `sessionStorage`, IndexedDB, cookies, service-worker caches, URL query/hash, analytics payloads, telemetry, or console logging for provider data;
- put plaintext provider data in the relay request body;
- put plaintext provider data in DOM dataset attributes;
- include plaintext provider data in thrown/public error messages;
- persist the PAIR-C sender private key; PAIR-C owns ephemeral non-extractable key material.

After success, the controller drops its plaintext input state. The view clears/removes provider input elements when rendering success.

## 11. View behavior

`phone-view.ts` renders a mobile/browser-oriented, accessible surface using DOM creation and `textContent`/safe value assignment.

Required flow:

- invalid bootstrap -> sanitized unable-to-pair state without rendering raw bootstrap values;
- provider choice: Xtream / M3U;
- provider form with explicit labels;
- submit action;
- Back action from a form returns to provider choice;
- sanitized validation/error text in `aria-live` status;
- sending disables duplicate submit and form switching;
- success confirms that the information was sent to the TV without echoing provider data;
- expired state instructs the user to start pairing again on the TV.

Keyboard/touch/browser accessibility:

- native inputs/buttons remain focusable;
- Enter on explicit submit may submit;
- focus moves to the first invalid field on validation failure;
- reduced-motion CSS is respected;
- no Samsung-TV remote assumptions are introduced into this phone surface.

## 12. Production ports

`PairingPhoneController` depends on narrow ports:

```ts
interface PairingPhoneCryptoPort {
  encryptForTv(tvPublicKey: JsonWebKey, plaintext: Uint8Array): Promise<PairingCiphertextV1>;
}

interface PairingPhoneRelayPort {
  putCiphertext(request: { sessionId: string; ciphertext: string }): Promise<void>;
}
```

The production adapter can be a tiny factory that binds:

- `encryptForPairingTv` from PAIR-C;
- an already-constructed `PairingRelayClient` from PAIR-R.

Bootstrap relay URL normalization must reuse `normalizePairingRelayBaseUrl()` or a production `PairingRelayClient` construction path that executes that exact validation; PAIR-WEB must not fork the HTTPS/user-info rule.

The controller must not import CredentialStore, Provider Core, provider repositories, watch/Favorites storage, Live TV, `main.js`, or TV playback.

## 13. Hosting/deployment boundary

PAIR-WEB is a browser-mountable module in this repo; it does not claim a public hosted phone URL.

No real relay origin or production web host is committed in this lane. Tests use synthetic `.invalid` origins/bootstrap values.

A later deployment/integration step may host the phone bundle/page and construct `PairingPhoneBootstrapV1`, but it must not change the payload/crypto/relay contracts frozen here without Controller approval.

Relay rate limiting/brute-force protection remains a server/deployment requirement and is not falsely claimed by this UI branch.

## 14. Preferred production scope

```text
player/src/pairing/phone-payload.ts
player/src/pairing/phone-controller.ts
player/src/pairing/phone-view.ts
player/src/ui/pairing-phone.css
player/test-ts/pairing-phone-payload.test.ts
player/test-ts/pairing-phone-ui.test.ts
```

A tiny `player/src/pairing/create-phone-pairing.ts` production adapter is allowed only if it materially simplifies binding PAIR-C/PAIR-R without moving UI/domain behavior into the adapter.

Forbidden:

- changes to `pairing/crypto.ts`;
- changes to `pairing/session.ts`;
- changes to `pairing/relay-contracts.ts` or `pairing/relay-client.ts` unless a reproduced contract bug is separately escalated;
- TV QR/session composition;
- Provider Core/onboarding transaction changes;
- CredentialStore/storage changes;
- `main.js`, Live TV, Home, playback, or provider runtime changes;
- real provider credentials/endpoints or real relay credentials/endpoints.

## 15. Acceptance tests

PAIR-WEB must prove:

- valid bootstrap contains no provider data/private key;
- invalid bootstrap version/session/time/relay fails closed with `INVALID_BOOTSTRAP` and zero crypto/relay calls;
- exact Xtream and M3U payload key sets/version are deterministic;
- strict decoder rejects extra/unknown keys and malformed/unknown payloads;
- payload encodes to UTF-8 bytes and encrypts through the injected crypto port;
- relay receives only session ID + serialized PAIR-C ciphertext envelope;
- no plaintext server URL/username/password/M3U URL appears in relay body, public controller error, console calls, or persistent browser storage;
- duplicate submit produces one crypto call and one relay write;
- expired bootstrap produces no crypto/relay call;
- Xtream required-field failure stays local;
- M3U validation reuses existing validation codes and preserves the input;
- crypto unavailable / invalid TV key map to fixed sanitized UI errors;
- relay network/unavailable failures map to fixed sanitized UI errors;
- retry keeps form input only in memory;
- success clears plaintext controller/view state;
- browser focus/accessibility behavior remains deterministic;
- no PAIR-C/S/R implementation semantics are duplicated.

## 16. Verification contract

Final PAIR-WEB production head must provide fresh exact-head evidence for:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

`tizen:build` is repository/staging compatibility evidence only. A phone browser deployment and physical Samsung/Tizen pairing flow remain `NOT VERIFIED` until separately executed.

## 17. Opening gate for PAIR-I

PAIR-I remains blocked until:

- this PAIR-WEB payload/UI contract is approved, implemented, merged, and frozen;
- pairing core remains unchanged/frozen;
- final Xtream/M3U onboarding transaction contracts remain available;
- the TV-side QR/bootstrap representation is bounded to `PairingPhoneBootstrapV1` or an explicitly version-compatible equivalent.

PAIR-I then owns TV session -> QR/bootstrap -> relay poll -> envelope parse -> PAIR-C decrypt -> strict `PairingProviderPayloadV1` parse -> existing Xtream/M3U onboarding handoff -> single-use completion.

## 18. Non-goals

PAIR-WEB does not:

- host or deploy a relay;
- host or deploy a public phone site;
- generate TV sessions or QR codes;
- decrypt on the phone;
- register providers;
- persist credentials;
- expose plaintext credentials to the relay;
- redesign PAIR-C/S/R;
- claim end-to-end physical pairing acceptance.
