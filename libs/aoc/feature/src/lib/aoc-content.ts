import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, ToastController } from '@ionic/angular/standalone';

import { MenuItemModel, SectionModel } from '@bk2/shared-models';
import { Button, Header, ResultLog } from '@bk2/shared-ui';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AocContentStore, MissingMenuRef, MissingSectionRef } from './aoc-content.store';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-aoc-content',
  standalone: true,
  imports: [
    SvgIconPipe,
    FormsModule, Header, Button, ResultLog,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol,
    IonList, IonItem, IonLabel, IonIcon,
  ],
  providers: [AocContentStore],
  template: `
    <bk-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ store.i18n.content() }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Orphaned Sections -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.content_section_orphaned_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ store.i18n.content_section_orphaned_content() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="orphanedSectionsLabel()" [iconName]="orphanedSectionsIcon()" (click)="toggleOrphanedSections()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(orphanedSections().length > 0) {
            <ion-list lines="inset">
              @for(section of orphanedSections(); track section.bkey) {
                <ion-item (click)="showSectionActions(section)" button>
                  <ion-icon slot="start" src="{{'section' | svgIcon }}" color="warning" />
                  <ion-label>
                    <h3>{{ section.name }}</h3>
                    <p>{{ section.bkey }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>

      <!-- Missing Sections -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.content_section_missing_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ store.i18n.content_section_missing_content() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="missingSectionsLabel()" [iconName]="missingSectionsIcon()" (click)="toggleMissingSections()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(missingSections().length > 0) {
            <ion-list lines="inset">
              @for(ref of missingSections(); track ref.resolvedKey) {
                <ion-item (click)="showMissingSectionRefActions(ref)" button>
                  <ion-icon slot="start" src="{{'section' | svgIcon }}" color="danger" />
                  <ion-label>
                    <h3>{{ ref.resolvedKey }}</h3>
                    <p>{{ ref.page.name }} ({{ ref.page.bkey }})</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>

      <!-- Orphaned Menus -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.content_menu_orphaned_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ store.i18n.content_menu_orphaned_content() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="orphanedMenusLabel()" [iconName]="orphanedMenusIcon()" (click)="toggleOrphanedMenus()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(orphanedMenus().length > 0) {
            <ion-list lines="inset">
              @for(menuItem of orphanedMenus(); track menuItem.bkey) {
                <ion-item (click)="showMenuActions(menuItem)" button>
                  <ion-icon slot="start" src="{{'menu' | svgIcon }}" color="warning" />
                  <ion-label>
                    <h3>{{ menuItem.name }}</h3>
                    <p>{{ menuItem.bkey }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>

      <!-- Missing Menus -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.content_menu_missing_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ store.i18n.content_menu_missing_content() }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="missingMenusLabel()" [iconName]="missingMenusIcon()" (click)="toggleMissingMenus()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(missingMenus().length > 0) {
            <ion-list lines="inset">
              @for(ref of missingMenus(); track ref.missingKey) {
                <ion-item (click)="showMissingMenuRefActions(ref)" button>
                  <ion-icon slot="start" src="{{'menu' | svgIcon }}" color="danger" />
                  <ion-label>
                    <h3>{{ ref.missingKey }}</h3>
                    <p>{{ ref.parent.name }} ({{ ref.parent.bkey }})</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.content_link_check_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ store.i18n.content_link_check_content() }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ store.i18n.content_link_check_show() }}" iconName="checkbox-circle" (click)="checkLinks()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [cardTitle]="store.i18n.result_title()" [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocContent {
  protected readonly store = inject(AocContentStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);

  protected readonly logTitle = computed(() => this.store.logTitle());
  protected readonly logInfo = computed(() => this.store.log());
  protected readonly isLoading = computed(() => this.store.isLoading());

  protected readonly orphanedSections = computed(() => this.store.orphanedSections());
  protected readonly orphanedSectionsLabel = computed(() => this.orphanedSections().length > 0 ? this.store.i18n.content_section_orphaned_hide() : this.store.i18n.content_section_orphaned_show());
  protected readonly orphanedSectionsIcon = computed(() => this.orphanedSections().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly orphanedMenus = computed(() => this.store.orphanedMenus());
  protected readonly orphanedMenusLabel = computed(() => this.orphanedMenus().length > 0 ? this.store.i18n.content_menu_orphaned_hide() : this.store.i18n.content_menu_orphaned_show());
  protected readonly orphanedMenusIcon = computed(() => this.orphanedMenus().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly missingSections = computed(() => this.store.missingSectionRefs());
  protected readonly missingSectionsLabel = computed(() => this.missingSections().length > 0 ? this.store.i18n.content_section_missing_hide() : this.store.i18n.content_section_missing_show());
  protected readonly missingSectionsIcon = computed(() => this.missingSections().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly missingMenus = computed(() => this.store.missingMenuRefs());
  protected readonly missingMenusLabel = computed(() => this.missingMenus().length > 0 ? this.store.i18n.content_menu_missing_hide() : this.store.i18n.content_menu_missing_show());
  protected readonly missingMenusIcon = computed(() => this.missingMenus().length > 0 ? 'eye-off' : 'eye-on');

  // constants
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public toggleOrphanedSections(): void {
    if (this.orphanedSections().length > 0) {
      this.store.clearOrphanedSections();
    } else {
      this.store.findOrphanedSections();
    }
  }

  public toggleMissingSections(): void {
    if (this.missingSections().length > 0) {
      this.store.clearMissingSections();
    } else {
      this.store.findMissingSections();
    }
  }

  public toggleOrphanedMenus(): void {
    if (this.orphanedMenus().length > 0) {
      this.store.clearOrphanedMenus();
    } else {
      this.store.findOrphanedMenus();
    }
  }

  public toggleMissingMenus(): void {
    if (this.missingMenus().length > 0) {
      this.store.clearMissingMenus();
    } else {
      this.store.findMissingMenus();
    }
  }

  public async checkLinks(): Promise<void> {
    this.store.checkLinks();
  }

  protected async showSectionActions(section: SectionModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.section.edit', this.store.i18n.content_section_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('content.actionsheet.section.delete', this.store.i18n.content_section_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.store.i18n.content_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'content.actionsheet.section.edit':
        await this.store.editSection(section);
        break;
      case 'content.actionsheet.section.delete':
        await this.store.removeSection(section);
        break;
      case 'content.actionsheet.copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, section.bkey ?? '');
        break;
    }
  }

  protected async showMissingSectionRefActions(ref: MissingSectionRef): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.page.edit', this.store.i18n.content_page_edit(), this.imgixBaseUrl, 'page'));
    options.buttons.push(createActionSheetButton('content.actionsheet.section.create', this.store.i18n.content_section_create(), this.imgixBaseUrl, 'section'));
    options.buttons.push(createActionSheetButton('content.actionsheet.section.removeRef', this.store.i18n.content_section_removeref(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.store.i18n.content_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));


    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'content.actionsheet.page.edit':
        await this.store.editPage(ref.page);
        break;
      case 'content.actionsheet.section.create':
        await this.store.createMissingSection(ref);
        break;
      case 'content.actionsheet.section.removeRef':
        await this.store.removeSectionRefFromPage(ref);
        break;
      case 'content.actionsheet.copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, ref.resolvedKey);
        break;
    }
  }

  protected async showMissingMenuRefActions(ref: MissingMenuRef): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.create', this.store.i18n.content_menu_create(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.removeRef', this.store.i18n.content_menu_removeref(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.store.i18n.content_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'content.actionsheet.menu.create':
        await this.store.addMissingMenu(ref);
        break;
      case 'content.actionsheet.menu.removeRef':
        await this.store.removeMissingMenuRef(ref);
        break;
      case 'content.actionsheet.copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, ref.missingKey);
        break;
    }
  }

  protected async showMenuActions(menuItem: MenuItemModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.edit', this.store.i18n.content_menu_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.delete', this.store.i18n.content_menu_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.store.i18n.content_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'content.actionsheet.menu.edit':
        await this.store.editMenu(menuItem);
        break;
      case 'content.actionsheet.menu.delete':
        await this.store.removeMenu(menuItem);
        break;
      case 'content.actionsheet.copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, menuItem.bkey ?? '');
        break;
    }
  }
}
