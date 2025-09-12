import { Browser } from "@capacitor/browser";
import { ModalController } from "@ionic/angular/standalone";

import { Image, ImageAction } from "@bk2/shared-models";
import { DateFormat, getTodayStr, warn } from "@bk2/shared-util-core";

import { DateSelectModalComponent } from "./date-select.modal";
import { ImageViewModalComponent } from "./image-view.modal";

export interface ValidationInfo {
  type: string,
  message: string
};

export interface ValidationInfoDictionary {
  username: ValidationInfo[],
  mandatoryName: ValidationInfo[],
  name: ValidationInfo[],
  email: ValidationInfo[],
  phone: ValidationInfo[],
  password: ValidationInfo[],
  confirm_password: ValidationInfo[],
  matching_passwords: ValidationInfo[],
  terms: ValidationInfo[],
}

// show a zoomed version of the image in a modal
export async function showZoomedImage(modalController: ModalController, title: string, image: Image, cssClass = 'zoom-modal'): Promise<void> {
  if (image.imageAction !== ImageAction.Zoom) return;
  const _modal = await modalController.create({
    component: ImageViewModalComponent,
    cssClass: cssClass,
    componentProps: {
      title: title,
      image: image
    }
  });
  _modal.present();
  await _modal.onWillDismiss();
}

export async function browse(url?: string): Promise<void> {
  if (url) {
    await Browser.open({ url: url });
  }
}

/**
 * Show a modal with a calendar view to select a date.
 * @param modalController
 * @returns the selected date as a string in ISO format (yyyy-mm-dd)
 */
export async function selectDate(modalController: ModalController): Promise<string | undefined> {
  const _modal = await modalController.create({
    component: DateSelectModalComponent,
    cssClass: 'date-modal',
    componentProps: {
      isoDate: getTodayStr(DateFormat.IsoDate)
    }
  });
  _modal.present();
  const { data, role } = await _modal.onWillDismiss();
  if (role === 'confirm') {
    if (typeof(data) === 'string') {
      return data;
    } else {
      warn('ui.util.selectDate: type of returned data is not string: ' + data);
    }
  }
  return undefined;
}