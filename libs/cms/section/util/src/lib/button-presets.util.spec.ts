import { describe, expect, it } from 'vitest';

import { BUTTON_SECTION_SHAPE, ButtonAction, ButtonConfig, ButtonSection, ColorIonic, ViewPosition } from '@okr/shared-models';

import {
  applyButtonAction, applyButtonPreset, DOWNLOAD_BUTTON_LABEL, downloadButtonConfig, FILE_DOWNLOAD_BUTTON_LABEL, withUploadedFile, applyButtonSize, applyIconPlacement, buttonConfigOf, buttonPresetOf, buttonSizeOf, buttonSizesFor,
  EMERGENCY_BUTTON_DIAMETER, EMERGENCY_BUTTON_LABEL, emergencyButtonConfig, iconPlacementOf, isEmergencyButton, withFixedEmergencyLook, withLegacyEmergency,
} from './button-presets.util';

const config = (patch: Partial<ButtonConfig> = {}): ButtonConfig => buttonConfigOf({
  style: { label: 'Formular', shape: 'default', fill: 'solid', width: 'auto', height: '44', color: ColorIonic.Primary },
  icon: { name: '', size: 20, slot: 'start' },
  action: { type: ButtonAction.Workflow, url: '', altText: '' },
  ...patch,
} as ButtonConfig);

describe('buttonConfigOf', () => {
  it('fills the parts an older document lacks', () => {
    const filled = buttonConfigOf({} as ButtonConfig);
    expect(filled.style).toBeDefined();
    expect(filled.icon).toBeDefined();
    expect(filled.action).toBeDefined();
  });
});

describe('presets', () => {
  it('recognises the preset of the stored look', () => {
    expect(buttonPresetOf(config())).toBe('main');
    expect(buttonPresetOf(config({ style: { ...config().style, fill: 'outline' } }))).toBe('outline');
    expect(buttonPresetOf(config({ style: { ...config().style, color: ColorIonic.Tertiary } }))).toBeUndefined();
  });

  it('keeps the size when the look changes', () => {
    const outline = applyButtonPreset(config({ style: { ...config().style, height: '56' } }), 'outline');
    expect(outline.style.fill).toBe('outline');
    expect(buttonSizeOf(outline.style)).toBe('l');
    expect(outline.style.label).toBe('Formular');
  });

  it('round: as wide as high, the label becomes the alt text', () => {
    const round = applyButtonPreset(config(), 'round');
    expect(round.style.shape).toBe('round');
    expect(round.style.width).toBe(round.style.height);
    expect(round.style.label).toBe('');
    expect(round.action.altText).toBe('Formular');
    expect(round.icon.slot).toBe('icon-only');
    expect(round.icon.name).toBe('process');
  });

  it('round from wide takes the large diameter', () => {
    const wide = applyButtonSize(config().style, 'wide');
    expect(buttonSizeOf(applyButtonPreset(config({ style: wide }), 'round').style)).toBe('l');
  });

  it('leaving the emergency preset leaves the alarm, not the label', () => {
    const main = applyButtonPreset(emergencyButtonConfig(config()), 'main');
    expect(main.action.type).toBe(ButtonAction.None);
    expect(main.style.label).toBe(EMERGENCY_BUTTON_LABEL);
    expect(main.style.color).toBe(ColorIonic.Primary);
  });
});

describe('emergencyButtonConfig', () => {
  it('is red, round, about 2 cm, «Hilfe !», without icon, with the alarm', () => {
    const sos = emergencyButtonConfig(config({ action: { type: ButtonAction.Download, url: 'x.pdf', altText: 'Notruf' } }));
    expect(sos.style).toMatchObject({ shape: 'round', fill: 'solid', color: ColorIonic.Danger, label: EMERGENCY_BUTTON_LABEL,
      width: EMERGENCY_BUTTON_DIAMETER, height: EMERGENCY_BUTTON_DIAMETER });
    expect(sos.icon.name).toBe('');
    expect(sos.action).toEqual({ type: ButtonAction.Emergency, url: '', altText: 'Notruf' });
    expect(buttonPresetOf(sos)).toBe('emergency');
    expect(buttonSizeOf(sos.style)).toBe('l');
  });
});

describe('sizes', () => {
  it('maps sizes to width and height and back', () => {
    for (const size of ['s', 'm', 'l', 'wide'] as const) expect(buttonSizeOf(applyButtonSize(config().style, size))).toBe(size);
    expect(buttonSizeOf({ ...config().style, width: '120', height: '40' })).toBeUndefined();
  });

  it('offers no whole width for a round button', () => {
    expect(buttonSizesFor({ shape: 'round' })).not.toContain('wide');
    expect(buttonSizesFor({ shape: 'default' })).toContain('wide');
  });
});

