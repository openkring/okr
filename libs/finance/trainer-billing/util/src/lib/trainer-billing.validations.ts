import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { TrainerAgreementModel, TrainerProfileModel, TrainerService, TrainerServiceUnit, WorkEntryModel } from '@okr/shared-models';
import { dateValidations, stringValidations } from '@okr/shared-util-core';

import { agreementsOverlap } from './trainer-billing.util';

const PFX = '@finance/trainer-billing/util.validation.';

/**
 * Most services per agreement (ruling R4): the work-entries rule unrolls the service lookup over the first 10, an
 * 11th service could never be booked. The agreement editor hides «add» at this count.
 */
export const TRAINER_MAX_SERVICES = 10;
/** Cap of a work entry's text on the invoice (kept in step with the form's `[maxLength]`). */
export const WORK_ENTRY_LABEL_LENGTH = 200;
/** Cap of a service name (shown as the service on the invoice). */
export const TRAINER_SERVICE_NAME_LENGTH = NAME_LENGTH;
/** Cap of the invoice number template, e.g. `TR-{yyyy}-{n}`. */
export const TRAINER_NUMBER_TEMPLATE_LENGTH = SHORT_NAME_LENGTH;
/** Cap of the VAT number (`CHE-123.456.789 MWST`). */
export const TRAINER_VAT_NUMBER_LENGTH = SHORT_NAME_LENGTH;
/** Longest payment term the profile accepts, in days. */
export const TRAINER_MAX_PAYMENT_TERM_DAYS = 120;
/** Most hours one work entry may carry (one entry = one day). */
export const WORK_ENTRY_MAX_HOURS = 24;
/** Most days one work entry may carry (one entry = one day). */
export const WORK_ENTRY_MAX_DAYS = 1;

/** Context of the agreement suite: the books' default expense account and the other agreements of the books. */
export type TrainerAgreementValidationContext = {
  /** `defaultCompensationAccountKey` of the books; '' = none, then every service needs its own account */
  defaultAccountKey: string;
  /** other agreements of the same books (the agreement itself may be among them, it is skipped by okey) */
  otherAgreements: TrainerAgreementModel[];
};

/** True when another live agreement of the same person in the same books overlaps the validity of `model` (D5). */
export function overlapsOtherAgreement(model: TrainerAgreementModel, others: TrainerAgreementModel[]): boolean {
  const personKey = model.personKey ?? '';
  if (!personKey || !model.validFrom) return false;
  return (others ?? []).some(o =>
    o.okey !== model.okey
    && !o.isArchived
    && (o.personKey ?? '') === personKey
    && (o.accountingTenantId ?? '') === (model.accountingTenantId ?? '')
    && agreementsOverlap(
      { validFrom: model.validFrom, validTo: model.validTo ?? '' },
      { validFrom: o.validFrom ?? '', validTo: o.validTo ?? '' },
    ));
}

/**
 * The stable key of a new service, derived from its name: `Regattabetreuung` → `regattabetreuung`,
 * `Training Ü30` → `training-ue30`. Work entries point at it, so it never changes once the service is stored.
 */
export function serviceKeyOf(name: string): string {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SHORT_NAME_LENGTH);
}

function isStoreDate(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9]{8}$/.test(value);
}

/**
 * The agreement editor (spec 1.167 §7.1). Field names follow the model; per-service failures are filed under
 * `services[<i>].<field>` so the editor can show them on the row.
 */
export const trainerAgreementValidations = staticSuite((model: TrainerAgreementModel, context?: TrainerAgreementValidationContext) => {
  const defaultAccountKey = context?.defaultAccountKey ?? '';
  const services = model.services ?? [];

  // the books come from the route / store, never from the app tenant: a foreign key, so no cap
  stringValidations('accountingTenantId', model.accountingTenantId, undefined, 0, true);

  test('personKey', PFX + 'personRequired', () => {
    enforce(!!(model.personKey ?? '').trim() && !!model.person).isTruthy();
  });

  stringValidations('validFrom', model.validFrom, undefined, 0, true);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo ?? '');
  omitWhen(!model.validFrom || !model.validTo, () => {
    test('validTo', PFX + 'validToBeforeFrom', () => {
      enforce(model.validTo >= model.validFrom).isTruthy();
    });
  });
  test('validFrom', PFX + 'agreementOverlap', () => {
    enforce(overlapsOtherAgreement(model, context?.otherAgreements ?? [])).isFalsy();
  });

  test('services', PFX + 'serviceRequired', () => {
    enforce(services.length).greaterThan(0);
  });
  test('services', PFX + 'tooManyServices', () => {
    enforce(services.length).lessThanOrEquals(TRAINER_MAX_SERVICES);
  });

  const keys = services.map(s => s.key ?? '');
  services.forEach((service, i) => {
    const at = `services[${i}]`;
    stringValidations(`${at}.name`, service.name ?? '', TRAINER_SERVICE_NAME_LENGTH, 1, true);
    test(`${at}.key`, PFX + 'serviceKeyRequired', () => {
      enforce(!!(service.key ?? '').trim()).isTruthy();
    });
    test(`${at}.key`, PFX + 'serviceKeyDuplicate', () => {
      enforce(keys.filter(k => k === (service.key ?? '')).length).equals(1);
    });
    test(`${at}.unit`, PFX + 'unitInvalid', () => {
      enforce(service.unit === 'hour' || service.unit === 'day').isTruthy();
    });
    validateRates(at, service);
    test(`${at}.accountKey`, PFX + 'accountRequired', () => {
      enforce(!!service.accountKey || !!defaultAccountKey).isTruthy();
    });
  });

  stringValidations('payablesNote', model.payablesNote ?? '', DESCRIPTION_LENGTH);
  stringValidations('notes', model.notes ?? '', DESCRIPTION_LENGTH);
});

