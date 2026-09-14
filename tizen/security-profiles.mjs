// Parses `tizen security-profiles list`, which prints a "Loaded in" line, a
// "[Profile Name] [Active]" header and one row per profile name.
export function parseSecurityProfileNames(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/);
  const header = lines.findIndex((line) => line.trim().startsWith('[Profile Name]'));
  if (header < 0) return [];
  return lines
    .slice(header + 1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => name !== undefined && name.length > 0);
}
