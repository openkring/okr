import { BaseProperty } from '@okr/shared-models';
import { EXTERNAL_ID_KINDS, externalIdKey, fill, isValidExternalId } from '@okr/shared-util-core';

/**
 * Editing `PersonModel.externalIds` (spec 1.132 §5.4, D15) in a list editor: the map is shown as
 * `BaseProperty[]` and written back as a map. Pure helpers, no Angular.
 */

/** A selectable external-id key with its user-facing label. */
export type ExternalIdKeyOption = { key: string; label: string };

/** Splits a key into its kind (the part before the first '_') and its scope ('' for an unscoped key). */
function splitKey(key: string): { kind: string; scope: string } {
  const sep = key.indexOf('_');
  return sep < 0 ? { kind: key, scope: '' } : { kind: key.slice(0, sep), scope: key.slice(sep + 1) };
}

/**
 * The map as an editable list, sorted by key. Invalid entries are kept on purpose: the form must show
 * (and validate) what is stored, so the user can see and remove a bad entry instead of it vanishing.
 */
export function toProperties(externalIds: Record<string, string> | undefined): BaseProperty[] {
  return Object.entries(externalIds ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: String(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The edited list as a map. Keys and values are trimmed, entries with an empty key or value are dropped
 * and a repeated key keeps its last value. By default an entry that fails `isValidExternalId` (unknown
 * kind, bad value, scoped kind without scope, unscoped kind with scope) is dropped too — the form passes
 * `keepInvalid = true` so that such an entry stays visible and the Vest suite reports it.
 */
export function fromProperties(properties: BaseProperty[] | undefined, keepInvalid = false): Record<string, string> {
  const result: Record<string, string> = {};
  for (const property of properties ?? []) {
    const key = String(property.key ?? '').trim();
    const value = String(property.value ?? '').trim();
    if (key === '' || value === '') continue;
    if (!keepInvalid && !isValidExternalId(key, value)) continue;
    result[key] = value;
  }
  return result;
}

/**
 * The keys a user can pick, and the label of every key: each unscoped kind once, each scoped kind once per
 * scope (the books id). `labels` maps a kind to its translated text; a scoped kind's text carries a `{books}`
 * placeholder («bexio-Kontakt ({books})»). `extraKeys` are keys already stored on the person — their scope is
 * offered too, so a stored key always has a label. A kind without a text is labelled with its own name.
 */
export function externalIdKeyOptions(labels: Record<string, string>, scopes: string[], extraKeys: string[] = []): ExternalIdKeyOption[] {
  const allScopes = new Set<string>(scopes.filter((s) => s !== ''));
  for (const key of extraKeys) {
    const { scope } = splitKey(key);
    if (scope !== '') allScopes.add(scope);
  }
  const options: ExternalIdKeyOption[] = [];
  for (const def of EXTERNAL_ID_KINDS) {
    const text = labels[def.kind] ?? def.kind;
    if (!def.scoped) {
      options.push({ key: externalIdKey(def.kind), label: text });
      continue;
    }
    for (const scope of [...allScopes].sort()) {
      options.push({ key: externalIdKey(def.kind, scope), label: fill(text, { books: scope }) });
    }
  }
  return options;
}

/** The i18n key of the validation message for an invalid entry: one per kind, one for anything unknown. */
export function externalIdErrorKey(key: string): string {
  const { kind } = splitKey(key);
  const known = EXTERNAL_ID_KINDS.some((def) => def.kind === kind);
  return '@subject/person/feature.validation.' + (known ? `externalId_${kind}` : 'externalId_unknown');
}

/** Same map, whatever the key order; an absent map equals an empty one. */
function sameExternalIds(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
  const left = Object.entries(a ?? {}).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b ?? {}).sort(([x], [y]) => x.localeCompare(y));
  return left.length === right.length && left.every(([key, value], i) => key === right[i][0] && value === right[i][1]);
}

/**
 * The person edit dialog's save payload: `externalIds` is left out when the user did not change it against the
 * snapshot the dialog opened with. The save is a merge (`updateModel`), so the stored map then stays as it is — an
 * id written meanwhile elsewhere (the J+S number from the course table, `setExternalId`) is not erased by a dialog
 * that was opened before. A changed map is sent whole, as before. Pure; the input is not changed.
 */
export function withoutUnchangedExternalIds<T extends { externalIds?: Record<string, string> }>(
  edited: T,
  opened: { externalIds?: Record<string, string> } | undefined,
): T {
  if (!sameExternalIds(edited.externalIds, opened?.externalIds)) return edited;
  const { externalIds: _unchanged, ...rest } = edited;   // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest as T;
}
