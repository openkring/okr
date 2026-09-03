import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonChip, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular/standalone';
import { Browser } from '@capacitor/browser';

import { DiaryModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AvatarDisplay } from '@okr/avatar-ui';
import { weatherCodeToIcon } from '@okr/weather-util';
import { dismissOverlay } from '@okr/shared-util-angular';

import {
  DiaryI18n, diaryStateOf, diaryWeatherLine, driveFolderUrl, formatDiaryDate, hasDiaryWeather, renderDiaryHtml,
} from '@okr/content-diary-util';

@Component({
  selector: 'okr-diary-view-modal',
  standalone: true,
  imports: [Header, AvatarDisplay, SvgIconPipe, IonContent, IonItem, IonLabel, IonList, IonNote, IonChip, IonIcon, IonButton],
  styles: [`
    .body { padding: 16px; line-height: 1.5; }
    .body img { display: none; }
    .meta ion-chip { margin-right: 4px; }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content>
      <ion-list lines="none" class="meta">
        <ion-item>
          <ion-label>
            <h2>{{ formatDiaryDate(diary().date) }}</h2>
            <p>{{ diary().location?.label || diary().location?.name1 || diary().customLocationLabel }}</p>
          </ion-label>
          @if (diary().scope === 'day' && hasWeather()) {
            <ion-icon slot="end" src="{{ weatherIcon() | svgIcon }}" />
            <ion-note slot="end">{{ weatherLine() }}</ion-note>
          }
        </ion-item>
        @if (diary().people.length || diary().customPeopleLabels.length) {
          <ion-item>
            <okr-avatar-display [avatars]="diary().people" [showName]="true" />
            @for (label of diary().customPeopleLabels; track label) { <ion-chip color="medium">{{ label }}</ion-chip> }
          </ion-item>
        }
        @if (diary().events.length || diary().places.length) {
          <ion-item>
            @for (e of diary().events; track e) { <ion-chip color="tertiary">{{ e }}</ion-chip> }
            @for (p of diary().places; track p) { <ion-chip>{{ p }}</ion-chip> }
          </ion-item>
        }
      </ion-list>

      <!-- markdown, sanitized by Angular; images are stripped (they live in Drive, decision 6) -->
      <div class="body" [innerHTML]="html().html"></div>

      @if (html().imageCount > 0 && driveUrl()) {
        <ion-item lines="none" button (click)="openDrive()">
          <ion-icon slot="start" src="{{ 'image' | svgIcon }}" />
          <ion-label>{{ html().imageCount }} {{ i18n().images_in_drive() }}</ion-label>
        </ion-item>
      }

      @if (diary().done.length) {
        <ion-list>
          <ion-item lines="none"><ion-label><strong>{{ i18n().view_done_title() }}</strong></ion-label></ion-item>
          @for (item of diary().done; track $index) {
            <ion-item lines="none"><ion-icon slot="start" src="{{ 'checkmark' | svgIcon }}" /><ion-label class="ion-text-wrap">{{ item }}</ion-label></ion-item>
          }
        </ion-list>
      }

      <ion-item lines="none">
        <ion-button slot="end" fill="outline" (click)="edit()">{{ i18n().edit() }}</ion-button>
      </ion-item>
    </ion-content>
  `,
})
export class DiaryViewModal {
  private readonly modalController = inject(ModalController);

  public readonly diary = input.required<DiaryModel>();
  public readonly i18n = input.required<DiaryI18n>();

  protected readonly formatDiaryDate = formatDiaryDate;
  protected readonly title = computed(() => this.diary().title || this.i18n().view_untitled());
  protected readonly html = computed(() => renderDiaryHtml(this.diary().text));
  protected readonly driveUrl = computed(() => driveFolderUrl(this.diary().driveFolderId));
  protected readonly hasWeather = computed(() => hasDiaryWeather(this.diary().weather));
  protected readonly weatherLine = computed(() => diaryWeatherLine(this.diary().weather));
  protected readonly weatherIcon = computed(() => weatherCodeToIcon(this.diary().weather.code));
  protected readonly state = computed(() => diaryStateOf(this.diary()));

  protected async openDrive(): Promise<void> {
    await Browser.open({ url: this.driveUrl() });
  }

  /** Hands over to the editor: the store re-opens this entry in DiaryEditModal on role 'edit'. */
  protected async edit(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'edit');
  }
}
