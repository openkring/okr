import { enforce, omitWhen, staticSuite, test } from 'vest';

import { MAP_PIN_FIELDS, MapSection } from '@okr/shared-models';
import { booleanValidations, numberValidations } from '@okr/shared-util-core';

import { baseSectionValidations } from './base-section.validations';
import { JOURNAL_MAP_LAYER_IDS, JOURNAL_MAP_ZOOM_MAX, JOURNAL_MAP_ZOOM_MIN } from './journal-mode.util';

export const mapSectionValidations = staticSuite((model: MapSection) => {
    baseSectionValidations(model);

    numberValidations('centerLatitude', model.properties?.centerLatitude, false, -90, 90);
    numberValidations('centerLongitude', model.properties?.centerLongitude, false, -180, 180);
    numberValidations('zoom', model.properties?.zoom, true, 0, 20);
    booleanValidations('useCurrentLocationAsCenter', model.properties?.useCurrentLocationAsCenter);

    // map editor: optional, absent on maps stored before
    omitWhen(model.properties?.showLocateButton === undefined, () => {
      booleanValidations('showLocateButton', model.properties?.showLocateButton);
    });
    omitWhen(model.properties?.locationKeys === undefined, () => {
      test('locationKeys', '@cms/section/feature.validation.locationKeys', () => {
        const keys = model.properties?.locationKeys;
        enforce(Array.isArray(keys) && keys.every((k) => typeof k === 'string' && k.length > 0)).isTruthy();
      });
    });
    omitWhen(model.properties?.pinFields === undefined, () => {
      test('pinFields', '@cms/section/feature.validation.pinFields', () => {
        const fields = model.properties?.pinFields;
        enforce(Array.isArray(fields) && fields.every((f) => (MAP_PIN_FIELDS as readonly string[]).includes(f))).isTruthy();
      });
    });

    // travel journal (spec 1.154 phase 5): a journal map names a base layer and/or whether it draws the route. Only
    // then the journal's tighter zoom range applies and the layer must be one the journal knows; every other map is
    // validated exactly as before. A layer this device does not offer is fine (the renderer falls back).
    const properties = model.properties;
    const isJournalMap = properties?.layer !== undefined || properties?.showRoute !== undefined;
    omitWhen(!isJournalMap, () => {
      test('zoom', '@cms/section/feature.validation.zoomRange', () => {
        const zoom = properties?.zoom;
        enforce(typeof zoom === 'number' && zoom >= JOURNAL_MAP_ZOOM_MIN && zoom <= JOURNAL_MAP_ZOOM_MAX).isTruthy();
      });
    });
    omitWhen(properties?.layer === undefined, () => {
      test('layer', '@cms/section/feature.validation.layerUnknown', () => {
        enforce(JOURNAL_MAP_LAYER_IDS.includes(properties?.layer as string)).isTruthy();
      });
    });

});
