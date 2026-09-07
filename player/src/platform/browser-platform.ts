import type { Platform, PlatformCapabilities } from './contracts.js';

const BROWSER_CAPABILITIES: PlatformCapabilities = {
  tizen: false,
  optionsKey: false,
  channelKeys: false,
  numericKeys: false,
};

export class BrowserPlatform implements Platform {
  capabilities(): PlatformCapabilities {
    return BROWSER_CAPABILITIES;
  }

  registerOptionalKeys(_keys: readonly string[]): void {
    // Browser development has no Tizen optional-key registration.
  }

  exitApp(): void {
    // Browser development must not attempt to close the host window.
  }
}
