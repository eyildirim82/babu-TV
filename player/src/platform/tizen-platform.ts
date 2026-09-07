import type { Platform, PlatformCapabilities } from './contracts.js';

interface SupportedKeyLike {
  name?: string | null;
}

interface TizenTvInputDeviceLike {
  registerKey?(key: string): void;
  getSupportedKeys?(): readonly SupportedKeyLike[];
}

interface TizenApplicationLike {
  getCurrentApplication?(): {
    exit?(): void;
  };
}

export interface PlatformWindowLike {
  tizen?: {
    tvinputdevice?: TizenTvInputDeviceLike;
    application?: TizenApplicationLike;
  };
}

function getSupportedKeyNames(windowLike: PlatformWindowLike): Set<string> {
  try {
    const keys = windowLike.tizen?.tvinputdevice?.getSupportedKeys?.() ?? [];
    return new Set(
      keys
        .map((key) => key.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0),
    );
  } catch {
    return new Set();
  }
}

export class TizenPlatform implements Platform {
  constructor(private readonly windowLike: PlatformWindowLike) {}

  capabilities(): PlatformCapabilities {
    const supported = getSupportedKeyNames(this.windowLike);
    const numericKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    return {
      tizen: true,
      optionsKey: supported.has('Tools') || supported.has('Menu'),
      channelKeys: supported.has('ChannelUp') && supported.has('ChannelDown'),
      numericKeys: numericKeys.some((key) => supported.has(key)),
    };
  }

  registerOptionalKeys(keys: readonly string[]): void {
    const device = this.windowLike.tizen?.tvinputdevice;
    if (!device?.registerKey) return;

    for (const key of keys) {
      try {
        device.registerKey(key);
      } catch {
        console.warn('Failed to register Tizen key:', key);
      }
    }
  }

  exitApp(): void {
    try {
      this.windowLike.tizen?.application?.getCurrentApplication?.().exit?.();
    } catch {
      // Exit is best-effort; match the inherited behavior by swallowing failures.
    }
  }
}
