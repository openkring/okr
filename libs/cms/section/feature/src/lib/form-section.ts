import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withProps } from '@ngrx/signals';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonNote } from '@ionic/angular/standalone';
import { from, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { Spinner } from '@okr/shared-ui';
import { FormSection } from '@okr/shared-models';

import { FormSubmitService } from '@okr/forms-data-access';
import { FormRenderer } from '@okr/forms-ui';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';


// The submit path itself is NOT here any more: it lives in FormSubmitService
// (@okr/forms-data-access), shared with the FormModal a CMS button opens — spec
// 2026-08-29-generic-workflow-triggers §6a, decision O5. Two copies of the honeypot,
// timing and token handling would drift.
const FormSectionStore = signalStore(
  withProps(() => ({
    appStore: inject(AppStore),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS)
  }))
);

@Component({
  selector: 'okr-form-section',
  standalone: true,
  imports: [Spinner, FormRenderer, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonNote],
  providers: [FormSectionStore],
  template: `
    <ion-card>
      @if (section().title) {
        <ion-card-header>
          <ion-card-title>{{ section().title }}</ion-card-title>
        </ion-card-header>
      }
      <ion-card-content>
        @if (definitionResource.isLoading()) {
          <okr-spinner />
        } @else if (submitted()) {
          <ion-note color="success">{{ store.i18n.form_submit_conf() }}</ion-note>
        } @else if (errorMsg()) {
          <ion-note color="danger">{{ errorMsg() }}</ion-note>
        } @else if (definition(); as def) {
          @if (def.isArchived) {
            <ion-note color="warning">{{ store.i18n.form_archived() }}</ion-note>
          } @else {
            <okr-form-renderer
              [definition]="def"
              [submitLabel]="store.i18n.form_submit()"
              [submitting]="submitting()"
              [jsToken]="jsToken()"
              (submitted)="onSubmit($event)"
            />
          }
        } @else {
          <ion-note color="medium">{{ store.i18n.form_not_found() }}</ion-note>
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class FormSectionComponent {
  protected readonly store = inject(FormSectionStore);
  private readonly alertController = inject(AlertController);
  private readonly formSubmitService = inject(FormSubmitService);

  public readonly section = input.required<FormSection>();
  public readonly editMode = input(false);

  private readonly pageLoadedAt = new Date().toISOString();

  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal('');
  protected readonly jsToken = signal('');

  protected readonly definitionResource = rxResource({
    params: () => ({ formKey: this.section().properties?.formKey }),
    stream: ({ params }: { params: { formKey: string } }) =>
      params.formKey
        ? from(this.formSubmitService.fetchDefinition(params.formKey, this.store.appStore.tenantId()))
        : of(undefined),
  });

  protected readonly definition = computed(() => {
    const val = this.definitionResource.value();
    return Array.isArray(val) ? val[0] : val;
  });

  constructor() {
    // Fetch JS token whenever the form definition becomes available
    effect(async () => {
      const def = this.definition();
      if (def?.formKey) {
        const token = await this.formSubmitService.fetchJsToken(def.formKey);
        this.jsToken.set(token);
      }
    });
  }

  protected async onSubmit(values: Record<string, unknown>): Promise<void> {
    const def = this.definition();
    if (!def) return;
    this.submitting.set(true);
    this.errorMsg.set('');
    try {
      const processedValues = await this.formSubmitService.uploadFiles(values, def, {
        encryptFileUpload: this.section().properties?.encryptFileUpload ?? false,
        askPassword: () => this.promptEncryptionPassword(),
      });
      await this.formSubmitService.submit({
        formKey: def.formKey,
        sectionConfigRef: this.section().okey ?? '',
        tenantId: this.store.appStore.tenantId(),
        values: processedValues,
        pageLoadedAt: this.pageLoadedAt,
        honeypotKey: def.honeypotKey || 'website',
        showCaptcha: this.section().properties?.showCaptcha ?? false,
      });
      this.submitted.set(true);
    } catch {
      this.errorMsg.set(this.store.i18n.form_submit_error());
    } finally {
      this.submitting.set(false);
    }
  }

  private async promptEncryptionPassword(): Promise<string> {
    return new Promise(resolve => {
      this.alertController.create({
        header: this.store.i18n.form_encryption_header(),
        message: this.store.i18n.form_encryption_message(),
        inputs: [{ name: 'password', type: 'password', placeholder: this.store.i18n.form_encryption_placeholder() }],
        buttons: [
          { text: this.store.i18n.cancel(), role: 'cancel', handler: () => resolve('') },
          { text: this.store.i18n.ok(), handler: (data: { password: string }) => resolve(data.password ?? '') },
        ],
      }).then(alert => alert.present());
    });
  }
}
