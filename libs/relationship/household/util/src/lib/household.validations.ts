import { enforce, omitWhen, staticSuite, test } from 'vest';

import { NAME_LENGTH } from '@okr/shared-constants';
import { HouseholdModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

import { HOUSEHOLD_VALIDATION_KEYS as V } from './household-i18n';

/**
 * The household edit form (spec 1.168 §4.2). The `saveHousehold` callable checks the same rules across documents
 * (one household per person and tenant); this suite only keeps an obviously wrong household from being sent.
 *
 * - name is mandatory;
 * - a NEW household needs two persons (the server archives anything smaller); an existing one may shrink — that is
 *   how an admin dissolves it;
 * - from two persons on, payer and contact are mandatory and must be among the persons.
 */
export const householdValidations = staticSuite((model: HouseholdModel) => {
  const members = model.memberKeys ?? [];
  stringValidations('name', model.name, NAME_LENGTH, 0, true);
  stringValidations('type', model.type);

  omitWhen(!!model.okey, () => {
    test('memberKeys', V.two_members, () => {
      enforce(members.length).greaterThanOrEquals(2);
    });
  });
  test('memberKeys', V.duplicate_member, () => {
    enforce(new Set(members).size).equals(members.length);
  });

  omitWhen(members.length < 2, () => {
    test('payerKey', V.payer_required, () => {
      enforce(model.payerKey ?? '').isNotBlank();
    });
    omitWhen(!model.payerKey, () => {
      test('payerKey', V.payer_not_member, () => {
        enforce(members.includes(model.payerKey)).isTruthy();
      });
    });
    test('contactKey', V.contact_required, () => {
      enforce(model.contactKey ?? '').isNotBlank();
    });
    omitWhen(!model.contactKey, () => {
      test('contactKey', V.contact_not_member, () => {
        enforce(members.includes(model.contactKey)).isTruthy();
      });
    });
  });
});
