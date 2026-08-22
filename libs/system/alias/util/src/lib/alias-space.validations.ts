import { enforce, only, staticSuite, test } from 'vest';

import { NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { AliasSpaceModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/** Das URL-Segment: nur das, was ohne Escaping durch einen Pfad und eine Document-ID passt. */
const SPACE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Validierung eines AliasSpace.
 *
 * `name` ist nach der ersten Alias-Vergabe UNVERÄNDERLICH — er steht in der URL und in der
 * Document-ID, ein Rename würde jeden gedruckten Code verwaisen lassen. Erzwungen wird das
 * nicht hier, sondern im Formular (`readOnly`, sobald der Space Aliase hat); diese Suite
 * prüft nur die Form.
 */
export const aliasSpaceValidations = staticSuite(
  (model: AliasSpaceModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);

    stringValidations('name', model.name, WORD_LENGTH);
    stringValidations('label', model.label, NAME_LENGTH);
    stringValidations('notes', model.notes, NAME_LENGTH);
    // 4 ist die untere Grenze, ab der ein 'base32-safe'-Code nicht trivial erratbar ist;
    // 32 die obere, ab der er als QR keinen Vorteil mehr gegenüber der langen URL hat.
    numberValidations('length', model.length, true, 4, 32);
    numberValidations('defaultMaxUses', model.defaultMaxUses, true, 0, 1_000_000);
    numberValidations('defaultValidDays', model.defaultValidDays, true, 0, 36_500);
    numberValidations('retentionDays', model.retentionDays, true, 0, 3_650);

    test('name', 'Nur Kleinbuchstaben, Ziffern und Bindestriche; Beginn mit einem Buchstaben.', () => {
      enforce(SPACE_NAME_PATTERN.test(model.name)).isTruthy();
    });

    // `detailed` schreibt eine Zeile pro Klick inklusive gehashter IP und uid. Ohne Frist wäre
    // das eine unbefristete Sammlung von Personendaten — die Spec verlangt deshalb
    // ausdrücklich retentionDays > 0, und das ist eine revDSG-Anforderung, keine Vorliebe.
    test('retentionDays', 'Detailliertes Tracking braucht eine Aufbewahrungsfrist grösser als 0.', () => {
      enforce(model.trackingLevel !== 'detailed' || model.retentionDays > 0).isTruthy();
    });
  },
);
