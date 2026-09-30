<p align="center">
  <img src="player/public/brand/babustv-wordmark.svg" alt="BabuşTV" width="420" />
</p>

<p align="center">
  <strong>A remote-first, privacy-focused live TV client for Samsung Tizen TVs.</strong>
</p>

<p align="center">
  <a href="https://github.com/eyildirim82/babu-TV/actions/workflows/verify.yml"><img src="https://github.com/eyildirim82/babu-TV/actions/workflows/verify.yml/badge.svg" alt="Verification" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Tizen-5.0%2B-red?logo=samsung" alt="Tizen 5.0+" />
  <img src="https://img.shields.io/badge/TypeScript-project-blue?logo=typescript" alt="TypeScript" />
</p>

BabuşTV is a Samsung Tizen live-TV application built around TV-remote navigation, privacy-conscious credential handling and resilient playback. It supports **Xtream** and **M3U/M3U8** providers, EPG data, favorites, search, viewing history and encrypted phone-to-TV provider onboarding.

The project started from the open-source **EN TV Player** codebase and has since been substantially extended with a new product identity, modular application architecture, provider abstractions, secure pairing, automated verification and Tizen packaging workflows. The upstream origin and license history are intentionally preserved.

> **Current release candidate:** `v1.0.0-rc.2`. `main` also contains post-RC changes, including phone pairing. Browser-level qualification is automated; final acceptance testing on physical Samsung TV hardware is still pending.

## Engineering highlights

| Area | What the project demonstrates |
| --- | --- |
| **Smart TV UX** | Remote-first navigation, explicit focus management, numeric channel entry and TV-oriented interaction flows |
| **Application architecture** | Provider adapters, domain services, repositories, platform boundaries and feature-level composition |
| **Streaming** | HLS / DASH / TS playback through Shaka Player with Samsung AVPlay fallback and classified recovery paths |
| **EPG & provider integration** | Xtream and M3U providers, XMLTV parsing, EPG normalization, channel mapping and provider-scoped state |
| **Security & privacy** | ECDH P-256 + AES-GCM pairing, protected credential storage, log sanitization and no account/cloud-sync requirement |
| **Edge/backend work** | A Node.js pairing relay plus a Cloudflare Workers + Durable Object deployment option |
| **Quality engineering** | Unit/integration tests, browser qualification with Playwright, type checking, build checks, brand checks and GitHub Actions |
| **Delivery** | Reproducible Samsung Tizen staging, packaging and deployment tooling |

## Product capabilities

- **Multiple provider types** — Xtream and M3U/M3U8, with multiple saved providers and one active provider at a time
- **Remote-first home screen** — provider selection, recently watched, live TV, favorites, frequently watched channels and settings
- **Live TV experience** — full-screen playback with category/channel/program overlays designed around directional remote input
- **Program guide** — current/next program data from Xtream EPG and XMLTV sources
- **Favorites and search** — provider-scoped favorites and local channel search with Turkish-character-aware matching
- **Secure phone onboarding** — scan a TV QR code and enter provider credentials on a phone instead of the TV keyboard
- **Playback resilience** — Shaka Player plus Samsung AVPlay fallback with bounded, classified retry behavior
- **Local-first privacy** — no BabuşTV account and no cloud synchronization of viewing state or provider credentials

V1 intentionally does **not** include VOD, catch-up TV, a user-account system or cloud sync. See the [V1 product and architecture design](docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md) for the detailed scope.

## Architecture

```text
                    ┌───────────────────────────┐
                    │      Samsung Tizen TV      │
                    │                           │
Xtream / M3U ──────▶│ Provider adapters         │
                    │        │                  │
                    │        ▼                  │
                    │ Domain + repositories     │
                    │ EPG · search · favorites  │
                    │        │                  │
                    │        ▼                  │
                    │ Playback coordinator      │
                    │ Shaka ───────▶ AVPlay     │
                    └───────────────────────────┘

Phone browser
    │
    │ ECDH P-256 + AES-GCM encrypted payload
    ▼
Pairing relay (opaque ciphertext only)
    │
    ▼
Samsung TV → secure credential store
```

The browser and Tizen implementations share application/domain code behind platform boundaries. Provider-specific behavior is isolated behind adapters, while structured repositories persist catalog, provider, EPG, favorite and watch-state data.

## Secure phone-to-TV pairing

Typing long provider credentials with a TV remote is awkward, so BabuşTV includes a phone-assisted onboarding flow designed to avoid exposing credentials to the relay:

