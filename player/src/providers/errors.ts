export type ProviderErrorCode =
  | 'AUTH'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'SERVER'
  | 'MALFORMED'
  | 'UNAVAILABLE';

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly status: number | null,
    safeMessage: string,
  ) {
    super(safeMessage);
    this.name = 'ProviderError';
  }
}
