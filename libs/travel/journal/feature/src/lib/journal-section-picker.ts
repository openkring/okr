import { computed, inject, Injector, runInInjectionContext } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

import { SECTION_IMAGE_PICKER, SectionImagePicker } from '@okr/cms-section-util';
import { IMAGE_CONFIG_SHAPE, ImageConfig } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';
import { JournalPhotoPickModal, PickablePhoto } from '@okr/travel-journal-ui';
import { ImageView, MAX_VIDEOS_PER_BLOCK } from '@okr/travel-journal-util';

import { JournalFileUrlService } from './journal-file-url.service';
import { JournalWebPhotos } from './journal-web-photos.service';
import { JournalWebVideos } from './journal-web-videos.service';
import { showJournalError } from './journal-errors';
import { JournalStore } from './journal.store';

/**
 * The travel journal's `SECTION_IMAGE_PICKER` (spec 1.154 §2 «Photo picker»): the section editor picks from the
 * journal's own photos (`image`) or clips (`video`) — local files on the iPad, signed links in the browser — or
 * imports new ones through the journal's import (Photos library on the iPad, file dialog and upload in the browser).
 * A picked image is a reference: `label` = journal image key, `url` '' (a resolved url is bound to one device or
 * expires), `altText` a readable name so the editor's list never shows the key. Nothing here reads Firestore.
 */
export class JournalSectionPicker implements SectionImagePicker {
  private readonly store = inject(JournalStore);
  private readonly fileUrl = inject(JournalFileUrlService);
  private readonly webPhotos = inject(JournalWebPhotos);
  private readonly webVideos = inject(JournalWebVideos);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);

  private readonly images = computed(() => this.store.images(this.journalKey));

  public constructor(private readonly journalKey: string, private readonly footprintKey: string) {}

  public async pick(kind: 'image' | 'video', multiple: boolean): Promise<ImageConfig[]> {
    const i18n = this.store.i18n;
    const photos: PickablePhoto[] = [...this.images().values()]
      .filter((image) => (kind === 'video') === (image.videoPath !== undefined))
      .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? '')) // newest first
      .map((image) => ({ key: image.key, label: this.nameOf(image) }));
    const modal = await this.modalController.create({
      component: JournalPhotoPickModal,
      componentProps: {
        photos,
        multiple,
        i18n: {
          title: kind === 'video' ? i18n.picker_videos() : i18n.picker_photos(),
          newItems: kind === 'video' ? i18n.picker_new_videos() : i18n.picker_new_photos(),
          empty: kind === 'video' ? i18n.picker_empty_videos() : i18n.picker_empty_photos(),
        },
        thumbnailUrl: (key: string) => this.fileUrl.url(this.images().get(key)?.path400),
        importItems: () => this.importItems(kind),
        progress: () => this.progress(),
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string[]>();
    if (role !== 'confirm' || !data) return [];
    // read again: an import adds image records while the modal is open
    return data.map((key) => this.referenceOf(key, kind));
  }

  public thumbnailUrl(image: ImageConfig): string {
    return this.fileUrl.url(this.images().get(image.label)?.path400);
  }

  /** The stored reference of a journal image (see the class comment). */
  private referenceOf(key: string, kind: 'image' | 'video'): ImageConfig {
    const image = this.images().get(key);
    return { ...IMAGE_CONFIG_SHAPE, label: key, url: '', altText: image ? this.nameOf(image) : this.kindName(kind) };
  }

  private kindName(kind: 'image' | 'video'): string {
    return kind === 'video' ? this.store.i18n.picker_video() : this.store.i18n.picker_photo();
  }

  /** «Foto vom 14.01.2027 09:12», or just «Foto» without a capture time. */
  private nameOf(image: ImageView): string {
    const kind = image.videoPath !== undefined ? 'video' : 'image';
    const takenAt = image.takenAt ?? '';
    const date = convertDateFormatToString(takenAt, DateFormat.IsoDateTime, DateFormat.ViewDate, false);
    const time = convertDateFormatToString(takenAt, DateFormat.IsoDateTime, DateFormat.Time, false);
    if (!date) return this.kindName(kind);
    const text = kind === 'video' ? this.store.i18n.picker_video_alt() : this.store.i18n.picker_photo_alt();
    return fill(text, { date: time ? `${date} ${time}` : date });
  }

  /** The import's progress for the picker: video conversion, then the browser upload count. */
  private progress(): string {
    const i18n = this.store.i18n;
    if (this.store.videoPreparing()) return i18n.video_preparing();
    const upload = this.store.webUpload();
    return upload ? fill(i18n.photos_uploading(), { done: upload.done, total: upload.total }) : '';
  }

  /**
   * Called inside the user's tap: the browser's file dialog must open NOW (WebKit ignores one opened later). Native,
   * offline or without an author no dialog opens here: the store opens the Photos library itself or refuses with its
   * own message. Resolves to the new image keys; failures are shown and resolve to [].
   */
  private importItems(kind: 'image' | 'video'): Promise<string[]> {
    const canPickHere = !this.store.native() && navigator.onLine && !!this.store.author();
    const files = canPickHere ? (kind === 'video' ? this.webVideos : this.webPhotos).pickFiles() : undefined;
    return this.importNow(kind, files);
  }

  private async importNow(kind: 'image' | 'video', files: Promise<File[]> | undefined): Promise<string[]> {
    try {
      const picked = files ? await files : undefined;
      if (picked?.length === 0) return [];
      const { imageKeys, skipped, slow } = await this.store.importImages(this.footprintKey, kind, picked);
      // the browser dialog cannot cap the count: clips beyond the limit are not imported (the Photos picker caps it itself)
      const limited = kind === 'video' && (picked?.length ?? 0) > MAX_VIDEOS_PER_BLOCK;
      await this.toastSkipped(skipped.map((s) => ('reason' in s ? String(s.reason) : '')), slow, limited);
      return imageKeys;
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
      return [];
    }
  }

  /** The clip limit, skipped files (one line per reason: too long, too large, anything else counted), and the slow-write note. */
  private async toastSkipped(reasons: string[], slow: boolean, limited = false): Promise<void> {
    const i18n = this.store.i18n;
    const parts: string[] = [];
    if (limited) parts.push(i18n.video_limit());
    if (reasons.includes('tooLong')) parts.push(i18n.video_skipped_too_long());
    if (reasons.includes('tooLarge')) parts.push(i18n.video_skipped_too_large());
    const other = reasons.filter((r) => r !== 'tooLong' && r !== 'tooLarge').length;
    if (other > 0) parts.push(fill(i18n.photos_skipped(), { count: other }));
    if (slow) parts.push(i18n.write_slow());
    if (parts.length === 0) return;
    const toast = await this.toastController.create({ message: parts.join(' · '), duration: 4000, position: 'bottom' });
    await toast.present();
  }
}

/**
 * An injector that provides the journal's picker to the section editor. `ModalController.create({ injector })` takes
 * it, so `okr-images-config` inside the modal finds SECTION_IMAGE_PICKER (it injects it optionally; without it, and
 * with `requirePicker`, the editor would offer no «add» at all).
 */
export function journalSectionPickerInjector(parent: Injector, journalKey: string, footprintKey: string): Injector {
  const picker = runInInjectionContext(parent, () => new JournalSectionPicker(journalKey, footprintKey));
  return Injector.create({ providers: [{ provide: SECTION_IMAGE_PICKER, useValue: picker }], parent });
}
