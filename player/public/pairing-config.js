// Public BabuşTV phone-pairing endpoints. These are not secrets: the relay only carries ciphertext.
// Self-hosting: point both URLs at your own relay deployment before building.
// A value provided earlier (for example by a test harness) always wins.
window.BABUSTV_PAIRING_CONFIG = window.BABUSTV_PAIRING_CONFIG || {
  relayBaseUrl: 'https://babustv-pairing-relay.babustv.workers.dev',
  phoneBaseUrl: 'https://babustv-pairing-relay.babustv.workers.dev/babustv/',
  relayTimeoutMs: 10000,
  pollIntervalMs: 2000
};
