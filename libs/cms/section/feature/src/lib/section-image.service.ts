import { inject, Injectable } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular/standalone';

import { ImageConfig, ImageType, SectionModel, UserModel } from '@bk2/shared-models';
import { IMAGE_MIMETYPES } from '@bk2/shared-constants';
import { confirm, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { UploadService } from '@bk2/avatar-data-access';
import { applyImagesToSlot, getSectionImageSlots, ImageSlot, isSlotOccupied } from '@bk2/cms-section-util';

export interface SectionImageUploadLabels {
  slotLogo: string;
  slotHero: string;
  overwriteTitle: string;
  overwriteMessage: string;
  ok: string;
  cancel: string;
  uploadTitle: string;
  actionSheetTitle: string;
}

/**
 * Orchestrates image uploads for the section-list quick action:
 * pick a slot (for multi-slot sections there is exactly one), confirm overwrite for an occupied
 * single slot, upload the file(s), create the backing document(s), and return the updated section.
 * Returns undefined when the user cancels at any step (caller then persists nothing).
 */
@Injectable({ providedIn: 'root' })
export class SectionImageService {
  private readonly uploadService = inject(UploadService);
  private readonly alertController = inject(AlertController);
  private readonly actionSheetController = inject(ActionSheetController);

  public async uploadToSection(
    section: SectionModel,
    tenantId: string,
    labels: SectionImageUploadLabels,
    currentUser?: UserModel,
  ): Promise<SectionModel | undefined> {
    const slots = getSectionImageSlots(section);
    if (slots.length === 0) return undefined;

    const slot = slots.length === 1 ? slots[0] : await this.chooseSlot(slots, labels);
    if (!slot) return undefined;

    if (!slot.multi && isSlotOccupied(section, slot)) {
      const ok = await confirm(this.alertController, labels.overwriteMessage, labels.ok, labels.cancel, true);
      if (ok !== true) return undefined;
    }

    const basePath = `tenant/${tenantId}/section/${section.bkey}`;
    const files = slot.multi
      ? await this.uploadService.pickMultipleFiles(IMAGE_MIMETYPES)
      : [await this.uploadService.pickFile(IMAGE_MIMETYPES)].filter((f): f is File => !!f);
    if (!files.length) return undefined;

    const uploads = files.map(f => ({ file: f, fullPath: `${basePath}/${f.name}` }));
    const urls = await this.uploadService.uploadFiles(uploads, labels.uploadTitle);
    if (!urls) return undefined;

    const newImages: ImageConfig[] = files.map(f => ({
      label: f.name.replace(/\.[^.]+$/, ''),
      type: ImageType.Image,
      url: `${basePath}/${f.name}`,
      actionUrl: '',
      altText: f.name.replace(/\.[^.]+$/, ''),
      overlay: '',
    }));

    await Promise.all(files.map((f, idx) => {
      const downloadUrl = urls[idx];
      if (!downloadUrl) return Promise.resolve(undefined);
      return this.uploadService.createAndSaveDocument(f, tenantId, `${basePath}/${f.name}`, downloadUrl, currentUser);
    }));

    return applyImagesToSlot(section, slot, newImages);
  }

  private async chooseSlot(slots: ImageSlot[], labels: SectionImageUploadLabels): Promise<ImageSlot | undefined> {
    const options = createActionSheetOptions(labels.actionSheetTitle);
    for (const slot of slots) {
      const label = slot.field === 'logo' ? labels.slotLogo : labels.slotHero;
      options.buttons.push(createActionSheetButton(`slot.${slot.field}`, label, ''));
    }
    options.buttons.push(createActionSheetButton('cancel', labels.cancel, ''));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action?.startsWith('slot.')) return undefined;
    const field = data.action.slice('slot.'.length);
    return slots.find(s => s.field === field);
  }
}
