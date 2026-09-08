const DEFAULT_NUMERIC_ZAP_DELAY_MS = 500;

export interface NumericZapTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class NumericZapBuffer {
  private readonly timers: NumericZapTimers;
  private readonly delayMs: number;
  private readonly onChange: (value: string) => void;
  private readonly onCommit: (value: number) => void;
  private value = '';
  private handle: unknown | null = null;

  constructor(input: {
    timers: NumericZapTimers;
    delayMs?: number;
    onChange(value: string): void;
    onCommit(value: number): void;
  }) {
    this.timers = input.timers;
    this.delayMs = input.delayMs ?? DEFAULT_NUMERIC_ZAP_DELAY_MS;
    this.onChange = input.onChange;
    this.onCommit = input.onCommit;
  }

  push(digit: number): void {
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;

    this.value += String(digit);
    this.onChange(this.value);

    if (this.handle !== null) {
      this.timers.clearTimeout(this.handle);
    }

    this.handle = this.timers.setTimeout(() => {
      const value = Number.parseInt(this.value, 10);
      this.value = '';
      this.handle = null;
      this.onChange('');

      if (Number.isFinite(value)) {
        this.onCommit(value);
      }
    }, this.delayMs);
  }

  clear(): void {
    if (this.handle !== null) {
      this.timers.clearTimeout(this.handle);
      this.handle = null;
    }

    this.value = '';
    this.onChange('');
  }
}
