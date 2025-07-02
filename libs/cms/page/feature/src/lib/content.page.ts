import { Component, computed, effect, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { Meta, Title } from '@angular/platform-browser';

import { debugMessage, hasRole, replaceSubstring } from '@bk2/shared/util-core';
import { AppNavigationService, error, navigateByUrl } from '@bk2/shared/util-angular';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';
import { RoleName } from '@bk2/shared/models';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { SectionComponent } from '@bk2/cms/section/feature';
import { PageDetailStore } from './page-detail.store';

@Component({
  selector: 'bk-content-page',
  imports: [
    SectionComponent, MenuComponent,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonMenuButton,
    IonContent, IonList, IonItemSliding, IonItem, IonItemOptions, IonItemOption, IonLabel,
    IonPopover
  ],
  styles: [`
  bk-section { width: 100%; }
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
              <ion-item-sliding #slidingList>
                <ion-item lines="none">
                  <bk-section [id]="sectionId" />
                </ion-item>
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="deleteSection(slidingList, sectionId)">
                    <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="success" (click)="editSection(slidingList, sectionId)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                </ion-item-options>
              </ion-item-sliding>
            }
          </ion-list>
        }
      } @else { <!-- not contentAdmin; also: not logged-in for public content -->
        @if(pageStore.isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPageReadOnly' | translate | async }}</ion-label>
          </ion-item>
        } @else {
          @for(sectionId of pageStore.sections(); track $index) {
            <bk-section [id]="sectionId" />
          } 
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

  public id = input.required<string>();     // pageId (can contain @TID@ placeholder)
  public contextMenuName = input.required<string>();

  protected tenantId = this.pageStore.appStore.env.tenantId;
  protected showDebugInfo = computed(() => this.pageStore.showDebugInfo());
  protected popupId = computed(() => 'c_contentpage_' + this.id());

  constructor() {
    effect(() => {
      const _id = replaceSubstring(this.id(), '@TID@', this.pageStore.appStore.env.tenantId);
      debugMessage(`ContentPageComponent: pageId=${this.id()} -> ${_id}`, this.pageStore.currentUser());
      this.pageStore.setPageId(_id);
    });
    effect(() => {
      const _meta = this.pageStore.meta();
      if (_meta) {
        this.meta.addTags(_meta);
      }
    });
    effect(() => {
      const _title = this.pageStore.page()?.title;
      if (_title && _title.length > 0) {
        this.title.setTitle(_title);
      }
    });
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'sortSections':  await this.pageStore.sortSections(); break;
      case 'selectSection': await this.pageStore.selectSection(); break;
      case 'addSection':    await this.pageStore.addSection(); break;
      case 'exportRaw': await this.pageStore.export("raw"); break;
      default: error(undefined, `ContentPage.onPopoverDismiss: unknown method ${_selectedMethod}`);
    }
  }

  public async editSection(slidingItem: IonItemSliding, sectionKey: string) { 
    if (slidingItem) slidingItem.close();
    const _sectionId = replaceSubstring(sectionKey, '@TID@', this.pageStore.appStore.env.tenantId);
    debugMessage(`ContentPageComponent.editSection: sectionId=${sectionKey} -> ${_sectionId}`, this.pageStore.currentUser());

    this.appNavigationService.pushLink('private/' + this.pageStore.pageId());
    navigateByUrl(this.router, `/section/${_sectionId}`);
  } 

  public deleteSection(slidingItem: IonItemSliding, sectionKey: string) {
    if (slidingItem) slidingItem.close();
    const _sectionId = replaceSubstring(sectionKey, '@TID@', this.pageStore.appStore.env.tenantId);
    debugMessage(`ContentPageComponent.deleteSection: sectionId=${sectionKey} -> ${_sectionId}`, this.pageStore.currentUser());
    this.pageStore.deleteSectionFromPage(_sectionId);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageStore.currentUser());
  }
}
