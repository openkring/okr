import { Component, computed, DOCUMENT, inject, input, output, PLATFORM_ID, Signal } from '@angular/core';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { IonCard, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { AVATAR_CONFIG_SHAPE, AvatarConfig, AvatarInfo, NameDisplay, PEOPLE_SHAPE_RADIUS, PEOPLE_SIZE_PX, resolvePeopleLook } from '@okr/shared-models';
import { ImgDirective } from '@okr/shared-ui';
import { getFullName } from '@okr/shared-util-core';

import { AvatarService } from '@okr/avatar-data-access';
import { getPeopleAltText, getPeopleBgColor, getPeopleImgixParams, splitIntoRows, toHexColor } from '@okr/cms-section-util';

interface PersonsWidgetI18n {
  people_empty:  Signal<string>
}

/** Everything the template needs for one person, computed once per change. */
interface PersonView {
  person: AvatarInfo;
  url: string;
  alt: string;
  name: string;
  function: string;
  email: string;
  /** set when the whole card is a mailto link (info 'email' or 'emailLink') */
  mailto: string;
  bgColor: string | undefined;
}

/**
 * Renders the persons of a people section as cards (sized by their content), a responsive
 * ion-grid, or 1–4 horizontal slider lines. Portraits are imgix crops (size, face area,
 * black and white, background removal + fill); name, function and email sit above, below,
 * beside or on top of the picture. When the person has an email and info shows it ('email') or
 * asks for it ('emailLink'), the whole card (avatar, name, email) is a mailto link.
 */
@Component({
  selector: 'okr-persons-widget',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    IonGrid, IonRow, IonCol, IonCard,
    ImgDirective
  ],
  styles: [`
    :host { display: block; }
    .empty { padding: 8px 16px; }

    /* card: each card is as large as its content */
    .cards { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px; }
    .cards ion-card { margin: 0; width: fit-content; }

    /* grid: the content adjusts to the cell */
    ion-col .person { width: 100%; }

    /* slider: 1-4 lines, each scrolls horizontally, perRow persons visible */
    .slider-row { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 8px 8px; }
    .slide { flex: 0 0 calc((100% - (var(--per-row) - 1) * 8px) / var(--per-row)); min-width: min-content; scroll-snap-align: start; }

    .person { display: flex; flex-direction: column; align-items: center; cursor: pointer; }
    .person.pos-right { flex-direction: row; }
    .img-wrap { position: relative; overflow: hidden; flex: none; max-width: 100%; }
    .img-wrap img { display: block; width: 100%; height: 100%; object-fit: cover; }

    .info { padding: 6px 10px; text-align: center; background: var(--info-bg); color: var(--info-fg); }
    .pos-right .info { text-align: start; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
    .info.overlay { position: absolute; left: 0; right: 0; opacity: 0.88; }
    .info.overlayBottom { bottom: 0; }
    .name { font-weight: 600; }
    .function { font-size: 0.9em; }
    .email { font-size: 0.85em; word-break: break-all; }
    .email a { color: inherit; }
    a.person-link { display: block; color: inherit; text-decoration: none; }
  `],
  template: `
    @if(count() === 0) {
      <div class="empty">{{ i18n().people_empty() }}</div>
    } @else {
      @switch(config().view) {
        @case('slider') {
          @for(row of rows(); track $index) {
            <div class="slider-row" [style.--per-row]="config().perRow">
              @for(item of row; track item.person.key) {
                <div class="slide">
                  <ng-container [ngTemplateOutlet]="personTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
                </div>
              }
            </div>
          }
        }
        @case('grid') {
          <ion-grid>
            <ion-row>
              @for(item of items(); track item.person.key) {
                <ion-col size="6" size-md="4" size-lg="3" size-xl="2">
                  <ng-container [ngTemplateOutlet]="personTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        }
        @default {
          <div class="cards">
            @for(item of items(); track item.person.key) {
              <ion-card>
                <ng-container [ngTemplateOutlet]="personTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
              </ion-card>
            }
          </div>
        }
      }
    }

    <ng-template #personTpl let-item>
      @if(item.mailto) {
        <a class="person-link" [href]="'mailto:' + item.mailto" [attr.aria-label]="(item.name ? item.name + ', ' : '') + item.mailto" (click)="onLinkClick($event)">
          <ng-container [ngTemplateOutlet]="bodyTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
        </a>
      } @else {
        <ng-container [ngTemplateOutlet]="bodyTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
      }
    </ng-template>

    <ng-template #bodyTpl let-item>
      <div class="person" [class]="'person pos-' + posClass()" [style.--info-bg]="infoBg" [style.--info-fg]="infoFg" (click)="onPersonClick(item)">
        <div class="img-wrap" [style.width.px]="sizePx()" [style.height.px]="sizePx()"
          [style.border-radius]="radius()" [style.background-color]="item.bgColor">
          <img okrImg [src]="item.url" [alt]="item.alt" [width]="sizePx()" [height]="sizePx()" loading="lazy" />
          @if(isOverlay() && hasInfo(item)) {
            <div class="info overlay" class="info overlay overlayBottom">
              <ng-container [ngTemplateOutlet]="infoTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
            </div>
          }
        </div>
        @if(!isOverlay() && hasInfo(item)) {
          <div class="info">
            <ng-container [ngTemplateOutlet]="infoTpl" [ngTemplateOutletContext]="{ $implicit: item }" />
          </div>
        }
      </div>
    </ng-template>

    <ng-template #infoTpl let-item>
      @if(item.name) { <div class="name">{{ item.name }}</div> }
      @if(item.function) { <div class="function">{{ item.function }}</div> }
      @if(item.email) {
        <!-- inside a card that is a link already, the address is plain text (no link inside a link) -->
        @if(item.mailto) {
          <div class="email">{{ item.email }}</div>
        } @else {
          <div class="email"><a [href]="'mailto:' + item.email" (click)="$event.stopPropagation()">{{ item.email }}</a></div>
        }
      }
    </ng-template>
  `
})
export class PersonsWidget {
  private readonly avatarService = inject(AvatarService);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public persons = input.required<AvatarInfo[]>();
  /** expected normalized (see normalizeAvatarConfig) */
  public avatarConfig = input<AvatarConfig>(AVATAR_CONFIG_SHAPE);
  /** person key → email (directory favEmail or the role's address), already filtered by visibility */
  public emails = input<Record<string, string>>({});
  /** person key → function to show instead of the person's label (e.g. the responsibility's name) */
  public functions = input<Record<string, string>>({});
  /** person key → avatar key to show instead of the person's own (e.g. a responsibility's portrait `responsibility.<okey>`) */
  public imageKeys = input<Record<string, string>>({});
  public editMode = input(false);
  public readonly i18n = input.required<PersonsWidgetI18n>();

