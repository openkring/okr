import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { PageModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { AppNavigationService, createActionSheetButton, createActionSheetOptions, error, navigateByUrl } from '@bk2/shared-util-angular';
import { debugMessage, hasRole, replaceSubstring } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { SectionComponent } from '@bk2/cms-section-feature';
import { PageDetailStore } from './page-detail.store';
import { ActionSheetController } from '@ionic/angular';

@Component({
  selector: 'bk-content-page',
  standalone: true,
  imports: [
    SectionComponent, MenuComponent,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonMenuButton, IonContent, IonList, IonItem, IonLabel, IonPopover
  ],
  styles: [`
  bk-section { width: 100%; }
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
  providers: [PageDetailStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary" id="bkheader">
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
    <ion-content>
      @if(hasRole('contentAdmin')) {
        @if(pageStore.isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPage' | translate | async }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-button (click)="pageStore.addSection()">
              <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
              {{ '@content.section.operation.add.label' | translate | async }}
            </ion-button>
          </ion-item>
        } @else {     <!-- page contains sections -->
          <ion-list>
            @for(sectionId of pageStore.sections(); track $index) {
              <ion-item lines="none" click="showActions(sectionId)">
                <bk-section [id]="sectionId" />
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
  protected pageStore = inject(PageDetailStore);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly router = inject(Router);
  private readonly appNavigationService = inject(AppNavigationService);
  private actionSheetController = inject(ActionSheetController);

  public id = input.required<string>();     // pageId (can contain @TID@ placeholder)
  public contextMenuName = input.required<string>();

  protected tenantId = this.pageStore.appStore.env.tenantId;
  protected showDebugInfo = computed(() => this.pageStore.showDebugInfo());
  protected popupId = computed(() => 'c_contentpage_' + this.id());
  private imgixBaseUrl = this.pageStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      const id = replaceSubstring(this.id(), '@TID@', this.pageStore.appStore.env.tenantId);
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
      case 'sortSections':  await this.pageStore.sortSections(); break;
      case 'selectSection': await this.pageStore.selectSection(); break;
      case 'addSection':    await this.pageStore.addSection(); break;
      case 'exportRaw': await this.pageStore.export("raw"); break;
      case 'print': await this.pageStore.print(); break;
      default: error(undefined, `ContentPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Page. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param sectionId 
   */
  protected async showActions(sectionId: string): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, sectionId);
    await this.executeActions(actionSheetOptions, sectionId);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param sectionId 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, sectionId: string): void {
    if (hasRole('contentAdmin', this.pageStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param sectionId 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, sectionId: string): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.delete(sectionId);
          break;
        case 'edit':
          await this.edit(sectionId);
          break;
      }
    }
  }

  public async edit(sectionKey: string) { 
    const sectionId = replaceSubstring(sectionKey, '@TID@', this.pageStore.appStore.env.tenantId);
    debugMessage(`ContentPageComponent.editSection: sectionId=${sectionKey} -> ${sectionId}`, this.pageStore.currentUser());
    this.appNavigationService.pushLink('private/' + this.pageStore.pageId());
    navigateByUrl(this.router, `/section/${sectionId}`);
  } 

  public delete(sectionKey: string) {
    const sectionId = replaceSubstring(sectionKey, '@TID@', this.pageStore.appStore.env.tenantId);
    debugMessage(`ContentPageComponent.deleteSection: sectionId=${sectionKey} -> ${sectionId}`, this.pageStore.currentUser());
    this.pageStore.deleteSectionFromPage(sectionId);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageStore.currentUser());
  }
}
