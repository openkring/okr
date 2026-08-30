import { Component, computed, effect, inject, input, signal, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, IonContent, IonNote, ModalController } from '@ionic/angular/standalone';
import { from, of } from 'rxjs';

import { Header, Spinner } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { FormSubmitService } from '@okr/forms-data-access';
import { FormRenderer } from './form-renderer';

/** The strings the modal needs. `SectionI18n` is a superset, so a section store's resolved
 *  i18n object can be handed straight in — structural typing, no new key set to maintain. */
export interface FormModalI18n {
  form_submit: Signal<string>;
  form_submit_conf: Signal<string>;
  form_submit_error: Signal<string>;
  form_not_found: Signal<string>;
  form_archived: Signal<string>;
  form_encryption_header: Signal<string>;
  form_encryption_message: Signal<string>;
  form_encryption_placeholder: Signal<string>;
  cancel: Signal<string>;
  ok: Signal<string>;
}

/**
 * A form-builder definition in a modal — what a CMS button with a `form:<formKey>` config
 * opens (spec 2026-08-29-generic-workflow-triggers §6a).
 *
 * This is what makes ANY builder form attachable to ANY button with no code at all, which is
 * the largest single piece of user-visible value in that spec.
 *
 * Two deliberate departures from the edit-modal skeleton in the `building-forms` skill, both
 * of which that skill spells out for form-builder forms:
 *  - `FormRenderer` keeps its OWN submit button and owns its submission, so there is no
 *    `okr-change-confirmation` here. The no-submit-button rule governs EDIT forms, whose
 *    parent modal drives the save; a public submission form is not one.
 *  - There is no model in and no model out: the modal dismisses with the submission id, and
 *    the consequence of the submit is the WRITE's own workflow event (§6b), never a client
 *    claim that something was submitted.
 *
 * The submit path itself is `FormSubmitService` — the same gateway the inline form section
 * uses, so the honeypot, the timing heuristic, the JS token, the rate limit and the optional
 * captcha are identical on both hosts (decision O5).
 *
 * `pageLoadedAt` is stamped when the modal is constructed. The server's timing heuristic only
 * flags submissions that are too FAST, and a modal submit is merely later than an inline one,
 * so there is no regression.
 */
@Component({
  selector: 'okr-form-modal',
  standalone: true,
  imports: [Header, Spinner, FormRenderer, IonContent, IonNote],
  styles: [`ion-note { display: block; padding: 16px; }`],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content>
      @if (definitionResource.isLoading()) {
        <okr-spinner />
      } @else if (submitted()) {
        <ion-note color="success">{{ i18n().form_submit_conf() }}</ion-note>
      } @else if (errorMsg()) {
        <ion-note color="danger">{{ errorMsg() }}</ion-note>
      } @else if (definition(); as def) {
        @if (def.isArchived) {
          <ion-note color="warning">{{ i18n().form_archived() }}</ion-note>
        } @else {
          <okr-form-renderer
            [definition]="def"
            [submitLabel]="i18n().form_submit()"
            [submitting]="submitting()"
            [jsToken]="jsToken()"
            (submitted)="onSubmit($event)"
          />
        }
      } @else {
        <ion-note color="medium">{{ i18n().form_not_found() }}</ion-note>
      }
    </ion-content>
  `,
})
export class FormModal {
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly formSubmitService = inject(FormSubmitService);

  // inputs — set as componentProps by whatever opens the modal
  public readonly formKey = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly title = input('');
  public readonly i18n = input.required<FormModalI18n>();
  /** whether file uploads are encrypted at rest; a button config has no section to read it from */
  public readonly encryptFileUpload = input(false);
  public readonly showCaptcha = input(false);

  private readonly pageLoadedAt = new Date().toISOString();

  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal('');
  protected readonly jsToken = signal('');

  protected readonly definitionResource = rxResource({
    params: () => ({ formKey: this.formKey(), tenantId: this.tenantId() }),
    stream: ({ params }: { params: { formKey: string; tenantId: string } }) =>
      params.formKey ? from(this.formSubmitService.fetchDefinition(params.formKey, params.tenantId)) : of(undefined),
  });

  protected readonly definition = computed(() => {
    const val = this.definitionResource.value();
    return Array.isArray(val) ? val[0] : val;
  });

  constructor() {
    effect(async () => {
      const def = this.definition();
      if (def?.formKey) this.jsToken.set(await this.formSubmitService.fetchJsToken(def.formKey));
    });
  }

  protected async onSubmit(values: Record<string, unknown>): Promise<void> {
    const def = this.definition();
    if (!def) return;
    this.submitting.set(true);
    this.errorMsg.set('');
    try {
      const processedValues = await this.formSubmitService.uploadFiles(values, def, {
        encryptFileUpload: this.encryptFileUpload(),
        askPassword: () => this.promptEncryptionPassword(),
      });
      const { submissionId } = await this.formSubmitService.submit({
        formKey: def.formKey,
        // A modal has no section document, so the section-configured side effects (tasks,
        // mail) are skipped server-side — `submitForm` guards them on a non-empty ref. The
        // workflow rule is the modal's equivalent, and it fires from the write.
        sectionConfigRef: '',
        tenantId: this.tenantId(),
        values: processedValues,
        pageLoadedAt: this.pageLoadedAt,
        honeypotKey: def.honeypotKey || 'website',
        showCaptcha: this.showCaptcha(),
      });
      this.submitted.set(true);
      // Leave the confirmation on screen; the header's close button dismisses. The id travels
      // so a caller can link to what was written, not so it can claim a submit happened.
      await dismissOverlay(this.modalController, { submissionId }, 'confirm');
    } catch {
      this.errorMsg.set(this.i18n().form_submit_error());
    } finally {
      this.submitting.set(false);
    }
  }

  private async promptEncryptionPassword(): Promise<string> {
    return new Promise(resolve => {
      this.alertController.create({
        header: this.i18n().form_encryption_header(),
        message: this.i18n().form_encryption_message(),
        inputs: [{ name: 'password', type: 'password', placeholder: this.i18n().form_encryption_placeholder() }],
        buttons: [
          { text: this.i18n().cancel(), role: 'cancel', handler: () => resolve('') },
          { text: this.i18n().ok(), handler: (data: { password: string }) => resolve(data.password ?? '') },
        ],
      }).then(alert => alert.present());
    });
  }
}
