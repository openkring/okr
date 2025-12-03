import { getSvgIconUrl } from "@bk2/shared-pipes";
import { bkTranslate } from "@bk2/shared-i18n";
import { ActionSheetButton, ActionSheetOptions } from "@ionic/angular";

export function createActionSheetOptions(
    header: string,
    subHeader = undefined,
    cssClass = undefined,
    backdropDismiss = true,
    translucent = false,
    animated = true,
    keyboardClose = true
): ActionSheetOptions {
    return {
        header: bkTranslate(header),
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
 * 
 * @param name  [model.]action
 * @param imgixBaseUrl 
 * @param iconName 
 * @returns 
 */
export function createActionSheetButton(
    name: string,
    imgixBaseUrl: string,
    iconName?: string
): ActionSheetButton {
    return {
        text: bkTranslate(`@actionsheet.${name}`),
        icon: iconName ? getSvgIconUrl(imgixBaseUrl, iconName) : undefined,
        role: getRole(name),
        data: {
            action: name
        }
    };
}

function getRole(text: string): string | undefined {
    if (text.endsWith('delete')) return 'destructive';
    if (text.endsWith('cancel')) return 'cancel';
    return undefined;
}