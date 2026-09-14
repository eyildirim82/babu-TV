// Xtream providers are named after their server host. The host is the only part
// of the server URL kept in provider metadata; path, query and credentials stay
// in the credential store.
export function xtreamServerLabel(serverUrl: string): string {
  try {
    const url = new URL(serverUrl);
    return url.host || 'Xtream';
  } catch {
    return 'Xtream';
  }
}