  public personClicked = output<AvatarInfo>();

  protected readonly config = this.avatarConfig;
  protected readonly count = computed(() => this.persons().length);
  protected readonly look = computed(() => resolvePeopleLook(this.config()));
  protected readonly sizePx = computed(() => PEOPLE_SIZE_PX[this.look().size]);
  protected readonly radius = computed(() => PEOPLE_SHAPE_RADIUS[this.look().shape]);
  protected readonly isOverlay = computed(() => this.look().textPosition === 'overlay');
  /** pos-below, pos-right or pos-overlayBottom */
  protected readonly posClass = computed(() => (this.isOverlay() ? 'overlayBottom' : this.look().textPosition));
  /** the name area is always ColorIonic.Light */
  protected readonly infoBg = 'var(--ion-color-light)';
  protected readonly infoFg = 'var(--ion-color-light-contrast)';

  /**
   * the tenant colours for a filled look, read from the Ionic theme (#rrggbb for imgix):
   * 'primary' → [primary], 'alternating' → [primary, secondary], cycled over the persons
   */
  private readonly orgColorHex = computed<string[] | undefined>(() => {
    const fill = this.look().fill;
    if (!this.isBrowser || fill === 'original') return undefined;
    const style = getComputedStyle(this.document.documentElement);
    const hex = (name: string) => toHexColor(style.getPropertyValue(`--ion-color-${name}`)) ?? '';
    return fill === 'alternating' ? [hex('primary'), hex('secondary')] : [hex('primary')];
  });

  protected readonly items = computed<PersonView[]>(() => {
    const config = this.config();
    const look = this.look();
    const info = config.info ?? [];
    const emails = this.emails();
    const functions = this.functions();
    const imageKeys = this.imageKeys();
    const orgColorHex = this.orgColorHex();
    return this.persons().map((person, index) => {
      const bgColor = getPeopleBgColor(look, index, orgColorHex);
      const key = imageKeys[person.key] ?? `${person.modelType}.${person.key}`;
      return {
        person,
        url: this.avatarService.getAvatarUrlWithParams(key, person.modelType, getPeopleImgixParams(look, bgColor)),
        alt: getPeopleAltText(config.altText, getFullName(person.name1, person.name2, NameDisplay.FirstLast)),
        name: getFullName(person.name1, person.name2, config.nameDisplay),
        function: info.includes('function') ? (functions[person.key] ?? person.label ?? '') : '',
        email: info.includes('email') ? (emails[person.key] ?? '') : '',
        // a visible email (or 'emailLink') turns the whole card into a mailto link
        mailto: info.includes('email') || info.includes('emailLink') ? (emails[person.key] ?? '') : '',
        bgColor,
      };
    });
  });

  protected readonly rows = computed(() => splitIntoRows(this.items(), this.config().sliderRows));

  protected hasInfo(item: PersonView): boolean {
    return !!(item.name || item.function || item.email);
  }

  /** a card that is a mailto link opens the mail program instead of the person */
  protected onPersonClick(item: PersonView): void {
    if (item.mailto) return;
    this.showPerson(item.person);
  }

  /** in edit mode the card stays put, so the section can be configured without opening mails */
  protected onLinkClick(event: Event): void {
    if (this.editMode()) event.preventDefault();
  }

  public showPerson(person: AvatarInfo): void {
    if (this.editMode()) return;
    this.personClicked.emit(person);
  }
}
