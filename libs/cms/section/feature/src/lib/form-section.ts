import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { signalStore, withProps } from '@ngrx/signals';
import { AlertController, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonNote, ModalController } from '@ionic/angular';
import { from, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { FormSection } from '@okr/shared-models';
import { fill, parsePrefillParams, resolveImplicitValues } from '@okr/shared-util-core';

import { FormCategoryService, FormSubmitService, isCourseUnavailableError, isFormClosedError, PublicFormDefinition } from '@okr/forms-data-access';
import { FORM_I18N_KEYS, FormI18n, hasVisibilityRules } from '@okr/forms-util';
import { FieldCourseI18n, FieldOtherI18n, FormFillerHelpModal, FormRenderer } from '@okr/forms-ui';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';


// The submit path itself is NOT here any more: it lives in FormSubmitService
// (@okr/forms-data-access), shared with the FormModal a CMS button opens — spec
// 2026-08-29-generic-workflow-triggers §6a, decision O5. Two copies of the honeypot,
// timing and token handling would drift.
const FormSectionStore = signalStore(
  withProps(() => {
    const i18nService = inject(I18nService);
    return {
      appStore: inject(AppStore),
      i18n: i18nService.translateAll(SECTION_I18N_KEYS),
      /** the forms keys, for the filler's (i) help */
      formI18n: i18nService.translateAll(FORM_I18N_KEYS) as FormI18n,
    };
  })
);

@Component({
  selector: 'okr-form-section',
  standalone: true,
  imports: [Spinner, FormRenderer, SvgIconPipe, IonButton, IonButtons, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonIcon, IonNote],
  providers: [FormSectionStore],
  styles: [`
    .title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    /* author-written texts (thank-you, closed) keep their line breaks; interpolated, never innerHTML */
    .pre-line { display: block; white-space: pre-line; }
    .remaining { display: block; padding: 0 16px 8px; }
  `],
  template: `
    <ion-card>
      @if (section().title || helpAvailable()) {
        <ion-card-header class="title-row">
          <ion-card-title>{{ section().title }}</ion-card-title>
          @if (helpAvailable()) {
            <ion-buttons>
              <ion-button fill="clear" (click)="onHelp()" [attr.aria-label]="store.formI18n.help_open()" [title]="store.formI18n.help_open()">
                <ion-icon src="{{ 'information-circle' | svgIcon }}" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          }
        </ion-card-header>
      }
      <ion-card-content>
        @if (definitionResource.isLoading()) {
          <okr-spinner />
        } @else if (submitted()) {
          <ion-note color="success" class="pre-line">{{ confirmationText() }}</ion-note>
        } @else if (errorMsg()) {
          <ion-note color="danger">{{ errorMsg() }}</ion-note>
        } @else if (definition(); as def) {
          @if (def.isArchived) {
            <ion-note color="warning">{{ store.i18n.form_archived() }}</ion-note>
          } @else if (isClosed()) {
            <!-- closed, past its date or full (spec §11): the text instead of the fields -->
            <ion-note color="warning" class="pre-line">{{ closedText() }}</ion-note>
          } @else {
            @if (remainingText()) {
              <ion-note color="primary" class="remaining">{{ remainingText() }}</ion-note>
            }
            @if (courseNotice()) {
              <ion-note color="warning" class="pre-line">{{ store.formI18n.field_course_unavailable() }}</ion-note>
            }
            <okr-form-renderer
              [definition]="def"
              [submitLabel]="store.i18n.form_submit()"
              [submitting]="submitting()"
              [jsToken]="jsToken()"
              [categories]="categoriesResource.value() ?? []"
              [prefill]="prefill().values"
              [lockedKeys]="prefill().keys"
              [implicitValues]="implicitValues()"
              [otherI18n]="otherI18n()"
              [courseAudience]="def.courseAudience"
              [courses]="def.courses ?? []"
              [courseI18n]="courseI18n()"
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
  private readonly modalController = inject(ModalController);
  private readonly formSubmitService = inject(FormSubmitService);
  private readonly formCategoryService = inject(FormCategoryService);
  private readonly route = inject(ActivatedRoute, { optional: true });

  public readonly section = input.required<FormSection>();
  public readonly editMode = input(false);

  private readonly pageLoadedAt = new Date().toISOString();

  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal('');
  protected readonly jsToken = signal('');
  /** the thank-you text `submitForm` returned; '' = the default text */
  protected readonly confirmation = signal('');
  /** `submitForm` refused because the form closed or filled up after the page loaded */
  protected readonly closedByServer = signal(false);

  /**
   * The page link's query parameters, read ONCE (spec §8). Never written back to the URL and never
   * logged — a link may carry a name or a date of birth.
   */
  private readonly queryParams = this.readQueryParams();

  protected readonly definitionResource = rxResource({
    // the section id lets the server apply this page's own acceptance rules (spec §11, «Per section»)
    params: () => ({ formKey: this.section().properties?.formKey, sectionId: this.section().okey ?? '' }),
    stream: ({ params }: { params: { formKey: string; sectionId: string } }) =>
      params.formKey
        ? from(this.formSubmitService.fetchDefinition(params.formKey, this.store.appStore.tenantId(), params.sectionId || undefined))
        : of(undefined),
  });

  /** a definition fetched after a refused course choice: replaces the resource's, so the renderer (and its answers) stays */
  private readonly refreshed = signal<PublicFormDefinition | undefined>(undefined);
  /** `submitForm` refused the chosen course: the list was reloaded, the answers are kept */
  protected readonly courseNotice = signal(false);

  protected readonly definition = computed<PublicFormDefinition | undefined>(() => {
    const refreshed = this.refreshed();
    if (refreshed) return refreshed;
    const val = this.definitionResource.value();
    return Array.isArray(val) ? val[0] : val;
  });

  /** answers from the link — invalid, unknown and excluded parameters are already dropped (`parsePrefillParams`) */
  protected readonly prefill = computed(() => {
    const def = this.definition();
    return def ? parsePrefillParams(def.fields ?? [], this.queryParams) : { values: {}, keys: [] as string[] };
  });

  /** the implicit fields' values: this section's, then the link's (only `fromLink`), then the default */
  protected readonly implicitValues = computed(() => {
    const def = this.definition();
    return def ? resolveImplicitValues(def.fields ?? [], this.section().properties?.implicitValues, this.prefill().values) : {};
  });

  /** a visible answer came from the link — an implicit value is never shown, so it does not count */
  private readonly wasPrefilled = computed(() => {
    const implicitKeys = new Set((this.definition()?.fields ?? []).filter(f => f.type === 'implicit').map(f => f.key));
    return this.prefill().keys.some(key => !implicitKeys.has(key));
  });

  /** absent from old functions: then the form counts as open and unlimited */
  private readonly availability = computed(() => this.definition()?.availability);

  protected readonly isClosed = computed(() => this.closedByServer() || this.availability()?.isOpen === false);

  /** the author's closed text (the section's or the form's, picked by the server), else the default */
  protected readonly closedText = computed(() => {
    const message = this.availability()?.closedMessage ?? '';
    return message.trim() ? message : this.store.formI18n.closed_default();
  });

  /** «Noch 3 Plätze frei» above the form, when the author switched it on and places are counted */
  protected readonly remainingText = computed(() => {
    const availability = this.availability();
    if (!availability?.isOpen || !availability.showRemaining || typeof availability.remaining !== 'number') return '';
    return availability.remaining === 1
      ? this.store.formI18n.remaining_one()
      : fill(this.store.formI18n.remaining(), { count: availability.remaining });
  });

  protected readonly confirmationText = computed(() => this.confirmation() || this.store.i18n.form_submit_conf());

  protected readonly otherI18n = computed<FieldOtherI18n>(() => ({
    option: this.store.formI18n.field_other_option(),
    placeholder: this.store.formI18n.field_other_placeholder(),
  }));

  protected readonly courseI18n = computed<FieldCourseI18n>(() => ({
    hint: this.store.formI18n.field_course_hint(),
    places: this.store.formI18n.field_course_places(),
    placesOne: this.store.formI18n.field_course_places_one(),
    full: this.store.formI18n.field_course_full(),
  }));

  /** the lists of the form's category fields — fetched for anonymous visitors, who have no AppStore categories */
  protected readonly categoriesResource = rxResource({
    params: () => ({ def: this.definition(), known: this.store.appStore.allCategories() }),
    stream: ({ params }) =>
      from(this.formCategoryService.fetchCategories(params.def, this.store.appStore.tenantId(), params.known)),
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

  /** the (i) is offered once there is a live form to explain, not for a missing, archived or closed one */
  protected readonly helpAvailable = computed(() => {
    const def = this.definition();
    return !!def && !def.isArchived && !this.isClosed() && !this.submitted();
  });

  /** the (i) next to the title — help for the person filling in the form; no sign-in needed */
  protected async onHelp(): Promise<void> {
    const def = this.definition();
    if (!def) return;
    const modal = await this.modalController.create({
      component: FormFillerHelpModal,
      componentProps: {
        i18n: this.store.formI18n,
        hasRules: hasVisibilityRules(def.fields),
        fillerHelpText: def.fillerHelpText ?? '',
        wasPrefilled: this.wasPrefilled(),
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
        encryptFileUpload: this.section().properties?.encryptFileUpload ?? false,
        askPassword: () => this.promptEncryptionPassword(),
      });
      const { confirmation } = await this.formSubmitService.submit({
        formKey: def.formKey,
        sectionConfigRef: this.section().okey ?? '',
        tenantId: this.store.appStore.tenantId(),
        values: processedValues,
        pageLoadedAt: this.pageLoadedAt,
        honeypotKey: def.honeypotKey || 'website',
        showCaptcha: this.section().properties?.showCaptcha ?? false,
      });
      this.confirmation.set(typeof confirmation === 'string' ? confirmation : '');
      this.submitted.set(true);
    } catch (err) {
      // closed or full since the page loaded: the closed text; anything else: the generic error
      if (isFormClosedError(err)) this.closedByServer.set(true);
      else if (isCourseUnavailableError(err)) await this.onCourseUnavailable(def);
      else this.errorMsg.set(this.store.i18n.form_submit_error());
    } finally {
      this.submitting.set(false);
    }
  }

  /** the course was taken, ended or no longer fits: reload the list without losing the answers, say so */
  private async onCourseUnavailable(def: PublicFormDefinition): Promise<void> {
    const fresh = await this.formSubmitService.fetchDefinition(def.formKey, this.store.appStore.tenantId(), this.section().okey || undefined);
    const next = Array.isArray(fresh) ? fresh[0] : fresh;
    if (next) this.refreshed.set(next);
    this.courseNotice.set(true);
  }

  /** every query parameter, repeated ones as a list; nothing when the section is not under a route */
  private readQueryParams(): Record<string, string[]> {
    const map = this.route?.snapshot?.queryParamMap;
    if (!map) return {};
    const params: Record<string, string[]> = {};
    for (const key of map.keys) params[key] = map.getAll(key);
    return params;
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
