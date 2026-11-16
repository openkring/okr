import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { IonIcon } from '@ionic/angular';

import { TilesSection } from '@okr/shared-models';
import { tilesColumns, validTiles, withTilesDefaults } from '@okr/cms-section-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ColorsIonic } from '@okr/shared-categories';

import { openSectionLink } from './section-link';

/**
 * A grid of tiles: stat tiles (big value + caption) or cards (icon, title, text, optional link).
 * The items live inline in the section config. Above the grid: the subtitle as a line in the section
 * colour, the title and the intro. Only the plain German fields are shown here.
 */
@Component({
  selector: 'okr-tiles-section',
  standalone: true,
  imports: [NgTemplateOutlet, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    .eyebrow { margin: 0px 0px 4px 0px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
    h2 { margin: 0px 0px 8px 0px; }
    .intro { margin: 0px 0px 16px 0px; opacity: 0.8; }
    .grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
    .grid.stat { grid-template-columns: repeat(2, 1fr); }
    @media (width >= 768px) {
      .grid, .grid.stat { grid-template-columns: repeat(var(--cols, 3), 1fr); }
    }
    .tile { padding: 16px; border-radius: 8px; background: var(--ion-color-light); color: var(--ion-color-light-contrast); text-align: left; border: 0px; font: inherit; }
    .stat-tile { text-align: center; }
    .value { display: block; font-size: 2.2rem; font-weight: 700; line-height: 1.1; }
    .caption { display: block; margin-top: 4px; }
    .tone-primary { color: var(--ion-color-primary); }
    .tone-secondary { color: var(--ion-color-secondary); }
    /* a card is a column: icon on top, link pinned to the foot, so icons and links of a row line up */
    .card-tile { display: flex; flex-direction: column; align-items: flex-start; height: 100%; }
    .icon-slot { display: block; width: 32px; height: 32px; margin-bottom: 8px; }
    .icon-slot ion-icon { width: 32px; height: 32px; }
    .tile h3 { margin: 0px 0px 4px 0px; font-size: 1.1rem; }
    .tile p { margin: 0px; }
    .link { display: inline-block; margin-top: auto; padding-top: 8px; font-weight: 600; }
    button.tile { cursor: pointer; width: 100%; }
    button.tile:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
  `],
  template: `
    @if (section().subTitle) { <p class="eyebrow" [style.--accent]="accent()">{{ section().subTitle }}</p> }
    @if (section().title) { <h2>{{ section().title }}</h2> }
    @if (section().intro) { <p class="intro">{{ section().intro }}</p> }
    <div class="grid" [class.stat]="variant() === 'stat'" [style.--cols]="columns()">
      @for (item of items(); track $index) {
        @if (variant() === 'stat') {
          <div class="tile stat-tile">
            <span class="value" [class]="'tone-' + item.tone">{{ item.value }}</span>
            <span class="caption">{{ item.title }}</span>
          </div>
        } @else if (item.url) {
          <button type="button" class="tile card-tile" (click)="open(item.url)">
            <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: item }" />
          </button>
        } @else {
          <div class="tile card-tile">
            <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: item }" />
          </div>
        }
      }
    </div>
    <ng-template #cardBody let-item>
      <!-- the icon slot is kept on every card once one card has an icon, so the titles line up too -->
      @if (hasIcons()) {
        <span class="icon-slot">
          @if (item.icon) { <ion-icon [class]="'tone-' + item.tone" src="{{ item.icon | svgIcon }}" /> }
        </span>
      }
      @if (item.title) { <h3>{{ item.title }}</h3> }
      @if (item.text) { <p>{{ item.text }}</p> }
      @if (item.url && item.linkLabel) { <span class="link" [class]="'tone-' + item.tone">{{ item.linkLabel }}</span> }
    </ng-template>
  `
})
export class TilesSectionComponent {
  private readonly router = inject(Router);

  // inputs
  public section = input.required<TilesSection>();

  // derived values
  protected readonly config = computed(() => withTilesDefaults(this.section().properties));
  protected readonly variant = computed(() => this.config().variant);
  protected readonly columns = computed(() => tilesColumns(this.config().columns));
  protected readonly items = computed(() => validTiles(this.config().items, this.variant()));
  protected readonly hasIcons = computed(() => this.items().some((i) => !!i.icon));
  /** the section colour as a css colour, for the subtitle line above the title */
  protected readonly accent = computed(() => `var(--ion-color-${ColorsIonic[this.section().color ?? 0]?.name ?? 'primary'})`);

  protected open(url: string | undefined): void {
    openSectionLink(this.router, url);
  }
}
