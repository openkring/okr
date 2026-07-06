import { Component, inject, input, output, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonIcon, IonItem, IonLabel, IonList,
  IonPopover, IonSpinner, IonText, IonTitle, IonToolbar, IonFooter, IonNote
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { PersonDirectoryService } from '@okr/subject-person-data-access';
import { PersonDirectoryResult } from '@okr/subject-person-util';

@Component({
  selector: 'okr-person-lookup',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonButton, IonButtons, IonIcon, IonSpinner, IonPopover, IonToolbar, IonTitle,
    IonList, IonItem, IonLabel, IonText, IonFooter, IonNote,
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
          <ion-title>{{ i18n().title }}</ion-title>
          <ion-buttons slot="end">
            <ion-button (click)="isPopoverOpen.set(false)">
              <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
        @if (error()) {
          <ion-item><ion-text color="danger">{{ error() }}</ion-text></ion-item>
        }
        <ion-list>
          @for (result of results(); track $index) {
            <ion-item button="true" detail="false" (click)="onSelect(result)">
              <ion-label>
                <h3>{{ result.firstName }} {{ result.lastName }}</h3>
                <p>{{ result.streetName }} {{ result.streetNumber }}, {{ result.zipCode }} {{ result.city }} · {{ result.phone }}</p>
              </ion-label>
            </ion-item>
          } @empty {
            @if (!error()) {
              <ion-item><ion-label>{{ i18n().empty }}</ion-label></ion-item>
            }
          }
        </ion-list>
        <ion-footer>
          <ion-note class="ion-padding-horizontal"><small>{{ i18n().attribution }}</small></ion-note>
        </ion-footer>
      </ng-template>
    </ion-popover>
  `
})
export class PersonLookup {
  private readonly directoryService = inject(PersonDirectoryService);

  public firstName = input('');
  public lastName = input('');
  public location = input('');
  public i18n = input.required<{ title: string; empty: string; error: string; attribution: string }>();
  public detailsLoaded = output<PersonDirectoryResult>();

  protected results = signal<PersonDirectoryResult[]>([]);
  protected isLoading = signal(false);
  protected isPopoverOpen = signal(false);
  protected error = signal('');

  protected async onSearch(): Promise<void> {
    const first = this.firstName().trim();
    const last = this.lastName().trim();
    if (!first && !last) return;

    this.isLoading.set(true);
    this.error.set('');
    this.results.set([]);
    try {
      const results = await this.directoryService.searchPerson(first, last, this.location().trim());
      this.results.set(results);
      this.isPopoverOpen.set(true);
    } catch {
      this.error.set(this.i18n().error);
      this.isPopoverOpen.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected onSelect(result: PersonDirectoryResult): void {
    this.isPopoverOpen.set(false);
    this.detailsLoaded.emit(result);
  }
}
