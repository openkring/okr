// libs/social/news-center/ui/src/lib/news-channel-edit.modal.ts
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { NewsChannelModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { NewsCenterI18n, NewsChannelFormData } from '@okr/social-news-center-util';

import { NewsChannelForm } from './news-channel.form';

/** A position picked by the curator or geocoded from an org. */
export interface NewsPosition {
  latitude: number;
  longitude: number;
}

/**
 * Curator edit of a webcam: name, position, host org (design 2026-11-09 §5.3). The pickers and the
 * geocoding are callbacks from `NewsCenterStore.editChannel` (the modal must not inject the store that
 * opens it). Linking an org or «Ort aus Organisation übernehmen» fills the position; manual edits win.
 * Dismisses with the edited `NewsChannelFormData` and role 'confirm'.
 */
@Component({
  selector: 'okr-news-channel-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, NewsChannelForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().edit_channel() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-news-channel-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (pickLocation)="onPickLocation()"
          (clearLocation)="patch({ latitude: 0, longitude: 0 })"
          (pickOrg)="onPickOrg()"
          (clearOrg)="patch({ orgKey: '', orgName: '' })"
          (locationFromOrg)="onLocationFromOrg(formData.orgKey)"
        />
      }
    </ion-content>
  `,
})
export class NewsChannelEditModal {
  private readonly modalController = inject(ModalController);

  public readonly channel = input.required<NewsChannelModel>();
  public readonly orgName = input('');
  public readonly i18n = input.required<NewsCenterI18n>();
  public readonly pickLocation = input<() => Promise<NewsPosition | undefined>>();
  public readonly pickOrg = input<() => Promise<{ orgKey: string; orgName: string } | undefined>>();
  public readonly geocodeOrg = input<(orgKey: string) => Promise<NewsPosition | undefined>>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = linkedSignal<NewsChannelFormData>(() => this.initial());
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const d = this.formData();
    await dismissOverlay(this.modalController, { ...d, name: d.name.trim() }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initial());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: NewsChannelFormData): void {
    this.formData.set(formData);
  }

  /** Any change made through a picker marks the form dirty, like a typed one. */
  protected patch(change: Partial<NewsChannelFormData>): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, ...change }));
  }

  protected async onPickLocation(): Promise<void> {
    const position = await this.pickLocation()?.();
    if (position) this.patch(position);
  }

  /** A newly linked org fills the position from its address; a failed geocode keeps the old one. */
  protected async onPickOrg(): Promise<void> {
    const org = await this.pickOrg()?.();
    if (!org) return;
    this.patch(org);
    await this.onLocationFromOrg(org.orgKey);
  }

  protected async onLocationFromOrg(orgKey: string): Promise<void> {
    if (!orgKey) return;
    const position = await this.geocodeOrg()?.(orgKey);
    if (position) this.patch(position);
  }

  private initial(): NewsChannelFormData {
    const c = this.channel();
    return {
      name: c.name ?? '',
      latitude: Number.isFinite(c.latitude) ? c.latitude : 0,
      longitude: Number.isFinite(c.longitude) ? c.longitude : 0,
      orgKey: c.orgKey ?? '',
      orgName: this.orgName(),
    };
  }
}
