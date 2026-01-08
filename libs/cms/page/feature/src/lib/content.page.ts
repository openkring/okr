import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { debugMessage, hasRole, replaceSubstring } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { SectionComponent, SectionStore } from '@bk2/cms-section-feature';

import { PageStore } from './page.store';

@Component({
  selector: 'bk-content-page',
  standalone: true,
  imports: [
    SectionComponent, MenuComponent,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonMenuButton, IonContent, IonList, IonItem, IonLabel, IonPopover
  ],
  providers: [PageStore, SectionStore],
  styles: [`
  bk-section { width: 100%; display: block; }

  .section-wrapper.editable {
    border: 3px solid;
    border-radius: 8px;
    border-color: yellow;
    margin: 8px 0;
    padding: 4px;
    width: calc(100% - 16px);
    cursor: pointer;
  }

  ion-item.edit-mode {
    --padding-start: 0;
    --inner-padding-end: 0;
  }

@media (width <= 600px) {
    .section-item {
    --padding-start: 2px;
    --inner-padding-end: 2px;
  }
}

@media print {
  @page {
    size: A4;
    margin: 15mm;
  }

  /* FORCE FULL HEIGHT */
  html, body, ion-app, ion-router-outlet {
    height: auto !important;
    overflow: visible !important;
  }

  ion-content {
    --offset-bottom: 0px !important;
    --overflow: visible !important;
    overflow: visible !important;
    contain: none !important;
  }

  /* PRINT CONTAINER */
  .print-content {
    display: block !important;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm;
    box-sizing: border-box;
    page-break-after: always;
    overflow: visible !important;
    position: relative !important;
  }

  /* ENSURE CHILDREN DON'T CLIP */
  .print-content > * {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* FORCE PAGE BREAKS */
  .page-break {
    page-break-before: always;
    height: 0;
  }

  /* HIDE UI */
  ion-header, ion-footer, ion-toolbar, .print-btn, .no-print {
    display: none !important;
  }
}
`],
  template: `
    <ion-header>
      <ion-toolbar [color]="color()" id="bkheader">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>      
        <ion-title>{{ pageStore.page()?.name | translate | async }}</ion-title>
        @if(hasRole('contentAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>          
        }
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-no-padding">
      @if(hasRole('contentAdmin')) {
        @if(pageStore.isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPage' | translate | async }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-button (click)="this.addSection()">
              <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
              {{ '@content.section.operation.add.label' | translate | async }}
            </ion-button>
          </ion-item>
        } @else {     <!-- page contains sections -->
          <ion-list>
            @for(sectionId of pageStore.sections(); track $index) {
              <ion-item lines="none" class="section-item" (click)="showActions(sectionId)" [class.edit-mode]="editMode()">
                @if(editMode()) {
                  <div class="section-wrapper" [class.editable]="editMode()">
                    <bk-section [id]="sectionId" />
                  </div>  
                } @else {
                  <bk-section [id]="sectionId" />
                }
              </ion-item>
            }
          </ion-list>
        }
      } @else { <!-- not contentAdmin; also: not logged-in for public content -->
        @if(pageStore.isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPageReadOnly' | translate | async }}</ion-label>
          </ion-item>
        } @else {
          <div class="print-content" #printContent>
            @for(sectionId of pageStore.sections(); track $index) {
              <bk-section [id]="sectionId" />
            } 
          </div>
        }
      }
    </ion-content>
  `
})
export class ContentPageComponent {
  protected pageStore = inject(PageStore);
  private sectionStore = inject(SectionStore);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public id = input.required<string>();     // pageId (can contain @TID@ placeholder)
  public contextMenuName = input.required<string>();
  public color = input('secondary');

  // derived signals
  protected tenantId = computed(() => this.pageStore.tenantId());
  protected showDebugInfo = computed(() => this.pageStore.showDebugInfo());
  protected popupId = computed(() => 'c_contentpage_' + this.id());
  protected editMode = signal(false);

  constructor() {
    effect(() => {
      const id = replaceSubstring(this.id(), '@TID@', this.pageStore.tenantId());
      debugMessage(`ContentPageComponent: pageId=${this.id()} -> ${id}`, this.pageStore.currentUser());
      this.pageStore.setPageId(id);
    });
    effect(() => {
      const meta = this.pageStore.meta();
      if (meta) {
        this.meta.addTags(meta);
      }
    });
    effect(() => {
      const title = this.pageStore.page()?.title;
      if (title && title.length > 0) {
        this.title.setTitle(title);
      }
    });
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'toggleEditMode':  this.editMode.update(value => !value); break;
      case 'sortSections':  await this.pageStore.sortSections(); break;
      case 'selectSection': await this.pageStore.selectSection(); break;
      case 'addSection':    await this.addSection(); break;
      case 'exportRaw': await this.pageStore.export("raw"); break;
      case 'print': await this.pageStore.print(); break;
      default: error(undefined, `ContentPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async addSection(): Promise<void> {
    const sectionId = await this.sectionStore.add(false);
    if (sectionId) {
      this.pageStore.addSectionById(sectionId);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Page. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param sectionId 
   */
  protected async showActions(sectionId: string): Promise<void> {
    if (this.editMode()) {
      const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      this.addActionSheetButtons(actionSheetOptions);
      await this.executeActions(actionSheetOptions, sectionId);
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param sectionId 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    if (hasRole('contentAdmin', this.pageStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.pageStore.imgixBaseUrl(), 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('page.removesection', this.pageStore.imgixBaseUrl(), 'trash_delete'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.pageStore.imgixBaseUrl(), 'close_cancel'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param sectionId 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, sectionId: string): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const id = replaceSubstring(sectionId, '@TID@', this.tenantId());
      this.sectionStore.setSectionId(id);
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'page.removesection':
          if (sectionId) {
            await this.pageStore.removeSectionById(sectionId);
          }
          break;
        case 'section.edit':
          await this.sectionStore.edit(this.sectionStore.section(), false);
          break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageStore.currentUser());
  }
}
