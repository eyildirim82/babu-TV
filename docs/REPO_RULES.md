# BabuşTV Repository Rules

## Branches

- `main` — always buildable; no development commits after the one-time upstream bootstrap
- `docs/*` — documentation/spec/plan work
- `feature/*` — user-visible functionality
- `fix/*` — bug fixes
- `refactor/*` — behavior-preserving structural work
- `spike/*` — bounded technical investigations

## Pull Requests

- Every development branch reaches `main` through a pull request.
- Keep each PR bounded to one behavior or one architectural step.
- The exact PR head must pass required verification before completion or merge claims.
- Merge only after explicit user approval.
- Prefer squash merge for BabuşTV-owned development unless preserving imported history is the explicit task.

## Commits

Use Conventional Commit style where practical:

- `feat(scope): ...`
- `fix(scope): ...`
- `test(scope): ...`
- `refactor(scope): ...`
- `docs(scope): ...`
- `chore(scope): ...`

Keep one logical change per commit.

## Test Discipline

For behavior changes and bugs:

1. reproduce or characterize the existing behavior
2. establish RED
3. implement the minimum change
4. reach GREEN
5. run relevant regression tests
6. run full task verification
7. review the diff against the active spec/plan

Do not guess at fixes before root cause is established.

## Secrets and Provider Data

Never commit:

- Xtream usernames/passwords or provider tokens
- secret M3U URLs or credential-bearing stream URLs
- real provider channel/EPG dumps
- private playlist snapshots
- Tizen signing private keys/certificates
- pairing plaintext or decrypted provider payloads

Use synthetic fixtures only. Sanitize URLs and request metadata before logging.

## Upstream

`Nur-allhi/en-tvplayer` remains the upstream reference. Do not automatically merge upstream.

Prioritize review of upstream:

1. security fixes
2. playback fixes
3. Tizen compatibility fixes
4. packaging/install fixes

For relevant changes, inspect the exact diff, establish relevance or reproduce where practical, port deliberately, and verify against BabuşTV tests.

The pinned starting point is documented in `docs/UPSTREAM_BASELINE.md`.
