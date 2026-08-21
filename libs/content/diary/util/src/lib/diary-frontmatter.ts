import { DiaryFile } from './diary-file';

function rawValue(file: DiaryFile, key: string): string | undefined {
  return file.frontmatter.find(entry => entry.key === key)?.raw;
}

/** The value of a scalar key, without the leading space and without surrounding double quotes. */
export function fmScalar(file: DiaryFile, key: string): string {
  const raw = rawValue(file, key);
  if (raw === undefined) {
    return '';
  }
  const trimmed = raw.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1
    ? trimmed.slice(1, -1)
    : trimmed;
}

/** The numeric value of a key, or undefined when the key is missing or not a number. */
export function fmNumber(file: DiaryFile, key: string): number | undefined {
  const raw = rawValue(file, key);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw.trim());
  return Number.isNaN(value) ? undefined : value;
}

/** The list value of a key, in both the inline form `[a, b]` and the block form `- a`. */
export function fmList(file: DiaryFile, key: string): string[] {
  const raw = rawValue(file, key);
  if (raw === undefined) {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(item => item.trim().replace(/^["']|["']$/g, ''))
      .filter(item => item !== '');
  }
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim().replace(/^["']|["']$/g, ''));
}
