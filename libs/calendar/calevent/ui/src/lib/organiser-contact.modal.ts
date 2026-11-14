import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, ModalController } from '@ionic/angular';

import { AvatarInfo } from '@okr/shared-models';
import { FullNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { AvatarDisplay } from '@okr/avatar-ui';
import { CaleventI18n } from '@okr/calendar-calevent-util';

export type OrganiserContactAction = 'view' | 'call' | 'email' | 'chat';

export type OrganiserContactResult = {
  action: OrganiserContactAction;
  organiser: AvatarInfo;
};

/**
 * "Organisierende Person …" from the calevent ActionSheet: pick WHO to contact and HOW, in one
 * step. It replaces two chained ActionSheets (how → who), which offered call/email whenever ANY
 * organiser had a number and then asked for the person afterwards — so picking the wrong one
 * silently did nothing.
 *
 * Dumb by design: it resolves nothing and calls nothing. The caller passes the organisers plus
 * their phone/email lookups and executes the returned {action, organiser}, which keeps the
 * navigation/chat/directory dependencies in the feature lib.
 */
@Component({
  selector: 'okr-organiser-contact-modal',
  standalone: true,
  imports: [
    AvatarDisplay, SvgIconPipe, FullNamePipe, Header, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonSelect, IonSelectOption,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().organiser_title() }" [isModal]="true" />

    <ion-content>
      <!-- the selected organiser (avatar + name) — formerly in the title bar -->
      @if(selected(); as organiser) {
        <ion-item lines="full">
          <okr-avatar-display [avatars]="[organiser]" [showName]="true" />
        </ion-item>
      }
      @if(hasChoice()) {
        <ion-item lines="full">
          <ion-select [value]="selectedKey()" (ionChange)="selectedKey.set($event.detail.value)"
            [label]="i18n().organiser_select()" labelPlacement="stacked" interface="popover">
            @for(organiser of organisers(); track organiser.key) {
              <ion-select-option [value]="organiser.key">{{ organiser.name1 | fullName:organiser.name2 }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      }

      <ion-list lines="inset">
        <ion-item button (click)="choose('view')">
          <ion-icon slot="start" src="{{ 'eye-on' | svgIcon }}" />
          <ion-label>{{ i18n().organiser_view() }}</ion-label>
        </ion-item>
        @if(hasPhone()) {
          <ion-item button (click)="choose('call')">
            <ion-icon slot="start" src="{{ 'tel' | svgIcon }}" />
            <ion-label>{{ i18n().organiser_call() }}</ion-label>
          </ion-item>
        }
        @if(hasEmail()) {
          <ion-item button (click)="choose('email')">
            <ion-icon slot="start" src="{{ 'email' | svgIcon }}" />
            <ion-label>{{ i18n().organiser_email() }}</ion-label>
          </ion-item>
        }
        <ion-item button (click)="choose('chat')">
          <ion-icon slot="start" src="{{ 'chatbubbles' | svgIcon }}" />
          <ion-label>{{ i18n().organiser_chat() }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `
})
export class OrganiserContactModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public organisers = input.required<AvatarInfo[]>();
  public i18n = input.required<CaleventI18n>();
  /** person key -> phone number / email address; an absent entry hides that action. */
  public phones = input<Record<string, string>>({});
  public emails = input<Record<string, string>>({});

  // state — defaults to the first organiser
  protected selectedKey = linkedSignal(() => this.organisers()[0]?.key ?? '');

  // computed
  protected selected = computed(() => this.organisers().find(o => o.key === this.selectedKey()) ?? this.organisers()[0]);
  protected hasChoice = computed(() => this.organisers().length > 1);
  protected hasPhone = computed(() => (this.phones()[this.selectedKey()] ?? '').length > 0);
  protected hasEmail = computed(() => (this.emails()[this.selectedKey()] ?? '').length > 0);

  protected choose(action: OrganiserContactAction): Promise<boolean> {
    const organiser = this.selected();
    if (!organiser) return dismissOverlay(this.modalController, undefined, 'cancel');
    return dismissOverlay(this.modalController, { action, organiser } as OrganiserContactResult, 'confirm');
  }
}
