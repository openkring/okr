import { enforce, omitWhen, staticSuite, test } from 'vest';

import { MandateModel } from '@okr/shared-models';

import { MANDATE_VALIDATION_KEYS as V } from './mandate-i18n';
import { isMandateActive } from './mandate.util';

/**
 * The Vollmacht form (spec 1.180). Field names are the form's: `grantee` is the grantee picker (`granteeKey`).
 * `existing` are the mandates already loaded for the pair's tenant, `today` a StoreDate. The Firestore rules re-check
 * the record on write (`mandateCreateOk`: shape per kind, parties, no self-grant, who may create); the duplicate and
 * the date checks are app-only. This suite keeps an obviously wrong Vollmacht from being sent.
 */
export const mandateValidations = staticSuite((model: MandateModel, existing: MandateModel[], today: string) => {
  test('grantee', V.grantee_required, () => {
    enforce(model.granteeKey ?? '').isNotBlank();
  });
  omitWhen(!model.granteeKey, () => {
    test('grantee', V.grantee_is_grantor, () => {
      enforce(model.granteeKey).notEquals(model.grantorKey);
    });
  });

  omitWhen(model.kind !== 'family' || !model.granteeKey, () => {
    test('grantee', V.duplicate_family, () => {
      const duplicate = existing.some(
        (m) =>
          m.kind === 'family' &&
          m.okey !== model.okey &&
          m.grantorKey === model.grantorKey &&
          m.granteeKey === model.granteeKey &&
          isMandateActive(m, today),
      );
      enforce(duplicate).isFalsy();
    });
  });

  omitWhen(model.kind !== 'family', () => {
    test('actions', V.actions_required, () => {
      enforce((model.actions ?? []).length).greaterThan(0);
    });
  });

  omitWhen(!model.validFrom || !model.validTo, () => {
    test('validTo', V.validTo_before_validFrom, () => {
      enforce(model.validTo >= model.validFrom).isTruthy();
    });
  });

  omitWhen(model.kind !== 'proxy', () => {
    test('meetingKey', V.meeting_required, () => {
      enforce(model.meetingKey ?? '').isNotBlank();
    });
  });
});
