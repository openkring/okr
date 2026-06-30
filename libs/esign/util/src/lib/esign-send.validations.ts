import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { stringValidations } from '@bk2/shared-util-core';

/** The editable fields collected by the send-document action modal. */
export interface EsignSendFormModel {
  initiatorAliasName: string;
  comment: string;
  signatureMode: 'timestamp' | 'advanced' | 'qualified';
  jurisdiction: 'zertes' | 'eidas';
  sendMail: 'all' | 'others' | 'none';
}

export const esignSendValidations = staticSuite((model: EsignSendFormModel, field?: string) => {
  if (field) only(field);

  // initiatorAliasName is required by the esignSendDocument Cloud Function.
  stringValidations('initiatorAliasName', model.initiatorAliasName, SHORT_NAME_LENGTH, 1, true);
  stringValidations('comment', model.comment, 1000);
});
