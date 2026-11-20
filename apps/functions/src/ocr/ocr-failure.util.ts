// apps/functions/src/ocr/ocr-failure.util.ts
//
// Pure helpers for the admin notification of a failed expense OCR. An OCR failure is an
// operator problem (provider credits, quota, configuration), never the submitter's: the upload
// itself succeeded. So the member sees nothing, and the tenant admin gets the raw error plus the
// trigger that raised it.

/** Where in the pipeline the failure was raised. */
export type OcrFailureTrigger = 'extract' | 'no-accounting-config' | 'unresolved-booking';

const TRIGGER_LABELS: Record<OcrFailureTrigger, string> = {
  'extract': 'onStorageFinalized › extractReceipt (Gemini-Auslesung)',
  'no-accounting-config': 'onOcrResultWritten › Buchhaltungs-Konfiguration fehlt',
  'unresolved-booking': 'onOcrResultWritten › handleExpenseResult (Betrag oder Konto nicht auflösbar)',
};

export function ocrFailureTriggerLabel(trigger: OcrFailureTrigger): string {
  return TRIGGER_LABELS[trigger];
}

/**
 * A short, actionable German hint for the errors an operator can fix, or '' when the message is
 * not recognised. Gemini answers an exhausted prepaid balance with HTTP 402 RESOURCE_EXHAUSTED and
 * a plain rate limit with 429 RESOURCE_EXHAUSTED.
 */
export function ocrFailureHint(message: string): string {
  const m = message ?? '';
  if (/"code"\s*:\s*402|prepayment credits|credits are depleted/i.test(m)) {
    return 'Das Gemini-Guthaben ist aufgebraucht. Lade es in Google AI Studio auf (Billing) und starte danach die OCR der betroffenen Spesen neu.';
  }
  if (/"code"\s*:\s*429|RESOURCE_EXHAUSTED|quota/i.test(m)) {
    return 'Das Gemini-Kontingent ist erschöpft (Rate-Limit). Starte die OCR der betroffenen Spesen später neu.';
  }
  if (/"code"\s*:\s*40[13]|API key|PERMISSION_DENIED/i.test(m)) {
    return 'Der Gemini-API-Schlüssel wird abgelehnt. Prüfe das Secret GEMINI_API_KEY.';
  }
  return '';
}

/** Deterministic task id: one admin task per (receipt, admin), so a redelivered event stays idempotent. */
export function ocrFailureTaskId(storagePath: string, adminPersonKey: string): string {
  const slug = `${storagePath}_${adminPersonKey}`.replace(/[^A-Za-z0-9_-]/g, '_');
  return `ocr-failure_${slug}`.slice(0, 1400);
}

export interface OcrFailureNoteInput {
  trigger: OcrFailureTrigger;
  message: string;
  storagePath: string;
  expenseKey: string;
  submitterName: string;
  amount: string;
  currency: string;
}

export function ocrFailureNotes(i: OcrFailureNoteInput): string {
  const hint = ocrFailureHint(i.message);
  return [
    ...(hint ? [hint, ''] : []),
    `Auslöser: ${ocrFailureTriggerLabel(i.trigger)}`,
    `Spesen: expense.${i.expenseKey}${i.submitterName ? ` (${i.submitterName}, ${i.currency} ${i.amount})` : ''}`,
    `Beleg: ${i.storagePath}`,
    '',
    'Fehlermeldung:',
    i.message,
    '',
    'Der Upload selbst war erfolgreich; die einreichende Person sieht diesen Fehler nicht.',
  ].join('\n');
}
