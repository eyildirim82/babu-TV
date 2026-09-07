export interface PlatformCapabilities {
  tizen: boolean;
  optionsKey: boolean;
  channelKeys: boolean;
  numericKeys: boolean;
}

export interface Platform {
  capabilities(): PlatformCapabilities;
  registerOptionalKeys(keys: readonly string[]): void;
  exitApp(): void;
}
