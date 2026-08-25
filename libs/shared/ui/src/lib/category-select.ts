import { Component, computed, inject, input, model } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPopover } from '@ionic/angular/standalone';
import { switchMap } from 'rxjs/operators';

import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean, getItemLabel } from '@okr/shared-util-core';

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
 *  <okr-cat-select selectedItemName="all" [category]="cat" [withAll]="true" (changed)="onChange($event)" />
 */
@Component({
  selector: 'okr-cat-select',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    IonItem, IonNote, IonButton, IonPopover, IonContent, IonList, IonIcon, IonLabel
  ],
  styles: [`
    .helper { --color: var(--ion-color-medium);}
    .popover.active { opacity: 1;}
    /* fieldStyle: the select reads like the neighbouring inputs — small label above the value,
       chevron at the far right — instead of a bare clear button. */
    .field-row { --min-height: 48px; cursor: pointer; }
    .field-row .field-label { display: block; font-size: 12px; color: var(--ion-color-medium); }
    .field-row .field-value { display: block; font-size: 16px; }
  `],
  template: `
  @if(!isReadOnly() && isFieldStyle()) {
    <ion-item class="field-row" lines="none" button="true" [detail]="false" id="{{popoverId}}">
      @if(showIcons() && selectedItem().icon.length > 0) {
        <ion-icon slot="start" src="{{ selectedItem().icon | svgIcon }}" />
      }
      <ion-label>
        @if(label().length > 0) {
          <span class="field-label">{{ label() }}</span>
        }
        <span class="field-value">{{ itemLabel(selectedItem()) | translate | async }}</span>
      </ion-label>
      <ion-icon slot="end" src="{{ 'chevron-expand' | svgIcon }}" />
    </ion-item>
  } @else if(!isReadOnly()) {
    <ion-button fill="clear" id="{{popoverId}}">
      @if(showIcons() && selectedItem().icon.length > 0) {
        <ion-icon slot="start" src="{{ selectedItem().icon | svgIcon }}" />
      }
      {{ itemLabel(selectedItem()) | translate | async }}
      <ion-icon slot="end" src="{{ 'chevron-expand' | svgIcon }}" />
    </ion-button>
  } @else {
    <ion-item lines="none">
      @if(showIcons() && selectedItem().icon.length > 0) {
        <ion-icon slot="start" src="{{ selectedItem().icon | svgIcon }}" />
      }
      <ion-label>{{ itemLabel(selectedItem()) | translate | async }}</ion-label>
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
              <ion-label class="ion-text-wrap">{{ itemLabel(item) | translate | async }}</ion-label>
            </ion-item>
            }
          </ion-list>
        </ion-content>
      </ng-template>
    </ion-popover>
  }
  @if(shouldShowHelper()) {
    <ion-item lines="none">
      <ion-note>{{helper() | translate | async }}</ion-note>
    </ion-item>
  }
  `
})
export class CategorySelect {
  // inputs
  public selectedItemName = model.required<string>(); // mandatory view model
  public category = input.required<CategoryListModel>(); // mandatory view model
  public withAll = input(false); // if true, the first item in the list is 'All' and the user can select it. This is useful for filtering.
  protected showWithAll = computed(() => coerceBoolean(this.withAll()));
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public showIcons = input(true);
  /**
   * true: render the select as a form field row (label above the value, chevron right) so it
   * lines up with the text/date inputs around it. Opt-in — the default stays the clear button.
   */
  public fieldStyle = input(false);
  protected isFieldStyle = computed(() => coerceBoolean(this.fieldStyle()));
  /** the field label shown above the value (fieldStyle only); empty renders the value alone. */
  public label = input('');
  protected shouldShowIcons = computed(() => coerceBoolean(this.showIcons()));

  protected name = computed(() => this.category().name);
  protected helper = computed(() => `${this.category().i18n}.${this.name()}.helper`);
  protected hovered = '';

  protected items = computed(() => {
    if (this.withAll()) {
      const _item = new CategoryItemModel('all', 'radio-button-on');
      return [_item, ...this.category().items];
    }
    return this.category().items;
  });

  protected popoverId = `select-cat-${id++}`;
  // a missing/unloaded category yields an empty item list (AppStore.getCategory degrades to an
  // empty CategoryListModel) — fall back to the stored name so the control renders instead of crashing
  protected selectedItem = computed(() => this.items().find(item => item.name === this.selectedItemName())
    ?? this.items()[0] ?? new CategoryItemModel(this.selectedItemName() ?? '', ''));

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

  /** Adapts (item) → the shared getItemLabel(category, itemName); the single source of truth for the key. */
  protected itemLabel(item: CategoryItemModel): string {
    return getItemLabel(this.category(), item.name);
  }
}
