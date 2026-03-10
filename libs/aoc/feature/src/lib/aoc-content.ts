import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { documentText, menu } from 'ionicons/icons';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel, SectionModel } from '@bk2/shared-models';
import { ButtonComponent, HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AocContentStore } from './aoc-content.store';

@Component({
  selector: 'bk-aoc-content',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
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
                <bk-button label=" {{ '@aoc.content.orphanedSections.button' | translate | async }}" iconName="checkbox-circle" (click)="findOrphanedSections()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(orphanedSections().length > 0) {
            <ion-list lines="inset">
              @for(section of orphanedSections(); track section.bkey) {
                <ion-item (click)="showSectionActions(section)" button>
                  <ion-icon name="document-text" slot="start" color="warning" />
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

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.content.missingSections.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.content.missingSections.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.content.missingSections.button' | translate | async }}" iconName="checkbox-circle" (click)="findMissingSections()" />
              </ion-col>
            </ion-row>
          </ion-grid>
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
                <bk-button label=" {{ '@aoc.content.orphanedMenus.button' | translate | async }}" iconName="checkbox-circle" (click)="findOrphanedMenus()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(orphanedMenus().length > 0) {
            <ion-list lines="inset">
              @for(menuItem of orphanedMenus(); track menuItem.bkey) {
                <ion-item (click)="showMenuActions(menuItem)" button>
                  <ion-icon name="menu" slot="start" color="warning" />
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

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.content.missingMenus.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.content.missingMenus.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.content.missingMenus.button' | translate | async }}" iconName="checkbox-circle" (click)="findMissingMenus()" />
              </ion-col>
            </ion-row>
          </ion-grid>
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
                <bk-button label=" {{ '@aoc.content.checkLinks.button' | translate | async }}" iconName="checkbox-circle" (click)="checkLinks()" />
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
  protected readonly orphanedMenus = computed(() => this.aocContentStore.orphanedMenus());

  constructor() {
    addIcons({ documentText, menu });
  }

  public findOrphanedSections(): void {
    this.aocContentStore.findOrphanedSections();
  }

  public async findMissingSections(): Promise<void> {
    this.aocContentStore.findMissingSections();
  }

  public findOrphanedMenus(): void {
    this.aocContentStore.findOrphanedMenus();
  }

  public async findMissingMenus(): Promise<void> {
    this.aocContentStore.findMissingMenus();
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
