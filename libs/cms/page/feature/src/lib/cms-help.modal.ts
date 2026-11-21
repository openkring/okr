import { Component, inject, Signal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonListHeader, IonNote } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { CMS_HELP_I18N_KEYS, CmsHelpI18n } from '@okr/cms-page-util';

/** One explained term: a label and its explanation; `swatch` names the border colour of a section state. */
interface HelpEntry {
  label: Signal<string>;
  text: Signal<string>;
  swatch?: string;
}

/**
 * Help modal opened by the (i) button of a CMS page in edit mode.
 * Explains the menu → page → section structure, the menu/page/section types, the coloured section
 * frames (the content state, same colours as `.section-wrapper.state-*` in the pages) and how to
 * publish internally (app) and externally (website). Read-only: nothing to edit or save.
 * Resolves its own i18n map, so the pages only carry the button label.
 */
@Component({
  selector: 'okr-cms-help-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonList, IonListHeader, IonItem, IonLabel, IonNote
  ],
  styles: [`
    .intro { padding: 12px 16px; margin: 0; }
    .subtitle { font-size: 1.1rem; font-weight: bold; }
    .term { font-weight: 600; }
    .swatch {
      width: 28px;
      height: 20px;
      border: 3px solid;
      border-radius: 6px;
      flex-shrink: 0;
      margin-right: 12px;
    }
    .swatch-primary { border-color: var(--ion-color-primary); }
    .swatch-warning { border-color: var(--ion-color-warning); }
    .swatch-success { border-color: var(--ion-color-success); }
    .swatch-danger  { border-color: var(--ion-color-danger); }
    ol { margin: 0; padding: 0 16px 0 36px; }
    li { margin-bottom: 8px; line-height: 1.4; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.title() }" [isModal]="true" />
    <ion-content>
      <p class="intro ion-text-wrap">{{ i18n.intro() }}</p>

      <ion-list lines="none">
        <ion-list-header><ion-label class="subtitle">{{ i18n.structure_title() }}</ion-label></ion-list-header>
        @for (entry of structure; track $index) {
          <ion-item>
            <ion-label class="ion-text-wrap"><span class="term">{{ entry.label() }}:</span> {{ entry.text() }}</ion-label>
          </ion-item>
        }
      </ion-list>

      @for (group of typeGroups; track $index) {
        <ion-list lines="none">
          <ion-list-header><ion-label class="subtitle">{{ group.title() }}</ion-label></ion-list-header>
          @for (entry of group.entries; track $index) {
            <ion-item>
              <ion-label class="ion-text-wrap"><span class="term">{{ entry.label() }}:</span> {{ entry.text() }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }

      <ion-list lines="none">
        <ion-list-header><ion-label class="subtitle">{{ i18n.states_title() }}</ion-label></ion-list-header>
        <ion-item><ion-label class="ion-text-wrap"><ion-note>{{ i18n.states_intro() }}</ion-note></ion-label></ion-item>
        @for (entry of states; track $index) {
          <ion-item>
            <div slot="start" class="swatch swatch-{{ entry.swatch }}"></div>
            <ion-label class="ion-text-wrap"><span class="term">{{ entry.label() }}:</span> {{ entry.text() }}</ion-label>
          </ion-item>
        }
      </ion-list>

      <ion-list lines="none">
        <ion-list-header><ion-label class="subtitle">{{ i18n.editing_title() }}</ion-label></ion-list-header>
        <ion-item><ion-label class="ion-text-wrap">{{ i18n.editing_toggle() }}</ion-label></ion-item>
        <ion-item><ion-label class="ion-text-wrap">{{ i18n.editing_click() }}</ion-label></ion-item>
        <ion-item><ion-label class="ion-text-wrap">{{ i18n.editing_menu() }}</ion-label></ion-item>
      </ion-list>

      <ion-list lines="none">
        <ion-list-header><ion-label class="subtitle">{{ i18n.internal_title() }}</ion-label></ion-list-header>
      </ion-list>
      <ol>
        <li>{{ i18n.internal_step1() }}</li>
        <li>{{ i18n.internal_step2() }}</li>
        <li>{{ i18n.internal_step3() }}</li>
      </ol>

      <ion-list lines="none">
        <ion-list-header><ion-label class="subtitle">{{ i18n.external_title() }}</ion-label></ion-list-header>
      </ion-list>
      <ol>
        <li>{{ i18n.external_step1() }}</li>
        <li>{{ i18n.external_step2() }}</li>
        <li>{{ i18n.external_step3() }}</li>
        <li>{{ i18n.external_step4() }}</li>
      </ol>

    </ion-content>
  `
})
export class CmsHelpModal {
  protected readonly i18n = inject(I18nService).translateAll(CMS_HELP_I18N_KEYS) as CmsHelpI18n;

