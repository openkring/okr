import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { navigateByUrl } from '@bk2/shared/util-angular';
import { IonButtons, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ButtonComponent } from './button.component';

@Component({
  selector: 'bk-footer',
  imports: [
    ButtonComponent,
    IonToolbar, IonButtons, IonTitle
  ],
  styles: [`
    ion-toolbar { height: 80px;
      @media (max-width: 700px) { font-size: 0.5em; }
      @media (max-height: 700px) { display: none; }
    }
    ion-grid { background-color: var(--ion-color-secondary);}
  .ion-button {
    background-color: var(--ion-color-secondary);
    margin-top: 0px;
    margin-bottom: 0px;
  }

  .icon-label { font-size: 0.8em;
    @media (max-width: 700px) {
      font-size: 0.7em;
    }
    @media (max-width: 500px) {
      display: none;
    }
  }
  `],
  template: `
  @if(showFooter()) {
  <ion-toolbar color="secondary">
    @if(isMobile()) {
      <ion-buttons slot="start">
        @if (twitterUrl()) {
          <bk-button iconName="twitter" fill="clear" size="small" (click)="callTwitter()" />
        }
        @if (emailUrl()) {
          <bk-button iconName="send" fill="clear" size="small" (click)="callEmail()" />
        }
      </ion-buttons>
      <ion-title>&copy; 2023/<a href="{{ authorUrl() }}">{{author()}}</a></ion-title>
    } @else {
      <ion-buttons>
        @if (twitterUrl()) {
          <bk-button label="@ui.twitter" iconName="twitter" fill="clear" size="small" (click)="callTwitter()" />
        }
        @if (emailUrl()) {
          <bk-button label="@ui.email" iconName="send" fill="clear" size="small" (click)="callEmail()" />
        }
      </ion-buttons>
      <ion-title>&copy; 2024/<a href="{{ authorUrl() }}">{{author()}}</a></ion-title>
    }
  </ion-toolbar>  
}
  `
})
export class FooterComponent {
  public router = inject(Router);
  public showFooter = input(false);
  public isMobile = input(false);
  public twitterUrl = input('');
  public emailUrl = input('');
  public author = input('bkaiser.com');
  public authorUrl = input('https://bkaiser.com');

  public callTwitter(): void {
    navigateByUrl(this.router, this.twitterUrl());
  }

  public callEmail(): void {
    navigateByUrl(this.router, this.emailUrl())
  }
}
