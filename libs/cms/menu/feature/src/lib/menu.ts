import { Component, computed, effect, forwardRef, inject, input } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonItem, IonItemDivider, IonLabel, IonList } from '@ionic/angular/standalone';

import { MenuItemModel } from '@okr/shared-models';
import { Spinner } from '@okr/shared-ui';
import { debugData, hasRole } from '@okr/shared-util-core';
import { DEFAULT_MENU_ACTION } from '@okr/shared-constants';

import { MultiAvatar } from '@okr/cms-menu-ui';
import { isMenuBlocked, nextVisitedKeys } from '@okr/cms-menu-util';

import { MenuStore } from './menu.store';

@Component({
  selector: 'okr-menu',
  standalone: true,
  imports: [
    forwardRef(() => Menu), Spinner, MultiAvatar,
    IonList, IonItem, IonLabel, IonAccordionGroup, IonAccordion, IonItemDivider
  ],
  styles: [`
      ion-icon { color: var(--ion-color-dark); }
    @media (prefers-color-scheme: dark) {
      ion-icon { color: var(--ion-color-white); }
    }
    ::ng-deep ion-accordion ion-icon[slot="start"] { margin-inline-end: 8px; }
    ion-item-divider.separator { min-height: 2px; --padding-start: 0; --inner-padding-end: 0;
      --background: var(--ion-color-step-150, #d7d8da); }
    `],
  providers: [MenuStore],
  template: `
    @if(menuStore.isMenuLoading()) {
      <okr-spinner />
    } @else {
      @if (isVisible()) {
        @if(menuItem(); as menuItem) {
          @switch(action()) {
            @case('navigate') {
              <okr-multi-avatar [icon]="icon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
            @case('browse') {
              <okr-multi-avatar [icon]="icon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
            @case('sub') {
              <ion-accordion-group>
                <ion-accordion [value]="menuItem.name" toggle-icon-slot="start" >
                  <ion-item slot="header" color="primary">
                    <ion-label>{{ menuStore.translatedMenuLabel() }}</ion-label>
                  </ion-item>
                  <div slot="content">
                    @for(menuItemName of menuItem.menuItems; track menuItemName) {
                      @if(isBlocked(menuItemName)) {
                        @if(isAdmin()) {
                          <ion-item color="warning"><ion-label>↻ circular reference to {{ menuItemName }}</ion-label></ion-item>
                        }
                      } @else {
                        <okr-menu [menuName]="menuItemName" [forceVisible]="forceVisible()" [excludeNames]="excludeNames()" [toggleStates]="toggleStates()" [inputDepth]="childDepth()" [inputVisitedKeys]="childVisitedKeys()" />
                      }
                    }
                  </div>
                </ion-accordion>
              </ion-accordion-group>
            }
            @case('divider') {
              @if(menuItem.label) {
                <ion-item-divider color="light">
                  <ion-label>{{ menuStore.translatedMenuLabel() }}</ion-label>
                </ion-item-divider>
              } @else {
                <!-- no caption: a hairline separator, not a section header -->
                <ion-item-divider class="separator" />
              }
            }
            @case('main') {
              <ion-list>
                @for(menuItemName of menuItem.menuItems; track menuItemName) {
                  @if(isBlocked(menuItemName)) {
                    @if(isAdmin()) {
                      <ion-item color="warning"><ion-label>↻ circular reference to {{ menuItemName }}</ion-label></ion-item>
                    }
                  } @else {
                    <okr-menu [menuName]="menuItemName" [excludeNames]="excludeNames()" [toggleStates]="toggleStates()" [inputDepth]="childDepth()" [inputVisitedKeys]="childVisitedKeys()" />
                  }
                }
              </ion-list>
            }
            @case('context') {
              <ion-list>
                @for(menuItemName of menuItem.menuItems; track menuItemName) {
                  @if(isBlocked(menuItemName)) {
                    @if(isAdmin()) {
                      <ion-item color="warning"><ion-label>↻ circular reference to {{ menuItemName }}</ion-label></ion-item>
                    }
                  } @else {
                    <!-- forceVisible must reach the entries too: a caller that forces the menu open
                         (group admin, personal calendar) otherwise gets an empty list -->
                    <okr-menu [menuName]="menuItemName" [forceVisible]="forceVisible()" [excludeNames]="excludeNames()" [toggleStates]="toggleStates()" [inputDepth]="childDepth()" [inputVisitedKeys]="childVisitedKeys()" />
                  }
                }
              </ion-list>
            }
            @case('call') {
              <okr-multi-avatar [icon]="icon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" [safariWorkaround]="safariWorkaround()"/>
            }
            @case('workflow') {
              <!-- renders exactly like 'call'; selecting it also fires the ui.menuCalled workflow
                   event (spec 2026-08-29 §3). NB this @switch has no @default: an action with no
                   case here renders NOTHING, with no error anywhere — a fourth way for a row to
                   go missing, on top of the three gates in the menu skill. -->
              <okr-multi-avatar [icon]="icon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" [safariWorkaround]="safariWorkaround()"/>
            }
            @case('toggle') {
              <!-- icon/label reflect the current toggle state (from toggleStates); selecting flips it via the host feature -->
              <okr-multi-avatar [icon]="effectiveIcon()" [label]="menuStore.translatedMenuLabel()" [badge]="notificationCount()" (click)="select(menuItem)" />
            }
          }
        } @else {
          <ion-item color="warning">
            <ion-label>Missing: {{ menuName() }}</ion-label>
          </ion-item>
        }
      }
    }
  `
})
export class Menu {
  protected readonly menuStore = inject(MenuStore);

