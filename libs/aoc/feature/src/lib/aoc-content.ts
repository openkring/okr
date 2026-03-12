import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, ToastController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel, SectionModel } from '@bk2/shared-models';
import { ButtonComponent, HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AocContentStore, MissingMenuRef, MissingSectionRef } from './aoc-content.store';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-aoc-content',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    FormsModule, HeaderComponent, ButtonComponent, ResultLogComponent,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol,
    IonList, IonItem, IonLabel, IonIcon,
  ],
  providers: [AocContentStore],
  template: `
    <bk-header title="@aoc.content.title" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.content.content' | translate | async }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Orphaned Sections -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.content.orphanedSections.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.content.orphanedSections.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="(orphanedSectionsLabel() | translate | async) ?? ''" [iconName]="orphanedSectionsIcon()" (click)="toggleOrphanedSections()" />
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
          <ion-card-title>{{ '@aoc.content.missingSections.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.content.missingSections.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="(missingSectionsLabel() | translate | async) ?? ''" [iconName]="missingSectionsIcon()" (click)="toggleMissingSections()" />
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
          <ion-card-title>{{ '@aoc.content.orphanedMenus.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.content.orphanedMenus.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="(orphanedMenusLabel() | translate | async) ?? ''" [iconName]="orphanedMenusIcon()" (click)="toggleOrphanedMenus()" />
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
          <ion-card-title>{{ '@aoc.content.missingMenus.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.content.missingMenus.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button [label]="(missingMenusLabel() | translate | async) ?? ''" [iconName]="missingMenusIcon()" (click)="toggleMissingMenus()" />
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
          <ion-card-title>{{ '@aoc.content.checkLinks.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.content.checkLinks.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.content.checkLinks.show' | translate | async }}" iconName="checkbox-circle" (click)="checkLinks()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocContentComponent {
  protected readonly aocContentStore = inject(AocContentStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);

  protected readonly logTitle = computed(() => this.aocContentStore.logTitle());
  protected readonly logInfo = computed(() => this.aocContentStore.log());
  protected readonly isLoading = computed(() => this.aocContentStore.isLoading());

  protected readonly orphanedSections = computed(() => this.aocContentStore.orphanedSections());
  protected readonly orphanedSectionsLabel = computed(() => this.orphanedSections().length > 0 ? '@aoc.content.orphanedSections.hide' : '@aoc.content.orphanedSections.show');
  protected readonly orphanedSectionsIcon = computed(() => this.orphanedSections().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly orphanedMenus = computed(() => this.aocContentStore.orphanedMenus());
  protected readonly orphanedMenusLabel = computed(() => this.orphanedMenus().length > 0 ? '@aoc.content.orphanedMenus.hide' : '@aoc.content.orphanedMenus.show');
  protected readonly orphanedMenusIcon = computed(() => this.orphanedMenus().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly missingSections = computed(() => this.aocContentStore.missingSectionRefs());
  protected readonly missingSectionsLabel = computed(() => this.missingSections().length > 0 ? '@aoc.content.missingSections.hide' : '@aoc.content.missingSections.show');
  protected readonly missingSectionsIcon = computed(() => this.missingSections().length > 0 ? 'eye-off' : 'eye-on');

  protected readonly missingMenus = computed(() => this.aocContentStore.missingMenuRefs());
  protected readonly missingMenusLabel = computed(() => this.missingMenus().length > 0 ? '@aoc.content.missingMenus.hide' : '@aoc.content.missingMenus.show');
  protected readonly missingMenusIcon = computed(() => this.missingMenus().length > 0 ? 'eye-off' : 'eye-on');

  public toggleOrphanedSections(): void {
    if (this.orphanedSections().length > 0) {
      this.aocContentStore.clearOrphanedSections();
    } else {
      this.aocContentStore.findOrphanedSections();
    }
  }

  public toggleMissingSections(): void {
    if (this.missingSections().length > 0) {
      this.aocContentStore.clearMissingSections();
    } else {
      this.aocContentStore.findMissingSections();
    }
  }

  public toggleOrphanedMenus(): void {
    if (this.orphanedMenus().length > 0) {
      this.aocContentStore.clearOrphanedMenus();
    } else {
      this.aocContentStore.findOrphanedMenus();
    }
  }

  public toggleMissingMenus(): void {
    if (this.missingMenus().length > 0) {
      this.aocContentStore.clearMissingMenus();
    } else {
      this.aocContentStore.findMissingMenus();
    }
  }

  public async checkLinks(): Promise<void> {
    this.aocContentStore.checkLinks();
  }

  protected async showSectionActions(section: SectionModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('section.edit', ''));
    options.buttons.push(createActionSheetButton('section.delete', ''));
    options.buttons.push(createActionSheetButton('copy.bkey', ''));
    options.buttons.push(createActionSheetButton('cancel', ''));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'section.edit':
        await this.aocContentStore.editSection(section);
        break;
      case 'section.delete':
        await this.aocContentStore.removeSection(section);
        break;
      case 'copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, section.bkey ?? '');
        break;
    }
  }

  protected async showMissingSectionRefActions(ref: MissingSectionRef): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('page.edit', ''));
    options.buttons.push(createActionSheetButton('section.create', ''));
    options.buttons.push(createActionSheetButton('section.removeRef', ''));
    options.buttons.push(createActionSheetButton('copy.bkey', ''));
    options.buttons.push(createActionSheetButton('cancel', ''));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'page.edit':
        await this.aocContentStore.editPage(ref.page);
        break;
      case 'section.create':
        await this.aocContentStore.createMissingSection(ref);
        break;
      case 'section.removeRef':
        await this.aocContentStore.removeSectionRefFromPage(ref);
        break;
      case 'copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, ref.resolvedKey);
        break;
    }
  }

  protected async showMissingMenuRefActions(ref: MissingMenuRef): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('menuItem.create', ''));
    options.buttons.push(createActionSheetButton('menuItem.removeRef', ''));
    options.buttons.push(createActionSheetButton('copy.bkey', ''));
    options.buttons.push(createActionSheetButton('cancel', ''));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'menuItem.create':
        await this.aocContentStore.addMissingMenu(ref);
        break;
      case 'menuItem.removeRef':
        await this.aocContentStore.removeMissingMenuRef(ref);
        break;
      case 'copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, ref.missingKey);
        break;
    }
  }

  protected async showMenuActions(menuItem: MenuItemModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('menuItem.edit', ''));
    options.buttons.push(createActionSheetButton('menuItem.delete', ''));
    options.buttons.push(createActionSheetButton('copy.bkey', ''));
    options.buttons.push(createActionSheetButton('cancel', ''));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'menuItem.edit':
        await this.aocContentStore.editMenu(menuItem);
        break;
      case 'menuItem.delete':
        await this.aocContentStore.removeMenu(menuItem);
        break;
      case 'copy.bkey':
        await copyToClipboardWithConfirmation(this.toastController, menuItem.bkey ?? '');
        break;
    }
  }
}
