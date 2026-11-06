// libs/content/pdf-template/feature/src/lib/template-list.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, ActionSheetOptions } from '@ionic/angular';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip, IonMenuButton, IonSegment, IonSegmentButton,
} from '@ionic/angular';

import { canDeleteEmailTemplate, isEmailTemplate } from '@okr/content-pdf-template-util';
import { TemplateModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { AppStore } from '@okr/shared-feature';
import { canWriteTenant, OPERATOR_TENANT_ID } from '@okr/shared-util-core';

import { TemplateListKind, TemplateStore } from './template.store';

@Component({
  selector: 'okr-template-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TemplateStore],
  imports: [
    SvgIconPipe,
    Spinner, ListFilter, EmptyList,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonMenuButton,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip, IonSegment, IonSegmentButton,
  ],
  styles: [`
    .t-name { font-size: 1rem; }
    .t-meta { font-size: 0.8rem; color: var(--ion-color-medium); }
    ion-chip { font-size: 0.75rem; height: 20px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.filteredTemplates().length }} {{ store.i18n.list_title() }}</ion-title>
        @if(store.listKind() === 'pdf') {
          <ion-buttons slot="end">
            <ion-button fill="clear" (click)="create()">
              <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="store.listKind()" (ionChange)="onKindChange($event)">
          <ion-segment-button value="pdf">
            <ion-label>{{ store.i18n.list_kind_pdf() }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="email">
            <ion-label>{{ store.i18n.list_kind_email() }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <okr-spinner />
      } @else if(store.filteredTemplates().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(tmpl of store.filteredTemplates(); track tmpl.okey) {
            <ion-row (click)="showActions(tmpl)">
              <ion-col size="5">
                <ion-label>
                  <p class="t-name">{{ tmpl.name }}</p>
                  @if(store.listKind() === 'pdf') {
                    <p class="t-meta">{{ tmpl.category }} · {{ tmpl.language }}</p>
                  }
                </ion-label>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center">
                <ion-chip [outline]="true" size="small">
                  {{ store.listKind() === 'email' ? kindLabel(tmpl) : tmpl.defaultOutputFormat.toUpperCase() }}
                </ion-chip>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center">
                v{{ tmpl.currentVersion }}{{ tmpl.draftVersion ? ' (v' + tmpl.draftVersion + '*)' : '' }}
              </ion-col>
              <ion-col size="3" class="ion-align-self-center">
                <ion-chip [outline]="true" size="small"
                  [color]="tmpl.status === 'published' ? 'success' : tmpl.status === 'draft' ? 'warning' : 'medium'">
                  {{ tmpl.status }}
                </ion-chip>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `
})
export class TemplateList {
  protected readonly store = inject(TemplateStore);
  private readonly router = inject(Router);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly appStore = inject(AppStore);

  private readonly imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  protected onKindChange(event: CustomEvent): void {
    this.store.setListKind(event.detail.value as TemplateListKind);
  }

  /** The label of an email template's kind, shown where a PDF template shows its output format. */
  protected kindLabel(tmpl: TemplateModel): string {
    return tmpl.kind === 'emailLayout' ? this.store.i18n.kind_email_layout() : this.store.i18n.kind_email_text();
  }

  protected async create(): Promise<void> {
    const key = await this.store.createTemplate();
    if (key) {
      // `new=1` marks the document as provisional: leaving the editor without saving
      // discards it again (TemplateEditPage.ngOnDestroy).
      await this.router.navigate(['/templates', key], { queryParams: { new: '1' } });
    }
  }

  protected async showActions(tmpl: TemplateModel): Promise<void> {
    const actionSheetOptions: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    const email = isEmailTemplate(tmpl);
    // a shared email template is read-only for a tenant; only the operator writes it
    const writable = !email || canWriteTenant(
      tmpl, this.appStore.tenantId(), this.appStore.tenantId() === OPERATOR_TENANT_ID
    );
    if (writable) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('template.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit')
      );
    }
    if (tmpl.currentVersion > 0) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('template.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on')
      );
    }
    // PDF templates can always be copied; an email template only when it is not the tenant's own
    if (!email || !writable) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('template.copy', this.store.i18n.copy(), this.imgixBaseUrl, 'copy')
      );
    }
    // revert is only meaningful when there is a draft or more than one published version
    if (writable && (tmpl.draftVersion || tmpl.currentVersion > 1)) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('template.revert', this.store.i18n.revert(), this.imgixBaseUrl, 'reload')
      );
    }
    if (writable && (!email || canDeleteEmailTemplate(tmpl.okey))) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('template.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash')
      );
    }
    actionSheetOptions.buttons.push(
      createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel')
    );

    const actionSheet = await this.actionSheetController.create(actionSheetOptions);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'template.edit':
        await this.router.navigate(['/templates', tmpl.okey]);
        break;
      case 'template.view':
        await this.router.navigate(['/templates', tmpl.okey], { queryParams: { mode: 'view' } });
        break;
      case 'template.copy': {
        const key = isEmailTemplate(tmpl)
          ? await this.store.copyEmailTemplate(tmpl)
          : await this.store.copyTemplate(tmpl);
        if (key) await this.router.navigate(['/templates', key]);
        break;
      }
      case 'template.revert':
        await this.store.revertToLastVersion(tmpl);
        break;
      case 'template.delete':
        await this.store.deleteTemplate(tmpl);
        break;
    }
  }
}
