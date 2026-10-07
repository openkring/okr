import { enforce, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { OcrRuleModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const VPFX = '@finance/ocr-rule/feature.edit.validation.';

/**
 * Form model of the OCR rule edit modal: the rule plus its aliases as the comma-separated text the
 * user types. Splitting on every keystroke would eat a trailing comma, so the list is only built on save.
 */
export type OcrRuleFormModel = OcrRuleModel & { aliasText: string };

export function toOcrRuleFormModel(rule: OcrRuleModel): OcrRuleFormModel {
  return { ...rule, aliasText: (rule.aliases ?? []).join(', ') };
}

/** Back to the stored shape: aliases as a trimmed list, rank as a number. */
export function fromOcrRuleFormModel(formModel: OcrRuleFormModel): OcrRuleModel {
  const { aliasText, ...rule } = formModel;
  return {
    ...rule,
    aliases: (aliasText ?? '').split(',').map(a => a.trim()).filter(a => a.length > 0),
    rank: Number(rule.rank) || 0,
  } as OcrRuleModel;
}

/**
 * The OCR rule dialog never blocked saving on content (party, account etc. are all optional), so the
 * suite only guards the typed text lengths and that the rank is a number.
 */
export const ocrRuleValidations = staticSuite((model: OcrRuleFormModel) => {
  stringValidations('party', model.party ?? '', LONG_NAME_LENGTH);
  stringValidations('aliasText', model.aliasText ?? '', DESCRIPTION_LENGTH);
  test('rank', VPFX + 'rankNumber', () => {
    enforce(Number.isFinite(Number(model.rank))).isTruthy();
  });
});
