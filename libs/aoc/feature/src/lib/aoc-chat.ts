import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent, ResultLogComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { AocChatStore } from './aoc-chat.store';

@Component({
  selector: 'bk-aoc-chat',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    FormsModule,
    HeaderComponent, ResultLogComponent,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol
  ],
  providers: [AocChatStore],
  template: `
    <bk-header title="@aoc.chat.title" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.chat.content' | translate | async }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.chat.rooms.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.chat.rooms.content' | translate | async }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocChat {
  protected readonly aocChatStore = inject(AocChatStore);

  protected roomType = linkedSignal(() => this.aocChatStore.roomType());
  protected readonly logTitle = computed(() => this.aocChatStore.logTitle());
  protected readonly logInfo = computed(() => this.aocChatStore.log());
  protected readonly isLoading = computed(() => this.aocChatStore.isLoading());
  protected readonly types = computed(() => this.aocChatStore.appStore.getCategory('model_type'));
  protected readonly readOnly = computed(() => !hasRole('admin', this.aocChatStore.currentUser()));


}
