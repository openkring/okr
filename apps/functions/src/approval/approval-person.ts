/** The person an approval is about: the subject when it is a person, else whoever asked (spec 1.87 §6.3). */
export function approvalSubjectPersonKey(after: Record<string, unknown>): string {
  const subjectKey = String(after['subjectKey'] ?? '');
  if (subjectKey.startsWith('person.')) return subjectKey.slice('person.'.length);
  return String((after['requestedBy'] as { key?: string } | undefined)?.key ?? '');
}