  protected readonly structure: HelpEntry[] = [
    { label: this.i18n.structure_menu_label, text: this.i18n.structure_menu_text },
    { label: this.i18n.structure_page_label, text: this.i18n.structure_page_text },
    { label: this.i18n.structure_section_label, text: this.i18n.structure_section_text },
  ];

  /** same order and colours as the section frames in edit mode (content.page / dashboard.page / blog layouts) */
  protected readonly states: HelpEntry[] = [
    { label: this.i18n.states_draft_label, text: this.i18n.states_draft_text, swatch: 'primary' },
    { label: this.i18n.states_inReview_label, text: this.i18n.states_inReview_text, swatch: 'warning' },
    { label: this.i18n.states_published_label, text: this.i18n.states_published_text, swatch: 'success' },
    { label: this.i18n.states_inactive_label, text: this.i18n.states_inactive_text, swatch: 'danger' },
  ];

  protected readonly typeGroups: { title: Signal<string>; entries: HelpEntry[] }[] = [
    {
      title: this.i18n.menuTypes_title,
      entries: [
        { label: this.i18n.menu_main_label, text: this.i18n.menu_main_content },
        { label: this.i18n.menu_sub_label, text: this.i18n.menu_sub_content },
        { label: this.i18n.menu_navigate_label, text: this.i18n.menu_navigate_content },
        { label: this.i18n.menu_browse_label, text: this.i18n.menu_browse_content },
        { label: this.i18n.menu_context_label, text: this.i18n.menu_context_content },
        { label: this.i18n.menu_call_label, text: this.i18n.menu_call_content },
        { label: this.i18n.menu_divider_label, text: this.i18n.menu_divider_content },
      ],
    },
    {
      title: this.i18n.pageTypes_title,
      entries: [
        { label: this.i18n.pageTypes_content_label, text: this.i18n.pageTypes_content_text },
        { label: this.i18n.pageTypes_dashboard_label, text: this.i18n.pageTypes_dashboard_text },
        { label: this.i18n.pageTypes_blog_label, text: this.i18n.pageTypes_blog_text },
        { label: this.i18n.pageTypes_landing_label, text: this.i18n.pageTypes_landing_text },
        { label: this.i18n.pageTypes_other_label, text: this.i18n.pageTypes_other_text },
      ],
    },
    {
      title: this.i18n.sectionTypes_title,
      entries: [
        { label: this.i18n.sectionTypes_text_label, text: this.i18n.sectionTypes_text_text },
        { label: this.i18n.sectionTypes_media_label, text: this.i18n.sectionTypes_media_text },
        { label: this.i18n.sectionTypes_events_label, text: this.i18n.sectionTypes_events_text },
        { label: this.i18n.sectionTypes_people_label, text: this.i18n.sectionTypes_people_text },
        { label: this.i18n.sectionTypes_interaction_label, text: this.i18n.sectionTypes_interaction_text },
        { label: this.i18n.sectionTypes_maps_label, text: this.i18n.sectionTypes_maps_text },
      ],
    },
  ];
}
