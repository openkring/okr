import {
  BUTTON_CONFIG_SHAPE, BUTTON_STYLE_SHAPE, ButtonAction, ButtonActionConfig, ButtonConfig, ButtonSection, ButtonStyle, ColorIonic, ICON_CONFIG_SHAPE, IconConfig,
  Slot, ViewPosition,
} from '@okr/shared-models';

/**
 * The simple settings of an «Aktions-Button» in the button editor: a look (preset), a size and where the icon stands. Each one writes
 * the fields a button has always stored (`ButtonStyle`, `IconConfig`), so readers and older apps draw it as before. A button whose
 * stored fields match no preset or size shows none of them as chosen; it keeps its fields until one is picked.
 */

export const BUTTON_PRESETS = ['main', 'outline', 'link', 'round', 'emergency'] as const;
export type ButtonPreset = (typeof BUTTON_PRESETS)[number];

export const BUTTON_SIZES = ['s', 'm', 'l', 'wide'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

export const ICON_PLACEMENTS = ['none', 'start', 'end', 'icon-only'] as const;
export type IconPlacement = (typeof ICON_PLACEMENTS)[number];

/** the name the emergency button had before it was an ordinary button (until its documents are patched) */
export const LEGACY_EMERGENCY_BUTTON_NAME = 'emergency-button';
/** about 2 cm across: 76 CSS px at 96 px per inch (how big it is on a screen depends on the device) */
export const EMERGENCY_BUTTON_DIAMETER = '76';
export const EMERGENCY_BUTTON_LABEL = 'Hilfe !';

/** height of a button with a label; width follows the label ('auto'), or the whole width */
const HEIGHTS: Record<Exclude<ButtonSize, 'wide'>, string> = { s: '36', m: '44', l: '56' };
/** diameter of a round button; 'wide' is not offered for one */
const DIAMETERS: Record<Exclude<ButtonSize, 'wide'>, string> = { s: '48', m: '60', l: EMERGENCY_BUTTON_DIAMETER };
const WIDE_HEIGHT = '48';
const AUTO = 'auto';
const FULL = '100%';

type PresetLook = Pick<ButtonStyle, 'shape' | 'fill' | 'color'>;
const LOOKS: Record<ButtonPreset, PresetLook> = {
  main:      { shape: 'default', fill: 'solid',   color: ColorIonic.Primary },
  outline:   { shape: 'default', fill: 'outline', color: ColorIonic.Primary },
  link:      { shape: 'default', fill: 'clear',   color: ColorIonic.Primary },
  round:     { shape: 'round',   fill: 'solid',   color: ColorIonic.Primary },
  emergency: { shape: 'round',   fill: 'solid',   color: ColorIonic.Danger },
};

/** the icon a new choice of action suggests when the button has none; '' = none */
const SUGGESTED_ICONS: Partial<Record<ButtonAction, string>> = {
  [ButtonAction.Download]: 'download',
  [ButtonAction.Zoom]: 'search',
  [ButtonAction.Notify]: 'calendar',
  [ButtonAction.Workflow]: 'process',
  [ButtonAction.Contract]: 'contract',
  [ButtonAction.ContractDocument]: 'contract',
};

const isRound = (style: Partial<ButtonStyle> | undefined): boolean => style?.shape === 'round';

function styleOf(config: Partial<ButtonConfig> | undefined): ButtonStyle {
  return { ...BUTTON_STYLE_SHAPE, ...(config?.style ?? {}) };
}

function iconOf(config: Partial<ButtonConfig> | undefined): IconConfig {
  return { ...ICON_CONFIG_SHAPE, ...(config?.icon ?? {}) };
}

function actionOf(config: Partial<ButtonConfig> | undefined): ButtonActionConfig {
  return { ...BUTTON_CONFIG_SHAPE.action, ...(config?.action ?? {}) } as ButtonActionConfig;
}

/** The whole config, with every part there: older documents may lack icon, style or action. */
export function buttonConfigOf(config: Partial<ButtonConfig> | undefined): ButtonConfig {
  return { ...(config ?? {}), icon: iconOf(config), style: styleOf(config), action: actionOf(config) } as ButtonConfig;
}

// ---------------------------------------------------- presets ----------------------------------------------------

/** The preset whose look the button has; 'emergency' only with its action. undefined: a look of its own. */
export function buttonPresetOf(config: Partial<ButtonConfig> | undefined): ButtonPreset | undefined {
  const style = styleOf(config);
  if (actionOf(config).type === ButtonAction.Emergency) return 'emergency';
  return BUTTON_PRESETS.find((preset) => preset !== 'emergency' && LOOKS[preset].shape === style.shape && LOOKS[preset].fill === style.fill
    && LOOKS[preset].color === style.color);
}

/**
 * Gives the button the look of a preset. Its size stays where it fits (a round one takes its diameter, one that was round a label's
 * size). 'emergency' is a whole button: red, round, 2 cm, «Hilfe !», no icon and the alarm as its action. Leaving it for another
 * preset leaves the alarm: the action becomes «Keine» and has to be chosen; the label stays, so the button is never empty.
 */
export function applyButtonPreset(config: Partial<ButtonConfig> | undefined, preset: ButtonPreset): ButtonConfig {
  const current = buttonConfigOf(config);
  if (preset === 'emergency') return emergencyButtonConfig(current);
  const size = buttonSizeOf(current.style) ?? 'm';
  let style: ButtonStyle = { ...current.style, ...LOOKS[preset] };
  style = applyButtonSize(style, preset === 'round' && size === 'wide' ? 'l' : size);
  let icon = current.icon;
  let action = current.action;
  if (action.type === ButtonAction.Emergency) action = { ...action, type: ButtonAction.None };
  if (preset === 'round') {
    const placed = applyIconPlacement(current, 'icon-only');
    style = { ...style, label: placed.style.label };
    icon = placed.icon;
    action = { ...action, altText: placed.action.altText };
  }
  return { ...current, style, icon, action };
}

/** The emergency button (red, round, about 2 cm, «Hilfe !», no icon, the alarm); what else the config holds stays. */
export function emergencyButtonConfig(config?: Partial<ButtonConfig>): ButtonConfig {
  const current = buttonConfigOf(config);
  return {
    ...current,
    style: { ...current.style, ...LOOKS.emergency, label: EMERGENCY_BUTTON_LABEL, width: EMERGENCY_BUTTON_DIAMETER, height: EMERGENCY_BUTTON_DIAMETER },
    icon: { ...current.icon, name: '', slot: 'start' },
    action: { ...current.action, type: ButtonAction.Emergency, url: '' },
  };
}

// ----------------------------------------------------- sizes -----------------------------------------------------

/** The size the stored width and height make; undefined: one of its own (typed in pixels). */
export function buttonSizeOf(style: Partial<ButtonStyle> | undefined): ButtonSize | undefined {
  const width = String(style?.width ?? '').trim();
  const height = String(style?.height ?? '').trim();
  const sizes = BUTTON_SIZES.filter((size): size is Exclude<ButtonSize, 'wide'> => size !== 'wide');
  if (isRound(style)) return sizes.find((size) => width === DIAMETERS[size] && height === DIAMETERS[size]);
  if (width === FULL && height === WIDE_HEIGHT) return 'wide';
  return sizes.find((size) => width === AUTO && height === HEIGHTS[size]);
}

/** Width and height of a size; a round button is as wide as high, and the whole width is offered only for one with a label. */
export function applyButtonSize(style: ButtonStyle, size: ButtonSize): ButtonStyle {
  if (isRound(style)) {
    const diameter = DIAMETERS[size === 'wide' ? 'l' : size];
    return { ...style, width: diameter, height: diameter };
  }
  if (size === 'wide') return { ...style, width: FULL, height: WIDE_HEIGHT };
  return { ...style, width: AUTO, height: HEIGHTS[size] };
}

/** The sizes a button may take: a round one has no 'wide'. */
export function buttonSizesFor(style: Partial<ButtonStyle> | undefined): readonly ButtonSize[] {
  return isRound(style) ? BUTTON_SIZES.filter((size) => size !== 'wide') : BUTTON_SIZES;
}

// ----------------------------------------------------- icon -----------------------------------------------------

/** Where the icon stands: 'none' without a name. 'none' as a stored slot reads as 'start' (it never hid the icon). */
export function iconPlacementOf(icon: Partial<IconConfig> | undefined): IconPlacement {
  if (!icon?.name) return 'none';
  return icon.slot === 'end' || icon.slot === 'icon-only' ? icon.slot : 'start';
}

/**
 * Places the icon. 'none' removes its name; any other place gives it one (the action's, else 'add') if it has none.
 * 'icon-only' shows no label: a label that was there becomes the alt text, if that is empty, so the button still has a name.
 * Leaving 'icon-only' brings that alt text back as the label when the label is empty.
 */
export function applyIconPlacement(config: Partial<ButtonConfig> | undefined, placement: IconPlacement): ButtonConfig {
  const current = buttonConfigOf(config);
  let { style, action } = current;
  if (placement === 'none') return { ...current, icon: { ...current.icon, name: '' } };
  const name = current.icon.name || suggestedIcon(current.action.type) || 'add';
  const icon: IconConfig = { ...current.icon, name, slot: placement as Slot };
  if (placement === 'icon-only' && style.label) {
    action = { ...action, altText: action.altText || style.label };
    style = { ...style, label: '' };
  } else if (placement !== 'icon-only' && !style.label && action.altText) {
    style = { ...style, label: action.altText };
  }
  return { ...current, icon, style, action };
}

/** The icon an action suggests; '' for one that suggests none. */
export function suggestedIcon(action: ButtonAction | undefined): string {
  return action === undefined ? '' : SUGGESTED_ICONS[action] ?? '';
}

/**
 * Chooses what the button does. The url stays (it means something else for each action, so the form asks for it again); an icon is
 * suggested when the button has a place for one but no name. Choosing the alarm makes it the emergency button.
 */
export function applyButtonAction(config: Partial<ButtonConfig> | undefined, type: ButtonAction): ButtonConfig {
  const current = buttonConfigOf(config);
  if (type === ButtonAction.Emergency) return emergencyButtonConfig(current);
  const left = current.action.type === ButtonAction.Emergency ? applyButtonPreset(current, 'main') : current;
  return { ...left, action: { ...left.action, type } };
}

// -------------------------------------------------- emergency --------------------------------------------------

/** Whether a button raises the alarm: by its action, or (until its document is patched) by its former name. */
export function isEmergencyButton(section: Pick<ButtonSection, 'name' | 'properties'> | undefined): boolean {
  return section?.properties?.action?.type === ButtonAction.Emergency || section?.name === LEGACY_EMERGENCY_BUTTON_NAME;
}

/**
 * A button as readers see it. The emergency button of the time before `ButtonAction.Emergency` was recognised by its name and drawn
 * with a fixed look: such a document is shown as the emergency button, with the button above its text, until it is patched.
 * Any other section comes back as it is.
 */
export function withLegacyEmergency(section: ButtonSection): ButtonSection {
  if (section.name !== LEGACY_EMERGENCY_BUTTON_NAME || section.properties?.action?.type === ButtonAction.Emergency) return section;
  const content = { ...section.content, position: ViewPosition.Top };
  return { ...section, content, properties: emergencyButtonConfig(section.properties) };
}
