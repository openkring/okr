import { getSvgIconUrl } from "@okr/shared-util-core";
import { ActionSheetButton, ActionSheetOptions } from "@ionic/angular/lazy";

export function createActionSheetOptions(
    header: string,
    subHeader = undefined,
    cssClass = 'custom-action-sheet',
    backdropDismiss = true,
    translucent = false,
    animated = true,
    keyboardClose = true
): ActionSheetOptions {
    return {
        header: header,
        subHeader,
        cssClass,
        buttons: [],
        backdropDismiss,
        translucent,
        animated,
        mode: undefined,
        keyboardClose
    };
}

/**
 * This is a helper to easily create a new menu on an actionsheet
 * @param name  [model.]action the action identifier
 * @param text the translated text to show on the actionsheet menu 
 * @param imgixBaseUrl base url for imgix. This is needed to resolve the icon image over imgix.
 * @param iconName the name of the icon to show on the actionsheet
 * @returns an ActionSheetButton
 */
export function createActionSheetButton(
    name: string,
    text: string,
    imgixBaseUrl: string,
    iconName?: string
): ActionSheetButton {
    return {
        text,
        icon: iconName ? getSvgIconUrl(imgixBaseUrl, iconName) : undefined,
        role: getRole(name),
        data: {
            action: name
        }
    };
}

export function createActionSheetDivider(): ActionSheetButton {
    return {
        text: '',
        cssClass: 'action-sheet-divider',
        role: 'none',
    }
}

function getRole(text: string): string | undefined {
    if (text.endsWith('delete')) return 'destructive';
    if (text.endsWith('cancel')) return 'cancel';
    return undefined;
}

/******************************** two-level ActionSheet ******************************************* */
/** One selectable action. `text` is the verb alone (e.g. 'anzeigen') when the action sits in a group. */
export interface ActionSheetAction {
    action: string;     // [model.]action identifier, returned on selection
    text: string;
    icon?: string;
}

/** A level-1 entry that opens a second ActionSheet with its actions (e.g. «Nutzung…» → «… ändern»). */
export interface ActionSheetGroup {
    text: string;       // the noun, e.g. 'Nutzung'
    icon?: string;
    actions: ActionSheetAction[];
}

export type ActionSheetEntry = ActionSheetAction | ActionSheetGroup;

/** The part of Ionic's ActionSheetController that selectNestedAction needs (keeps this file testable). */
export interface ActionSheetControllerLike {
    create(opts: ActionSheetOptions): Promise<{ present(): Promise<void>; onDidDismiss(): Promise<{ data?: { action?: string } }> }>;
}

export function isActionSheetGroup(entry: ActionSheetEntry): entry is ActionSheetGroup {
    return Array.isArray((entry as ActionSheetGroup).actions);
}

/** Builds the label of a group action that is shown directly on level 1, e.g. 'Nutzung' + 'anzeigen'. */
export type ActionLabelCombiner = (group: string, action: string) => string;
export const combineActionLabel: ActionLabelCombiner = (group, action) => `${group} ${action}`;

/**
 * Reduces the entries to what level 1 shows: empty groups disappear, and a group with only one
 * accessible action is not worth a second sheet — its action moves up to level 1 with a combined
 * label (e.g. a read-only user sees «Nutzung anzeigen» instead of «Nutzung…» → «… anzeigen»).
 */
export function flattenActionSheetEntries(entries: ActionSheetEntry[], combine: ActionLabelCombiner = combineActionLabel): ActionSheetEntry[] {
    const result: ActionSheetEntry[] = [];
    for (const entry of entries) {
        if (!isActionSheetGroup(entry)) {
            result.push(entry);
        } else if (entry.actions.length === 1) {
            const action = entry.actions[0];
            result.push({ action: action.action, text: combine(entry.text, action.text), icon: action.icon ?? entry.icon });
        } else if (entry.actions.length > 1) {
            result.push(entry);
        }
    }
    return result;
}

/**
 * Shows a two-level ActionSheet and resolves to the selected action identifier, or undefined when
 * the user cancelled (on either level) or there was nothing to offer. A group opens a second sheet
 * with its actions (labelled «… verb»); see flattenActionSheetEntries for the single-action rule.
 * @param actionSheetController the Ionic controller
 * @param header the header of the first-level sheet
 * @param entries the actions and groups the current user is allowed to use
 * @param cancelText the label of the cancel button (on both levels)
 * @param imgixBaseUrl base url to resolve the icons
 * @param combine builds the label of a group action that moved up to level 1
 */
export async function selectNestedAction(
    actionSheetController: ActionSheetControllerLike,
    header: string,
    entries: ActionSheetEntry[],
    cancelText: string,
    imgixBaseUrl: string,
    combine: ActionLabelCombiner = combineActionLabel
): Promise<string | undefined> {
    const level1 = flattenActionSheetEntries(entries, combine);
    if (level1.length === 0) return undefined;

    const options = createActionSheetOptions(header);
    level1.forEach((entry, i) => options.buttons.push(isActionSheetGroup(entry) ?
        createActionSheetButton(`group.${i}`, `${entry.text}…`, imgixBaseUrl, entry.icon) :
        createActionSheetButton(entry.action, entry.text, imgixBaseUrl, entry.icon)));
    options.buttons.push(createActionSheetButton('cancel', cancelText, imgixBaseUrl, 'cancel'));
    const selected = await presentActionSheet(actionSheetController, options);
    if (!selected || selected === 'cancel') return undefined;
    if (!selected.startsWith('group.')) return selected;

    const group = level1[Number(selected.substring('group.'.length))];
    if (!group || !isActionSheetGroup(group)) return undefined;
    const subOptions = createActionSheetOptions(group.text);
    for (const action of group.actions) {
        subOptions.buttons.push(createActionSheetButton(action.action, `… ${action.text}`, imgixBaseUrl, action.icon));
    }
    subOptions.buttons.push(createActionSheetButton('cancel', cancelText, imgixBaseUrl, 'cancel'));
    const subSelected = await presentActionSheet(actionSheetController, subOptions);
    return !subSelected || subSelected === 'cancel' ? undefined : subSelected;
}

async function presentActionSheet(
    actionSheetController: ActionSheetControllerLike,
    options: ActionSheetOptions
): Promise<string | undefined> {
    const actionSheet = await actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    return data?.action;
}
