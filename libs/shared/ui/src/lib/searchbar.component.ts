import { Component, OnInit, input, viewChild } from '@angular/core';
import { IonSearchbar } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-searchbar',
  standalone: true,
  imports: [
    IonSearchbar
  ],
  template: `
      <ion-searchbar  #bksearch
          type="search" 
          inputmode="search"
          [disabled]="disabled()"
          [debounce]="debounce()"
          [placeholder]="placeholder()"
          [value]="searchTerm()">
      </ion-searchbar>
  `
})
export class SearchbarComponent implements OnInit {
  public searchTerm = input('');
  public placeholder = input('');
  public disabled = input(false);
  public debounce = input(500);
  protected bkSearch = viewChild<IonSearchbar>('bksearch');

  // fires ionInput event for every change of the value
  // fires ionChange event when the value has been committed by the user, i.e. element loses focus or the 'enter' key is pressed.

  /**
   * sets focus into the search input field
   * see https://stackoverflow.com/questions/45786205/how-to-focus-ion-searchbar-on-button-click#45786266
   */
  ngOnInit() {
    setTimeout(() => {
      if (this.bkSearch()) this.bkSearch()?.setFocus();
    }, 500);
  }
}
