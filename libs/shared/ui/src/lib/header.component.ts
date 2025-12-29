import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonButton, IonButtons, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { AppNavigationService } from '@bk2/shared-util-angular';
import { coerceBoolean } from '@bk2/shared-util-core';

import { SearchbarComponent } from './searchbar.component';

@Component({
  selector: 'bk-header',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonIcon, IonButton,
    SearchbarComponent
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        @if(!isModalDialog()) {
          <ion-buttons slot="start">
            <ion-menu-button />
          </ion-buttons>
        }
        <ion-title>{{ title() | translate | async }}</ion-title>
        @if(isRootPage() === false) {
          <ion-buttons slot="end">
            @if(shouldShowCloseButton()) {
              <ion-button (click)="back()">
                <ion-icon slot="icon-only" src="{{'close_cancel_circle' | svgIcon }}" />
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
          <bk-searchbar (ionInput)="onSearchTermChange($event)" placeholder="{{ placeholder() | translate | async }}" />
        </ion-toolbar>
      }
    </ion-header>
  `,
  styles: [`
    .back-button-text { display: none; }
    ion-button { background-color: primary !important; }
  `]
})
export class HeaderComponent {
  private readonly appNavigationService = inject(AppNavigationService);
  private readonly modalController = inject(ModalController, { optional: true });

  // inputs
  public searchTerm = model(''); // search term for the search bar
  public title = input.required<string>();
  public isModal = input(false);
  public isRoot = input(false);
  public isSearchable = input(false);
  public showOkButton = input(false);
  public showCloseButton = input(true);
  public placeholder = input('@general.operation.search.placeholder');

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
