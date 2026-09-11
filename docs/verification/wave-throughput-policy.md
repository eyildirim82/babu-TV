# BabuşTV Wave Throughput Policy

Date: 2026-09-11  
Owner: REVIEW / Integration Controller  
Status: APPROVED PROCESS DECISION

This document is a normative amendment to `docs/verification/parallel-development-control.md`. Where older wording could be read as serializing otherwise independent work inside a wave, this policy governs: wave boundaries stay, but independent production lanes run concurrently and wait only at real dependency edges.

## Decision

Wave boundaries remain part of the BabuşTV development process, but a wave is a synchronization and integration boundary, not a requirement to execute every task serially.

The default execution model is:

```text
stable GREEN wave base
        ↓
central design/controller decisions
        ↓
3–5 independent production lanes in parallel
        ↓
controller audit per lane
        ↓
wait only at real integration dependencies
        ↓
integration/retarget lane when required
        ↓
post-merge GREEN main
        ↓
next dependency edge / next wave
```

## Operating rules

1. Keep wave boundaries. They remain useful for freezing contracts, controlling integration order, and preventing unrelated changes from accumulating on `main`.
2. Do not treat a wave as a serial queue. Independent lanes should start concurrently once their exact base, scope, and consumed contracts are frozen.
3. Default to 3–5 active production lanes when file ownership and semantic dependencies are non-overlapping. Higher concurrency is allowed only when controller/CI capacity and isolation remain clear.
4. Keep design and controller authority centralized. Workers may implement bounded approved work, but they do not independently redefine cross-lane contracts or merge order.
5. Wait only for real dependencies: shared hot-zone ownership, an unfrozen required contract, an integration seam that must consume another lane, or a post-merge `main` verification gate.
6. A worker lane being GREEN does not automatically make it independently merge-ready. If another active lane introduces a required contract or composition change, use an explicit integration/retarget lane on the latest GREEN `main` instead of creating a broken intermediate `main` state.
7. Every production lane still requires exact-head verification, exact-scope review, controller audit, and Draft-PR discipline before Ready/merge.
8. After every merge that changes a dependency edge, require a successful push-triggered verification on the resulting exact `main` SHA before dependent work advances.
9. Documentation/evidence branches do not count as production-lane concurrency and must not silently become production integration bases.
10. Prefer thinner waves with clearer dependency edges over large waves that combine many unrelated composition, security, provider, and UI dependencies.

## Why this policy exists

The previous wave model prevented serious integration mistakes, but throughput drops when every lane waits for unrelated work inside the same wave. The safety benefit comes from frozen bases, explicit ownership, contract discipline, controller review, and post-merge verification—not from unnecessary serialization.

This policy therefore preserves the safety boundaries while increasing useful parallelism:

```text
wave boundary stays
+ controller stays centralized
+ exact-base / exact-scope gates stay
+ post-merge GREEN stays
+ independent lanes run concurrently
+ waiting is limited to genuine dependency edges
```

## Merge-readiness rule

A lane is merge-ready only when all of the following are true:

- its own exact-head gates are GREEN;
- its owned scope is clean;
- controller audit accepts its invariants;
- no active or already-merged dependency makes its current contract stale;
- merging it cannot knowingly leave `main` in a state where an existing production composition cannot satisfy a newly required contract.

When the last condition is not true, the correct outcome is `IMPLEMENTATION READY / INTEGRATION PENDING`, not direct merge.

## Wave completion rule

A wave is complete when its required integration edges are closed and the resulting `main` is GREEN. Individual worker PR completion alone does not close a wave.

Physical Samsung/Tizen runtime evidence remains a separate release-acceptance concern unless a specific wave explicitly requires on-device evidence.
