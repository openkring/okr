/** Compares dotted version numbers: negative when a < b, 0 when equal, positive when a > b. Missing parts count as 0. */
export function compareAppVersions(a: string, b: string): number {
  const parts1 = a.split('.').map(Number);
  const parts2 = b.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }

  return 0;
}
