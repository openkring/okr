import { Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { FooterItem, FooterLogoHeight, FooterSection } from '@okr/shared-models';
import { ImgDirective, OptionalCardHeader } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { footerBlocks, footerColumnCount, footerVisibleColumns, isExternalFooterUrl, isFooterUrl, normalizeFooterConfig } from '@okr/cms-section-util';

import { SectionStore } from './section.store';

/** rendered logo heights in px; imgix is asked for twice that, for sharp logos on retina screens */
const LOGO_HEIGHTS: Record<FooterLogoHeight, number> = { small: 32, medium: 48, large: 72 };

/**
 * A footer of one to three columns plus an optional bottom line. The layout follows the width of
 * the section, not of the window (container queries), so a footer in a narrow page column stacks:
 * - three columns: side by side from 992px; from 576px column 1 spans the full width above 2 + 3
 * - two columns: side by side from 576px
 * - below 576px every column stacks, centred, separated by a hairline
 * Consecutive logos share a wrapping row. The public website renders the same config with its own
 * styling (publicApi page route → seite.html renderFooter).
 */
@Component({
  selector: 'okr-footer-section',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, SvgIconPipe, ImgDirective, OptionalCardHeader, IonCard, IonCardContent, IonIcon],
  styles: [`
    :host { display: block; container: footer / inline-size; }
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }

    footer { padding: 24px 16px 16px 16px; border-top: 1px solid var(--ion-color-light-shade); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px 32px; text-align: center; }
    .col + .col { border-top: 1px solid var(--ion-color-light); padding-top: 20px; }
    .col > * + * { margin-top: 8px; }

    .title { margin: 0 0 4px 0; font-size: 1rem; font-weight: 600; color: var(--ion-text-color); }
    .title:not(:first-child) { margin-top: 16px; }
    .text { margin: 0; font-size: 0.9rem; line-height: 1.5; white-space: pre-line; color: var(--ion-color-medium); }
    a { color: var(--ion-color-medium); text-decoration: none; font-size: 0.9rem; }
    a:hover, a:focus-visible { color: var(--ion-color-primary); text-decoration: underline; }
    .link { display: block; }
    .icon { display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--ion-color-medium); }
    .icon ion-icon { font-size: 1.25rem; flex: none; }
    .logos { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px 20px; }
    .logos img { width: auto; max-width: 100%; object-fit: contain; }

    .bottom { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--ion-color-light);
      font-size: 0.8rem; color: var(--ion-color-medium); text-align: center; }

    @container footer (min-width: 576px) {
      .grid.cols-2, .grid.cols-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); text-align: start; }
      .grid.cols-3 > .col:first-child { grid-column: 1 / -1; }
      .grid.cols-2 .col + .col { border-top: 0px; padding-top: 0px; }
      .grid.cols-3 .col:nth-child(3) { border-top: 0px; padding-top: 0px; }
      .grid.cols-2 .logos, .grid.cols-3 .logos { justify-content: flex-start; }
      .grid.cols-2 + .bottom, .grid.cols-3 + .bottom { text-align: start; }
    }
    @container footer (min-width: 992px) {
      .grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grid.cols-3 > .col:first-child { grid-column: auto; }
      .grid.cols-3 .col + .col { border-top: 0px; padding-top: 0px; }
    }
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <okr-optional-card-header [title]="section.title" [subTitle]="section.subTitle" />
        <ion-card-content>
          <footer [attr.aria-label]="section.title || store.i18n.footer_region()">
            <div class="grid" [class]="'cols-' + columnCount()">
              @for (blocks of columnBlocks(); track $index) {
                <div class="col">
                  @for (block of blocks; track $index) {
                    @if (block.kind === 'logos') {
                      <div class="logos">
                        @for (logo of block.items; track $index) {
                          <ng-container *ngTemplateOutlet="target; context: { $implicit: logo, body: logoTpl }" />
                        }
                      </div>
                    } @else {
                      @switch (block.item.type) {
                        @case ('title') { <h3 class="title">{{ block.item.label }}</h3> }
                        @case ('link') {
                          @if (hasTarget(block.item)) {
                            <ng-container *ngTemplateOutlet="target; context: { $implicit: block.item, body: labelTpl, cssClass: 'link' }" />
                          } @else { <p class="text">{{ block.item.label }}</p> }
                        }
                        @case ('icon') {
                          <div><ng-container *ngTemplateOutlet="target; context: { $implicit: block.item, body: iconTpl }" /></div>
                        }
                        @default { <p class="text">{{ block.item.label }}</p> }
                      }
                    }
                  }
                </div>
              }
            </div>
            @if (config().showBottomLine && config().bottomLine) {
              <div class="bottom">{{ config().bottomLine }}</div>
            }
          </footer>
        </ion-card-content>
      </ion-card>
    }

    <!-- an item, wrapped in a router link (/…), an external link (new tab) or nothing -->
    <ng-template #target let-item let-body="body" let-cssClass="cssClass">
      @if (!hasTarget(item)) {
        <ng-container *ngTemplateOutlet="body; context: { $implicit: item }" />
      } @else if (isInternal(item)) {
        <a [class]="cssClass" [routerLink]="item.url"><ng-container *ngTemplateOutlet="body; context: { $implicit: item }" /></a>
      } @else if (isExternal(item)) {
        <a [class]="cssClass" [href]="item.url" target="_blank" rel="noopener noreferrer"><ng-container *ngTemplateOutlet="body; context: { $implicit: item }" /></a>
      } @else {
        <a [class]="cssClass" [href]="item.url"><ng-container *ngTemplateOutlet="body; context: { $implicit: item }" /></a>
      }
    </ng-template>

    <ng-template #labelTpl let-item>{{ item.label }}</ng-template>

    <ng-template #iconTpl let-item>
      <span class="icon">
        <ion-icon src="{{ item.icon | svgIcon }}" [attr.aria-hidden]="item.label ? 'true' : null" [attr.aria-label]="item.label ? null : item.icon" />
        @if (item.label) { <span>{{ item.label }}</span> }
      </span>
    </ng-template>

    <ng-template #logoTpl let-item>
      <img okrImg [src]="logoUrl(item)" [alt]="item.label" [style.height.px]="logoHeight(item)" />
    </ng-template>
  `
})
export class FooterSectionComponent {
  protected readonly store = inject(SectionStore);
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;

  // inputs
  public section = input<FooterSection>();

  // derived values
  /** Legacy or hand-edited documents may lack fields; normalizing fills them in. */
  protected readonly config = computed(() => normalizeFooterConfig(this.section()?.properties));
  protected readonly columnCount = computed(() => footerColumnCount(this.config()));
  protected readonly columnBlocks = computed(() => footerVisibleColumns(this.config()).map(column => footerBlocks(column.items)));

  /** an unsafe url (only possible in a hand-edited document) renders as no link at all */
  protected hasTarget(item: FooterItem): boolean {
    return !!item.url && isFooterUrl(item.url);
  }

  protected isInternal(item: FooterItem): boolean {
    return item.url.startsWith('/');
  }

  protected isExternal(item: FooterItem): boolean {
    return isExternalFooterUrl(item.url);
  }

  protected logoHeight(item: FooterItem): number {
    return LOGO_HEIGHTS[item.height] ?? LOGO_HEIGHTS.medium;
  }

  protected logoUrl(item: FooterItem): string {
    if (item.image.startsWith('http')) return item.image;
    return `${this.imgixBaseUrl}/${item.image}?h=${this.logoHeight(item) * 2}&auto=format,compress`;
  }
}
