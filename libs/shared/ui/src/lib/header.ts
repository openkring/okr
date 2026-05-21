import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonButton, IonButtons, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { AppNavigationService } from '@bk2/shared-util-angular';
import { coerceBoolean } from '@bk2/shared-util-core';

import { Searchbar } from './searchbar';

export interface HeaderI18n {
  title: string;
  placeholder?: string;
}

@Component({
  selector: 'bk-header',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonIcon, IonButton,
    Searchbar
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        @if(!isModalDialog()) {
          <ion-buttons slot="start">
            <ion-menu-button />
          </ion-buttons>
        }
        <ion-title>{{ i18n().title }}</ion-title>
        @if(isRootPage() === false) {
          <ion-buttons slot="end">
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
        <ion-toolbar>
          <bk-searchbar (ionInput)="onSearchTermChange($event)" placeholder="{{ i18n().placeholder ?? '@general.operation.search.placeholder' }}" />
        </ion-toolbar>
      }
    </ion-header>
  `,
  styles: [`
    .back-button-text { display: none; }
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

  // coerced boolean inputs
  protected isModalDialog = computed(() => coerceBoolean(this.isModal()));
  protected isRootPage = computed(() => coerceBoolean(this.isRoot()));
  protected isSearchablePage = computed(() => coerceBoolean(this.isSearchable()));
  protected shouldShowOkButton = computed(() => coerceBoolean(this.showOkButton()));
  protected shouldShowCloseButton = computed(() => coerceBoolean(this.showCloseButton()));

  // outputs
  public okClicked = output();

  public back(): void {
    if (this.isModal()) {
      this.modalController?.dismiss(null, 'cancel');
    } else {
      this.appNavigationService.back();
    }
  }

  protected onSearchTermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value);
  }
}
