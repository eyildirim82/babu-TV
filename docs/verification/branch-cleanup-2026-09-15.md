# Repository Branch Cleanup — 2026-09-15

**Requested by:** the owner, in preparation for handing the project over (see [`HANDOVER.md`](../../HANDOVER.md)).
**Base:** `main@a792270`.

## Rule

A remote branch was deleted when either:

1. every commit on it was already reachable from `main`; or
2. it had a merged or closed pull request. GitHub keeps those commits under the pull request and offers **Restore branch** on the PR page.

Branches whose commits are not on `main` and that never had a pull request were kept: CI verification/evidence branches, plus three documentation branches whose files were imported into `main` by #147.

To restore any deleted branch from its recorded tip: `git push origin <sha>:refs/heads/<branch>` (the commit must still be available locally or through its PR).

## Result

- Deleted: **124** branches (30 fully contained in `main`, 94 with a merged or closed PR). All batches succeeded.
- Kept: **61** branches.
- Two branches existed only on the owner's machine, with unique commits and no PR. They were published as Draft PRs instead of being deleted: #148 (`chore/tizen-real-tv-deploy`, a real-TV install fallback) and #149 (`fix/copy-declaration-line-endings`, a Windows CRLF test fix).
- Local: 14 stale git worktrees from earlier sessions were unregistered and all local branches except `main` were deleted, after confirming each was clean and preserved on `main` or in a PR.

## Incident: signed rc.2 package deleted

The pre-removal check covered tracked and untracked files but not git-ignored build output.

- **What was lost:** removing the stale `verification/v1-rc2-package` worktree deleted its ignored `tizen/build/` directory. That directory held the only copy of the locally signed `babustv_beta_v1.0.0-rc.2_77b0a5b.wgt` (SHA-256 `ea127ca6ac2f8d47728ae603cb99409c7ed5fee96e057a703e6eb3df18acecf1`), which had never been distributed.
- **What was preserved:** the owner's machine still has a copy of the signed rc.1 package (`babustv_beta_v1.0.0-rc.1_c3c9709.wgt`, SHA-256 verified `7601527b…99173e`). It also has the unpacked contents of the rc.2 package, including `author-signature.xml` and `signature1.xml`, and the rc.2 packaging log. These were copied outside temporary folders.
- **Impact:** low. `1.0.0-rc.3` will supersede rc.2, and rc.2 can be rebuilt from tag `v1.0.0-rc.2`, but re-signing needs the owner's certificate. The remaining stale directories were left untouched after the incident.
- **Lesson:** before removing a worktree, also check ignored output with `git status --ignored` and search for `*.wgt`, `*.p12` and `*.pem`.

## Deleted branches

