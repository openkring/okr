import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, ToastController } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { MenuItemModel, SectionModel } from '@bk2/shared-models';
import { Button, Header, ResultLog } from '@bk2/shared-ui';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AocContentStore, MissingMenuRef, MissingSectionRef } from './aoc-content.store';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { PFX } from './scope';

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
    <bk-header [title]="i18n.title()" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ i18n.content() }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Orphaned Sections -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n.orphaned_sections_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ i18n.orphaned_sections_content() }}</ion-col>
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
          <ion-card-title>{{ i18n.missing_sections_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ i18n.missing_sections_content() }}</ion-col>
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
          <ion-card-title>{{ i18n.orphaned_menus_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ i18n.orphaned_menus_content() }}</ion-col>
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
          <ion-card-title>{{ i18n.missing_menus_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ i18n.missing_menus_content() }}</ion-col>
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
          <ion-card-title>{{ i18n.check_links_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ i18n.check_links_content() }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ i18n.check_links_show() }}" iconName="checkbox-circle" (click)="checkLinks()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocContent {
  protected readonly store = inject(AocContentStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);
  private readonly i18nService = inject(I18nService);

  protected readonly i18n = this.i18nService.translateAll({
    title: PFX + 'content.title',
    content: PFX + 'content.content',
    orphaned_sections_title: PFX + 'orphanedSections.title',
    orphaned_sections_content: PFX + 'orphanedSections.content',
    orphaned_sections_hide: PFX + 'orphanedSections.hide',
    orphaned_sections_show: PFX + 'orphanedSections.show',
    missing_sections_title: PFX + 'missingSections.title',
    missing_sections_content: PFX + 'missingSections.content',
    missing_sections_hide: PFX + 'missingSections.hide',
    missing_sections_show: PFX + 'missingSections.show',
    orphaned_menus_title: PFX + 'orphanedMenus.title',
    orphaned_menus_content: PFX + 'orphanedMenus.content',
    orphaned_menus_hide: PFX + 'orphanedMenus.hide',
    orphaned_menus_show: PFX + 'orphanedMenus.show',
    missing_menus_title: PFX + 'missingMenus.title',
    missing_menus_content: PFX + 'missingMenus.content',
    missing_menus_hide: PFX + 'missingMenus.hide',
    missing_menus_show: PFX + 'missingMenus.show',
    check_links_title: PFX + 'checkLinks.title',
    check_links_content: PFX + 'checkLinks.content',
    check_links_show: PFX + 'checkLinks.show',
    as_title: PFX + 'content.actionsheet.title',
    as_section_edit: PFX + 'content.actionsheet.section.edit',
    as_section_delete: PFX + 'content.actionsheet.section.delete',
    as_copy_bkey: PFX + 'content.actionsheet.copy.bkey',
    as_page_edit: PFX + 'content.actionsheet.page.edit',
    as_section_create: PFX + 'content.actionsheet.section.create',
    as_section_removeref: PFX + 'content.actionsheet.section.removeRef',
    as_menu_create: PFX + 'content.actionsheet.menu.create',
    as_menu_delete: PFX + 'content.actionsheet.menu.delete',
    as_menu_edit: PFX + 'content.actionsheet.menu.edit',
    as_menu_removeref: PFX + 'content.actionsheet.menu.removeRef',
    cancel: '@cancel',
  });

  protected readonly logTitle = computed(() => this.store.logTitle());
  protected readonly logInfo = computed(() => this.store.log());
  protected readonly isLoading = computed(() => this.store.isLoading());

  protected readonly orphanedSections = computed(() => this.store.orphanedSections());
  protected readonly orphanedSectionsLabel = computed(() => this.orphanedSections().length > 0 ? this.i18n.orphaned_sections_hide() : this.i18n.orphaned_sections_show());
  protected readonly orphanedSectionsIcon = computed(() => this.orphanedSections().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly orphanedMenus = computed(() => this.store.orphanedMenus());
  protected readonly orphanedMenusLabel = computed(() => this.orphanedMenus().length > 0 ? this.i18n.orphaned_menus_hide() : this.i18n.orphaned_menus_show());
  protected readonly orphanedMenusIcon = computed(() => this.orphanedMenus().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly missingSections = computed(() => this.store.missingSectionRefs());
  protected readonly missingSectionsLabel = computed(() => this.missingSections().length > 0 ? this.i18n.missing_sections_hide() : this.i18n.missing_sections_show());
  protected readonly missingSectionsIcon = computed(() => this.missingSections().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly missingMenus = computed(() => this.store.missingMenuRefs());
  protected readonly missingMenusLabel = computed(() => this.missingMenus().length > 0 ? this.i18n.missing_menus_hide() : this.i18n.missing_menus_show());
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
    const options: ActionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.section.edit', this.i18n.as_section_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('content.actionsheet.section.delete', this.i18n.as_section_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.i18n.as_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

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
    const options: ActionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.page.edit', this.i18n.as_page_edit(), this.imgixBaseUrl, 'page'));
    options.buttons.push(createActionSheetButton('content.actionsheet.section.create', this.i18n.as_section_create(), this.imgixBaseUrl, 'section'));
    options.buttons.push(createActionSheetButton('content.actionsheet.section.removeRef', this.i18n.as_section_removeref(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.i18n.as_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel'));


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
    const options: ActionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.create', this.i18n.as_menu_create(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.removeRef', this.i18n.as_menu_removeref(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.i18n.as_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

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
    const options: ActionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.edit', this.i18n.as_menu_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('content.actionsheet.menu.delete', this.i18n.as_menu_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('content.actionsheet.copy.bkey', this.i18n.as_copy_bkey(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

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
