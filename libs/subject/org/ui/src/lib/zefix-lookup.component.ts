import { Component, inject, input, output, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonIcon, IonItem, IonLabel, IonList,
  IonPopover, IonSpinner, IonText, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { ZefixCompanyDetails, ZefixSearchResult, ZefixService } from '@bk2/subject-org-data-access';

@Component({
  selector: 'bk-zefix-lookup',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonButton, IonButtons, IonIcon, IonSpinner,
    IonPopover, IonToolbar, IonTitle,
    IonList, IonItem, IonLabel, IonText,
  ],
  template: `
    <ion-button fill="clear" (click)="onSearch()" [disabled]="isLoading()">
      @if (isLoading()) {
        <ion-spinner name="crescent" slot="icon-only" />
      } @else {
        <ion-icon slot="icon-only" src="{{'search' | svgIcon}}" />
      }
    </ion-button>

    <ion-popover [isOpen]="isPopoverOpen()" [showBackdrop]="true" [dismissOnSelect]="false" (didDismiss)="isPopoverOpen.set(false)">
      <ng-template>
        <ion-toolbar color="primary">
          <ion-title>Zefix-Suche</ion-title>
          <ion-buttons slot="end">
            <ion-button (click)="isPopoverOpen.set(false)">
              <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
        @if (error()) {
          <ion-item>
            <ion-text color="danger">{{ error() }}</ion-text>
          </ion-item>
        }
        <ion-list>
          @for (result of results(); track result.uid) {
            <ion-item button="true" detail="false" (click)="onSelect(result)">
              <ion-label>
                <h3>{{ result.name }}</h3>
                <p>{{ result.legalSeat }} &middot; {{ result.uid }}</p>
              </ion-label>
            </ion-item>
          } @empty {
            @if (!error()) {
              <ion-item><ion-label>Keine Treffer gefunden.</ion-label></ion-item>
            }
          }
        </ion-list>
      </ng-template>
    </ion-popover>
  `
})
export class ZefixLookupComponent {
  private readonly zefixService = inject(ZefixService);

  public orgName = input('');
  public detailsLoaded = output<ZefixCompanyDetails>();

  protected results = signal<ZefixSearchResult[]>([]);
  protected isLoading = signal(false);
  protected isPopoverOpen = signal(false);
  protected error = signal('');

  protected async onSearch(): Promise<void> {
    const name = this.orgName().trim();
    if (!name) return;

    this.isLoading.set(true);
    this.error.set('');
    this.results.set([]);

    try {
      const results = await this.zefixService.searchCompany(name);
      this.results.set(results);
      this.isPopoverOpen.set(true);
    } catch {
      this.error.set('Zefix-Suche fehlgeschlagen. Bitte erneut versuchen.');
      this.isPopoverOpen.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async onSelect(result: ZefixSearchResult): Promise<void> {
    this.isPopoverOpen.set(false);
    this.isLoading.set(true);
    this.error.set('');

    try {
      const details = await this.zefixService.getCompanyDetails(result.uid);
      this.detailsLoaded.emit(details);
    } catch {
      this.error.set('Details konnten nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
