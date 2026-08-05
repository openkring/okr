import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { TestimonialSection } from '@okr/shared-models';
import { testimonialColumns, validTestimonials, withTestimonialDefaults } from '@okr/cms-section-util';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';

import { SectionStore } from './section.store';

/**
 * Voices of members, customers or partners: a short, prominent quote plus its author.
 *
 * The entries live inline in the section config (like `chart` or `spider`) and the author is free
 * text — no `personKey`, so a published quote never drags profile data onto a public page (→ 1.19).
 *
 * Grid and carousel are the same markup with a different container class: CSS grid vs. horizontal
 * scroll-snap. No slider dependency and no auto-rotation, so there is nothing to pause. The long
 * version of a quote expands in a native `<details>` — keyboard and screen-reader behaviour for free.
 */
@Component({
  selector: 'okr-testimonial-section',
  standalone: true,
  imports: [Spinner, OptionalCardHeader, IonCard, IonCardContent],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }

    .grid { display: grid; gap: 16px; grid-template-columns: repeat(var(--cols, 3), 1fr); }
    .carousel { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 8px; }
    .carousel > figure { flex: 0 0 320px; scroll-snap-align: start; }
    @media (width <= 768px) {
      .grid { grid-template-columns: 1fr; }
      .carousel > figure { flex-basis: 85%; }
    }

    figure {
      margin: 0px;
      padding: 16px;
      border-radius: 8px;
      background: var(--ion-color-light);
      color: var(--ion-color-light-contrast);
    }
    blockquote { margin: 0px 0px 12px 0px; font-size: 1.15rem; line-height: 1.5; font-style: italic; }
    figcaption { display: flex; align-items: center; gap: 12px; }
    figcaption img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
    .author { font-style: normal; font-weight: 600; }
    .role { display: block; font-size: 0.85rem; font-weight: 400; opacity: 0.75; }
    details { margin-top: 12px; }
    summary { cursor: pointer; color: var(--ion-color-primary); }
    details p { margin: 8px 0px 0px 0px; white-space: pre-line; }
    .story { display: inline-block; margin-top: 12px; color: var(--ion-color-primary); }
  `],
  template: `
  @if(section(); as section) {
    <ion-card>
      <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(content(); as content) {
          <div [innerHTML]="content"></div>
        }
        <div
          [class]="carousel() ? 'carousel' : 'grid'"
          [style.--cols]="columns()"
          [attr.tabindex]="carousel() ? 0 : null"
          [attr.aria-label]="store.i18n.testimonial_list_label()"
        >
          @for(entry of entries(); track $index) {
            <figure>
              <blockquote>{{ entry.quote }}</blockquote>
              <figcaption>
                @if(entry.imageUrl) {
                  <img [src]="entry.imageUrl" [alt]="entry.authorName" loading="lazy" />
                }
                <cite class="author">
                  {{ entry.authorName }}
                  @if(entry.authorRole) { <span class="role">{{ entry.authorRole }}</span> }
                </cite>
              </figcaption>
              @if(entry.detail) {
                <details>
                  <summary>{{ store.i18n.testimonial_more() }}</summary>
                  <p>{{ entry.detail }}</p>
                </details>
              }
              @if(entry.link) {
                <a class="story" [href]="entry.link" target="_blank" rel="noopener noreferrer">{{ store.i18n.testimonial_link() }}</a>
              }
            </figure>
          }
        </div>
      </ion-card-content>
    </ion-card>
  } @else {
    <okr-spinner />
  }
`
})
export class TestimonialSectionComponent {
  protected readonly store = inject(SectionStore);

  // inputs
  public section = input<TestimonialSection>();

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  private readonly config = computed(() => withTestimonialDefaults(this.section()?.properties));
  protected readonly entries = computed(() => validTestimonials(this.config().entries));
  protected readonly carousel = computed(() => this.config().layout === 'carousel');
  protected readonly columns = computed(() => testimonialColumns(this.config().columns));
}
