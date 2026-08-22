import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { AliasModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

import { isRoutableTargetKey } from './alias-target-routes';
import { isSafeTargetUrl } from './alias.util';

/**
 * Validierung eines Alias im Formular.
 *
 * Sie spiegelt bewusst die Server-Regeln aus `assertTargetAcceptable` (Teilprojekt 2): das
 * Formular soll dieselbe Antwort geben wie die Callable, nur früher. Der Server bleibt die
 * Autorität — diese Suite ist Bequemlichkeit, keine Sicherheitsgrenze.
 */
export const aliasValidations = staticSuite(
  (model: AliasModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);

    stringValidations('space', model.space, WORD_LENGTH);
    stringValidations('alias', model.alias, WORD_LENGTH);
    stringValidations('original', model.original, NAME_LENGTH);
    stringValidations('notes', model.notes, NAME_LENGTH);
    numberValidations('maxUses', model.maxUses, true, 0, 1_000_000);

    test('space', 'Ein Space muss gewählt sein.', () => {
      enforce(model.space).isNotBlank();
    });

    // Nur https. Ein öffentlicher Redirector, der 'javascript:' oder 'data:' weiterreicht, ist
    // ein Waschgang für fremde Payloads; 'http:' würde die TLS-Verbindung downgraden.
    omitWhen(model.targetType !== 'url', () => {
      test('targetUrl', 'Das Ziel muss eine https-Adresse sein.', () => {
        enforce(isSafeTargetUrl(model.targetUrl)).isTruthy();
      });
    });

    // Der TP1-Review-Befund, hier am frühesten Punkt: ein Modellziel ohne Detailroute
    // (calevent, trip) darf gar nicht erst entstehen — sonst steht der Code am Ende
    // gedruckt auf einem Plakat und kann nur noch 404 sein.
    omitWhen(model.targetType !== 'model', () => {
      test('targetKey', 'Für diesen Modelltyp gibt es keine Detailseite, die ein Link öffnen könnte.', () => {
        enforce(isRoutableTargetKey(model.targetKey)).isTruthy();
      });
    });
  },
);
