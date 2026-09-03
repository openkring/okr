/** `done` is edited as one item per line; a pasted '- [x] ' prefix is tolerated and stripped. */
export function linesToList(text: string): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^-\s*(\[[ x]\]\s*)?/, ''))
    .filter(line => line.length > 0);
}

export function listToLines(list: string[]): string {
  return (list ?? []).join('\n');
}

/** Slug lists (`places`, `events`, `customPeopleLabels`) are edited comma-separated. */
export function csvToList(text: string): string[] {
  return (text ?? '').split(',').map(s => s.trim()).filter(s => s.length > 0);
}

export function listToCsv(list: string[]): string {
  return (list ?? []).join(', ');
}
