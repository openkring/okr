import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { IonIcon } from '@ionic/angular';

import { TilesSection } from '@okr/shared-models';
import { tilesColumns, validTiles, withTilesDefaults } from '@okr/cms-section-util';
import { SvgIconPipe } from '@okr/shared-pipes';

import { openSectionLink } from './section-link';

/**
 * A grid of tiles: stat tiles (big value + caption) or cards (icon, title, text, optional link).
 * The items live inline in the section config. Only the plain German fields are shown here.
 */
@Component({
  selector: 'okr-tiles-section',
  standalone: true,
  imports: [NgTemplateOutlet, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    .kicker { margin: 0px 0px 4px 0px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
    h2 { margin: 0px 0px 8px 0px; }
    .lead { margin: 0px 0px 16px 0px; opacity: 0.8; }
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
    .tile ion-icon { width: 32px; height: 32px; margin-bottom: 8px; }
    .tile h3 { margin: 0px 0px 4px 0px; font-size: 1.1rem; }
    .tile p { margin: 0px; }
    .link { display: inline-block; margin-top: 8px; font-weight: 600; color: var(--ion-color-primary); }
    button.tile { cursor: pointer; width: 100%; }
    button.tile:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
  `],
  template: `
    @if (config().kicker) { <p class="kicker">{{ config().kicker }}</p> }
    @if (section().title) { <h2>{{ section().title }}</h2> }
    @if (config().lead) { <p class="lead">{{ config().lead }}</p> }
    <div class="grid" [class.stat]="variant() === 'stat'" [style.--cols]="columns()">
      @for (item of items(); track $index) {
        @if (variant() === 'stat') {
          <div class="tile stat-tile">
            <span class="value" [class]="'tone-' + item.tone">{{ item.value }}</span>
            <span class="caption">{{ item.title }}</span>
          </div>
        } @else if (item.url) {
          <button type="button" class="tile" (click)="open(item.url)">
            <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: item }" />
          </button>
        } @else {
          <div class="tile">
            <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: item }" />
          </div>
        }
      }
    </div>
    <ng-template #cardBody let-item>
      @if (item.icon) { <ion-icon [class]="'tone-' + item.tone" src="{{ item.icon | svgIcon }}" /> }
      @if (item.title) { <h3>{{ item.title }}</h3> }
      @if (item.text) { <p>{{ item.text }}</p> }
      @if (item.url && config().linkLabel) { <span class="link">{{ config().linkLabel }}</span> }
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

  protected open(url: string | undefined): void {
    openSectionLink(this.router, url);
  }
}
