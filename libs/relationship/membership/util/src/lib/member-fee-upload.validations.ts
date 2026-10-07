import { staticSuite } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

/** One invoice position as the createBexioInvoice callable expects it. */
export interface BexioPosition {
  text: string;
  unit_price: number;
  account_id: number;
  amount: number;
}

/** Form model backing the "upload to Bexio" modal: the free texts above and below the positions. */
export interface MemberFeeUploadFormModel {
  header: string;   // optional text above the positions
  footer: string;   // optional text below the positions (HTML, Bexio renders it)
}

/** The footer Bexio has always been sent for the yearly fee invoice (HTML, as Bexio expects it). */
export const MEMBER_FEE_UPLOAD_DEFAULT_FOOTER = '<span>Vielen Dank f&uuml;r die Bezahlung der Rechnung innert 30 Tagen auf unser Konto bei der Z&uuml;rcher Kantonalbank IBAN CH67 0070 0110 4044 7417 6.<br /><br />Bitte verwende den QR-Code Einzahlungsschein auf der n&auml;chste Seite oder &uuml;berweise direkt auf die IBAN Nummer.<br /><br />Herzliche Gr&uuml;sse<br /><br />Seeclub St&auml;fa, Finanzen<br />Bruno Kaiser</span>';

export function newMemberFeeUploadFormModel(): MemberFeeUploadFormModel {
  return { header: '', footer: MEMBER_FEE_UPLOAD_DEFAULT_FOOTER };
}

/** Both texts are optional; the only rule is the long-text cap the notes input enforces anyway. */
export const memberFeeUploadValidations = staticSuite((model: MemberFeeUploadFormModel) => {

  stringValidations('header', model.header, DESCRIPTION_LENGTH);
  stringValidations('footer', model.footer, DESCRIPTION_LENGTH);
});
