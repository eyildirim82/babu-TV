# Tizen Packaging Baseline

**Date:** 2026-09-07  
**Branch probe head:** `7daf543ad293a953643adffa4e0a4cbfa64d0ead`  
**GitHub Actions run:** `34151253687`  
**Environment:** Ubuntu 24.04, Node 22.23.2, npm 10.9.8

## Commands

```bash
npm ci
npm run build
npm run tizen
```

## Observed Result

- `npm ci`: PASS; 17 packages added, 0 reported vulnerabilities.
- production Vite build: PASS.
- inherited WGT packaging: PASS.
- OpenSSL was available as `openssl`.
- Tizen SDB was not installed; the inherited packager explicitly skipped its SDB check and continued with packaging-only behavior.
- no author certificate/key existed initially, so the inherited packager generated a developer certificate for the ephemeral CI runner.
- output: `beta/EN-IPTV_Player_v1.10.1_7daf543.wgt`.
- output size reported by the packager: 387.8 KB.
- `tizen/author-key.pem` and `tizen/author-cert.pem` are covered by `.gitignore`.

## Existing Build Warnings

The inherited baseline builds successfully but Vite reports two existing warnings:

1. the Tizen `$WEBAPIS/webapis/webapis.js` script cannot be bundled as a module;
2. the minified JavaScript bundle is larger than Vite's 500 KB warning threshold (observed `913.82 kB`, gzip `296.09 kB`).

These are baseline observations, not M0 regressions.

## Existing Packaging Side Effect

On Ubuntu, packaging left an untracked file:

```text
?? tizen/nul
```

This comes from the inherited SDB-detection path using Windows-style `2>nul` redirection. Packaging still completed successfully. M0 records this behavior and intentionally does not alter the inherited packager; any cleanup/fix should be a separately scoped task with tests.

## Release Safety

The CI-generated developer signing key is ephemeral and must never be treated as a release key. Real BabuşTV releases require an intentionally managed signing identity and secure off-repository backup policy.
