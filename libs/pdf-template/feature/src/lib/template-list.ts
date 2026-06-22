// libs/pdf-template/feature/src/lib/template-list.ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, ActionSheetOptions } from '@ionic/angular/standalone';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip, IonMenuButton,
} from '@ionic/angular/standalone';

import { TemplateModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { AppStore } from '@bk2/shared-feature';

import { TemplateStore } from './template.store';

@Component({
  selector: 'bk-template-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TemplateStore],
  imports: [
    SvgIconPipe,
    Spinner, ListFilter, EmptyList,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonMenuButton,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonChip,
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
        <ion-buttons slot="end">
          <ion-button fill="clear" (click)="create()">
            <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <bk-spinner />
      } @else if(store.filteredTemplates().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(tmpl of store.filteredTemplates(); track tmpl.bkey) {
            <ion-row (click)="showActions(tmpl)">
              <ion-col size="5">
                <ion-label>
                  <p class="t-name">{{ tmpl.name }}</p>
                  <p class="t-meta">{{ tmpl.category }} · {{ tmpl.language }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center">
                <ion-chip [outline]="true" size="small">
                  {{ tmpl.defaultOutputFormat.toUpperCase() }}
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

  protected async create(): Promise<void> {
    const key = await this.store.createTemplate();
    if (key) {
      await this.router.navigate(['/templates', key]);
    }
  }

  protected async showActions(tmpl: TemplateModel): Promise<void> {
    const actionSheetOptions: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    actionSheetOptions.buttons.push(
      createActionSheetButton('template.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit')
    );
    if (tmpl.currentVersion > 0) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('template.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on')
      );
    }
    // revert is only meaningful when there is a draft or more than one published version
    if (tmpl.draftVersion || tmpl.currentVersion > 1) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('template.revert', this.store.i18n.revert(), this.imgixBaseUrl, 'reload')
      );
    }
    actionSheetOptions.buttons.push(
      createActionSheetButton('template.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash')
    );
    actionSheetOptions.buttons.push(
      createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel')
    );

    const actionSheet = await this.actionSheetController.create(actionSheetOptions);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'template.edit':
        await this.router.navigate(['/templates', tmpl.bkey]);
        break;
      case 'template.view':
        await this.router.navigate(['/templates', tmpl.bkey], { queryParams: { mode: 'view' } });
        break;
      case 'template.revert':
        await this.store.revertToLastVersion(tmpl);
        break;
      case 'template.delete':
        await this.store.deleteTemplate(tmpl);
        break;
    }
  }
}
