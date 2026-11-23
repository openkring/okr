import { Component, computed, input, linkedSignal, model, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow, IonSelect, IonSelectOption } from '@ionic/angular';

import { ARTICLE_TEXT_COLORS, ArticleConfig, ArticleTextColor, CategoryListModel, RoleName, SECTION_INTRO_POSITIONS, SectionIntroPosition, SectionModel, UserModel } from '@okr/shared-models';
import { ButtonCopy, ButtonCopyI18n, CategorySelect, ErrorNote, TextareaInput, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { COMMENT_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { SectionAddChip, SectionAddChips } from './section-add-chips';
import { articleUses, getFieldErrors, parseSectionWidths, SECTION_SCREENS, SectionErrors, SectionI18n, SectionScreen, sectionWidthChoices, setSectionWidth } from '@okr/cms-section-util';

export const PFX = '@cms/section/feature.';

/**
 * Which part of the base settings to render (spec 1.171): 'all' for every section type but the article;
 * the article form splits them into its «Inhalt» tab (title, subtitle, intro) and its «Darstellung» tab
 * (visibility, width, name, emphasis, background, intro position).
 */
export type SectionConfigPart = 'all' | 'content' | 'appearance';

export type ArticleEmphasis = NonNullable<ArticleConfig['emphasis']>;
const EMPHASES: ArticleEmphasis[] = ['none', 'banner'];

@Component({
  selector: 'okr-section-config',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonLabel, IonItem, IonSelect, IonSelectOption, IonNote,
    TextInput, TextareaInput, CategorySelect, ButtonCopy, NgTemplateOutlet,
    ErrorNote, SectionAddChips
  ],
  template: `
    <!-- what the section is and who sees it: at the top, apart from its content (the article: in «Darstellung») -->
    @if (!journalMode() && part() !== 'content') {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ headerTitle() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            @if (hasRole('admin')) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().default_type() }}: {{ type() }}</ion-label>
                  </ion-item>
                </ion-col>
                @if(okey(); as okey) {
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none">
                      <ion-label>{{ i18n().default_id() }}: {{ okey }}</ion-label>
                      <okr-button-copy [i18n]="buttonCopyI18n()" [value]="okey" />
                    </ion-item>
                  </ion-col>
                }
              </ion-row>
            }
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().form_roleNeeded() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <okr-cat-select [category]="roles()!" [selectedItemName]="roleNeeded()" (selectedItemNameChange)="onFieldChange('roleNeeded', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().form_state() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <okr-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <!-- how wide the section is on the page, per screen size (colSize); narrower neighbours stand side by side -->
            <ion-row>
              @for (screen of screens; track screen) {
                <ion-col size="12" size-md="4">
                  <ion-select [label]="widthLabels()[screen]" labelPlacement="stacked" interface="popover"
                              [value]="widths()[screen]" [disabled]="isReadOnly()"
                              (ionChange)="onWidthChange(screen, $event.detail.value)">
                    @for (w of widthChoices()[screen]; track w) {
                      <ion-select-option [value]="w">{{ widthLabel(w) }}</ion-select-option>
                    }
                  </ion-select>
                </ion-col>
              }
              <ion-col size="12">
                <ion-note>{{ i18n().section_config_width_helper() }}</ion-note>
              </ion-col>
            </ion-row>
            <!-- the article: its technical name sits with the other settings of «Darstellung» (spec 1.171) -->
            @if (part() === 'appearance') {
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameMaxLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsFor('name')" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }

    @if (part() !== 'appearance') {
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().section_config_titleCard() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
        <ion-row>
          @if(showAdvanced() && !journalMode() && part() === 'all') {
            <ion-col size="12">
              <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameMaxLength" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="errorsFor('name')" />
            </ion-col>
          }
          <ion-col size="12">
            <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [maxLength]="maxLength" [readOnly]="isReadOnly()" />
            <okr-error-note [errors]="errorsFor('title')" />
          </ion-col>
          <!-- journal mode: the change record carries the title only -->
          @if (!journalMode()) {
            @if (showSubTitle()) {
            <ion-col size="12">
              <okr-text-input [i18n]="subTitleI18n()" [value]="subTitle()" (valueChange)="onFieldChange('subTitle', $event)" [maxLength]="maxLength" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="errorsFor('subTitle')" />
            </ion-col>
            }
            <!-- the intro: above the title (the former «Überzeile») or below title and subtitle -->
            @if(showAdvanced() && showIntro()) {
              <ion-col size="12">
                <okr-textarea-input [i18n]="introI18n()" [value]="intro()" (valueChange)="onFieldChange('intro', $event)" [maxLength]="introMaxLength" [readOnly]="isReadOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('intro')" />
              </ion-col>
              <!-- how the intro is shown only matters once there is an intro (the article: in «Darstellung») -->
              @if (hasIntro() && part() === 'all') {
                <ion-col size="12" [sizeMd]="isArticle() ? '6' : '12'">
                  <ion-select [label]="i18n().section_config_introPosition_label()" labelPlacement="stacked"
                              [value]="introPosition()" [disabled]="isReadOnly()"
                              (ionChange)="onFieldChange('introPosition', $event.detail.value)">
                    @for (p of introPositions; track p) {
                      <ion-select-option [value]="p">{{ introPositionLabels()[p] }}</ion-select-option>
                    }
                  </ion-select>
                  <ion-note>{{ i18n().section_config_introPosition_helper() }}</ion-note>
                </ion-col>
              }
              <!-- kept outside the condition: a stored value that fails must still show its error -->
              @if (part() === 'all') {
                <ion-col size="12">
                  <okr-error-note [errors]="errorsFor('introPosition')" />
                </ion-col>
              }
            }
            <!-- an article: a normal block or a full-width coloured band -->
            @if(isArticle() && part() === 'all') {
              <ng-container [ngTemplateOutlet]="look" />
            }
          }
        </ion-row>
        </ion-grid>
        <!-- «Inhalt» of an article: the optional texts still empty, as «+» chips (spec 1.171 §4.2) -->
        @if (part() === 'content') {
          <okr-section-add-chips [chips]="addChips()" [label]="i18n().article_add_label()" [readOnly]="isReadOnly()" (add)="onAdd($event)" />
        }
      </ion-card-content>
    </ion-card>
    }

    <!-- «Darstellung» of an article: emphasis, background, text colour and where the intro stands (spec 1.171 §4.3) -->
    @if (part() === 'appearance' && isArticle()) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().article_look_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ng-container [ngTemplateOutlet]="look" />
              @if (hasIntro()) {
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().section_config_introPosition_label()" labelPlacement="stacked"
                              [value]="introPosition()" [disabled]="isReadOnly()"
                              (ionChange)="onFieldChange('introPosition', $event.detail.value)">
                    @for (p of introPositions; track p) {
                      <ion-select-option [value]="p">{{ introPositionLabels()[p] }}</ion-select-option>
                    }
                  </ion-select>
                  <ion-note>{{ i18n().section_config_introPosition_helper() }}</ion-note>
                </ion-col>
              }
              <ion-col size="12">
                <okr-error-note [errors]="errorsFor('introPosition')" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if (!showBackground()) {
            <okr-section-add-chips [chips]="backgroundChip()" [label]="i18n().article_add_label()" [readOnly]="isReadOnly()" (add)="onAdd($event)" />
          }
        </ion-card-content>
      </ion-card>
    }

    <!-- the look of an article: in the title card ('all') or in the «Darstellung» card ('appearance') -->
    <ng-template #look>
              <ion-col size="12" [sizeMd]="showAdvanced() && hasIntro() && part() === 'all' ? '6' : '12'">
                <ion-select [label]="i18n().emphasis_label()" labelPlacement="stacked"
                            [value]="emphasis()" [disabled]="isReadOnly()"
                            (ionChange)="onEmphasisChange($event.detail.value)">
                  @for (e of emphases; track e) {
                    <ion-select-option [value]="e">{{ emphasisLabels()[e] }}</ion-select-option>
                  }
                </ion-select>
                <ion-note>{{ i18n().emphasis_helper() }}</ion-note>
              </ion-col>
              <!-- an own background colour (e.g. the KISS band of la21staefa) and the text colour on it;
                   in «Darstellung» offered as a «+» chip until used -->
              @if (showBackground()) {
                <ion-col size="12" [sizeMd]="hasBackground() ? '6' : '12'">
                  <okr-text-input [i18n]="backgroundI18n()" [value]="background()" (valueChange)="onArticleChange({ background: $event.trim() })"
                                  [maxLength]="backgroundLength" [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('background')" />
                </ion-col>
              }
              @if (hasBackground()) {
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().emphasis_textColor_label()" labelPlacement="stacked"
                              [value]="textColor()" [disabled]="isReadOnly()"
                              (ionChange)="onArticleChange({ textColor: $event.detail.value })">
                    @for (c of textColors; track c) {
                      <ion-select-option [value]="c">{{ textColorLabels()[c] }}</ion-select-option>
                    }
                  </ion-select>
                  <ion-note>{{ i18n().emphasis_textColor_helper() }}</ion-note>
                </ion-col>
              }
              <!-- kept outside the condition: a stored value that fails must still show its error -->
              <ion-col size="12">
                <okr-error-note [errors]="errorsFor('textColor')" />
              </ion-col>
    </ng-template>
  `
})
export class SectionConfiguration {
  // inputs
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  public formData = model.required<SectionModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly headerTitle = input<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly showAdvanced = input(false);
  /** travel journal (spec 1.154): only the title, the one base field its change record carries */
  public readonly journalMode = input(false);
  /** which part to render; the article form renders 'content' and 'appearance' in its two tabs (spec 1.171) */
  public readonly part = input<SectionConfigPart>('all');
  public readonly i18n = input.required<SectionI18n>();

  // fields
  protected okey = computed(() => this.formData().okey ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected title = linkedSignal(() => this.formData().title ?? '');
  protected subTitle = linkedSignal(() => this.formData().subTitle ?? '');
  protected intro = linkedSignal(() => this.formData().intro ?? '');
  /** which optional parts are in use; shared with the panel of the article editor, so that both draw by the same rule */
  private readonly uses = computed(() => articleUses(this.formData()));
  protected hasIntro = computed(() => this.uses().intro);
  protected introPosition = computed<SectionIntroPosition>(() => this.formData().introPosition ?? 'below');
  protected isArticle = computed(() => this.formData().type === 'article');
  protected emphasis = computed<ArticleEmphasis>(() => {
    const section = this.formData();
    return section.type === 'article' ? section.properties?.emphasis ?? 'none' : 'none';
  });
  protected background = computed(() => {
    const section = this.formData();
    return section.type === 'article' ? section.properties?.background ?? '' : '';
  });
  protected hasBackground = computed(() => this.uses().background);
  protected textColor = computed<ArticleTextColor>(() => {
    const section = this.formData();
    return section.type === 'article' ? section.properties?.textColor ?? 'auto' : 'auto';
  });
  protected type = computed(() => this.formData().type);

  // «add, don't show» (spec 1.171 §4.2): in the article's tabs an empty optional field waits behind a «+» chip;
  // a click opens it for this form, a stored value always shows it
  private readonly opened = signal<ReadonlySet<string>>(new Set());
  private readonly isOpen = (id: string): boolean => this.part() === 'all' || this.opened().has(id);
  protected showSubTitle = computed(() => this.uses().subTitle || this.isOpen('subTitle'));
  protected showIntro = computed(() => this.hasIntro() || this.isOpen('intro'));
  protected showBackground = computed(() => this.hasBackground() || this.isOpen('background'));
  protected addChips = computed((): SectionAddChip[] => [
    ...(this.showSubTitle() ? [] : [{ id: 'subTitle', label: this.i18n().article_add_subTitle() }]),
    ...(this.showIntro() ? [] : [{ id: 'intro', label: this.i18n().article_add_intro() }]),
  ]);
  protected backgroundChip = computed((): SectionAddChip[] => [{ id: 'background', label: this.i18n().article_add_background() }]);
  protected state = computed(() => this.formData().state);
  protected roleNeeded = linkedSignal(() => this.formData().roleNeeded ?? 'registered');
  protected widths = computed(() => parseSectionWidths(this.formData().colSize));
  protected widthChoices = computed<Record<SectionScreen, number[]>>(() => {
    const w = this.widths();
    return { sm: sectionWidthChoices(w.sm), md: sectionWidthChoices(w.md), lg: sectionWidthChoices(w.lg) };
  });
  protected headerTitle2 = computed(() => this.headerTitle() ?? this.i18n().form_title);

  // both caps must stay in sync with baseSectionValidations, otherwise the character
  // counter invites input that the vest suite then rejects as 'tooLong'
  protected maxLength = LONG_NAME_LENGTH;
  protected nameMaxLength = NAME_LENGTH;
  protected introMaxLength = COMMENT_LENGTH;
  protected readonly introPositions = SECTION_INTRO_POSITIONS;
  protected readonly emphases = EMPHASES;
  protected readonly textColors = ARTICLE_TEXT_COLORS;
  // the longest value the suite accepts is #rrggbb
  protected readonly backgroundLength = 7;
  protected backgroundI18n = computed((): TextInputI18n => ({
    name: 'articleBackground',
    label: this.i18n().emphasis_background_label(),
    placeholder: '#59A4BF',
    helper: this.i18n().emphasis_background_helper(),
  }));
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().section_config_name_label(),
    placeholder: this.i18n().section_config_name_placeholder(),
    helper: this.i18n().section_config_name_helper(),
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title',
    label: this.i18n().section_config_title_label(),
    placeholder: this.i18n().section_config_title_placeholder(),
    helper: this.i18n().section_config_title_helper(),
  } as TextInputI18n));

  protected subTitleI18n = computed(() => ({
    name: 'subTitle',
    label: this.i18n().section_config_subTitle_label(),
    placeholder: this.i18n().section_config_subTitle_placeholder(),
    helper: this.i18n().section_config_subTitle_helper(),
  } as TextInputI18n));

  protected introI18n = computed(() => ({
    name: 'intro',
    label: this.i18n().section_config_intro_label(),
    placeholder: this.i18n().section_config_intro_placeholder(),
    helper: this.i18n().section_config_intro_helper(),
  } as TextInputI18n));

  protected introPositionLabels = computed<Record<SectionIntroPosition, string>>(() => ({
    above: this.i18n().section_config_introPosition_above(),
    below: this.i18n().section_config_introPosition_below(),
  }));

  protected emphasisLabels = computed<Record<ArticleEmphasis, string>>(() => ({
    none: this.i18n().emphasis_none(),
    banner: this.i18n().emphasis_banner(),
  }));

  protected textColorLabels = computed<Record<ArticleTextColor, string>>(() => ({
    auto: this.i18n().emphasis_textColor_auto(),
    light: this.i18n().emphasis_textColor_light(),
    dark: this.i18n().emphasis_textColor_dark(),
  }));

  protected readonly screens = SECTION_SCREENS;
  protected widthLabels = computed<Record<SectionScreen, string>>(() => ({
    sm: this.i18n().section_config_width_sm(),
    md: this.i18n().section_config_width_md(),
    lg: this.i18n().section_config_width_lg(),
  }));
  private widthNames = computed<Record<number, string>>(() => ({
    12: this.i18n().section_config_width_w12(),
    8: this.i18n().section_config_width_w8(),
    6: this.i18n().section_config_width_w6(),
    4: this.i18n().section_config_width_w4(),
    3: this.i18n().section_config_width_w3(),
  }));

  /** the name of a width; an odd stored one (e.g. 5) shows as «5/12» */
  protected widthLabel(width: number): string {
    return this.widthNames()[width] ?? `${width}/12`;
  }

  protected onWidthChange(screen: SectionScreen, width: unknown): void {
    const n = Number(width);
    if (!Number.isInteger(n) || n < 1 || n > 12) return;
    this.formData.update(vm => ({ ...vm, colSize: setSectionWidth(vm.colSize, screen, n) }));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | RoleName | SectionIntroPosition): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onEmphasisChange(emphasis: ArticleEmphasis): void {
    this.formData.update(vm => vm.type === 'article' ? ({ ...vm, properties: { ...vm.properties, emphasis } } as SectionModel) : vm);
  }

  protected onArticleChange(patch: Partial<ArticleConfig>): void {
    this.formData.update(vm => vm.type === 'article' ? ({ ...vm, properties: { ...vm.properties, ...patch } } as SectionModel) : vm);
  }


  protected onAdd(id: string): void {
    this.opened.update(open => new Set([...open, id]));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
