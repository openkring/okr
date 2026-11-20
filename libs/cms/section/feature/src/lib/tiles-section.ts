import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { combineLatest, map, of } from 'rxjs';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { IonIcon } from '@ionic/angular';

import { PageCollection, PageModel, TilesSection } from '@okr/shared-models';
import { groupTiles, tileColor, tileImageUrl, tilesColumns, validTiles, withTilesDefaults } from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { FirestoreService } from '@okr/shared-data-access';
import { AvatarPipe } from '@okr/avatar-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { ENV } from '@okr/shared-config';
import { ImgDirective } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ColorsIonic } from '@okr/shared-categories';

import { openSectionLink } from './section-link';

/**
 * A grid of tiles: stat tiles (big value + caption), cards (icon, title, text, optional link) or image
 * cards (a picture on top, spec 1.165 §10.1).
 * The items live inline in the section config. Above the grid: the subtitle as a line in the section
 * colour, the title and the intro. Only the plain German fields are shown here.
 */
@Component({
  selector: 'okr-tiles-section',
  standalone: true,
  imports: [NgTemplateOutlet, IonIcon, SvgIconPipe, ImgDirective, AvatarPipe],
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
    .tile-image { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 8px; margin-bottom: 12px; object-fit: cover; }
    .tile-image.contain { object-fit: contain; padding: 16px; background: var(--ion-color-light); }
    .icon-slot { display: block; width: 32px; height: 32px; margin-bottom: 8px; }
    .icon-slot ion-icon { width: 32px; height: 32px; }
    .tile h3 { margin: 0px 0px 4px 0px; font-size: 1.1rem; }
    .tile p { margin: 0px; }
    .link { display: inline-block; margin-top: auto; padding-top: 8px; font-weight: 600; }
    button.tile { cursor: pointer; width: 100%; }
    /* a group card in its own colour (TileItem.color): white text, the logo on the colour */
    .tile.colored { background: var(--tile-bg); color: #fff; }
    .tile.colored .tone-primary, .tile.colored .tone-secondary { color: #fff; }
    .tile.colored .tile-image.contain { background: transparent; }
    /* list layout: one row per tile, the picture left */
    /* collapsed logo strip (TilesConfig.collapse): the linked logo, an arrow, the picture-only tiles below */
    .collapse-head { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .collapse-head img { display: block; width: 480px; max-width: calc(100vw - 112px); height: auto; }
    .collapse-head button { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--ion-color-medium); background: transparent; cursor: pointer; }
    .collapse-head ion-icon { width: 22px; height: 22px; }
    .collapse-head button.logo-link { width: auto; height: auto; border: 0px; border-radius: 0px; padding: 0px; }
    .grid.icons { gap: 8px; margin-top: 12px; grid-template-columns: repeat(3, 1fr); }
    @media (width >= 768px) { .grid.icons { grid-template-columns: repeat(var(--cols, 6), 1fr); } }
    .grid.icons .tile { padding: 0px; background: transparent; }
    .grid.icons .tile-image { aspect-ratio: 1; margin: 0px; border-radius: 4px; }
    .grid.list { grid-template-columns: 1fr !important; }
    .grid.list .card-tile { flex-direction: row; align-items: center; gap: 16px; }
    .grid.list .tile-image { width: 144px; flex: 0 0 144px; margin-bottom: 0; }
    @media (width <= 480px) { .grid.list .card-tile { flex-direction: column; align-items: flex-start; } .grid.list .tile-image { width: 100%; flex-basis: auto; } }
    button.tile:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
  `],
  template: `
    @if (section().intro && section().introPosition === 'above') { <p class="eyebrow" [style.--accent]="accent()">{{ section().intro }}</p> }
    @if (section().subTitle) { <p class="eyebrow" [style.--accent]="accent()">{{ section().subTitle }}</p> }
    @if (section().title) { <h2>{{ section().title }}</h2> }
    @if (section().intro && section().introPosition !== 'above') { <p class="intro">{{ section().intro }}</p> }
    @if (collapse(); as c) {
      <div class="collapse-head">
        @if (c.url) {
          <button type="button" class="logo-link" (click)="open(c.url)"><img okrImg [src]="c.imageSrc" [alt]="c.label" /></button>
        } @else { <img okrImg [src]="c.imageSrc" [alt]="c.label" /> }
        <button type="button" [attr.aria-expanded]="expanded()" [attr.aria-label]="c.label" (click)="expanded.set(!expanded())">
          <ion-icon src="{{ (expanded() ? 'arrow-up' : 'arrow-down') | svgIcon }}" />
        </button>
      </div>
    }
    @if (!collapse() || expanded()) {
    <div class="grid" [class.stat]="variant() === 'stat'" [class.list]="layout() === 'list'" [class.icons]="!!collapse()" [style.--cols]="columns()">
      @for (item of items(); track $index) {
        @if (variant() === 'stat') {
          <div class="tile stat-tile">
            <span class="value" [class]="'tone-' + item.tone">{{ item.value }}</span>
            <span class="caption">{{ item.title }}</span>
          </div>
        } @else if (item.url) {
          <button type="button" class="tile card-tile" [class.colored]="!!item.color" [style.--tile-bg]="item.color || null" (click)="open(item.url)">
            <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: item }" />
          </button>
        } @else {
          <div class="tile card-tile" [class.colored]="!!item.color" [style.--tile-bg]="item.color || null">
            <ng-container *ngTemplateOutlet="cardBody; context: { $implicit: item }" />
          </div>
        }
      }
    </div>
    }
    <ng-template #cardBody let-item>
      @if (item.avatarKey) {
        <img okrImg class="tile-image contain" [src]="item.avatarKey | avatar:'group'" alt="" />
      } @else if (item.imageSrc) { <img okrImg class="tile-image" [class.contain]="item.imageFit === 'contain'" [src]="item.imageSrc" [alt]="collapse() ? item.title ?? '' : ''" [attr.title]="collapse() ? item.title : null" /> }
      @if (collapse()) { <!-- a logo strip tile shows its picture only --> } @else {
      <!-- the icon slot is kept on every card once one card has an icon, so the titles line up too -->
      @if (hasIcons()) {
        <span class="icon-slot">
          @if (item.icon) { <ion-icon [class]="'tone-' + item.tone" src="{{ item.icon | svgIcon }}" /> }
        </span>
      }
      @if (item.title) { <h3>{{ item.title }}</h3> }
      @if (item.text) { <p>{{ item.text }}</p> }
      @if (item.url && item.linkLabel) { <span class="link" [class]="'tone-' + item.tone">{{ item.linkLabel }}</span> }
      }
    </ng-template>
  `
})
export class TilesSectionComponent {
  private readonly router = inject(Router);
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;
  private readonly appStore = inject(AppStore);
  private readonly firestoreService = inject(FirestoreService);

  // inputs
  public section = input.required<TilesSection>();

  // derived values
  protected readonly config = computed(() => withTilesDefaults(this.section().properties));
  protected readonly fromGroups = computed(() => this.config().source === 'groups');
  /** the collapsed logo strip (TilesConfig.collapse) with its picture resolved; undefined = none */
  protected readonly collapse = computed(() => {
    const c = this.config().collapse;
    const imageSrc = c ? tileImageUrl(c.imageUrl, 'contain', this.imgixBaseUrl) : '';
    return c && imageSrc ? { ...c, imageSrc } : undefined;
  });
  protected readonly expanded = signal(false);
  protected readonly variant = computed(() => this.fromGroups() ? 'image' : this.config().variant);
  protected readonly layout = computed(() => this.config().layout ?? 'grid');

  /** source 'groups': the keys of the groups whose content page is public — one cached read per group page */
  private readonly groupKeys = computed(() => this.fromGroups()
    ? this.appStore.allGroups().filter((g) => !g.isArchived).map((g) => g.okey).sort()
    : []);
  private readonly publicGroupKeys = rxResource({
    params: resourceParams(() => ({ keys: this.groupKeys() })),
    stream: ({ params }) => params.keys.length === 0 ? of(new Set<string>()) : combineLatest(params.keys.map((key) =>
      this.firestoreService.readModel<PageModel>(PageCollection, `${key}_content`).pipe(
        map((page) => (page && page.isPrivate === false ? key : ''))))).pipe(map((keys) => new Set(keys.filter(Boolean)))),
  });
  protected readonly columns = computed(() => tilesColumns(this.config().columns));
  protected readonly items = computed((): (ReturnType<typeof validTiles>[number] & { imageSrc: string; avatarKey?: string })[] => {
    if (this.fromGroups()) {
      const publicKeys = this.publicGroupKeys.value() ?? new Set<string>();
      return groupTiles(this.appStore.allGroups(), publicKeys, this.config().linkLabel).map((t) => ({ ...t, imageSrc: '' }));
    }
    return validTiles(this.config().items, this.variant()).map((i) => ({
      ...i,
      color: this.variant() === 'stat' ? '' : tileColor(i.color),
      imageSrc: this.variant() === 'image' ? tileImageUrl(i.imageUrl, i.imageFit, this.imgixBaseUrl) : '',
    }));
  });
  protected readonly hasIcons = computed(() => this.items().some((i) => !!i.icon));
  /** the section colour as a css colour, for the subtitle line above the title */
  protected readonly accent = computed(() => `var(--ion-color-${ColorsIonic[this.section().color ?? 0]?.name ?? 'primary'})`);

  protected open(url: string | undefined): void {
    openSectionLink(this.router, url);
  }
}
