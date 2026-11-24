import { DestroyRef, Directive, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';

import { HelperVisibility, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import { SETTINGS_GROUPS, settingsFieldKey, settingsHelperKey, settingsValidations } from '@okr/tenant-util';
import type { SettingsContext, SettingsGroupId, SettingsI18n, TenantSettings } from '@okr/tenant-util';

/** Satisfies the i18n input of every shared/ui field the settings forms use. */
export interface SettingsFieldI18n { name: string; label: string; placeholder: string; helper: string; }

/**
 * What every settings form shares: inputs, outputs, the signal form over the Vest suite of its group, and per field
 * the texts, the value and the errors. A form is only its template, its `group` and its length constants.
 * Every field the suite checks shows `<okr-error-note [errors]="errors()['field']" />` right below it.
 */
@Directive()
export abstract class SettingsFormBase {
  protected readonly helperVisibility = inject(HelperVisibility);

  // inputs
  public readonly i18n = input.required<SettingsI18n>();
  public formData = model.required<TenantSettings>();
  /** the values as loaded and the two domains: what the suite needs beyond the model */
  public readonly context = input.required<SettingsContext>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true); // toggled by the modal to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** true while the form does something the user must not interrupt (an upload): the modal then hides the change confirmation */
  public readonly busy = output<boolean>();

  /** The group the form edits. A getter, because it is read while the base class is being constructed. */
  protected abstract get group(): SettingsGroupId;

  // validity comes from the form, never from suite.isValid(): the suite skips unchanged fields
  private readonly suiteWithContext = (settings: TenantSettings) => settingsValidations[this.group](settings, this.context());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly settingsForm = form(this.formData, (path) => validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.settingsForm);

  /** the key of the action running now (an upload, a picker), '' when none: only one at a time, the buttons read it */
  protected readonly working = signal('');
  /** Counts the resets and the end of the form: a result that arrives for an older one belongs to nothing any more. */
  private generation = 0;

  constructor() {
    effect(() => this.valid.emit(this.settingsForm().valid()));
    inject(DestroyRef).onDestroy(() => { this.generation = -1; });
    // the modal's cancel switches the form off and on again, with the values as loaded
    effect(() => { if (!this.showForm()) untracked(() => { this.generation++; this.working.set(''); this.busy.emit(false); }); });
  }

  /**
   * Runs an action the user must not interrupt or double (an upload, a picker): the form is busy meanwhile. Answers what
   * `call` answered, or undefined when it threw, when another action runs or the form is read-only, and when the form
   * was destroyed or reset meanwhile — emitting an output after that would throw (NG0953), so the caller never writes then.
   */
  protected async runExclusive<T>(key: string, call: () => Promise<T | undefined>): Promise<T | undefined> {
    if (this.working() !== '' || this.isReadOnly()) return undefined;
    const generation = this.generation;
    this.working.set(key);
    this.busy.emit(true);
    let result: T | undefined;
    try {
      result = await call();
    } catch {
      result = undefined; // the caller has told the user; the value stays
    }
    if (this.generation !== generation) return undefined;
    this.working.set('');
    this.busy.emit(false);
    return result;
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly publicNote = computed(() => this.text('public_note'));

  protected readonly fields = computed(() => this.perField((field): SettingsFieldI18n => ({
    name: field, label: this.text(settingsFieldKey(field)), placeholder: '', helper: this.text(settingsHelperKey(field)),
  })));
  /** the text fields; a field that holds no string reads as '' */
  protected readonly values = computed(() => {
    const data = this.formData() as Record<string, unknown>;
    return this.perField((field) => (typeof data[field] === 'string' ? data[field] : ''));
  });
  protected readonly errors = computed(() => {
    const result = this.validationResult();
    return this.perField((field) => result.getErrors(field));
  });

  protected text(name: string): string {
    return this.i18n()[name]?.() ?? '';
  }

  protected onFieldChange(field: string, value: unknown): void {
    this.dirty.emit(true);
    this.formData.update((settings) => ({ ...settings, [field]: value ?? '' }));
  }

  private perField<T>(of: (field: string) => T): Record<string, T> {
    return Object.fromEntries(SETTINGS_GROUPS[this.group].map((field) => [field, of(field)])) as Record<string, T>;
  }
}
