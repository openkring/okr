import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton, IonSelect, IonSelectOption } from '@ionic/angular';

import { ButtonActions } from '@okr/shared-categories';
import { COMMENT_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { TranslatePipe } from '@okr/shared-i18n';
import { ButtonAction, ButtonConfig, EditorConfig, ViewPosition } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import {
  applyButtonAction, applyButtonPreset, applyButtonSize, applyIconPlacement, BUTTON_PRESETS, ButtonEditorI18n, ButtonPreset, buttonActionChoices,
  buttonConfigOf, buttonPresetOf, ButtonSize, buttonSizeOf, buttonSizesFor, getFieldErrors, ICON_PLACEMENTS, IconPlacement, iconPlacementOf,
  SECTION_ICON_PICKER, SectionErrors,
} from '@okr/cms-section-util';

import { ButtonConfiguration, } from './button-configuration';
import { ContractOption } from './button-action-configuration';

/** A form a button may open (`action.url` = 'form:<formKey>'). */
export interface ButtonFormOption { formKey: string; name: string }

const FORM_PREFIX = 'form:';
const POSITIONS: readonly ViewPosition[] = [ViewPosition.Left, ViewPosition.Right, ViewPosition.Top, ViewPosition.Bottom, ViewPosition.None];
/** the width of the button next to the text, of 12 (`content.colSize`) */
const RATIOS = [3, 4, 6] as const;

/**
 * The settings of an «Aktions-Button» in the button editor, shown while the button is selected: what it does first, then its label,
 * look, size, icon and where it stands next to the text. The toggle beside «Button» in the editor's panel head (`showDetails`) adds
 * the url (where an upload, a form or a contract list stands for it), the alt text and the former settings, field by field
 * (`okr-button-config`), for what no preset covers. A field with an error is shown anyway. Every change sets `config` or `content` once.
 */
@Component({
  selector: 'okr-button-panel',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, ButtonConfiguration, ErrorNote, TextInput,
    IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
  ],
  styles: [`
    .field-label { display: block; margin: 0 0 6px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .note { display: block; margin-top: 6px; font-size: 0.85rem; }
    .upload { margin: 10px 0 0; text-transform: none; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .choice { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 8px; text-align: start; font: inherit; font-size: 0.9rem;
      color: var(--ion-text-color); background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; cursor: pointer; }
    .choice ion-icon { flex: none; font-size: 20px; }
    .choice.current { border: 2px solid var(--ion-color-primary); padding: 5px 7px; }
    .presets { display: flex; flex-wrap: wrap; gap: 6px; }
    .preset { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 76px; padding: 8px 4px; font: inherit; font-size: 0.75rem;
      color: var(--ion-text-color); background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; cursor: pointer; }
    .preset.current { border: 2px solid var(--ion-color-primary); padding: 7px 3px; }
    .sample { display: flex; align-items: center; justify-content: center; height: 28px; min-width: 40px; padding: 0 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; }
    .sample.main { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .sample.outline { border: 1.5px solid var(--ion-color-primary); color: var(--ion-color-primary); }
    .sample.link { color: var(--ion-color-primary); text-decoration: underline; }
    .sample.round { width: 28px; min-width: 0; padding: 0; border-radius: 50%; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .sample.emergency { width: 34px; height: 34px; min-width: 0; padding: 0; border-radius: 50%; font-size: 0.6rem; background: var(--ion-color-danger); color: var(--ion-color-danger-contrast); }
    .layouts { display: flex; flex-wrap: wrap; gap: 6px; }
    .layout { display: flex; gap: 3px; width: 52px; height: 36px; padding: 4px; background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 6px; cursor: pointer; }
    .layout.current { border: 2px solid var(--ion-color-primary); padding: 3px; }
    .layout .b { flex: none; background: var(--ion-color-primary); border-radius: 2px; }
    .layout .t { flex: 1; background: var(--ion-color-light-shade); border-radius: 2px; }
    .layout.col { flex-direction: column; }
    .layout.col .b { height: 35%; }
    .layout.row .b { width: 35%; }
    .layout.alone .b { flex: 1; }
    .reverse.row { flex-direction: row-reverse; }
    .reverse.col { flex-direction: column-reverse; }
    ion-segment { margin-bottom: 4px; }
    /* four short choices in a 360 px panel: no capitals, little padding, so none is cut off */
    ion-segment-button { min-width: 0; --padding-start: 2px; --padding-end: 2px; text-transform: none; letter-spacing: 0; font-size: 0.85rem; }
  `],
  template: `
    @let t = i18n();
    <!-- what it does -->
    <ion-card>
      <ion-card-content>
        <span class="field-label">{{ t.button_editor_action_title() }}</span>
        <div class="actions" role="radiogroup" [attr.aria-label]="t.button_editor_action_title()">
          @for (a of actions(); track a.id) {
            <button type="button" class="choice" role="radio" [class.current]="a.id === actionType()" [attr.aria-checked]="a.id === actionType()" [disabled]="readOnly()" (click)="setAction(a.id)">
              <ion-icon src="{{ a.icon | svgIcon }}" aria-hidden="true" />
              <span>{{ (a.i18nBase + '.label') | translate | async }}</span>
            </button>
          }
        </div>
        @switch (actionType()) {
          @case (BA.Emergency) { <ion-note class="note">{{ t.button_editor_action_emergency() }}</ion-note> }
          @case (BA.Workflow) { <ion-note class="note">{{ t.button_editor_action_workflow() }}</ion-note> }
          @case (BA.None) { <ion-note class="note">{{ t.button_editor_action_none() }}</ion-note> }
          @case (BA.Download) {
            @if (uploads()) {
              <ion-button class="upload" fill="outline" size="small" [disabled]="readOnly() || uploading()" (click)="upload.emit()">
                <ion-icon slot="start" src="{{ 'upload' | svgIcon }}" aria-hidden="true" />
                {{ uploading() ? t.button_editor_action_uploading() : t.button_editor_action_upload() }}
              </ion-button>
              <ion-note class="note">{{ t.button_editor_action_uploadHelper() }}</ion-note>
            }
            @if (showUrl(uploads())) {
              <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="setActionField('url', $event)" [maxLength]="urlLength" [readOnly]="readOnly()" />
            }
            <okr-error-note [errors]="errorsFor('action.url')" />
          }
          @case (BA.ContractDocument) {
            @if (contracts().length > 0) {
              <ion-select [label]="t.contract_document_label()" labelPlacement="stacked" interface="popover" [value]="url()" [disabled]="readOnly()" (ionChange)="setActionField('url', $event.detail.value)">
                @for (c of contracts(); track c.okey) { <ion-select-option [value]="c.okey">{{ c.name }}</ion-select-option> }
              </ion-select>
              <ion-note class="note">{{ t.contract_document_helper() }}</ion-note>
            } @else {
              <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="setActionField('url', $event)" [readOnly]="readOnly()" />
            }
            <okr-error-note [errors]="errorsFor('action.url')" />
          }
          @case (BA.Notify) {
            @if (forms().length > 0) {
              <ion-select [label]="t.button_editor_action_form()" labelPlacement="stacked" interface="popover" [value]="formKey()" [disabled]="readOnly()" (ionChange)="setActionField('url', formPrefix + $event.detail.value)">
                @for (f of forms(); track f.formKey) { <ion-select-option [value]="f.formKey">{{ f.name }}</ion-select-option> }
              </ion-select>
              <ion-note class="note">{{ t.button_editor_action_formHelper() }}</ion-note>
            }
            @if (showUrl(forms().length > 0)) {
              <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="setActionField('url', $event)" [maxLength]="urlLength" [readOnly]="readOnly()" />
            }
            <okr-error-note [errors]="errorsFor('action.url')" />
          }
          @default {
            <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="setActionField('url', $event)" [maxLength]="urlLength" [readOnly]="readOnly()" />
            <okr-error-note [errors]="errorsFor('action.url')" />
          }
        }
      </ion-card-content>
    </ion-card>

    <!-- label and look -->
    <ion-card>
      <ion-card-content>
        @if (placement() !== 'icon-only') {
          <okr-text-input [i18n]="labelI18n()" [value]="config().style.label" (valueChange)="setLabel($event)" [maxLength]="labelLength" [readOnly]="readOnly()" />
          <okr-error-note [errors]="errorsFor('style.label')" />
        }
        <!-- empty, it falls back to the label, then to the section's title (an upload fills in the title, else the file name) -->
        @if (showDetails() || errorsFor('action.altText').length > 0) {
          <okr-text-input [i18n]="altTextI18n()" [value]="config().action.altText ?? ''" (valueChange)="setActionField('altText', $event)" [maxLength]="altTextLength" [readOnly]="readOnly()" />
          <okr-error-note [errors]="errorsFor('action.altText')" />
        }

        <span class="field-label">{{ t.button_editor_look_title() }}</span>
        <div class="presets" role="radiogroup" [attr.aria-label]="t.button_editor_look_title()">
          @for (p of presets; track p) {
            <button type="button" class="preset" role="radio" [class.current]="p === preset()" [attr.aria-checked]="p === preset()" [disabled]="readOnly()" (click)="setPreset(p)">
              <span [class]="'sample ' + p">
                @switch (p) {
                  @case ('round') { <ion-icon src="{{ 'add' | svgIcon }}" aria-hidden="true" /> }
                  @case ('emergency') { {{ emergencySample }} }
                  @default { Aa }
                }
              </span>
              {{ presetLabels()[p] }}
            </button>
          }
        </div>
        @if (!preset()) { <ion-note class="note">{{ t.button_editor_look_own() }}</ion-note> }
        <okr-error-note [errors]="lookErrors()" />

        <!-- the emergency button has a fixed look (withFixedEmergencyLook): no size, no icon -->
        @if (preset() !== 'emergency') {
          <span class="field-label" style="margin-top: 14px">{{ t.button_editor_size_title() }}</span>
          <ion-segment [value]="size() ?? ''" [disabled]="readOnly()" [attr.aria-label]="t.button_editor_size_title()" (ionChange)="setSize($event.detail.value)">
            @for (s of sizes(); track s) { <ion-segment-button [value]="s"><ion-label>{{ sizeLabels()[s] }}</ion-label></ion-segment-button> }
          </ion-segment>
          @if (!size()) { <ion-note class="note">{{ t.button_editor_size_own() }}</ion-note> }
        }
        <okr-error-note [errors]="sizeErrors()" />

        @if (preset() !== 'emergency') {
          <span class="field-label" style="margin-top: 14px">{{ t.button_editor_icon_title() }}</span>
          <ion-segment [value]="placement()" [disabled]="readOnly()" [attr.aria-label]="t.button_editor_icon_title()" (ionChange)="setPlacement($event.detail.value)">
            @for (p of placements; track p) { <ion-segment-button [value]="p"><ion-label>{{ placementLabels()[p] }}</ion-label></ion-segment-button> }
          </ion-segment>
          @if (placement() !== 'none' && !readOnly()) {
            <ion-button size="small" fill="outline" (click)="pickIcon()">
              <ion-icon slot="start" src="{{ config().icon.name | svgIcon }}" aria-hidden="true" />{{ t.button_editor_icon_choose() }}
            </ion-button>
          }
          <okr-error-note [errors]="iconErrors()" />
        }
      </ion-card-content>
    </ion-card>

    <!-- where the button stands next to the text -->
    <ion-card>
      <ion-card-content>
        <span class="field-label">{{ t.button_editor_layout_title() }}</span>
        <div class="layouts" role="radiogroup" [attr.aria-label]="t.button_editor_layout_title()">
          @for (p of positions; track p) {
            <button type="button" role="radio" [class]="layoutClass(p)" [class.current]="p === position()" [attr.aria-checked]="p === position()"
              [attr.aria-label]="positionLabels()[p]" [title]="positionLabels()[p]" [disabled]="readOnly()" (click)="setContent({ position: p })">
              <span class="b"></span>@if (p !== VP.None) { <span class="t"></span> }
            </button>
          }
        </div>
        <ion-note class="note">{{ positionLabels()[position()] }}</ion-note>
        @if (position() === VP.Left || position() === VP.Right) {
          <span class="field-label" style="margin-top: 14px">{{ t.button_editor_layout_ratio() }}</span>
          <ion-segment [value]="ratio()" [disabled]="readOnly()" [attr.aria-label]="t.button_editor_layout_ratio()" (ionChange)="setRatio($event.detail.value)">
            @for (r of ratios; track r) { <ion-segment-button [value]="r"><ion-label>{{ ratioLabel(r) }}</ion-label></ion-segment-button> }
          </ion-segment>
        }
      </ion-card-content>
    </ion-card>

    <!-- what no preset covers: the former settings, field by field (behind the toggle) -->
    @if (showDetails()) {
      <okr-button-config [style]="config().style" (styleChange)="setConfig({ style: $event })" [icon]="config().icon" (iconChange)="setConfig({ icon: $event })"
        [action]="config().action" (actionChange)="setConfig({ action: $event })" [contracts]="contracts()" [readOnly]="readOnly()" [i18n]="i18n()" [errors]="errors()" />
    }
  `,
})
export class ButtonPanel {
  private readonly iconPicker = inject(SECTION_ICON_PICKER, { optional: true });

