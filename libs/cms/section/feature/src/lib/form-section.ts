import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withMethods, withProps } from '@ngrx/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonNote } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { Spinner } from '@bk2/shared-ui';
import { FormSection } from '@bk2/shared-models';
import { FormDefinitionService } from '@bk2/forms-data-access';
import { getFormMapping } from '@bk2/forms-util';
import { FormRenderer } from '@bk2/forms-ui';

const FormSectionStore = signalStore(
  withProps(() => ({
    appStore: inject(AppStore),
    formDefinitionService: inject(FormDefinitionService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      submit:       '@forms.section.submit',
      submit_conf:  '@forms.section.submit_conf',
      submit_error: '@forms.section.submit_error',
      not_found:    '@forms.section.not_found',
      archived:     '@forms.section.archived',
    }),
  })),
  withMethods(store => ({
    async submitToCollection(
      collectionName: string,
      mappingKey: string,
      values: Record<string, unknown>,
    ): Promise<void> {
      const mapping = getFormMapping(mappingKey);
      if (!mapping) throw new Error(`Unknown mapping: ${mappingKey}`);
      const record: Record<string, unknown> = {
        ...(mapping.defaults ?? {}),
        ...values,
        ...(mapping.defaults ?? {}),       // defaults always win
        tenants: [store.appStore.tenantId()],
        submittedAt: new Date().toISOString(),
        submittedBy: store.appStore.currentUser()?.bkey ?? 'anonymous',
      };
      const { getFirestore, collection, addDoc } = await import('firebase/firestore');
      await addDoc(collection(getFirestore(), collectionName), record);
    },

    async submitToUrl(url: string, values: Record<string, unknown>): Promise<void> {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(values)) body.set(k, String(v ?? ''));
      const res = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  }))
);

@Component({
  selector: 'bk-form-section',
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
          <bk-spinner />
        } @else if (submitted()) {
          <ion-note color="success">{{ store.i18n.submit_conf() }}</ion-note>
        } @else if (errorMsg()) {
          <ion-note color="danger">{{ errorMsg() }}</ion-note>
        } @else if (definition(); as def) {
          @if (def.isArchived) {
            <ion-note color="warning">{{ store.i18n.archived() }}</ion-note>
          } @else {
            <bk-form-renderer
              [definition]="def"
              [submitLabel]="store.i18n.submit()"
              [submitting]="submitting()"
              (submitted)="onSubmit($event)"
            />
          }
        } @else {
          <ion-note color="medium">{{ store.i18n.not_found() }}</ion-note>
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class FormSectionComponent {
  protected readonly store = inject(FormSectionStore);

  public readonly section = input.required<FormSection>();
  public readonly editMode = input(false);

  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal('');

  protected readonly definitionResource = rxResource({
    params: () => ({ formKey: this.section().properties?.formKey }),
    stream: ({ params }) =>
      this.store.formDefinitionService.readByFormKey(params.formKey),
  });

  protected readonly definition = computed(() => {
    const val = this.definitionResource.value();
    return Array.isArray(val) ? val[0] : val;
  });

  protected async onSubmit(values: Record<string, unknown>): Promise<void> {
    this.submitting.set(true);
    this.errorMsg.set('');
    try {
      const target = this.definition()?.target;
      if (!target) return;
      if (target.kind === 'collection') {
        await this.store.submitToCollection(target.collectionName, target.mappingKey, values);
      } else {
        await this.store.submitToUrl(target.url, values);
      }
      this.submitted.set(true);
    } catch {
      this.errorMsg.set(this.store.i18n.submit_error());
    } finally {
      this.submitting.set(false);
    }
  }
}
