import { describe, expect, it } from 'vitest';
import { MAP_SECTION_SHAPE, MapSection } from '@okr/shared-models';

import { JOURNAL_MAP_LAYER_IDS } from './journal-mode.util';
import { mapSectionValidations } from './map-section.validations';

describe('mapSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(mapSectionValidations({ ...MAP_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...MAP_SECTION_SHAPE, title: 123 } as unknown as MapSection;
    expect(mapSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('flags an out-of-range latitude', () => {
    const model = { ...MAP_SECTION_SHAPE, properties: { ...MAP_SECTION_SHAPE.properties, centerLatitude: 999 } } as unknown as MapSection;
    expect(mapSectionValidations(model).hasErrors('centerLatitude')).toBe(true);
  });

  describe('journal map (layer / showRoute present)', () => {
    const journalMap = (properties: Record<string, unknown>) =>
      ({ ...MAP_SECTION_SHAPE, properties: { ...MAP_SECTION_SHAPE.properties, ...properties } }) as unknown as MapSection;

    it('accepts a zoom from 1 to 19 and a known layer', () => {
      for (const zoom of [1, 10, 19]) {
        expect(mapSectionValidations(journalMap({ zoom, layer: 'world', showRoute: true })).isValid()).toBe(true);
      }
    });

    it('flags a zoom outside 1-19', () => {
      for (const zoom of [0, 20]) {
        expect(mapSectionValidations(journalMap({ zoom, showRoute: false })).hasErrors('zoom')).toBe(true);
      }
    });

    it('flags a layer id the journal does not know', () => {
      expect(mapSectionValidations(journalMap({ layer: 'bing' })).hasErrors('layer')).toBe(true);
    });

    it('accepts every layer id the form offers', () => {
      for (const layer of JOURNAL_MAP_LAYER_IDS) {
        expect(mapSectionValidations(journalMap({ layer })).hasErrors('layer')).toBe(false);
      }
    });

    it('leaves a map without layer and showRoute on the CMS range (0-20)', () => {
      expect(mapSectionValidations(journalMap({ zoom: 0 })).hasErrors('zoom')).toBe(false);
      expect(mapSectionValidations(journalMap({ zoom: 20 })).hasErrors('zoom')).toBe(false);
      expect(mapSectionValidations(journalMap({ zoom: 21 })).hasErrors('zoom')).toBe(true);
    });
  });

  describe('map editor fields', () => {
    const withProps = (properties: Record<string, unknown>) =>
      ({ ...MAP_SECTION_SHAPE, properties: { ...MAP_SECTION_SHAPE.properties, ...properties } }) as unknown as MapSection;

    it('accepts a map without the new fields', () => {
      expect(mapSectionValidations(withProps({})).isValid()).toBe(true);
    });

    it('accepts pins, pin fields and the locate button', () => {
      expect(mapSectionValidations(withProps({ showLocateButton: false, locationKeys: ['a', 'b'], pinFields: ['name', 'address'] })).isValid()).toBe(true);
    });

    it('flags a non-boolean locate button', () => {
      expect(mapSectionValidations(withProps({ showLocateButton: 'yes' })).hasErrors('showLocateButton')).toBe(true);
    });

    it('flags an empty location key', () => {
      expect(mapSectionValidations(withProps({ locationKeys: ['a', ''] })).hasErrors('locationKeys')).toBe(true);
    });

    it('flags an unknown pin field', () => {
      expect(mapSectionValidations(withProps({ pinFields: ['name', 'phone'] })).hasErrors('pinFields')).toBe(true);
    });
  });
});