  // inputs
  public readonly config = input<ButtonConfig, ButtonConfig | undefined>(buttonConfigOf(undefined), { transform: buttonConfigOf });
  public readonly content = input.required<EditorConfig>();
  public readonly contracts = input<ContractOption[]>([]);
  public readonly forms = input<ButtonFormOption[]>([]);
  public readonly errors = input<SectionErrors>({});
  public readonly readOnly = input(false);
  /** whether a file may be uploaded into a download button here (the editor knows how) */
  public readonly uploads = input(false);
  public readonly uploading = input(false);
  public readonly i18n = input.required<ButtonEditorI18n>();
  /** the toggle beside «Button»: url, alt text and the field-by-field settings */
  public readonly showDetails = input(false);

  // outputs
  public readonly configChange = output<ButtonConfig>();
  public readonly contentChange = output<EditorConfig>();
  /** pick and upload a file for the download button */
  public readonly upload = output<void>();

  // constants for the template
  protected readonly BA = ButtonAction;
  protected readonly VP = ViewPosition;
  protected readonly presets = BUTTON_PRESETS;
  protected readonly placements = ICON_PLACEMENTS;
  protected readonly positions = POSITIONS;
  protected readonly ratios = RATIOS;
  protected readonly formPrefix = FORM_PREFIX;
  protected readonly emergencySample = 'SOS';
  /** kept in step with the caps the Vest suite enforces */
  protected readonly labelLength = LONG_NAME_LENGTH;
  protected readonly urlLength = URL_LENGTH;
  protected readonly altTextLength = COMMENT_LENGTH;

