// libs/social/news-center/ui/src/lib/news-channel.form.ts
import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { isPlaced, NEWS_CHANNEL_NAME_MAX_LENGTH, NewsCenterI18n, NewsChannelFormData, newsChannelValidations } from '@okr/social-news-center-util';

/**
 * A webcam's name, position and host org (design 2026-11-09 §5.3). The position and org rows only show
 * the values and ask the parent modal to pick or clear them; the modal runs the pickers and the geocoding.
 */
@Component({
  selector: 'okr-news-channel-form',
  standalone: true,
  imports: [TextInput, ErrorNote, SvgIconPipe, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onNameChange($event)"
                    [autofocus]="true" [maxLength]="nameMaxLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
              </ion-row>
              @if (showPlace()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-icon slot="start" src="{{ 'location' | svgIcon }}" />
                    <ion-label>
                      <p>{{ i18n().location() }}</p>
                      <h3>{{ positionText() }}</h3>
                    </ion-label>
                    @if (!isReadOnly()) {
                      <ion-button slot="end" fill="clear" [attr.aria-label]="i18n().pick_location()" (click)="pickLocation.emit()">
                        <ion-icon slot="icon-only" src="{{ 'map' | svgIcon }}" />
                      </ion-button>
                      @if (placed()) {
                        <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="i18n().clear_location()" (click)="clearLocation.emit()">
                          <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
                        </ion-button>
                      }
                    }
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-icon slot="start" src="{{ 'people' | svgIcon }}" />
                    <ion-label>
                      <p>{{ i18n().org() }}</p>
                      <h3>{{ orgName() || i18n().no_org() }}</h3>
                    </ion-label>
                    @if (!isReadOnly()) {
                      <ion-button slot="end" fill="clear" [attr.aria-label]="i18n().pick_org()" (click)="pickOrg.emit()">
                        <ion-icon slot="icon-only" src="{{ 'people' | svgIcon }}" />
                      </ion-button>
                      @if (orgKey()) {
                        <ion-button slot="end" fill="clear" [attr.aria-label]="i18n().location_from_org()" (click)="locationFromOrg.emit()">
                          <ion-icon slot="icon-only" src="{{ 'sync' | svgIcon }}" />
                        </ion-button>
                        <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="i18n().clear_org()" (click)="clearOrg.emit()">
                          <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
                        </ion-button>
                      }
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class NewsChannelForm {
  // inputs
  public readonly i18n = input.required<NewsCenterI18n>();
  public formData = model.required<NewsChannelFormData>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);
  /** position + host org rows: webcams only (design 2026-11-09 G2) */
  public readonly showPlace = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly pickLocation = output<void>();
  public readonly clearLocation = output<void>();
  public readonly pickOrg = output<void>();
  public readonly clearOrg = output<void>();
  public readonly locationFromOrg = output<void>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly channelForm = form(this.formData, (path) => validateVestTree(path, newsChannelValidations as any));
  private readonly validationResult = vestErrors(this.channelForm);

  constructor() {
    effect(() => this.valid.emit(this.channelForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly nameMaxLength = NEWS_CHANNEL_NAME_MAX_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly orgKey = computed(() => this.formData()?.orgKey ?? '');
  protected readonly orgName = computed(() => this.formData()?.orgName ?? '');
  protected readonly placed = computed(() => isPlaced(this.formData()));
  protected readonly positionText = computed(() => {
    const d = this.formData();
    return isPlaced(d) ? `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}` : this.i18n().no_location();
  });
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().channel_name(),
    placeholder: '',
  } as TextInputI18n));

  protected onNameChange(name: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, name }));
  }
}
