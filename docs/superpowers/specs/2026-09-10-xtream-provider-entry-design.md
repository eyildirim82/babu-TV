# BabuşTV Xtream Provider Entry Design

**Status:** Approved design for implementation before M4 EPG work.

## 1. Goal

Add a remote-first Xtream Codes provider-entry flow that accepts server URL, username, and password, validates and persists the provider through Provider Core, performs an initial sync, validates the resulting cache, activates the provider only as the final onboarding commit point, and then enters the existing M3 Live TV runtime through a clean application reload.

This is a bounded pre-M4 product slice. It does not implement EPG, Home, favorites, search, QR/phone pairing, or M3U migration.

## 2. Existing contracts reused

The implementation must reuse, not duplicate:

- `ProviderCoreService.registerProvider(provider, credential)` for validation-before-persist and registration rollback.
- `ProviderSyncService.refresh(providerId)` for provider-scoped initial catalog sync.
- `ProviderCoreService.loadCached(providerId)` for post-sync cache validation before activation.
- `ProviderCoreService.switchActiveProvider(providerId)` for the final active-provider commit point.
- `ProviderCoreService.deleteProvider(providerId)` for compensation if post-registration onboarding fails.
- the existing `createBrowserLiveTvRuntime()` boot path for M3 startup after reload.

Xtream credentials remain shaped as:

```ts
{
  kind: 'xtream';
  serverUrl: string;
  username: string;
  password: string;
}
```

## 3. User flow

The first implementation exposes a dedicated full-screen BabuşTV surface named **“Xtream Codes ile Bağlan”** with exactly these interactive controls:

1. `Sunucu URL'si`
2. `Kullanıcı adı`
3. `Şifre`
4. `Bağlan`
5. `Geri`

The password input is masked. TV keyboard entry is sufficient; QR/phone input is out of scope.

Pressing `Bağlan` runs this exact sequence:

```text
trim form values
→ reject empty fields locally
→ construct a new Xtream ProviderRecord + XtreamCredential
→ registerProvider()
→ initial ProviderSyncService.refresh()
→ require channels.status === 'success'
→ load/confirm cached snapshot
→ switchActiveProvider()
→ report success to integration callback
→ reload the application
→ existing boot path starts M3 from the active provider
```

A successful channel sync with zero channels is still a successful provider connection. The UI may show an empty Live TV catalog; it must not invent a provider failure merely because the valid provider returned zero live channels.

Category sync is non-blocking for onboarding. If categories fail but channels succeed, cache validation and activation proceed because Live TV can operate with the channel catalog.

## 4. Transaction and compensation policy

Registration itself remains governed by the existing Provider Core transaction contract.

After `registerProvider()` succeeds, the onboarding service owns compensation until activation completes. The active provider must not change until sync and cache validation have both succeeded. If any of these occur:

- initial sync throws;
- initial sync reports `channels.status === 'failed'`;
- loading the post-sync cache fails;
- active-provider selection fails;

then the onboarding service calls `deleteProvider(providerId)` before surfacing a sanitized error.

Compensation is best-effort. Cleanup failures must never replace a more useful original safe provider error and must never expose credential values.

Because cache validation happens before `switchActiveProvider()`, any pre-activation failure leaves the previously active provider untouched. Activation is the final onboarding commit point.

No failed onboarding attempt may intentionally leave the new provider active. If the repository itself throws during active-provider persistence after partially mutating state, the onboarding service still performs best-effort `deleteProvider(providerId)` compensation.

## 5. Provider identity and display name

The form does not ask the user for a provider display name.

The orchestration layer receives an injectable `createProviderId(): ProviderId` dependency so tests are deterministic and UI code never derives identity from credentials.

Production IDs are opaque and must not contain server URL, username, password, or hashes derived from credential material.

The initial `ProviderRecord.name` is a non-secret display label derived from the normalized server host when possible; otherwise it is `Xtream`. Account/profile metadata returned by validation is not required to rename the provider in this slice.

## 6. Orchestration boundary

Create a focused TypeScript service with a UI-independent contract:

```ts
export interface XtreamConnectInput {
  serverUrl: string;
  username: string;
  password: string;
}

export interface XtreamConnectSuccess {
  providerId: ProviderId;
  profile: ProviderProfile;
  snapshot: ProviderSnapshot;
}

export class XtreamOnboardingService {
  connect(input: XtreamConnectInput): Promise<XtreamConnectSuccess>;
}
```

Its dependencies are ports for Provider Core registration/switch/delete/cache load, provider sync, provider-ID creation, and current time. It must not import DOM, `settings.js`, localStorage, playback, remote handling, or Tizen APIs.

## 7. Error behavior

The service preserves `ProviderError.code` where available. Unknown failures become `UNAVAILABLE` with a safe generic message.

The UI maps safe codes to Turkish-first copy:

