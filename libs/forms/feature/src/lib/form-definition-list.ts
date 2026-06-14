import { Component, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { FormDefinitionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { Menu } from '@bk2/cms-menu-feature';

import { FormDefinitionStore } from './form-definition.store';

@Component({
  selector: 'bk-form-definition-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip, IonPopover,
  ],
  providers: [FormDefinitionStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        @if (showMenuButton()) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        <ion-title>{{ store.filteredForms().length }}/{{ store.formsCount() }} {{ store.i18n.list_title() }}</ion-title>
        @if (store.canWrite()) {
          <ion-buttons slot="end">
            <ion-button id="c-forms">
              <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-forms" triggerAction="click" [showBackdrop]="true"
              [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content><bk-menu [menuName]="contextMenuName()" /></ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <bk-spinner />
      } @else if (store.filteredForms().length === 0) {
        <bk-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (form of store.filteredForms(); track form.bkey) {
            <ion-item button [detail]="false" (click)="showActions(form)">
              <ion-label>
                <h2>{{ form.name }}</h2>
                <p>{{ form.formKey }} · v{{ form.version }} · {{ form.fields.length }} Felder</p>
              </ion-label>
              <ion-chip slot="end" color="medium" class="ion-hide-sm-down">{{ form.target.kind }}</ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class FormDefinitionList {
  protected readonly store = inject(FormDefinitionStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs
  public readonly listId = input('all');                         // list partition; default 'all', route binding overrides it
  public readonly contextMenuName = input('forms-context');      // context menu for list-level actions
  public readonly showMenuButton = input(true);                  // hide the side-menu button in embedded views

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    switch ($event.detail.data) {
      case 'add': await this.store.openCreateModal(); break;
      default: this.alertService.error(`FormDefinitionList.onPopoverDismiss: unknown method ${$event.detail.data}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a form. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param form
   */
  protected async showActions(form: FormDefinitionModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, form);
    await this.executeActions(actionSheetOptions, form);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param options
   * @param form
   */
  private addActionSheetButtons(options: ActionSheetOptions, form: FormDefinitionModel): void {
    if (!this.store.canWrite()) return;
    options.buttons.push(createActionSheetButton('form.builder', this.store.i18n.action_builder(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('form.settings', this.store.i18n.action_settings(), this.imgixBaseUrl, 'settings'));
    if (form.target.kind === 'collection') {
      options.buttons.push(createActionSheetButton('form.exportCsv', this.store.i18n.action_export_csv(), this.imgixBaseUrl, 'download'));
      options.buttons.push(createActionSheetButton('form.exportPdf', this.store.i18n.action_export_pdf(), this.imgixBaseUrl, 'document'));
    }
    options.buttons.push(createActionSheetButton('form.duplicate', this.store.i18n.action_duplicate(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('form.archive', this.store.i18n.action_archive(), this.imgixBaseUrl, 'archive'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];   // only cancel → show nothing
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions
   * @param form
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, form: FormDefinitionModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'form.builder':   await this.store.openBuilder(form); break;
        case 'form.settings':  await this.store.openEditModal(form); break;
        case 'form.exportCsv': await this.store.downloadCsv(form); break;
        case 'form.exportPdf': await this.store.downloadPdf(form); break;
        case 'form.duplicate': await this.store.duplicateForm(form); break;
        case 'form.archive':   await this.store.archiveForm(form); break;
      }
    }
  }
}
