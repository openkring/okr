import type { MenuItemModel } from '@okr/shared-models';
import type { MenuStructureDrift, StructuralField } from '@okr/tenant-util';

import type { MenuTreeRow } from './menu-tree.util';

/**
 * Which structural fields of a `drifted` row are actually safe to act on — the row-level
 * «Übernehmen»/«Fixieren»/«Katalog anpassen» buttons act on ALL of them together (one click
 * resolves the whole row), not on one field at a time, so the table needs the full set once
 * per row.
 *
 * Reads straight off `MenuStructureDrift` — `drift.fields` names every field that differs
 * from the catalogue, `drift.pinned` names every field this tenant has deliberately taken
 * over — rather than off `MenuTreeRow`, which folds `roleNeeded` and `url`/`action` into
 * separate display fields and does not expose per-field pin state. A pinned field is
 * dropped here unconditionally (rule: "a pinned field must never be offered for overwrite,
 * the server refuses it, the UI must not ask") — including one that happens to sit next to
 * a genuinely actionable field on the same row (`roleNeeded` pinned, `url` not).
 */
export function actionableFieldsOf(drift: MenuStructureDrift | undefined): StructuralField[] {
  if (!drift) return [];
  return (Object.keys(drift.fields) as StructuralField[]).filter(field => !drift.pinned.includes(field));
}

/**
 * The plain-text patch note «Katalog anpassen» copies to the clipboard (`copyToClipboard`) —
 * the ask a developer needs to change the catalogue's own `MenuSpec`, not the tenant's
 * document (an admin cannot edit the catalogue, which is code). One line per actionable
 * field, phrased as "the catalogue should change to match what is live here" — that is
 * precisely what «Katalog anpassen» means: the tenant's value is right for everyone.
 */
export function patchNoteFor(row: MenuTreeRow, drift: MenuStructureDrift, fields: StructuralField[]): string {
  const blockSuffix = row.blockId ? ` (Baustein ${row.blockId})` : '';
  const lines = [
    `Katalog anpassen: ${row.name}${blockSuffix}`,
    `Dokument: ${row.docId || row.name}`,
    ...fields.map(field => {
      const catalogueValue = String(drift.fields[field as keyof MenuItemModel] ?? '');
      const liveValue = String(drift.live[field as keyof MenuItemModel] ?? '');
      return `${field}: Katalog heute «${catalogueValue}» -> soll werden «${liveValue}»`;
    }),
  ];
  return lines.join('\n');
}