  // action
  protected readonly actionType = computed(() => this.config().action.type ?? ButtonAction.None);
  protected readonly actions = computed(() => buttonActionChoices(ButtonActions, this.actionType()));
  protected readonly url = computed(() => this.config().action.url ?? '');
  protected readonly formKey = computed(() => this.url().startsWith(FORM_PREFIX) ? this.url().slice(FORM_PREFIX.length) : '');

  // look
  protected readonly preset = computed(() => buttonPresetOf(this.config()));
  protected readonly size = computed(() => buttonSizeOf(this.config().style));
  protected readonly sizes = computed(() => buttonSizesFor(this.config().style));
  protected readonly placement = computed(() => iconPlacementOf(this.config().icon));
  protected readonly lookErrors = computed(() => ['style.shape', 'style.fill', 'style.color'].flatMap((field) => this.errorsFor(field)));
  protected readonly sizeErrors = computed(() => ['style.width', 'style.height'].flatMap((field) => this.errorsFor(field)));
  protected readonly iconErrors = computed(() => ['icon.name', 'icon.size', 'icon.slot'].flatMap((field) => this.errorsFor(field)));

  // layout
  protected readonly position = computed(() => this.content()?.position ?? ViewPosition.None);
  protected readonly ratio = computed(() => this.content()?.colSize ?? 6);

