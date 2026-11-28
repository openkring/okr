import { Component, computed, input, model } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { CategoryListModel, isSameValue, RoleName, SectionModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Chips, ErrorNote, TextareaInput, TextareaInputI18n } from '@okr/shared-ui';
import { hasRole } from '@okr/shared-util-core';
import { getFieldErrors, pickErrors, SectionErrors, SectionI18n } from '@okr/cms-section-util';

import { SectionConfiguration } from './section-configuration';

/** the error names this panel shows at a field; an editor lists them as its own in `restErrors` */
export const SECTION_PANEL_FIELDS = ['title', 'subTitle', 'intro', 'introPosition', 'roleNeeded', 'state', 'colSize', 'name', 'tags', 'notes'];

/**
 * «Abschnitt»: the section's own settings in the panel of every graphical section editor (button, hero, iframe, map, table, video,
 * people), so that they look the same everywhere. A head with the title, what the editor projects with `okrPanelHead`, and a
 * toggle; below it what the editor projects with
 * `okrPanelErrors` (errors no field shows), the errors of title, subtitle and intro (typed on the canvas), then
 * `okr-section-config part="appearance"` («Sektion», «Publikation», «Darstellung»), what the editor projects without a selector
 * (e.g. «Wer» of the people section), and tags and notes. Type and key, tags and notes stand behind the toggle (`showDetails`);
 * tags or notes with an error are shown anyway. Every change sets `section` once.
 */
@Component({
  selector: 'okr-section-panel',
  standalone: true,
  imports: [Chips, ErrorNote, TextareaInput, SectionConfiguration, SvgIconPipe, IonButton, IonIcon],
  styles: [`
    .panel-head { display: flex; align-items: center; gap: 4px; padding: 12px 16px 0; }
    .panel-head h2 { flex: 1; margin: 0; font-size: 1.1rem; font-weight: 600; }
    .rest { padding: 0 16px; }
  `],
  template: `
    @let t = i18n();
    <div class="panel-head">
      <h2>{{ title() || t.section_panel_title() }}</h2>
      <ng-content select="[okrPanelHead]" />
      <ion-button fill="clear" size="small" [title]="t.form_advanced_label()" [attr.aria-label]="t.form_advanced_label()"
        [attr.aria-pressed]="showDetails()" (click)="showDetails.set(!showDetails())">
        <ion-icon slot="icon-only" src="{{ (showDetails() ? 'toggle' : 'toggle-off') | svgIcon }}" aria-hidden="true" />
      </ion-button>
    </div>
    <ng-content select="[okrPanelErrors]" />
    <!-- title, subtitle and intro are typed on the canvas: their errors stand here -->
    <div class="rest">
      <okr-error-note [errors]="errorsFor('title')" />
      <okr-error-note [errors]="errorsFor('subTitle')" />
      <okr-error-note [errors]="errorsFor('intro')" />
    </div>
    <okr-section-config part="appearance" [showIds]="showDetails()" [formData]="section()" (formDataChange)="set($event)"
      [currentUser]="currentUser()" [roles]="roles()" [states]="states()" [showAdvanced]="true" [readOnly]="false" [i18n]="t" [errors]="fieldErrors()" />
    <ng-content />
    @if (hasRole('privileged') && (showDetails() || errorsFor('tags').length > 0)) {
      <okr-chips chipName="tag" [storedChips]="section().tags ?? ''" (storedChipsChange)="setField('tags', $event)" [allChips]="allTags()" [readOnly]="false" />
      <okr-error-note [errors]="errorsFor('tags')" />
    }
    @if (hasRole('admin') && (showDetails() || errorsFor('notes').length > 0)) {
      <okr-textarea-input variant="card" [i18n]="notesI18n()" [value]="section().notes ?? ''" (valueChange)="setField('notes', $event)" [errors]="errorsFor('notes')" [readOnly]="false" />
    }
  `,
})
export class SectionPanel {
  // inputs
  public readonly section = model.required<SectionModel>();
  /** every error of the section's suite; the panel shows those of `SECTION_PANEL_FIELDS` */
  public readonly errors = input<SectionErrors>({});
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly allTags = input('');
  public readonly i18n = input.required<SectionI18n>();
  /** the heading; empty: «Abschnitt» */
  public readonly title = input('');
  /** the toggle in the head: type and key, tags and notes */
  public readonly showDetails = model(false);

  protected readonly fieldErrors = computed(() => pickErrors(this.errors(), SECTION_PANEL_FIELDS));
  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as TextareaInputI18n));

  protected set(section: SectionModel): void {
    if (!isSameValue(section, this.section())) this.section.set(section);
  }

  protected setField(field: 'tags' | 'notes', value: string): void {
    this.set({ ...this.section(), [field]: value });
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.fieldErrors(), field);
  }
}