describe('icon placement', () => {
  it('reads none without a name, start for an unknown slot', () => {
    expect(iconPlacementOf({ name: '', slot: 'end' })).toBe('none');
    expect(iconPlacementOf({ name: 'add', slot: 'none' })).toBe('start');
    expect(iconPlacementOf({ name: 'add', slot: 'end' })).toBe('end');
  });

  it('gives a missing icon the one of the action', () => {
    expect(applyIconPlacement(config(), 'end').icon).toMatchObject({ name: 'process', slot: 'end' });
    expect(applyIconPlacement(config({ action: { type: ButtonAction.None, url: '', altText: '' } }), 'start').icon.name).toBe('add');
  });

  it('brings the alt text back as the label after icon-only', () => {
    const only = applyIconPlacement(config(), 'icon-only');
    expect(applyIconPlacement(only, 'start').style.label).toBe('Formular');
  });

  it('none removes the name only', () => {
    expect(applyIconPlacement(config({ icon: { name: 'add', size: 20, slot: 'end' } }), 'none').icon).toEqual({ name: '', size: 20, slot: 'end' });
  });
});

describe('applyButtonAction', () => {
  it('choosing the alarm makes the emergency button, leaving it a normal one', () => {
    const sos = applyButtonAction(config(), ButtonAction.Emergency);
    expect(buttonPresetOf(sos)).toBe('emergency');
    const back = applyButtonAction(sos, ButtonAction.Download);
    expect(back.action.type).toBe(ButtonAction.Download);
    expect(back.style.color).toBe(ColorIonic.Primary);
  });
});

describe('emergency of the time before ButtonAction.Emergency', () => {
  const legacy = { ...BUTTON_SECTION_SHAPE, name: 'emergency-button', content: { htmlContent: '<p>Text</p>', colSize: 4, position: ViewPosition.Left },
    properties: config({ action: { type: ButtonAction.None, url: '', altText: '' } }) } as ButtonSection;

  it('is recognised by its name or its action', () => {
    expect(isEmergencyButton(legacy)).toBe(true);
    expect(isEmergencyButton({ name: 'x', properties: emergencyButtonConfig() })).toBe(true);
    expect(isEmergencyButton({ name: 'x', properties: config() })).toBe(false);
  });

  it('is drawn as the emergency button above its text', () => {
    const shown = withLegacyEmergency(legacy);
    expect(shown.properties.action.type).toBe(ButtonAction.Emergency);
    expect(shown.content.position).toBe(ViewPosition.Top);
    expect(shown.content.htmlContent).toBe('<p>Text</p>');
  });

  it('leaves a patched one and every other section as it is', () => {
    const patched = { ...legacy, properties: emergencyButtonConfig() };
    expect(withLegacyEmergency(patched)).toBe(patched);
    const other = { ...legacy, name: 'x' };
    expect(withLegacyEmergency(other)).toBe(other);
  });
});

describe('withFixedEmergencyLook', () => {
  it('draws an alarm button as the emergency button, whatever its stored style', () => {
    const disguised = { ...BUTTON_SECTION_SHAPE, name: 'x', content: { htmlContent: '', colSize: 6, position: ViewPosition.None },
      properties: config({ style: { ...config().style, label: 'Download', color: ColorIonic.Primary }, action: { type: ButtonAction.Emergency, url: '', altText: '' } }) } as ButtonSection;
    const shown = withFixedEmergencyLook(disguised);
    expect(shown.properties.style).toMatchObject({ label: EMERGENCY_BUTTON_LABEL, color: ColorIonic.Danger, shape: 'round' });
    expect(shown.properties.icon.name).toBe('');
  });

  it('leaves any other button as it is', () => {
    const other = { ...BUTTON_SECTION_SHAPE, properties: config() } as ButtonSection;
    expect(withFixedEmergencyLook(other)).toBe(other);
  });
});

describe('download button (the default of a new button)', () => {
  it('is a medium link «PDF herunterladen» with the PDF icon in front', () => {
    const fresh = downloadButtonConfig();
    expect(buttonPresetOf(fresh)).toBe('link');
    expect(buttonSizeOf(fresh.style)).toBe('m');
    expect(iconPlacementOf(fresh.icon)).toBe('start');
    expect(fresh.icon.name).toBe('filetypes:pdf');
    expect(fresh.style.label).toBe(DOWNLOAD_BUTTON_LABEL);
    expect(fresh.action).toEqual({ type: ButtonAction.Download, url: '', altText: '' });
  });

  it('a new one each time', () => {
    expect(downloadButtonConfig()).not.toBe(downloadButtonConfig());
    expect(downloadButtonConfig().style).not.toBe(downloadButtonConfig().style);
  });

  it('an uploaded PDF becomes its url and alt text', () => {
    const up = withUploadedFile(downloadButtonConfig(), { url: 'https://x/y.pdf', name: 'Statuten.pdf' });
    expect(up.action).toEqual({ type: ButtonAction.Download, url: 'https://x/y.pdf', altText: 'Statuten.pdf' });
    expect(up.icon.name).toBe('filetypes:pdf');
    expect(up.style.label).toBe(DOWNLOAD_BUTTON_LABEL);
  });

  it('a file that is no PDF drops the PDF icon and the default label, a typed alt text and label stay', () => {
    const up = withUploadedFile(downloadButtonConfig(), { url: 'u', name: 'Liste.xlsx' });
    expect(up.icon.name).toBe('download');
    expect(up.style.label).toBe(FILE_DOWNLOAD_BUTTON_LABEL);
    const own = withUploadedFile(config({ action: { type: ButtonAction.Download, url: '', altText: 'Mitgliederliste' } }), { url: 'u', name: 'Liste.xlsx' });
    expect(own.action.altText).toBe('Mitgliederliste');
    expect(own.style.label).toBe('Formular');
  });
});