| Branch | Tip SHA | Why deleted |
| --- | --- | --- |
| `docs/b0-babustv-brand-separation` | `380f67f4a7e571bffaf3b321e6f66c1cf127f869` | merged PR #17 |
| `docs/close-open-work` | `cf8414fbefa0fead39d9218b1fb5544429250c66` | merged PR #32 |
| `docs/m0-baseline-bootstrap` | `4bd433db29a6210daf07e8c7a956688c9d98ec88` | merged PR #1 |
| `docs/m3-live-tv-core-design` | `a70410c41358fc09df80f62a17e08e4d8998681e` | merged PR #10 |
| `docs/m3-live-tv-verification` | `f9c204baaafe80513358feb8d1d04f24b68ecaeb` | closed PR #22 |
| `docs/m7-hardening-execution` | `091fe93fd5073ca6a21f04f54aacd764afff60da` | closed PR #89 |
| `docs/parallel-development-control` | `9c73a9e942ac073931f3cebbf2afb497e95277c7` | merged PR #25 |
| `docs/rc-browser-execution` | `bf9890c31c31db6ac0748fab1bc581f0c7e05546` | closed PR #97 |
| `docs/rc-controller-closeout-rc-package` | `3beb681bdd4c38b44bb60b0e336853ec831dc939` | merged PR #136 |
| `docs/rc-f0-closeout-wave1-base` | `edfd95caafd94689e5869586773bb6ef202c5271` | merged PR #39 |
| `docs/rc-f0-plan` | `1e2dbc9c31921813063e48278801b50b0f60cf89` | closed PR #35 |
| `docs/rc-package-closeout` | `3f4a02e1b673a6eb6c7cb2eed75f481ec7db80c8` | merged PR #138 |
| `docs/rc2-closeout` | `f0aab368e00436125041034c593294f815c9ba92` | merged PR #141 |
| `docs/v1-history-and-refresh` | `da2e223803b6d53bfe54bba658e7b4ddd169dd3b` | all commits already on `main` |
| `docs/v1-maximum-parallel-execution` | `de60819be1bab69c24776a2cf5d50e1429ca1a3d` | merged PR #34 |
| `docs/v1-rc-f0-plan` | `98ca7e6d6746c897d61d950081773b8dfdeebec6` | merged PR #36 |
| `docs/v1-rc-roadmap` | `28bd0ee7c7cb89352a782d0669e6e56554186802` | merged PR #33 |
| `docs/wave1-bounded-plans` | `ce00fe42f7aaec802350d449b4a6e12734e8dc5f` | merged PR #40 |
| `docs/wave3c-m5-pair-web-design` | `0698d3256b403e6e4e4d34f5e964161a065c4fd4` | closed PR #80 |
| `feat/m2a-provider-security-foundation` | `29f1da97c3033221fa225faea384a7d4055441fd` | merged PR #6 |
| `feat/m2b-xtream-provider` | `d8b161988ea350ee69d3833e62498211f38df468` | merged PR #7 |
| `feat/m2c-m3u-provider` | `2ef2b558cc70462e377da6871b9a4fd6f2f96c51` | merged PR #8 |
| `feat/m2d-provider-cache-sync` | `8c59ffa85fab4153aed644f9ce4d7c8429edd538` | merged PR #9 |
| `feature/b0b-design-system` | `a460c331ac830833a2f23dd020b7c2626473cd7c` | merged PR #19 |
| `feature/b0c-brand-assets` | `b7b0b71718b1222478f4d12f7f5a94a140d77d5a` | merged PR #20 |
| `feature/b0d-shell-rebrand` | `50ec2ab35e023041be0f1f0d6c73375961b99179` | merged PR #24 |
| `feature/b0e-live-tv-visual-reset` | `ea9a4b974025032cd50c3fa192c2fd4187eb2abf` | merged PR #26 |
| `feature/b0f-settings-copy-cleanup` | `c95396d904f7350922c5f7288af736a26f9eb756` | merged PR #21 |
| `feature/b0g-brand-hardening` | `5327edee5c9e8ed479dc8102e6ebf90a62ece6fa` | merged PR #27 |
| `feature/channel-actions-ui` | `472abab1c49219db7b164d4ca9b2db2cd873a1df` | merged PR #60 |
| `feature/epg-channel-mapper` | `0b0c6cd1aedc2a2df9fefb91c615d82fb42edf25` | merged PR #42 |
| `feature/epg-live-tv-ui` | `4220d47426415ef2f97cf928780b4d215a6500fc` | merged PR #59 |
| `feature/epg-normalizer` | `f4bc411ee1d0c8ef6d76a193d7db8eadde407f14` | merged PR #41 |
| `feature/epg-query-engine` | `4f417487c5dd0e03f6aeea7baa27400c7c6be27f` | merged PR #45 |
| `feature/epg-xmltv-parser` | `f28dc56ad597f38f5d490d5a2b3a88fec3e43d2c` | merged PR #49 |
| `feature/epg-xtream-adapter` | `052751aec5f84fb5a1297589a257fa70930cd653` | merged PR #47 |
| `feature/favorites-domain` | `3615617359bfb52abb1c38b3f95a436939bd24cc` | merged PR #48 |
| `feature/favorites-ui` | `2e610f515c79d28fa0322e448af29c1416c11127` | merged PR #58 |
| `feature/first-run-ui` | `06e390f4f8170bbb6dc409fd0418eb54e6ce04a2` | merged PR #65 |
| `feature/home-domain` | `d39dccaa0e1a55ad5e1332a07a0e593b703e4ee2` | merged PR #64 |
| `feature/home-ui` | `7595281951251f04ae93209c73a9441e5b7563c5` | merged PR #71 |
| `feature/m3a-live-tv-state` | `cd3c2d8a800e25300ad386ac694a9f5abbed34a5` | merged PR #11 |
| `feature/m3b-channel-intent` | `895ae844a8745d3d8dfe71926ac664db73977a27` | merged PR #12 |
| `feature/m3c-playback-engine-boundary` | `e88aaeccc7887f90d00ca82221833ec20d66fcee` | merged PR #13 |
| `feature/m3d-session-recovery` | `3361e2b4801b20ed2b6ea80422ada52db9ebc291` | merged PR #14 |
| `feature/m3e-remote-numeric` | `d5244b8be5333b53bf712371378c507101f9e2c3` | merged PR #15 |
| `feature/m3f-live-tv-integration` | `611ec7cdddd333dea5a73ba197b1acb3c444a716` | merged PR #16 |
| `feature/m3u-entry-validation` | `ef15155f3bf011f97f332d1bf0b4717a46dd237c` | merged PR #43 |
| `feature/m3u-onboarding-ui` | `f22d596ba7db49158b3951cc967fc1b950cb9ad4` | merged PR #61 |
| `feature/pairing-crypto` | `6806175956190d95f55f0ff6b3d732bf087d3999` | merged PR #74 |
| `feature/pairing-default-relay-config` | `3d6834c66b1d86aa4e333b25067987802a3c839f` | all commits already on `main` |
| `feature/pairing-relay-cloudflare` | `037da23c2f69daeb26950874cbeed39d3586dfb1` | all commits already on `main` |
| `feature/pairing-relay-contract` | `785cc014613011a91a29a284377974a69c17165a` | merged PR #73 |
| `feature/pairing-relay-server` | `02e44ffbf2d52a239584a0683bc5e24d77bb7fd5` | all commits already on `main` |
| `feature/pairing-session` | `20dac66aab17f3dc2858ab594e78c50afa264ceb` | merged PR #72 |
| `feature/provider-management-ui` | `36ca3a7abba94aeae6076da919c1c07a0deeb4b9` | merged PR #63 |
| `feature/provider-reentry` | `2d576dfc8b4fff84fb6ddf096b1f470e73d70c4d` | closed PR #81 |
| `feature/search-core` | `8813df4304622210e294e0b78bd516fc077c4ca6` | merged PR #51 |
| `feature/search-ui` | `5eea64fce5d6eb0e8265580bcbd3c9dcf303f6df` | merged PR #62 |
| `feature/watch-score` | `de1186a2556faff1b11360e1aff2fca010cc252f` | merged PR #46 |
| `feature/watch-state-domain` | `36885456b0fb53b8a6182d50dba3ba14c4f19ab8` | merged PR #44 |
| `feature/xt-a-xtream-onboarding-core` | `17b1ff14aaae3b7c9d588af562a9c7614736e751` | merged PR #29 |
| `feature/xt-b-xtream-entry-ui` | `08971c6d9219aa8a43833b82a75f567818807b47` | merged PR #30 |
| `feature/xt-c-xtream-entry-integration` | `95a23139a206f923f1d8ee1badccaee6ff784231` | merged PR #31 |
| `feature/xtream-core-hardening` | `d2342fb4c2425dd6416c0eb92b1b76f197e8c3ba` | merged PR #28 |
| `fix/credential-store-serialize` | `e76a9ea78aea72ae0c64dbeb1f5758dfe415ddee` | merged PR #133 |
| `fix/rc-demo-findings` | `569e2cca4e5bb7946cad2bb9ee9ff79c8cc3310c` | all commits already on `main` |
| `fix/rc-phone-route-dom-ready` | `04ae0e400fab48c5970dc28427725769ccaf424e` | merged PR #131 |
| `fix/rc-playback-stop-race` | `eca280996cd5f56b849bdaa0c28ccff483d2a887` | merged PR #129 |
| `fix/rc-search-text-entry` | `c349838ba5382649d8350ae627580405cae0a38c` | merged PR #134 |
| `fix/rc-teardown-empty-src-error` | `44f3aea894bd4b5c516d8d9f04dcddde48ccc571` | merged PR #130 |
| `fix/rc-version-prerelease` | `d179d65848417b9220842ed776ccf2098ab1a729` | merged PR #135 |
| `fix/rc3-followups` | `be6e8f4a16ee3f5a0a663e6bd3ec5d10efe066fc` | all commits already on `main` |
| `fix/rc3-onboarding-cleanups` | `a51363f67dca0facc5878eaede75beb38c06d2d2` | all commits already on `main` |
| `foundation/v1-rc-contracts` | `8a216600b8244c58e7fabb8069f2320b906b21b4` | merged PR #37 |
| `hardening/security-privacy-audit` | `c5c2cce398e2190057ec943c77bcf82ddfc3693c` | closed PR #91 |
| `integration/epg-persistence` | `99b6b352358636b68b33aab019d1de6becbf4666` | merged PR #53 |
| `integration/epg-provider-capability` | `305a63836885bfdf2d8ca2158ba55aa97b9351fa` | merged PR #56 |
| `integration/m3u-provider-core` | `da45b740c71672e6c48a8420535bf52da8872c35` | closed PR #55, merged PR #54 |
| `integration/m4-live-tv-composition` | `462db278730d146eaa007ada26fc477a6d822dfa` | merged PR #70 |
| `integration/user-state-persistence` | `c8494cf711bc4cbb2206a8cb14a1a986d92f2a7f` | merged PR #52 |
| `integration/watch-playback-events` | `bfd9b09cb6e1a95dd49349ef7ba3d3a093a49f76` | merged PR #57 |
| `refactor/b0a-product-identity` | `9b5380b7123a43c2606e3cc826a311d1522e8ef6` | merged PR #18 |
| `refactor/m1a-contracts-foundation` | `0deb81f6d6698d65eb072aca1488f11e5ab9744f` | merged PR #2 |
| `refactor/m1b-platform-focus` | `db18530b609473e2b29bb07cdca31d4cafc1e9fa` | merged PR #3 |
| `refactor/m1c-playback-boundary` | `159c00d23fc087a4c8968361d41976b8cfff1842` | merged PR #4 |
| `refactor/m1d-provider-repository-foundation` | `92670f844c053d4a9dc7d9a597bba6388f3a6480` | merged PR #5 |
| `verification/fav-ui-exact-head-gates` | `a41dad4d3be2f1b2c5a04fc452a262d124d66235` | closed PR #68 |
| `verification/m3u-v-exact-head-gates` | `4336796d99853c85e46d74e74e4b16f1a42c3f1d` | closed PR #50 |
| `verification/m4-comp-exact-head` | `df7c57aa5adf1a593701f77c2f6572b4d2305a83` | closed PR #76 |
| `verification/m4-comp-favorites-scope-exact-head` | `d336ffb672b99480664ad0b773f4d9f17dd1c9d0` | closed PR #77 |
| `verification/m7-exact-head-evidence-20260912` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` | all commits already on `main` |
| `verification/pair-i-core-post-integrations` | `390d0c2e40c3707789a061c5530e5b479dd1b434` | all commits already on `main` |
| `verification/prov-reentry-exact-head-trigger` | `eed3d9e4dfe1e4e5149d917c14f15a8dd2f02464` | closed PR #82 |
| `verification/prov-reentry-i-post-del` | `2bb33aee3f141286ada1ea9dcd959eb1fd350784` | all commits already on `main` |
| `verification/prov-ui-exact-head-trigger` | `998efcd2ddb1b086cfef7dfba852b6410d1ad848` | closed PR #67 |
| `verification/prov-ui-tizen-build-trigger` | `590059bf4395a10577854066b1c073bffbe1c79b` | closed PR #69 |
| `verification/rc-browser-h1-provider-sync-fix` | `f24200e8e1e06c427c27faae79d9fb041e8064f4` | all commits already on `main` |
| `verification/rc-browser-harness-integration` | `468d8fac181163fdbdb35ed72e3dbd39f855c6b3` | all commits already on `main` |
| `verification/rc-browser-harness-trigger-fix` | `2695eac41bd4218bc783a1d846233cba1c9311bf` | all commits already on `main` |
| `verification/rc-browser-live` | `c21d58571f46c8c8bbc6a6547728f7bb42690d39` | all commits already on `main` |
| `verification/rc-browser-play-nav` | `fa64a2297971a8b630bf727bdda9feda683fa53c` | all commits already on `main` |
| `verification/rc-browser-provider` | `8cc5a5ba78ff6d6325b75dae3c6b4185f8e48f79` | closed PR #128, merged PR #123, closed PR #101 |
| `verification/rc-browser-provider-a03-harness-fix` | `cfcbbf68c9af1f086920d47f958e0e658da857cb` | merged PR #106 |
| `verification/rc-browser-provider-a11-test-fix` | `a7d35d5ff63c3a4f932a27bdcfa9ab98217c6d5b` | merged PR #120, closed PR #107 |
| `verification/rc-browser-provider-a11-v2` | `5ef7503635e093b9977ee80b9aa56c7e028c3ed7` | merged PR #121 |
| `verification/rc-browser-qualify/play-nav` | `aeed34d3d3ee07de8d841980ebda384dfc7e1e86` | all commits already on `main` |
| `verification/rc-browser-qualify/provider` | `aeed34d3d3ee07de8d841980ebda384dfc7e1e86` | all commits already on `main` |
| `verification/rc-browser-qualify/security-pairing` | `aeed34d3d3ee07de8d841980ebda384dfc7e1e86` | all commits already on `main` |
| `verification/rc-browser-qualify/state` | `aeed34d3d3ee07de8d841980ebda384dfc7e1e86` | all commits already on `main` |
| `verification/rc-browser-security-pairing` | `2226c2fb439950600f1f92b604ac40bd75e17dd3` | all commits already on `main` |
| `verification/rc-browser-state` | `69ee8e1cf7280d5dacb3e1975339778ddf42c180` | all commits already on `main` |
| `verification/rc-browser-state-c08-test-fix` | `69ee8e1cf7280d5dacb3e1975339778ddf42c180` | all commits already on `main` |
| `verification/rc-f0-gates` | `95f3c80d0176495a45998697a44bb4614fdc5837` | all commits already on `main` |
| `verification/srch-ui-exact-head` | `041107335f030b2770f5ab450306df2bb6d8ef29` | closed PR #66 |
| `verification/v1-rc-browser` | `aeed34d3d3ee07de8d841980ebda384dfc7e1e86` | all commits already on `main` |
| `verification/v1-rc-browser-h1` | `5276c420236b4ef980fa5003f4b1b6f3b299e876` | all commits already on `main` |
| `verification/v1-rc-browser-h2` | `fcf5217693c23ac74e71ff17ad98d7543a33a64c` | all commits already on `main` |
| `verification/v1-rc-package` | `e90a0fc9666e5629475255a2d57bb85451f0aedc` | all commits already on `main` |
| `verification/v1-rc2-package` | `e34bb36a9293a5d9ae9813a115ed3a061b0e1ce8` | all commits already on `main` |
| `verify/b0c-tizen-build-evidence` | `b7b0b71718b1222478f4d12f7f5a94a140d77d5a` | closed PR #23 |
| `verify/b0g-exact-head` | `0ccf8c3c3a32ec709ee60e10e380e458d5f04e8d` | all commits already on `main` |
| `verify/pair-c-6806175` | `a7c6a99e1354fc31808b0be385c36bc1740b6a84` | closed PR #75 |
| `verify/prov-del-i-517c651` | `517c6519efb9aa5e2b28aa67e4e5d675b36c4e94` | all commits already on `main` |

## Kept branches

| Branch | Commits not on `main` |
| --- | --- |
| `docs/prov-reentry-design` | 23 |
| `docs/wave3b-home-m4-pairing-design` | 8 |
| `docs/wave3c-closure` | 7 |
| `evidence/b0d-final-50ec2ab` | 10 |
| `evidence/b0e-ea9a4b9` | 6 |
| `evidence/xt-c-95a2313` | 10 |
| `verification/act-ui-pr60-exact-head` | 4 |
| `verification/epg-map-42-0b0c6cd` | 3 |
| `verification/epg-n-f4bc411` | 4 |
| `verification/epg-p-exact-head` | 9 |
| `verification/epg-pi-305a6383` | 11 |
| `verification/epg-q-extra-gates` | 9 |
| `verification/epg-ui-exact-head` | 8 |
| `verification/epg-x-052751a` | 5 |
| `verification/fav-d-exact-head-20260910` | 7 |
| `verification/first-run-ui-exact-head` | 6 |
| `verification/home-ui-0356abbf` | 10 |
| `verification/home-ui-75952819` | 12 |
| `verification/m3u-c-exact-head` | 1 |
| `verification/m3u-ui-61-full-gates` | 7 |
| `verification/m7-sec-legacy-scope-fix-20260912` | 1 |
| `verification/m7-sec-legacy-scope-fix-final-20260912` | 1 |
| `verification/pair-s-20dac66` | 7 |
| `verification/prov-reentry-exact-head` | 8 |
| `verification/prov-reentry-fix-exact-head` | 10 |
| `verification/prov-reentry-i-canonical` | 1 |
| `verification/prov-reentry-i-canonical-2` | 1 |
| `verification/prov-reentry-i-task1-green` | 1 |
| `verification/prov-reentry-i-task1-red` | 1 |
| `verification/prov-reentry-i-task2-green` | 1 |
| `verification/prov-reentry-i-task2-red` | 1 |
| `verification/prov-reentry-i-task3-green` | 1 |
| `verification/prov-reentry-i-task3-red` | 1 |
| `verification/prov-reentry-i-task4-green` | 1 |
| `verification/prov-reentry-i-task4-red` | 1 |
| `verification/prov-reentry-i-typecheck-diag` | 1 |
| `verification/prov-reentry-i-typecheck-fix` | 1 |
| `verification/prov-reentry-i-typecheck-fix-2` | 1 |
| `verification/prov-ui-exact-head` | 6 |
| `verification/rc-browser-h1-live-b11-sync-fix` | 1 |
| `verification/rc-browser-h1-live-contract-fix` | 1 |
| `verification/rc-browser-qualify/live` | 1 |
| `verification/sec-final-focused-236a0c3` | 5 |
| `verification/sec-final-focused-4039d46` | 7 |
| `verification/sec-final-focused-891f348` | 4 |
| `verification/sec-final-focused-b9ccfc2` | 1 |
| `verification/sec-final-full-236a0c3` | 5 |
| `verification/sec-final-full-4039d46` | 7 |
| `verification/sec-final-full-b9ccfc2` | 1 |
| `verification/sec-final-red-f16dda7` | 1 |
| `verification/srch-c-8813df4` | 4 |
| `verification/user-p-exact-head` | 4 |
| `verification/watch-i-exact-head` | 12 |
| `verification/watch-r-36885456` | 5 |
| `verify/b0d-controller-e840cb0` | 11 |
| `verify/epg-xml-exact-head-20260910` | 4 |
| `verify/m7-nav-exact-gates` | 1 |
| `verify/m7-perf-fd96a2d4` | 1 |
| `verify/pair-i-wire-final` | 2 |
| `verify/pair-r-exact-head-785cc014` | 3 |
| `verify/watch-score-de1186a` | 5 |
