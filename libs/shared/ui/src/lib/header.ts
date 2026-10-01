import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonButton, IonButtons, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { AppNavigationService, dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { Searchbar } from './searchbar';
import { TranslatePipe } from '@okr/shared-i18n';
import { AsyncPipe } from '@angular/common';

export interface HeaderI18n {
  title: string;
  /** optional: replaces `title` on small screens (width <= 600px), e.g. 'Einladen' for 'Personen einladen'. */
  shortTitle?: string;
  placeholder?: string;
}

@Component({
  selector: 'okr-header',
  standalone: true,
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonIcon, IonButton,
    Searchbar
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary" [style.--okr-title-inset.px]="titleInset()">
        @if(!isModalDialog()) {
          <ion-buttons slot="start">
            <ion-menu-button />
          </ion-buttons>
        }
        @if(i18n().shortTitle; as shortTitle) {
          <ion-title>
            <span class="title-long">{{ i18n().title }}</span>
            <span class="title-short">{{ shortTitle }}</span>
          </ion-title>
        } @else {
          <ion-title>{{ i18n().title }}</ion-title>
        }
        @if(isRootPage() === false) {
          <ion-buttons slot="end">
            <!-- optional page/modal action, rendered LEFT of the close button; the task modal
                 uses it as the 'advanced settings' toggle. -->
            @if(actionIcon()) {
              <ion-button (click)="actionClicked.emit()" title="{{ actionTitle() }}">
                <ion-icon slot="icon-only" src="{{ actionIcon() | svgIcon }}" />
              </ion-button>
            }
            @if(shouldShowCloseButton()) {
              <ion-button (click)="back()">
                <ion-icon slot="icon-only" src="{{'cancel' | svgIcon }}" />
              </ion-button>
            }
            @if(shouldShowOkButton()) {
              <ion-button (click)="okClicked.emit()">
                <ion-icon slot="icon-only" src="{{'checkbox-circle' | svgIcon }}" />
              </ion-button>
            }
          </ion-buttons>
        }
      </ion-toolbar>
      @if(isSearchablePage()) {
        <ion-toolbar color="light">
          <okr-searchbar (ionInput)="onSearchTermChange($event)" placeholder="{{ i18n().placeholder ?? ('@search.placeholder' | translate | async) }}" />
        </ion-toolbar>
      }
    </ion-header>
  `,
  styles: [`
    .back-button-text { display: none; }
    .title-short { display: none; }
    /* iOS centres the title absolutely and reserves 90px on BOTH sides for buttons — in a narrow
       modal that cut 'Person wählen' to 'Person wä…'. Reserve only what the buttons need. */
    :host-context(.ios) ion-title {
      padding-inline-start: var(--okr-title-inset, 90px);
      padding-inline-end: var(--okr-title-inset, 90px);
    }
    @media (width <= 600px) {
      .title-long { display: none; }
      .title-short { display: inline; }
    }
    ion-button { background-color: primary !important; }
  `]
})
export class Header {
  private readonly appNavigationService = inject(AppNavigationService);
  private readonly modalController = inject(ModalController, { optional: true });

  // inputs
  public searchTerm = model(''); // search term for the search bar
  public i18n = input.required<HeaderI18n>();
  public isModal = input(false);
  public isRoot = input(false);
  public isSearchable = input(false);
  public showOkButton = input(false);
  public showCloseButton = input(true);
  public actionIcon = input('');        // '' hides the action button
  public actionTitle = input('');       // tooltip of the action button

  // coerced boolean inputs
  protected isModalDialog = computed(() => coerceBoolean(this.isModal()));
  protected isRootPage = computed(() => coerceBoolean(this.isRoot()));
  protected isSearchablePage = computed(() => coerceBoolean(this.isSearchable()));
  protected shouldShowOkButton = computed(() => coerceBoolean(this.showOkButton()));
  protected shouldShowCloseButton = computed(() => coerceBoolean(this.showCloseButton()));

  /**
   * Room the centred iOS title must keep free on each side: the wider of the two button groups
   * (a toolbar icon button is ~48px), plus a small gap. The title is centred, so both sides get it.
   */
  protected titleInset = computed(() => {
    const start = this.isModalDialog() ? 0 : 1;
    const end = this.isRootPage() ? 0
      : (this.actionIcon() ? 1 : 0) + (this.shouldShowCloseButton() ? 1 : 0) + (this.shouldShowOkButton() ? 1 : 0);
    return Math.max(start, end) * 48 + 8;
  });

  // outputs
  public okClicked = output();
  public actionClicked = output();

  public back(): void {
    if (this.isModal()) {
      // The modal may already be closing (double tap, backdrop dismiss); dismissOverlay keeps
      // Ionic's 'overlay does not exist' rejection from escaping unhandled (SCS-5G).
      void dismissOverlay(this.modalController, null, 'cancel');
    } else {
      this.appNavigationService.back();
    }
  }

  protected onSearchTermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value);
  }
}