/** At least one rate; every rate has a valid date and a positive whole amount in Rappen; no two on the same day. */
function validateRates(at: string, service: TrainerService): void {
  const rates = service.rates ?? [];
  test(`${at}.rates`, PFX + 'rateRequired', () => {
    enforce(rates.length).greaterThan(0);
  });
  test(`${at}.rates`, PFX + 'rateDateInvalid', () => {
    enforce(rates.every(r => isStoreDate(r.validFrom))).isTruthy();
  });
  test(`${at}.rates`, PFX + 'rateAmountInvalid', () => {
    enforce(rates.every(r => Number.isSafeInteger(r.amount?.amount) && (r.amount?.amount ?? 0) > 0)).isTruthy();
  });
  test(`${at}.rates`, PFX + 'rateDateDuplicate', () => {
    const dates = rates.map(r => r.validFrom);
    enforce(new Set(dates).size).equals(dates.length);
  });
}

/** The trainer's invoice profile (spec 1.167 §7.2). `nextNumber` and `tenants` are server-maintained and never judged. */
export const trainerProfileValidations = staticSuite((model: TrainerProfileModel) => {
  stringValidations('companyName', model.companyName ?? '', NAME_LENGTH);
  stringValidations('contactName', model.contactName ?? '', NAME_LENGTH);
  // chosen from the person's own addresses: foreign keys, so no cap
  stringValidations('postalAddressKey', model.postalAddressKey ?? '', undefined, 0, true);
  stringValidations('bankAddressKey', model.bankAddressKey ?? '', undefined, 0, true);

  stringValidations('numberTemplate', model.numberTemplate ?? '', TRAINER_NUMBER_TEMPLATE_LENGTH, 1, true);
  test('numberTemplate', PFX + 'templateNeedsVariable', () => {
    const template = model.numberTemplate ?? '';
    enforce(template.includes('{mm}') || template.includes('{n}')).isTruthy();
  });

  test('paymentTermDays', PFX + 'paymentTermInvalid', () => {
    const days = model.paymentTermDays;
    enforce(Number.isInteger(days) && days >= 0 && days <= TRAINER_MAX_PAYMENT_TERM_DAYS).isTruthy();
  });

  omitWhen(model.vatRegistered !== true, () => {
    stringValidations('vatNumber', model.vatNumber ?? '', TRAINER_VAT_NUMBER_LENGTH, 1, true);
  });
  stringValidations('vatNote', model.vatNote ?? '', DESCRIPTION_LENGTH);
  stringValidations('closingText', model.closingText ?? '', DESCRIPTION_LENGTH);
});

/** Hours in quarter hours, days in half days (spec 1.167 §5.3). */
function isOnStep(quantity: number, unit: TrainerServiceUnit): boolean {
  const steps = quantity / (unit === 'day' ? 0.5 : 0.25);
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/**
 * A work entry (spec 1.167 §7.3). `services` are the services of the entry's agreement: the unit of the chosen one
 * decides the quantity range (one entry = one day), and an archived or unknown service cannot be chosen.
 * `state` and `invoiceKey` are server-maintained and never judged.
 */
export const workEntryValidations = staticSuite((model: WorkEntryModel, services?: TrainerService[]) => {
  stringValidations('agreementKey', model.agreementKey ?? '', undefined, 0, true);
  stringValidations('date', model.date, undefined, 0, true);
  dateValidations('date', model.date);

  stringValidations('serviceKey', model.serviceKey ?? '', undefined, 0, true);
  const service = (services ?? []).find(s => s.key === model.serviceKey);
  omitWhen(!model.serviceKey || services === undefined, () => {
    test('serviceKey', PFX + 'serviceUnavailable', () => {
      enforce(!!service && !service.isArchived).isTruthy();
    });
  });

  const quantity = model.quantity;
  test('quantity', PFX + 'quantityPositive', () => {
    enforce(typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0).isTruthy();
  });
  omitWhen(!service || !(quantity > 0), () => {
    const unit = service?.unit ?? 'hour';
    test('quantity', unit === 'day' ? PFX + 'quantityMaxDay' : PFX + 'quantityMaxHours', () => {
      enforce(quantity).lessThanOrEquals(unit === 'day' ? WORK_ENTRY_MAX_DAYS : WORK_ENTRY_MAX_HOURS);
    });
    test('quantity', unit === 'day' ? PFX + 'quantityStepDay' : PFX + 'quantityStepHours', () => {
      enforce(isOnStep(quantity, unit)).isTruthy();
    });
  });

  stringValidations('label', model.label ?? '', WORK_ENTRY_LABEL_LENGTH);
});
