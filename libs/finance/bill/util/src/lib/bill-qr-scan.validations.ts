import { enforce, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const VPFX = '@finance/bill/feature.qr.validation.';

/** Form model of the QR scan modal: the raw content of a Swiss QR-bill (camera or pasted). */
export interface BillQrScanFormModel {
  qrContent: string;
}

export function newBillQrScanFormModel(): BillQrScanFormModel {
  return { qrContent: '' };
}

/** The scan dialog only ever required some content before it could be processed. */
export const billQrScanValidations = staticSuite((model: BillQrScanFormModel) => {

  stringValidations('qrContent', model.qrContent ?? '', DESCRIPTION_LENGTH);
  test('qrContent', VPFX + 'contentRequired', () => {
    enforce(model.qrContent ?? '').isNotBlank();
  });
});