  // texts
  protected readonly presetLabels = computed<Record<ButtonPreset, string>>(() => {
    const t = this.i18n();
    return { main: t.button_editor_look_main(), outline: t.button_editor_look_outline(), link: t.button_editor_look_link(), round: t.button_editor_look_round(), emergency: t.button_editor_look_emergency() };
  });
  protected readonly sizeLabels = computed<Record<ButtonSize, string>>(() => {
    const t = this.i18n();
    return { s: t.button_editor_size_s(), m: t.button_editor_size_m(), l: t.button_editor_size_l(), xl: t.button_editor_size_xl() };
  });
  protected readonly placementLabels = computed<Record<IconPlacement, string>>(() => {
    const t = this.i18n();
    return { none: t.button_editor_icon_none(), start: t.button_editor_icon_start(), end: t.button_editor_icon_end(), 'icon-only': t.button_editor_icon_only() };
  });
  protected readonly positionLabels = computed<Record<ViewPosition, string>>(() => {
    const t = this.i18n();
    return {
      [ViewPosition.None]: t.button_position_none(), [ViewPosition.Top]: t.button_position_top(), [ViewPosition.Bottom]: t.button_position_bottom(),
      [ViewPosition.Left]: t.button_position_left(), [ViewPosition.Right]: t.button_position_right(),
    };
  });
  protected readonly labelI18n = computed<TextInputI18n>(() => ({
    name: 'buttonLabel', label: this.i18n().button_editor_label_label(), placeholder: this.i18n().button_editor_label_placeholder(), helper: '',
  }));
  protected readonly urlI18n = computed<TextInputI18n>(() => ({
    name: 'actionUrl', label: this.i18n().url_label(), placeholder: this.i18n().url_placeholder(), helper: this.i18n().url_helper(),
  }));
  protected readonly altTextI18n = computed<TextInputI18n>(() => ({
    name: 'altText', label: this.i18n().altText_label(), placeholder: this.i18n().altText_placeholder(), helper: this.i18n().button_altText_helper(),
  }));