| Code | User-visible message |
| --- | --- |
| `AUTH` | `Kullanıcı adı veya şifre hatalı.` |
| `NETWORK` | `Sunucuya ulaşılamadı.` |
| `TIMEOUT` | `Bağlantı zaman aşımına uğradı.` |
| `NOT_FOUND` | `Sunucu kaynağı bulunamadı.` |
| `SERVER` | `Sunucu geçici bir hata döndürdü.` |
| `MALFORMED` | `Sunucu yanıtı desteklenmiyor.` |
| `UNAVAILABLE` | `Bağlantı kurulamadı.` |

Local empty-field validation uses `Sunucu, kullanıcı adı ve şifre gerekli.` and does not invoke Provider Core.

A failed connection keeps all three entered values in the live form so the user can correct only the bad field. The password remains masked.

## 8. Presentation and focus behavior

The new surface uses the existing BabuşTV tokens/primitives and violet remote focus contract. It must not reintroduce inherited orange styling.

Focus order is deterministic and vertical:

```text
server URL → username → password → Bağlan → Geri
```

Remote Up/Down moves within that order without changing provider state. Select/OK on an input focuses the TV keyboard field; Select/OK on `Bağlan` submits; Select/OK on `Geri` returns to the existing legacy settings/first-launch path.

While a connection attempt is in flight:

- `Bağlan` cannot start a second concurrent attempt;
- fields remain rendered;
- status text shows `Bağlanıyor…`;
- Back does not tear down the in-flight entry surface; it becomes effective again after a failure clears the pending state.

On failure, focus returns to `Bağlan` and the safe error appears without clearing inputs.

## 9. Integration boundary

Do not embed Provider Core credential logic into legacy `settings.js`.

The integration layer owns construction of the Provider Core repositories, credential store, HTTP client, adapter factory, sync service, and `XtreamOnboardingService`. Shared construction should be factored so onboarding and `createBrowserLiveTvRuntime()` use compatible persistence boundaries without duplicating credential policy.

The first-launch/settings entry point may expose a new action such as `Xtream Codes` that opens the dedicated surface. Existing M3U playlist management remains untouched.

On successful connection, the integration callback performs a controlled page reload (`window.location.reload()`). This is intentional: it guarantees the existing startup path creates exactly one M3 controller, remote registration set, and Tizen hardware-key listener instead of attempting an unsafe in-process legacy-to-M3 runtime swap.

## 10. Security and privacy constraints

- Never write Xtream username/password/server credential URLs to localStorage.
- Never place credentials in DOM `data-*` attributes, provider IDs, logs, error messages, screenshots, or test artifacts.
- Password input uses `type="password"`.
- Structured provider/catalog storage remains non-secret.
- Credential persistence goes only through the existing `CredentialStore` boundary.
- Tests use synthetic credentials only.

## 11. Parallel implementation model

### XT-A — orchestration/core

Owns only the UI-independent onboarding transaction and tests.

Expected primary files:

- `player/src/providers/xtream-onboarding-service.ts`
- `player/test-ts/xtream-onboarding-service.test.ts`

It must not edit HTML/CSS/settings/main integration files.

### XT-B — presentation

Owns only the dedicated Xtream provider-entry surface, Turkish copy, focus behavior, and presentation tests. It consumes a callback/port and does not construct repositories or credentials.

Expected primary files:

- `player/src/xtream-entry.ts`
- `player/src/ui/xtream-entry.css`
- `player/src/ui/copy.js` / `copy.d.ts` only for shared user-visible strings if needed
- focused UI acceptance tests

It must not edit Provider Core/repository/credential implementation.

### XT-C — integration

Starts only after XT-A and XT-B contracts are GREEN. It wires the UI callback to `XtreamOnboardingService`, provides production repository/runtime dependencies, exposes the first-launch/settings entry action, and reloads on success.

Integration may touch `main.js`, `index.html`, shared runtime construction, and focused integration tests, but must not broaden into EPG/Home/favorites/search/playback semantics.

## 12. Acceptance criteria

The slice is complete when all of the following are true:

1. Xtream form is remote-usable with server URL, username, masked password, Bağlan, and Geri.
2. Empty fields fail locally without persistence/network work.
3. Wrong credentials, network failure, timeout, malformed response, server error, and unavailable state show safe Turkish copy.
4. Failed attempts preserve entered form values.
5. Validation occurs before provider/credential persistence through the existing registration contract.
6. Initial sync occurs after registration.
7. Channel sync failure compensates by deleting the newly registered provider and credentials/catalog.
8. Category-only failure does not block activation when channel sync succeeds.
9. Post-sync cache is loaded successfully before active-provider state changes.
10. Active provider changes only as the final onboarding commit point after channel sync and cache validation succeed.
11. Pre-activation failure compensates the new provider without changing the previous active provider; activation failure also triggers best-effort compensation.
12. Successful connection triggers exactly one integration success callback and reload path.
13. No credential material enters logs, localStorage, ordinary provider/catalog persistence, IDs, or test artifacts.
14. Existing M3U/legacy flow and M3 playback/remote semantics remain unchanged.
15. Focused tests, full `npm test`, typecheck, production build, and clean-diff are GREEN on exact final heads.
16. Tizen-only credential persistence/runtime behavior is not claimed PASS without real Tizen evidence.
