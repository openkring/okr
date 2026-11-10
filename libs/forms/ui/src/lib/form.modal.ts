import { Component, computed, effect, inject, input, signal, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, IonButton, IonButtons, IonContent, IonIcon, IonNote, ModalController } from '@ionic/angular';
import { from, of } from 'rxjs';

import { CategoryListModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, Spinner } from '@okr/shared-ui';
import { fill, resolveImplicitValues } from '@okr/shared-util-core';

import { FormCategoryService, FormSubmitService, isCourseUnavailableError, isFormClosedError, PublicFormDefinition } from '@okr/forms-data-access';
import { FORM_I18N_KEYS, FormI18n, hasVisibilityRules } from '@okr/forms-util';
import { FieldCourseI18n, FieldOtherI18n, FieldPickI18n } from './field-renderer';
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
 * There is no page link here, so nothing is pre-filled and implicit fields take their defaults; a
 * modal has no section either, so the form-wide acceptance rules apply (no `sectionId`). After a
 * submit the thank-you text stays on screen until the filler closes the modal.
 *
 * `pageLoadedAt` is stamped when the modal is constructed. The server's timing heuristic only
 * flags submissions that are too FAST, and a modal submit is merely later than an inline one,
 * so there is no regression.
 */
@Component({
  selector: 'okr-form-modal',
  standalone: true,
  imports: [Header, Spinner, FormRenderer, SvgIconPipe, IonButton, IonButtons, IonContent, IonIcon, IonNote],
  styles: [`
    ion-note { display: block; padding: 16px; }
    /* author-written texts (thank-you, closed) keep their line breaks; interpolated, never innerHTML */
    .pre-line { white-space: pre-line; }
    ion-note.remaining { padding-bottom: 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true">
      @if (helpAvailable()) {
        <!-- the filler's (i), left of the close button -->
        <ion-buttons okrHeaderEnd slot="end">
          <ion-button (click)="onHelp()" [title]="formI18n.help_open()" [attr.aria-label]="formI18n.help_open()">
            <ion-icon slot="icon-only" src="{{ 'information-circle' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      }
    </okr-header>
    <ion-content>
      @if (definitionResource.isLoading()) {
        <okr-spinner />
      } @else if (submitted()) {
        <ion-note color="success" class="pre-line">{{ confirmationText() }}</ion-note>
      } @else if (errorMsg()) {
        <ion-note color="danger">{{ errorMsg() }}</ion-note>
      } @else if (definition(); as def) {
        @if (def.isArchived) {
          <ion-note color="warning">{{ i18n().form_archived() }}</ion-note>
        } @else if (isClosed()) {
          <!-- closed, past its date or full (spec §11): the text instead of the fields -->
          <ion-note color="warning" class="pre-line">{{ closedText() }}</ion-note>
        } @else {
          @if (remainingText()) {
            <ion-note color="primary" class="remaining">{{ remainingText() }}</ion-note>
          }
          @if (courseNotice()) {
            <ion-note color="warning" class="pre-line">{{ formI18n.field_course_unavailable() }}</ion-note>
          }
          <okr-form-renderer
            [definition]="def"
            [submitLabel]="i18n().form_submit()"
            [submitting]="submitting()"
            [jsToken]="jsToken()"
            [categories]="categoriesResource.value() ?? []"
            [implicitValues]="implicitValues()"
            [otherI18n]="otherI18n()"
            [courseAudience]="def.courseAudience"
            [courses]="def.courses ?? []"
            [courseI18n]="courseI18n()"
            [choices]="def.choices ?? {}"
            [pickI18n]="pickI18n()"
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
  private readonly formCategoryService = inject(FormCategoryService);
  /** the forms keys, for the (i) help — `i18n` below only carries the submit-path strings */
  protected readonly formI18n = inject(I18nService).translateAll(FORM_I18N_KEYS) as FormI18n;

  // inputs — set as componentProps by whatever opens the modal
  public readonly formKey = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly title = input('');
  public readonly i18n = input.required<FormModalI18n>();
  /** the category lists the caller already has (signed-in AppStore); missing ones are fetched */
  public readonly categories = input<CategoryListModel[]>([]);
  /** whether file uploads are encrypted at rest; a button config has no section to read it from */
  public readonly encryptFileUpload = input(false);
  public readonly showCaptcha = input(false);

  private readonly pageLoadedAt = new Date().toISOString();

  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal('');
  protected readonly jsToken = signal('');
  /** the thank-you text `submitForm` returned; '' = the default text */
  protected readonly confirmation = signal('');
  /** `submitForm` refused because the form closed or filled up after the modal opened */
  protected readonly closedByServer = signal(false);
  /** `submitForm` refused the course choice (taken, ended or no longer fitting): the list was reloaded */
  protected readonly courseNotice = signal(false);
  /** the definition re-fetched after a course refusal (fresh course list); the answers stay in the renderer */
  private readonly refreshed = signal<PublicFormDefinition | undefined>(undefined);

  protected readonly definitionResource = rxResource({
    params: () => ({ formKey: this.formKey(), tenantId: this.tenantId() }),
    stream: ({ params }: { params: { formKey: string; tenantId: string } }) =>
      params.formKey ? from(this.formSubmitService.fetchDefinition(params.formKey, params.tenantId)) : of(undefined),
  });

  protected readonly definition = computed<PublicFormDefinition | undefined>(() => {
    const refreshed = this.refreshed();
    if (refreshed) return refreshed;
    const val = this.definitionResource.value();
    return Array.isArray(val) ? val[0] : val;
  });

  /** no page link and no section: the implicit fields' own defaults */
  protected readonly implicitValues = computed(() => resolveImplicitValues(this.definition()?.fields ?? [], undefined, {}));

  /** absent from old functions: then the form counts as open and unlimited */
  private readonly availability = computed(() => this.definition()?.availability);

  protected readonly isClosed = computed(() => this.closedByServer() || this.availability()?.isOpen === false);

  /** the author's closed text, else the default */
  protected readonly closedText = computed(() => {
    const message = this.availability()?.closedMessage ?? '';
    return message.trim() ? message : this.formI18n.closed_default();
  });

  /** «Noch 3 Plätze frei» above the form, when the author switched it on and places are counted */
  protected readonly remainingText = computed(() => {
    const availability = this.availability();
    if (!availability?.isOpen || !availability.showRemaining || typeof availability.remaining !== 'number') return '';
    return availability.remaining === 1
      ? this.formI18n.remaining_one()
      : fill(this.formI18n.remaining(), { count: availability.remaining });
  });

  protected readonly confirmationText = computed(() => this.confirmation() || this.i18n().form_submit_conf());

  protected readonly otherI18n = computed<FieldOtherI18n>(() => ({
    option: this.formI18n.field_other_option(),
    placeholder: this.formI18n.field_other_placeholder(),
  }));

  protected readonly pickI18n = computed<FieldPickI18n>(() => ({ none: this.formI18n.field_pick_none() }));

  protected readonly courseI18n = computed<FieldCourseI18n>(() => ({
    hint: this.formI18n.field_course_hint(),
    places: this.formI18n.field_course_places(),
    placesOne: this.formI18n.field_course_places_one(),
    full: this.formI18n.field_course_full(),
  }));

  /** the lists of the form's category fields — fetched for anonymous visitors, who have no AppStore categories */
  protected readonly categoriesResource = rxResource({
    params: () => ({ def: this.definition(), tenantId: this.tenantId(), known: this.categories() }),
    stream: ({ params }) => from(this.formCategoryService.fetchCategories(params.def, params.tenantId, params.known)),
  });

  constructor() {
    effect(async () => {
      const def = this.definition();
      if (def?.formKey) this.jsToken.set(await this.formSubmitService.fetchJsToken(def.formKey));
    });
  }

  /** the (i) is offered once there is a live form to explain, not for a missing, archived or closed one */
  protected readonly helpAvailable = computed(() => {
    const def = this.definition();
    return !!def && !def.isArchived && !this.isClosed() && !this.submitted();
  });

  /** the (i) in the header — help for the person filling in the form; no sign-in needed */
  protected async onHelp(): Promise<void> {
    const def = this.definition();
    if (!def) return;
    const { FormFillerHelpModal } = await import('./form-filler-help.modal');
    const modal = await this.modalController.create({
      component: FormFillerHelpModal,
      componentProps: {
        i18n: this.formI18n,
        hasRules: hasVisibilityRules(def.fields),
        fillerHelpText: def.fillerHelpText ?? '',
        wasPrefilled: false,
        hasLimit: def.availability?.hasLimit === true,
        sendsMail: def.sendFillerConfirmation === true,
      },
    });
    await modal.present();
  }

  protected async onSubmit(values: Record<string, unknown>): Promise<void> {
    const def = this.definition();
    if (!def) return;
    this.submitting.set(true);
    this.errorMsg.set('');
    this.courseNotice.set(false);
    try {
      const processedValues = await this.formSubmitService.uploadFiles(values, def, {
        encryptFileUpload: this.encryptFileUpload(),
        askPassword: () => this.promptEncryptionPassword(),
      });
      const { confirmation } = await this.formSubmitService.submit({
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
      this.confirmation.set(typeof confirmation === 'string' ? confirmation : '');
      this.submitted.set(true);
      // Leave the thank-you text on screen; the header's close button dismisses. No caller reads
      // a result: the consequence of a submit is the WRITE's own workflow event (§6b).
    } catch (err) {
      // closed or full since the modal opened: the closed text; anything else: the generic error
      if (isFormClosedError(err)) this.closedByServer.set(true);
      else if (isCourseUnavailableError(err)) await this.onCourseUnavailable(def);
      else this.errorMsg.set(this.i18n().form_submit_error());
    } finally {
      this.submitting.set(false);
    }
  }

  /** the course was taken, ended or no longer fits: reload the list without losing the answers, say so */
  private async onCourseUnavailable(def: PublicFormDefinition): Promise<void> {
    try {
      const fresh = await this.formSubmitService.fetchDefinition(def.formKey, this.tenantId());
      const next = Array.isArray(fresh) ? fresh[0] : fresh;
      if (next) this.refreshed.set(next);
    } catch {
      // the list could not be reloaded: the notice still tells the filler to choose again
    }
    this.courseNotice.set(true);
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
