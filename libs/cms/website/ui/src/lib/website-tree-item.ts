import { Component, computed, input, output } from '@angular/core';
import { IonBadge, IonIcon, IonItem, IonLabel, IonReorder } from '@ionic/angular';

import { WebsiteNode } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { WebsiteI18n, WebsiteWarningCode, websiteUrl } from '@okr/cms-website-util';

const WARNING_KEYS: Record<WebsiteWarningCode, keyof WebsiteI18n> = {
  pageMissing: 'warning_page_missing',
  pageArchived: 'warning_page_archived',
  pagePrivate: 'warning_page_private',
  slugDuplicate: 'warning_slug_duplicate',
  pageDuplicate: 'warning_page_duplicate',
  linkInvalid: 'warning_link_invalid',
  homeMissing: 'warning_home_missing',
};

/**
 * One row of the sitemap tree: indented by depth, an icon per node type, greyed when archived,
 * the warnings of the node as badges and, for a page, how many of its sections are still drafts.
 * The drag handle belongs to the surrounding `ion-reorder-group` of the parent.
 */
@Component({
  selector: 'okr-website-tree-item',
  standalone: true,
  imports: [SvgIconPipe, IonItem, IonIcon, IonLabel, IonBadge, IonReorder],
  styles: [`
    .archived { opacity: 0.5; }
    ion-badge { margin-left: 4px; }
  `],
  template: `
    <ion-item button [detail]="false" lines="inset" [class.archived]="isArchived()"
      [style.--padding-start]="indent()" (click)="selected.emit(node())">
      <ion-icon slot="start" src="{{ icon() | svgIcon }}" />
      <ion-label>
        <h2>{{ node().label }}@if (isArchived()) { ({{ i18n().row_archived() }})}</h2>
        @if (url()) {
          <p>{{ url() }}</p>
        }
        @if (draftHint()) {
          <p><em>{{ draftHint() }}</em></p>
        }
      </ion-label>
      @for (text of warningTexts(); track $index) {
        <ion-badge slot="end" color="warning">{{ text }}</ion-badge>
      }
      @if (!readOnly()) {
        <ion-reorder slot="end" (click)="$event.stopPropagation()" />
      }
    </ion-item>
  `,
})
export class WebsiteTreeItem {
  // inputs
  public readonly node = input.required<WebsiteNode>();
  public readonly i18n = input.required<WebsiteI18n>();
  public readonly depth = input(0);
  public readonly warnings = input<WebsiteWarningCode[]>([]);
  public readonly draftCount = input(0);
  public readonly readOnly = input(true);

  // outputs
  public readonly selected = output<WebsiteNode>();

  protected readonly isArchived = computed(() => !!this.node().isArchived);
  protected readonly indent = computed(() => `${16 + this.depth() * 24}px`);
  protected readonly icon = computed(() => this.node().type);   // icon names 'menu', 'page', 'link'
  protected readonly url = computed(() => websiteUrl(this.node()));
  protected readonly warningTexts = computed(() => this.warnings().map((code) => this.i18n()[WARNING_KEYS[code]]()));
  protected readonly draftHint = computed(() => {
    const count = this.draftCount();
    if (count <= 0) return '';
    return count === 1 ? this.i18n().row_drafts_one() : fill(this.i18n().row_drafts(), { count });
  });
}
