import type { PlanEntry } from './apply-preview.types';
import { planConsequence, type FeaturePickerI18n } from './feature-picker-i18n';

/** How many subjects one sentence names before the rest are elided with an ellipsis. */
const MAX_SUBJECTS = 12;

/**
 * The prose a confirmation dialog shows for a plan — every DISTINCT consequence sentence once,
 * carrying how many things it happens to AND which ones.
 *
 * A `PlanEntry` is per subject, not per sentence: «Gruppe ergänzen» on a menu group plans one
 * entry per row of that subtree, and all of them usually carry the same `menu_shared` sentence.
 * The naive `entries.map(planConsequence).join(' ')` therefore produced an alert repeating one
 * identical German sentence twenty times — unreadable, and it hid the two facts the admin
 * actually needs: how many rows this click touches, and WHICH.
 *
 * The subjects are `MenuOutlineRow.name`s (block ids for `block-*` kinds) — deliberately the raw
 * names, not translated labels: segment 2's table lists rows under exactly these names, so the
 * admin can find every one of them there, and the alert needs no async label resolution to be
 * built. The `n ×` prefix and the `…` elision carry no words, so they stay correct in all five
 * languages.
 *
 * `withSubjects: false` drops both count and names, leaving the distinct sentences only — for the
 * per-row note in `BlockEnableModal`, where the subject is the label the note already sits under
 * and repeating it there would be noise.
 */
export function summarizePlanConsequences(
  entries: PlanEntry[], i18n: FeaturePickerI18n, options: { withSubjects?: boolean } = {},
): string {
  const withSubjects = options.withSubjects ?? true;
  const subjectsBySentence = new Map<string, string[]>();
  for (const entry of entries) {
    const sentence = planConsequence(entry, i18n);
    if (sentence.length === 0) continue;
    const subjects = subjectsBySentence.get(sentence);
    if (subjects) subjects.push(entry.subject); else subjectsBySentence.set(sentence, [entry.subject]);
  }
  return [...subjectsBySentence]
    .map(([sentence, subjects]) => withSubjects
      ? `${countPrefix(subjects.length)}${sentence} (${subjectList(subjects)})`
      : sentence)
    .join(' ');
}

function countPrefix(count: number): string {
  return count > 1 ? `${count} × ` : '';
}

function subjectList(subjects: string[]): string {
  const shown = subjects.slice(0, MAX_SUBJECTS).join(', ');
  return subjects.length > MAX_SUBJECTS ? `${shown}, …` : shown;
}