1. The TV creates a short-lived pairing session and a one-time key pair.
2. The QR code contains session information and the TV public key — **not provider credentials**.
3. The phone encrypts provider data in the browser using **ECDH P-256 + AES-GCM**.
4. The relay transports only the encrypted payload and does not connect to the provider on the user's behalf.
5. The TV retrieves and decrypts the payload, then persists credentials through the Samsung WidgetData credential store.

Pairing sessions expire after five minutes and are single-delivery. The default public relay runs on **Cloudflare Workers + a Durable Object**; a self-hosted Node.js relay is also included. See [relay/README.md](relay/README.md), [relay-cloudflare/README.md](relay-cloudflare/README.md) and the [security documentation](docs/SECURITY.md).

## Tech stack

**Client & platform**

- TypeScript / JavaScript
- Vite
- Samsung Tizen Web APIs
- Shaka Player
- Samsung AVPlay
- IndexedDB / Samsung WidgetData-backed storage boundaries

**Relay & edge**

- Node.js
- Cloudflare Workers
- Cloudflare Durable Objects
- Web Crypto (`ECDH P-256`, `AES-GCM`)

**Testing & delivery**

- Node test runner
- Playwright
- TypeScript type checking
- GitHub Actions
- Custom Tizen packaging scripts + Tizen Studio CLI support

## Verification

The repository treats verification as part of the product rather than a final manual step.

```bash
npm test              # player + TypeScript + relay tests
npm run typecheck     # player + relay type checks
npm run build         # production player build
npm run rc:browser    # Playwright release-candidate browser qualification
npm run relay:build   # relay build
npm run brand:check   # product identity / legacy-brand guard
```

The Cloudflare package is intentionally isolated from the root npm workspace. It can be verified independently without a Cloudflare account:

```bash
cd relay-cloudflare
npm ci
npm run typecheck
npm test
npm run build
```

## Repository structure

```text
├── player/              # TV/web application, domain modules and tests
├── relay/               # Pairing relay core and Node.js server
├── relay-cloudflare/    # Cloudflare Worker + Durable Object deployment
├── tizen/               # Samsung Tizen staging, packaging and deployment tools
├── tools/rc-browser/    # Playwright release-candidate qualification harness
├── docs/                # Architecture, ADRs, plans, security and verification evidence
└── .github/workflows/   # Automated verification workflows
```

## Run locally

Requirements: **Node.js 22+** and npm.

```bash
git clone https://github.com/eyildirim82/babu-TV.git
cd babu-TV
npm ci
npm run dev
```

Development server:

```text
http://localhost:5173/babustv/
```

## Samsung Tizen build

BabuşTV uses one canonical product identity across its packaging paths:

```text
package:      BabusTVApp
application:  BabusTVApp.BabusTV
display name: BABUŞ TV
```

Custom packaging:

```bash
npm run build
npm run tizen
```

Tizen Studio CLI flow:

```bash
npm run tizen:build
TIZEN_PROFILE=<profile-name> npm run tizen:package
```

See [tizen/README.md](tizen/README.md) and [SETUP.md](SETUP.md) for environment and device setup details.

## Engineering documentation

This repository keeps implementation decisions and verification evidence alongside the code. Useful entry points:

- [V1 product & architecture design](docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md)
- [Security model](docs/SECURITY.md)
- [Telemetry & privacy](docs/TELEMETRY.md)
- [ADR 0001 — controlled upstream divergence](docs/decisions/0001-controlled-upstream-divergence.md)
- [ADR 0002 — Tizen credential storage](docs/decisions/0002-tizen-credential-storage.md)
- [ADR 0003 — pairing relay hosting](docs/decisions/0003-pairing-relay-hosting.md)
- [V1 RC readiness / verification](docs/verification/v1-rc-readiness.md)
- [Changelog](CHANGELOG.md)

## Contributing and security reports

Before contributing, read [AGENTS.md](AGENTS.md) and [docs/REPO_RULES.md](docs/REPO_RULES.md). When opening an issue, include the TV model, Tizen version, app version and reproduction steps when relevant.

Do **not** post provider URLs, usernames, passwords or private playlist links in issues or logs.

## Origin and license

BabuşTV is distributed under the **MIT License**. It is a controlled derivative of [EN TV Player](docs/UPSTREAM_BASELINE.md); the repository preserves the relevant upstream history and attribution while documenting the architectural and product divergence introduced by BabuşTV.
