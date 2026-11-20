import { Component, computed, DestroyRef, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonCard, IonCardContent, IonIcon, IonItem, IonLabel } from '@ionic/angular';
import { AsyncPipe } from '@angular/common';

import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { AccordionItem, AccordionSection, ColorIonic } from '@okr/shared-models';
import { ColorsIonic } from '@okr/shared-categories';
import { CategoryPlainNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { TranslatePipe } from '@okr/shared-i18n';
import { accordionOpenValues, splitIntoColumns, withAccordionDefaults } from '@okr/cms-section-util';

import { AccordionItemContentComponent } from './accordion-item';

type ScreenSize = 'sm' | 'md' | 'lg';
/** Ionic's md and lg breakpoints */
const MEDIA_MD = '(min-width: 768px)';
const MEDIA_LG = '(min-width: 992px)';

/**
 * Accordion of nested sections, in two view types:
 * - 'list': the classic ion-accordion list in the section colour.
 * - 'cards': white cards in 1–4 columns per screen size; an open item shows its text on a tinted panel.
 * Both honour the formatting fields (title style + size, open/closed icon, icon colour + position, text background + size).
 */
@Component({
  selector: 'okr-accordion-section',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, CategoryPlainNamePipe, SvgIconPipe,
    IonLabel, IonCard, IonCardContent, OptionalCardHeader,
    IonAccordionGroup, IonAccordion, IonItem, IonIcon,
    Spinner, AccordionItemContentComponent
  ],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}

    .title { font-size: var(--acc-title-size); }
    .title-bold { font-weight: 700; }
    .title-italic { font-style: italic; }
    .title-underline { text-decoration: underline; text-underline-offset: 0.2em; }
    .acc-icon { color: var(--acc-icon-color, var(--ion-color-medium)); font-size: 1.5rem; flex-shrink: 0; }
    .acc-content { font-size: var(--acc-text-size); background: var(--acc-text-bg, transparent); }
    /* the nested section brings its own card: let the panel's background and size show through */
    .acc-content ::ng-deep ion-card { --background: transparent; background: transparent; box-shadow: none; margin: 0; }
    .acc-content ::ng-deep ion-card-content { font-size: inherit; }

    /* list: our own open/closed icon replaces Ionic's rotating one */
    ion-accordion ::ng-deep .ion-accordion-toggle-icon { display: none; }

    /* cards */
    .acc-cards { display: flex; gap: 1.5rem 2rem; align-items: flex-start; }
    .acc-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1.25rem; }
    .acc-card { background: var(--ion-background-color, #fff); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
    .acc-header {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      width: 100%; padding: 1rem 1.25rem; border: 0; background: transparent;
      color: var(--ion-text-color); font: inherit; text-align: start; cursor: pointer;
    }
    .acc-header.icon-start { flex-direction: row-reverse; justify-content: flex-end; }
    .acc-header:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: -2px; }
    .acc-header .title { line-height: 1.6; }
    .acc-cards .acc-content { background: var(--acc-text-bg, rgba(var(--ion-color-primary-rgb), 0.12)); padding: 1rem 1.25rem; }
  `],
  template: `
    @if(section()) {
      <ion-card>
        <okr-optional-card-header [intro]="section()?.intro" [introPosition]="section()?.introPosition" [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content [style]="cssVars()">
          @if (cfg().viewType === 'cards') {
            <div class="acc-cards">
              @for (column of columns(); track $index) {
                <div class="acc-col">
                  @for (item of column; track item.value) {
                    @let isOpen = open().includes(item.value);
                    <div class="acc-card">
                      <button type="button" class="acc-header" [class.icon-start]="cfg().iconPosition === 'start'"
                              [attr.aria-expanded]="isOpen" [attr.aria-controls]="contentId(item)" (click)="toggle(item.value)">
                        <span [class]="titleClass()">{{ item.label | translate | async }}</span>
                        <ion-icon class="acc-icon" aria-hidden="true" src="{{ (isOpen ? cfg().iconOpen : cfg().iconClosed) | svgIcon }}" />
                      </button>
                      @if (isOpen) {
                        <div class="acc-content" role="region" [id]="contentId(item)">
                          <okr-accordion-item-content [sectionId]="item.key" />
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <ion-accordion-group [value]="groupValue()" [multiple]="cfg().multiple" (ionChange)="onGroupChange($event.detail.value)">
              @for(item of cfg().items; track item.value) {
                @let isOpen = open().includes(item.value);
                <ion-accordion [value]="item.value">
                  <ion-item slot="header" [color]="color() | categoryPlainName:colorsIonic">
                    <ion-icon class="acc-icon" aria-hidden="true" [slot]="cfg().iconPosition"
                              src="{{ (isOpen ? cfg().iconOpen : cfg().iconClosed) | svgIcon }}" />
                    <ion-label [class]="titleClass()">{{item.label | translate | async}}</ion-label>
                  </ion-item>
                  <div class="ion-padding acc-content" slot="content">
                    <okr-accordion-item-content [sectionId]="item.key" />
                  </div>
                </ion-accordion>
              }
            </ion-accordion-group>
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class AccordionSectionComponent {
  // inputs
  public section = input<AccordionSection>();

  // computed
  protected title = computed(() => this.section()?.title ?? '');
  protected subTitle = computed(() => this.section()?.subTitle ?? '');
  protected color = computed(() => this.section()?.color ?? ColorIonic.Primary);
  protected cfg = computed(() => withAccordionDefaults(this.section()?.properties));
  protected colorsIonic = ColorsIonic;

  /** the open item values; seeded from the configured value, then driven by the user */
  protected open = linkedSignal(() => accordionOpenValues(this.cfg().value));
  protected groupValue = computed(() => this.cfg().multiple ? this.open() : (this.open()[0] ?? undefined));

  protected titleClass = computed(() => 'title title-' + this.cfg().titleStyle);
  protected cssVars = computed(() => {
    const c = this.cfg();
    return {
      '--acc-title-size': c.titleSize + 'rem',
      '--acc-text-size': c.textSize + 'rem',
      ...(c.iconColor ? { '--acc-icon-color': c.iconColor } : {}),
      ...(c.textBackground ? { '--acc-text-bg': c.textBackground } : {}),
    } as Record<string, string>;
  });

  private screen = this.watchScreenSize();
  protected columns = computed(() => splitIntoColumns(this.cfg().items, this.cfg().columns[this.screen()]));

  protected contentId(item: AccordionItem): string {
    return 'acc-' + (this.section()?.okey ?? '') + '-' + item.value;
  }

  protected toggle(value: string): void {
    const current = this.open();
    if (current.includes(value)) {
      this.open.set(current.filter((v) => v !== value));
    } else {
      this.open.set(this.cfg().multiple ? [...current, value] : [value]);
    }
  }

  protected onGroupChange(value: string | string[] | null | undefined): void {
    this.open.set(Array.isArray(value) ? value : value ? [value] : []);
  }

  /** current Ionic breakpoint as a signal (sm < 768px ≤ md < 992px ≤ lg) */
  private watchScreenSize() {
    const size = signal<ScreenSize>('sm');
    if (typeof window === 'undefined' || !window.matchMedia) return size.asReadonly();
    const md = window.matchMedia(MEDIA_MD);
    const lg = window.matchMedia(MEDIA_LG);
    const update = () => size.set(lg.matches ? 'lg' : md.matches ? 'md' : 'sm');
    update();
    md.addEventListener('change', update);
    lg.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => {
      md.removeEventListener('change', update);
      lg.removeEventListener('change', update);
    });
    return size.asReadonly();
  }
}
