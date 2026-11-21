import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular';

import { NewsletterSubscriptionModel } from '@okr/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ImgDirective, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';

import { AvatarPipe } from '@okr/avatar-ui';

import { NewsletterStore } from './newsletter.store';

/**
 * The subscribers of one newsletter group (spec 1.169 §5.8), at `/group/:groupKey/subscribers`.
 * Visible to member admins, privileged users and the newsletter's own admins — the same circle the
 * `newsletterSubscriptions` read rule lets through. Per row: «Abmelden»; in the header: the Versand.
 */
@Component({
  selector: 'okr-newsletter-subscriber-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe, AvatarPipe, ImgDirective,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonAvatar, IonChip,
  ],
  providers: [NewsletterStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.subscribers() }} {{ groupName() }}</ion-title>
        @if (canSendVersand() || store.canImport()) {
          <ion-buttons slot="end">
            @if (store.canImport()) {
              <ion-button (click)="store.openImport()" [title]="store.i18n.import()">
                <ion-icon slot="icon-only" src="{{ 'upload' | svgIcon }}" />
              </ion-button>
            }
            @if (canSendVersand()) {
              <ion-button (click)="store.openVersand()" [title]="store.i18n.versand()">
                <ion-icon slot="icon-only" src="{{ 'send' | svgIcon }}" />
              </ion-button>
            }
          </ion-buttons>
        }
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" [mdSize]="6" />
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (!store.group()) {
        <okr-empty-list [message]="store.i18n.not_found()" />
      } @else if (!store.canSee()) {
        <okr-empty-list [message]="store.i18n.not_allowed()" />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (subscription of filtered(); track subscription.okey) {
            <ion-item button [detail]="false" (click)="showActions(subscription)">
              <ion-avatar slot="start">
                <img okrImg src="{{ 'person.' + subscription.personKey | avatar:'person' }}" alt="Avatar" />
              </ion-avatar>
              <ion-label>
                <h2>{{ subscription.personName }}</h2>
                @if (subscription.dateOfEntry) {
                  <p>{{ store.i18n.since() }} {{ subscription.dateOfEntry | prettyDate }}</p>
                }
              </ion-label>
              <ion-chip slot="end" color="medium" class="ion-hide-sm-down">{{ sourceLabel(subscription) }}</ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class NewsletterSubscriberList {
  protected readonly store = inject(NewsletterStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // inputs (route)
  public readonly groupKey = input.required<string>();

  // derived
  protected readonly count = computed(() => this.store.activeCount());
  protected readonly filtered = computed(() => this.store.filteredSubscribers());
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly groupName = computed(() => this.store.group()?.name ?? '');
  protected readonly canSendVersand = computed(() => this.store.canSee() && this.count() > 0);

  constructor() {
    effect(() => this.store.setGroupKey(this.groupKey()));
  }

  protected sourceLabel(subscription: NewsletterSubscriptionModel): string {
    switch (subscription.source) {
      case 'form': return this.store.i18n.source_form();
      case 'import': return this.store.i18n.source_import();
      default: return this.store.i18n.source_app();
    }
  }

  /******************************** per-item actions ******************************************* */
  protected async showActions(subscription: NewsletterSubscriptionModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options);
    await this.executeActions(options, subscription);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    if (this.store.canSee()) {
      options.buttons.push(createActionSheetButton('newsletter.unsubscribe', this.store.i18n.unsubscribe(), this.imgixBaseUrl, 'stop-circle'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];
  }

  private async executeActions(options: ActionSheetOptions, subscription: NewsletterSubscriptionModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'newsletter.unsubscribe':
        await this.store.endSubscription(subscription.okey);
        break;
    }
  }
}
