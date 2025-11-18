import { ActionSheetButton, ActionSheetOptions } from "@ionic/angular";
import { getSvgIconUrl } from "@bk2/shared-pipes";
import { bkTranslate } from "@bk2/shared-i18n";

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
 * @param name  cancel, call, copy, delete, edit, send, show, upload, view
 * @param imgixBaseUrl 
 * @param iconName 
 * @returns 
 */
export function createActionSheetButton(
    name: string,
    imgixBaseUrl: string,
    iconName?: string,
    prefix?: string
): ActionSheetButton {
    const nameLC = name.toLowerCase();
    const nameT = bkTranslate(`@actionsheet.${nameLC}`);
    const text = prefix ? prefix + ' ' + nameT.toLowerCase() : nameT;
    return {
        text: text,
        icon: iconName ? getSvgIconUrl(imgixBaseUrl, iconName) : undefined,
        role: getRole(nameLC),
        data: {
            action: nameLC
        }
    };
}

function getRole(text: string): string | undefined {
    if (text === 'delete') return 'destructive';
    if (text === 'cancel') return 'cancel';
    return undefined;
}