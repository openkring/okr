import { getSvgIconUrl } from "@bk2/shared-util-core";
import { ActionSheetButton, ActionSheetOptions } from "@ionic/angular";

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
