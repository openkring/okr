import { Component, effect, inject, input } from '@angular/core';

import { MenuStore } from './menu.store';

/**
 * The label of one bar row. `translatedMenuLabel` is a per-store signal, so each row gets its own
 * `MenuStore`, exactly as `Menu` does. It is a component of its own, and not part of `MenuBar`,
 * so that the segment button stays a direct child of its `ion-segment`.
 */
@Component({
  selector: 'okr-menu-bar-label',
  providers: [MenuStore],
  template: `{{ menuStore.translatedMenuLabel() }}`,
})
export class MenuBarLabel {
  protected readonly menuStore = inject(MenuStore);

  /** The `name` of the menu row. */
  public readonly name = input.required<string>();

  constructor() {
    effect(() => this.menuStore.setMenuName(this.name()));
  }
}
