import { AsyncPipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { IonButton, IonButtons, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { AppNavigationService } from '@bk2/shared-util-angular';
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
        @if(!isModal()) {
          <ion-buttons slot="start">
            <ion-menu-button />
          </ion-buttons>
        }
        <ion-title>{{ title() }}</ion-title>
        @if(isRoot() === false) {
          <ion-buttons slot="end">
            @if(showCloseButton()) {
              <ion-button (click)="back()">
                <ion-icon slot="icon-only" src="{{'close_cancel_circle' | svgIcon }}" />
              </ion-button>
            }
            @if(showOkButton()) {
              <ion-button (click)="okClicked.emit()">
                <ion-icon slot="icon-only" src="{{'checkbox-circle' | svgIcon }}" />
              </ion-button>
            }
          </ion-buttons>
        }
      </ion-toolbar>
      @if(isSearchable()) {
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
  public isRoot = input(false);
  public isSearchable = input(false);
  public showOkButton = input(false);
  public showCloseButton = input(true);
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