  /************************************** changes *********************************************** */
  protected setConfig(patch: Partial<ButtonConfig>): void {
    this.configChange.emit({ ...this.config(), ...patch });
  }

  protected setAction(type: ButtonAction): void {
    if (type !== this.actionType()) this.configChange.emit(applyButtonAction(this.config(), type));
  }

  protected setActionField(field: 'url' | 'altText', value: string): void {
    this.setConfig({ action: { ...this.config().action, [field]: value ?? '' } });
  }

  protected setLabel(label: string): void {
    this.setConfig({ style: { ...this.config().style, label } });
  }

  protected setPreset(preset: ButtonPreset): void {
    if (preset !== this.preset()) this.configChange.emit(applyButtonPreset(this.config(), preset));
  }

  protected setSize(value: unknown): void {
    const size = this.sizes().find((s) => s === value);
    if (size && size !== this.size()) this.setConfig({ style: applyButtonSize(this.config().style, size) });
  }

  protected setPlacement(value: unknown): void {
    const placement = ICON_PLACEMENTS.find((p) => p === value);
    if (placement && placement !== this.placement()) this.configChange.emit(applyIconPlacement(this.config(), placement));
  }

  protected async pickIcon(): Promise<void> {
    const name = await this.iconPicker?.pick(this.config().icon.name);
    if (name) this.setConfig({ icon: { ...this.config().icon, name } });
  }

  protected setContent(patch: Partial<EditorConfig>): void {
    this.contentChange.emit({ ...this.content(), ...patch });
  }

  protected setRatio(value: unknown): void {
    const ratio = RATIOS.find((r) => r === Number(value));
    if (ratio && ratio !== this.ratio()) this.setContent({ colSize: ratio });
  }

  protected ratioLabel(ratio: number): string {
    return ratio === 3 ? '¼' : ratio === 4 ? '⅓' : '½';
  }

  protected layoutClass(position: ViewPosition): string {
    switch (position) {
      case ViewPosition.Left: return 'layout row';
      case ViewPosition.Right: return 'layout row reverse';
      case ViewPosition.Top: return 'layout col';
      case ViewPosition.Bottom: return 'layout col reverse';
      default: return 'layout alone';
    }
  }

  /** the url field: always behind the toggle where something else fills it in (`replaced`); with an error shown anyway */
  protected showUrl(replaced: boolean): boolean {
    return !replaced || this.showDetails() || this.errorsFor('action.url').length > 0;
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
