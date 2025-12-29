import { Component, model } from '@angular/core';
import { IonCol, IonGrid, IonRow, IonToolbar } from '@ionic/angular/standalone';

import { SearchbarComponent } from './searchbar.component';

@Component({
  selector: 'bk-search-toolbar',
  standalone: true,
  imports: [
    SearchbarComponent, 
    IonToolbar, IonGrid, IonRow, IonCol
  ],
  template: `
    <ion-toolbar>
      <ion-grid>
        <ion-row class="ion-align-items-center">
          <ion-col class="ion-no-padding" size="12">
            <bk-searchbar [searchTerm]="searchTerm()" (ionInput)="onSearchTermChange($event)" />
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  `
})
export class SearchToolbarComponent {
  // inputs
  public searchTerm = model('');

  protected onSearchTermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value);
  }
}
