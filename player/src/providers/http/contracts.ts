export interface ProviderHttpClient {
  getJson<T>(url: string, timeoutMs?: number): Promise<T>;
  getText(url: string, timeoutMs?: number): Promise<string>;
}
