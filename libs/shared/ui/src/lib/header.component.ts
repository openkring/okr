import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { IonButton, IonButtons, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { AppNavigationService } from '@bk2/shared-util-angular';
import { SearchbarComponent } from './searchbar.component';
import { coerceBoolean } from 'libs/shared/util-core/src/lib/type.util';

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
        <ion-title>{{ title() }}</ion-title>
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
          <bk-searchbar placeholder="{{ placeholder() | translate | async }}" (ionInput)="onSearchtermChange($event)" />
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
  private readonly modalController = inject(ModalController);
  public title = input.required<string>();
  public isModal = input(false);
  protected isModalDialog = computed(() => coerceBoolean(this.isModal()));
  public isRoot = input(false);
  protected isRootPage = computed(() => coerceBoolean(this.isRoot()));
  public isSearchable = input(false);
  protected isSearchablePage = computed(() => coerceBoolean(this.isSearchable()));
  public showOkButton = input(false);
  protected shouldShowOkButton = computed(() => coerceBoolean(this.showOkButton()));
  public showCloseButton = input(true);
  protected shouldShowCloseButton = computed(() => coerceBoolean(this.showCloseButton()));
  public placeholder = input('@general.operation.search.placeholder');
  public okClicked = output();
  public searchtermChange = output<string>();

  public back(): void {
    if (this.isModal()) {
      this.modalController.dismiss(null, 'cancel');
    } else {
      this.appNavigationService.back();
    }
  }

  protected onSearchtermChange($event: Event): void {
    this.searchtermChange.emit(($event.target as HTMLInputElement).value);
  }
}
