import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { JournalI18n } from './journal-i18n';

/** The labels the lost-value text needs, as the store's i18n signals provide them. */
export type LostValueLabels = Pick<JournalI18n,
  | 'footprint_form_title_label' | 'footprint_form_place_label' | 'footprint_form_date_label' | 'footprint_form_time_label'
  | 'footprint_position' | 'footprint_form_published_label' | 'story_published' | 'story_draft' | 'transport_label'
  | 'transport_plane' | 'transport_ship' | 'transport_bus' | 'transport_train' | 'transport_car'
  | 'transport_bike' | 'transport_foot' | 'transport_row' | 'transport_ski' | 'transport_motorbike'>;

const EMPTY = '–';

function dateText(value: string): string {
  return convertDateFormatToString(value, DateFormat.StoreDate, DateFormat.ViewDate, false) || value;
}

/** A lost footprint value in words a club member understands: a field label and a readable value (spec 1.126 §6.3). */
export function lostValueText(field: string, value: unknown, t: LostValueLabels): { field: string; value: string } {
  const raw = value === undefined || value === null ? '' : String(value);
  switch (field) {
    case 'title': return { field: t.footprint_form_title_label(), value: raw || EMPTY };
    case 'placeName': return { field: t.footprint_form_place_label(), value: raw || EMPTY };
    case 'date': return { field: t.footprint_form_date_label(), value: raw ? dateText(raw) : EMPTY };
    case 'time': return { field: t.footprint_form_time_label(), value: raw || EMPTY };
    case 'latitude':
    case 'longitude': {
      const n = typeof value === 'number' ? value : Number.parseFloat(raw);
      return { field: t.footprint_position(), value: Number.isFinite(n) ? String(Number(n.toFixed(4))) : EMPTY };
    }
    case 'publishState':
      return { field: t.footprint_form_published_label(), value: raw === 'published' ? t.story_published() : raw === 'draft' ? t.story_draft() : EMPTY };
    case 'transport': {
      const mode = t[('transport_' + raw) as keyof LostValueLabels];
      return { field: t.transport_label(), value: raw && mode ? mode() : EMPTY };
    }
    default: return { field: EMPTY, value: raw || EMPTY }; // not a conflict field
  }
}
