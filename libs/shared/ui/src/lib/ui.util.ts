import { Browser } from "@capacitor/browser";
import { ModalController } from "@ionic/angular/standalone";
import { getDownloadURL, getMetadata, getStorage, ref, updateMetadata } from "firebase/storage";

import { Dimensions, ImageStyle, UserModel } from "@bk2/shared-models";
import { DateFormat, debugMessage, getTodayStr, warn } from "@bk2/shared-util-core";

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
export async function showZoomedImage(modalController: ModalController, url: string, title: string, style: ImageStyle, altText = '', cssClass = 'zoom-modal'): Promise<void> {
  const modal = await modalController.create({
    component: ImageViewModalComponent,
   // cssClass: cssClass,
    componentProps: {
      title,
      altText,
      url,
      style
    }
  });
  modal.present();
  await modal.onWillDismiss();
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
export async function selectDate(modalController: ModalController, isoDate?: string, headerTitle?: string, intro?: string): Promise<string | undefined> {
  const cssClass = (intro && intro?.length > 0) ? 'date-modal2' : 'date-modal';
  const modal = await modalController.create({
    component: DateSelectModalComponent,
    cssClass,
    componentProps: {
      isoDate,
      headerTitle,
      intro,
      locale: 'de-ch'
    }
  });
  modal.present();
  const { data, role } = await modal.onWillDismiss();
  if (role === 'confirm' && data) {
    if (typeof(data) === 'string') {
      return data;
    } else {
      warn('ui.util.selectDate: type of returned data is not string: ' + data);
    }
  }
  return undefined;
}

/**
 * Loads an image from storage path, calculates its dimensions (widht x height) and saves them back as metadata into storage.
 * @param path the relative path to the file in the firebase storage
 * @param currentUser the current user (used for logging)
 */
export async function updateImageDimensions(path: string, currentUser?: UserModel): Promise<Dimensions | undefined> {
  const imageRef = ref(getStorage(), path);
  const url = await getDownloadURL(imageRef);
  const dimensions = await calculateDimensions(url, currentUser);
  await updateImageDimensionsMetadata(path, dimensions, currentUser);
  return dimensions;
}

/**
 * Updates given dimensions (widht, height) as metadata to an image with a given path in firebase storage.
 * @param path the path of the image in firebase storage
 * @param dimensions the dimensions (width, height)
 * @param currentUser the current user (used for logging)
 */
export async function updateImageDimensionsMetadata(path: string, dimensions?: Dimensions, currentUser?: UserModel): Promise<void> {
  if (!dimensions) {
    warn('ui.util.updateImageDimensionsMetadata: image metadata not updated as there were no dimensions given.');
    return;
  }
  try {
    const imageRef = ref(getStorage(), path);
    await updateMetadata(imageRef, {
      customMetadata: {
        width: dimensions.width,
        height: dimensions.height
      }
    });
    debugMessage(`ui.util.updateImageDimensionsMetadata: dimensions ${dimensions.width}x${dimensions.height} on image ${path} updated successfully.`, currentUser);
  } catch (error) {
    console.warn(`ui.util.updateImageDimensionsMetadata: error updating image metadata: `, error);
  }
}

/**
 * Calculate the dimensions of an image with a given url
 * @param url the url of the image
 * @param currentUser the current user (used for logging)
 * @returns the dimensions (width, height) or undefined if there was an error.
 */
export async function calculateDimensions(url: string, currentUser?: UserModel): Promise<Dimensions | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;

    img.onload = () => {
      const dims = { width: img.width + '', height: img.height + '' };
      debugMessage(`ui.util.calculateDimensions: image dimensions: width=${dims.width}, height=${dims.height}`, currentUser);
      resolve(dims);
    };

    img.onerror = (err) => {
      warn(`ui.util.calculateDimensions: error resolving dimensions: ${err}`);
      resolve(undefined);
    };
  });
}

/**
 * Retrieves the dimensions of an image on a given path in firebase storage.
 * @param path the relative path to the image in firebase storage
 * @returns the dimensions of the image (width, height in pixels)
 */
export async function getImageDimensionsFromMetadata(path: string): Promise<Dimensions | undefined> {
  let dimensions: Dimensions | undefined = undefined;
  const imageRef = ref(getStorage(), path);
  const metadata = await getMetadata(imageRef);
  if (metadata.customMetadata?.width && metadata.customMetadata?.height) {
    dimensions = {
      width: metadata.customMetadata?.width,
      height: metadata.customMetadata?.height
    };
  }
  return dimensions;
}