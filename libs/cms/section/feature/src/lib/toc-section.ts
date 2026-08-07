import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { PageModel, SectionModel, TocSection } from '@okr/shared-models';
import { tocEntries, withTocDefaults } from '@okr/cms-section-util';
import { PageService } from '@okr/cms-page-data-access';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';

import { SectionStore } from './section.store';

/**
 * Table of contents of the page this section sits on: lists the page's other sections in page
 * order and scroll-jumps to the clicked one. The anchor is the section okey — the ContentPage
 * renders each section into a `div`/`ion-col` with that id and also resolves a `#okey` route
 * fragment on load, so the entries double as deep links.
 *
 * The page is looked up by the section's own okey (no PageStore here — cms-page-feature already
 * depends on cms-section-feature).
 */
@Component({
  selector: 'okr-toc-section',
  standalone: true,
  imports: [
    Spinner, OptionalCardHeader,
    IonCard, IonCardContent, IonList, IonItem, IonLabel
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
    .index { margin-right: 8px; opacity: 0.6; }
  `],
  template: `
  @if(section(); as section) {
    <ion-card>
      <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(content(); as content) {
          <div [innerHTML]="content"></div>
        }
        <nav [attr.aria-label]="store.i18n.toc_nav_label()">
          <ion-list>
            @for(entry of entries(); track entry.key; let i = $index) {
              <ion-item button="true" (click)="goTo(entry.key)">
                <ion-label class="ion-text-wrap">
                  @if(numbered()) { <span class="index">{{ i + 1 }}.</span> }
                  {{ entry.label }}
                </ion-label>
              </ion-item>
            }
          </ion-list>
        </nav>
      </ion-card-content>
    </ion-card>
  } @else {
    <okr-spinner />
  }
`
})
export class TocSectionComponent {
  protected readonly store = inject(SectionStore);
  private readonly pages = toSignal(inject(PageService).list(), { initialValue: [] as PageModel[] });

  // inputs
  public section = input<TocSection>();
  public editMode = input(false);

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected readonly numbered = computed(() => withTocDefaults(this.section()?.properties).numbered);

  /** Sections of the page containing this TOC, in page order. */
  private readonly pageSections = computed(() => {
    const okey = this.section()?.okey;
    if (!okey) return [] as SectionModel[];
    const page = this.pages().find(p => p.sections?.includes(okey));
    const sections = this.store.sections() ?? [];
    return (page?.sections ?? [])
      .map(key => sections.find(s => s.okey === key))
      .filter((s): s is SectionModel => !!s);
  });

  protected readonly entries = computed(() => tocEntries(
    this.pageSections(), this.section()?.properties, this.section()?.okey,
    this.store.appStore.currentUser(), this.editMode()
  ));

  /** Scrolls to the section and moves the focus there — scrolling alone strands keyboard users. */
  protected goTo(key: string): void {
    const el = document.getElementById(key);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
}
