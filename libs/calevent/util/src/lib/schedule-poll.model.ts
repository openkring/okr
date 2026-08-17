import { InvitationState } from '@okr/shared-models';

/** One proposed date = one column of the poll table. `id` is the calevent okey once the poll is live. */
export interface SchedulePollColumn {
  id: string;
  startDate: string;   // StoreDate yyyyMMdd
  startTime: string;   // HH:mm, '' = full day (DEFAULT_TIME)
  /** Text column: the header text shown instead of the date. Its calevent is dated today but hidden from every calendar. */
  columnLabel?: string;
}

/** One member = one row. `responses` maps a column id to that member's answer. */
export interface SchedulePollRow {
  key: string;         // personKey
  firstName: string;
  lastName: string;
  responses: Record<string, InvitationState>;
  /** Free text the member added to their answers — stored on each of their invitations (`notes`). */
  comment?: string;
}

/**
 * The whole table as one editable model. `rows[0]` is always the current user — the only row the
 * form ever writes to. `isDraft` switches the form between building a poll and answering one.
 */
export interface SchedulePollFormData {
  name: string;
  description: string;
  columns: SchedulePollColumn[];
  rows: SchedulePollRow[];
  isDraft: boolean;
}
