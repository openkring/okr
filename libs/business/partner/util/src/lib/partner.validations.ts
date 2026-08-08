import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { PartnerModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

/**
 * `serviceUid`, `lastHeartbeatAt` and `reportedVersion` are NOT validated here because they are
 * not edited here: the heartbeat and the version are written by the ingest Cloud Function, and the
 * uid is pasted from the Firebase console. Validating a field the form does not own would only
 * block a save on data the user cannot fix.
 */
export const partnerValidations = staticSuite(
  (model: PartnerModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);
    stringValidations('name', model.name, SHORT_NAME_LENGTH);
    stringValidations('orgKey', model.orgKey, SHORT_NAME_LENGTH);
    stringValidations('serviceUid', model.serviceUid, SHORT_NAME_LENGTH);
  });