  // inputs
  public menuName = input.required<string>();
  /** Shows this menu AND all its entries, ignoring their roleNeeded (group admins: they hold no tenant role). */
  public forceVisible = input(false);
  /** Shows this menu only — entries keep their own roleNeeded gate (personal calendar: 'add' yes, 'schedule' no). */
  public forceVisibleSelf = input(false);
  public excludeNames = input<string[]>([]);
  /** Nesting depth of this menu (0 at the root). */
  public inputDepth = input(0);
  /** Names already rendered on the current path, used to break circular references. */
  public inputVisitedKeys = input<ReadonlySet<string>>(new Set<string>());
  /** Current state of any 'toggle' action items, keyed by their url (e.g. { toggleFilter: true }). */
  public toggleStates = input<Record<string, boolean>>({});

  // derived signals
  protected safariWorkaround = computed(() => this.menuName() === 'files-add');
  protected menuItem = computed(() => this.menuStore.menu());
  private currentUser = computed(() => this.menuStore.currentUser());

  // circular-reference / depth protection
  protected readonly childDepth = computed(() => this.inputDepth() + 1);
  protected readonly childVisitedKeys = computed(() => nextVisitedKeys(this.inputVisitedKeys(), this.menuName()));
  protected readonly isAdmin = computed(() => hasRole('admin', this.currentUser()));
  protected roleNeeded = computed(() => this.menuItem()?.roleNeeded);
  protected action = computed(() => this.menuItem()?.action ?? DEFAULT_MENU_ACTION);
  protected icon = computed(() => this.menuItem()?.icon ?? 'help-circle');
  // toggle items: whether this item's toggled state is active, and the icon reflecting it
  protected readonly toggleActive = computed(() => this.toggleStates()[this.menuItem()?.url ?? ''] ?? false);
  protected readonly effectiveIcon = computed(() =>
    this.toggleActive() ? (this.menuItem()?.iconAlt ?? this.icon()) : this.icon()
  );
  protected readonly isVisible = computed(() => {
    const name = this.menuItem()?.name;
    if (name && this.excludeNames().includes(name)) return false;
    return this.forceVisible() || this.forceVisibleSelf() || hasRole(this.roleNeeded(), this.currentUser());
  });
  protected readonly notificationCount = computed(() => this.menuStore.notificationCount());

  constructor() {
    effect(() => {
      this.currentUser();
      this.menuStore.setMenuName(this.menuName());
    });
    // keep the store's toggle state in sync so translatedMenuLabel can pick label vs labelAlt
    effect(() => {
      this.menuStore.setToggleActive(this.toggleActive());
    });
    // Warn (admins/debug) when a child would create a cycle, naming the offending key.
    effect(() => {
      const children = this.menuItem()?.menuItems ?? [];
      for (const child of children) {
        if (this.inputVisitedKeys().has(child)) {
          debugData(`Menu.cycle: circular reference to '${child}' under '${this.menuName()}'`, { path: [...this.inputVisitedKeys()] }, this.currentUser());
        }
      }
    });
  }

  /** Whether a child menu must render as a placeholder (cycle or depth cap reached). */
  protected isBlocked(childName: string): boolean {
    return isMenuBlocked(this.inputVisitedKeys(), childName, this.inputDepth());
  }

  protected async select(menuItem: MenuItemModel) {
    this.menuStore.select(menuItem);
  }
}
