import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { WebsiteNode } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { WEBSITE_I18N_KEYS, WebsiteI18n, WebsiteNodeFormModel } from '@okr/cms-website-util';

import { WebsiteNodeForm } from './website-node.form';

function toFormModel(node: WebsiteNode): WebsiteNodeFormModel {
  return {
    type: node.type,
    label: node.label ?? '',
    slug: node.slug ?? '',
    url: node.url ?? '',
    style: node.style ?? 'default',
  };
}

/**
 * Edits the label (all types), the slug (page) or url + style (link) of one website node.
 * Dismisses with the edited `WebsiteNodeFormModel` and role 'confirm'; the store applies it.
 */
@Component({
  selector: 'okr-website-node-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, WebsiteNodeForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-website-node-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [originalSlug]="isNew() ? '' : (node().slug ?? '')"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class WebsiteNodeEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the sitemap store opens this modal
  protected readonly i18n = inject(I18nService).translateAll(WEBSITE_I18N_KEYS) as WebsiteI18n;

  // inputs
  public readonly node = input.required<WebsiteNode>();
  public readonly isNew = input(false);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = linkedSignal(() => toFormModel(this.node()));
  protected showForm = signal(true);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());

  protected readonly headerTitle = computed(() => {
    const type = this.node().type;
    if (type === 'page') return this.i18n.edit_title_page();
    if (type === 'link') return this.isNew() ? this.i18n.new_title_link() : this.i18n.edit_title_link();
    return this.isNew() ? this.i18n.new_title_menu() : this.i18n.edit_title_menu();
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.discard(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const f = this.formData();
    const result: WebsiteNodeFormModel = { ...f, label: f.label.trim(), slug: f.slug.trim(), url: f.url.trim() };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  protected onFormDataChange(formData: WebsiteNodeFormModel): void {
    this.formData.set(formData);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(toFormModel(this.node()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}
