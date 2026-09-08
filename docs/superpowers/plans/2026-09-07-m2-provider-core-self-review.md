# BabuşTV M2 Provider Core Plan — Self-Review Clarifications

**Status:** Normative addendum to `2026-09-07-m2-provider-core.md`. If this file is more specific than the main plan, this file wins.

The main plan was checked against the approved V1 spec for scope coverage, placeholder language, and type/interface consistency. The following details are locked before implementation so no task must invent policy while coding.

## 1. Xtream duplicate and stream-extension policy

- `stream_id` is the provider's logical live-channel identity.
- If `get_live_streams` returns the same valid `stream_id` more than once, **the first valid occurrence wins**. Later duplicates are ignored for normalized catalog output and stream metadata.
- `container_extension` is accepted only after trimming and matching `^[A-Za-z0-9]+$`; otherwise the adapter uses `ts`.
- `resolveStream()` URL shape is `<normalized-server>/live/<encoded-username>/<encoded-password>/<encoded-stream-id>.<extension>`.
- The credential-bearing generated URL is transient `StreamRequest` data. It is never placed in `Channel`, `ProviderRecord`, ordinary IndexedDB catalog rows, errors, or logs.

## 2. M3U category and stable channel identity policy

Normalize group display text by trimming surrounding whitespace without case-folding the visible label.

For every non-empty group:

```ts
categoryId = `group:${fnv1a32(group.trim().toLocaleLowerCase('tr-TR'))}`;
```

The first-seen trimmed display label is retained for that category ID. Channels with no non-empty group use `categoryId: null`.

Channel identity is deterministic and independent of array order:

```ts
const fingerprint = fnv1a32(
  `${streamUrl.trim()}\u0000${name.trim()}\u0000${group?.trim() ?? ''}`,
);

if (tvgId?.trim()) {
  const base = `tvg:${tvgId.trim()}`;
  // First occurrence keeps base. A later duplicate tvg-id receives a stable
  // fingerprint suffix so distinct streams never collapse by list position.
  id = firstOccurrence ? base : `${base}:${fingerprint}`;
} else {
  id = `stream:${fingerprint}`;
}
```

If an exact duplicate entry repeats with the same `tvg-id` and same fingerprint, keep the first and ignore later exact duplicates. This prevents repository key collisions without raw-index identity.

The fallback hash is an **identity hash, not a security primitive**. Raw stream URLs remain transient and are not persisted merely because a hash was computed from them.

## 3. M3U fetch reuse inside one adapter instance

A provider-scoped `M3uProvider` keeps one parsed in-memory snapshot after a successful load. `getProfile()`, `listCategories()`, `listChannels()`, and `resolveStream()` reuse that snapshot inside the same adapter instance instead of refetching the same playlist for every method.

A new sync operation may create a new adapter instance so background refresh observes provider changes. On a fresh app process before refresh, cached display channels can be shown, but raw M3U stream resolution is unavailable until the adapter has successfully loaded the playlist. M2 deliberately prefers this limitation over persisting credential-bearing stream URLs in ordinary IndexedDB.

## 4. Provider registration transaction policy

`ProviderCoreService` must also expose:

```ts
registerProvider(
  provider: ProviderRecord,
  credential: ProviderCredential,
): Promise<ProviderProfile>;
```

Registration order is:

1. reject duplicate provider ID;
2. reject `provider.kind !== credential.kind`;
3. create adapter and call `getProfile()` to validate **before persistence**;
4. save credential through `CredentialStore`;
5. save non-secret `ProviderRecord` through `ProviderRepository`;
6. if metadata persistence fails after credential save, remove that just-written credential before rethrowing a sanitized error;
7. return the normalized profile.

Registration does **not** silently set the active provider and does not perform UI navigation. M5 onboarding will explicitly orchestrate registration -> initial sync -> active-provider selection -> Home.

Tests must cover invalid credential leaving no metadata/credential behind, credential-save failure leaving no metadata behind, and provider-repository failure rolling back the credential.

## 5. Review result

With these clarifications, the M2 plan covers the approved M2 scope without pulling M3–M6 UI/EPG/favorites/pairing work forward. No implementation placeholder remains in the normalization, duplicate identity, registration, or credential persistence policies above.
