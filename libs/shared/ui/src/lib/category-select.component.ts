import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPopover } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean, getItemLabel } from '@bk2/shared-util-core';

// unique id to avoid duplicated IDs in reusable component
let id = 0;

/**
 * A category consists of some metadata and a list of items.
 * The metadata is used to describe the category.
 * The items are the selectable labels that are shown in the UI
 * This component presents a dropdown of the category and lets the user select one of the items (if readOnly is false).
 * If input variable withAll is set to true, the first item in the list is 'All' and the user can select it. This is useful for filtering.
 * The selected category is shown as a ready-only text if the `readOnly` input is true. Default is false.
 * 
 * Usage example:
 *  typically, the CategoryListModel is first read from the database. -> cat
 *  <bk-cat-select selectedItemName="all" [category]="cat" [withAll]="true" (changed)="onChange($event)" />
 */
@Component({
  selector: 'bk-cat-select',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonItem, IonNote, IonButton, IonPopover, IonContent, IonList, IonIcon, IonLabel
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`
    .helper { --color: var(--ion-color-medium);}
    .popover.active { opacity: 1;}
  `],
  template: `
  @if(!isReadOnly()) {
    <ion-button fill="clear" id="{{popoverId}}">
      @if(showIcons() && selectedItem().icon.length > 0) {
        <ion-icon slot="start" src="{{ selectedItem().icon | svgIcon }}" />
      }
      {{ getItemLabel(selectedItem()) | translate | async}}
      <ion-icon slot="end" src="{{ 'chevron-expand' | svgIcon }}" />
    </ion-button>
  } @else {
    <ion-item lines="none">
      @if(showIcons() && selectedItem().icon.length > 0) {
        <ion-icon slot="start" src="{{ selectedItem().icon | svgIcon }}" />
      }
      <ion-label>{{ getItemLabel(selectedItem()) | translate | async}}</ion-label>
    </ion-item>
  }
  @if(!isReadOnly()) {
    <ion-popover trigger="{{popoverId}}" [showBackdrop]=true [dismissOnSelect]=true>
      <ng-template>
        <ion-content>
          <ion-list lines="inset">
            @for(item of items(); track $index) {
              <ion-item button (click)="select(item)"
                [class.active]="selectedItemName() === item.name"
                (mouseenter)="hovered = item.name"
                (mouseleave)="hovered = ''"
                [class.hover]="hovered === item.name"
              >
              @if(shouldShowIcons()) {
                <ion-icon slot="start" src="{{ item.icon| svgIcon }}" />
              }
              <ion-label class="ion-text-wrap">{{ getItemLabel(item) | translate | async }}</ion-label>
            </ion-item>
            }
          </ion-list>
        </ion-content>
      </ng-template>
    </ion-popover>
  }
  @if(shouldShowHelper()) {
    <ion-item lines="none">
      <ion-note>{{helper() | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class CategorySelectComponent {
  // inputs
  public selectedItemName = model.required<string>(); // mandatory view model
  public category = input.required<CategoryListModel>(); // mandatory view model
  public withAll = input(false); // if true, the first item in the list is 'All' and the user can select it. This is useful for filtering.
  protected showWithAll = computed(() => coerceBoolean(this.withAll()));
  public labelName = input('label'); // the name of the label in the i18n file
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public showIcons = input(true);
  protected shouldShowIcons = computed(() => coerceBoolean(this.showIcons()));

  protected name = computed(() => this.category().name); // category name, determines the label
  protected label = computed(() => `@${this.category().i18nBase}.${this.labelName()}`);
  protected helper = computed(() => `@input.${this.name()}.helper`);

  protected hovered = '';

  protected items = computed(() => {
    if (this.withAll()) {
      const _item = new CategoryItemModel('all', 'all', '');
      return [_item, ...this.category().items];
    }
    return this.category().items;
  });

  protected popoverId = `select-cat-${id++}`;
  protected selectedItem = computed(() => this.items().find(item => item.name === this.selectedItemName()) ?? this.items()[0]);

  /**
   * Compare two CategoryItemModels.
   * Return true if they are the same.
   */
  public compareWith(cat1: CategoryItemModel | null, cat2: CategoryItemModel | null): boolean {
    return cat1 && cat2 ? cat1.name === cat2.name : cat1 === cat2;
  }

  public select(item: CategoryItemModel): void {
    this.selectedItemName.set(item.name);
  }

  protected getItemLabel(item: CategoryItemModel): string {
    return getItemLabel(this.category(), item.name);
  }
}
