import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonComponent, HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { AocContentStore } from './aoc-content.store';

@Component({
  selector: 'bk-aoc-content',
  standalone: true,
  imports: [TranslatePipe, AsyncPipe, FormsModule, HeaderComponent, ButtonComponent, ResultLogComponent, IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol],
  providers: [AocContentStore],
  template: `
    <bk-header title="{{ '@aoc.content.title' | translate | async }}" />
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

  protected readonly logTitle = computed(() => this.aocContentStore.logTitle());
  protected readonly logInfo = computed(() => this.aocContentStore.log());
  protected readonly isLoading = computed(() => this.aocContentStore.isLoading());

  public async findOrphanedSections(): Promise<void> {
    this.aocContentStore.findOrphanedSections();
  }

  public async findMissingSections(): Promise<void> {
    this.aocContentStore.findMissingSections();
  }

  public async findOrphanedMenus(): Promise<void> {
    this.aocContentStore.findOrphanedMenus();
  }

  public async findMissingMenus(): Promise<void> {
    this.aocContentStore.findMissingMenus();
  }

  public async checkLinks(): Promise<void> {
    this.aocContentStore.checkLinks();
  }
}
