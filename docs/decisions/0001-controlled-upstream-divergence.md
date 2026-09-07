# ADR 0001: Controlled Upstream Divergence

- Status: Accepted
- Date: 2026-09-07

## Context

BabuşTV starts from EN TV Player because its Samsung Tizen playback and packaging behavior already solves platform-specific problems that should not be rediscovered during product work. BabuşTV also needs a different provider model, cache architecture, focus system, UI, pairing subsystem, testing discipline, and brand.

## Decision

Keep `Nur-allhi/en-tvplayer` as the `upstream` Git remote and preserve its history, but do not require BabuşTV to remain mechanically mergeable with upstream.

Upstream changes are classified as:

- security
- playback
- Tizen compatibility
- product feature
- UI-only

Security, playback, and Tizen compatibility fixes receive priority review. Relevant changes are reproduced or otherwise shown relevant, then ported or cherry-picked deliberately and verified against BabuşTV tests.

## Consequences

- BabuşTV can evolve independently.
- Upstream fixes remain discoverable.
- Upstream merges are never automatic.
- Refactoring inherited playback code requires characterization tests first.
