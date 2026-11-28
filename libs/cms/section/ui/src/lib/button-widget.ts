import { AsyncPipe, NgStyle } from '@angular/common';
import { Component, computed, inject, input, output, Signal } from '@angular/core';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { IonButton, IonIcon, ModalController, ToastController } from '@ionic/angular';

import { ButtonActions, ColorsIonic, getCategoryStringField } from '@okr/shared-categories';
import { ENV } from '@okr/shared-config';
import { BUTTON_HEIGHT, BUTTON_WIDTH } from '@okr/shared-constants';
import { ButtonAction, ButtonSection, ColorIonic } from '@okr/shared-models';
import { showZoomedImage } from '@okr/shared-ui';
import { DEFAULT_BUTTON_ICON_SIZE, toCssLength, withFixedEmergencyLook } from '@okr/cms-section-util';
import { TranslatePipe } from '@okr/shared-i18n';
import { downloadToBrowser, navigateByUrl } from '@okr/shared-util-angular';
import { getSvgIconUrl } from '@okr/shared-util-core';
import { IMAGE_STYLE_SHAPE } from '@okr/shared-models';

interface ButtonWidgetI18n {
  button_image_zoomed: Signal<string>;
}

@Component({
  selector: 'okr-button-widget',
  standalone: true,
  imports: [
    NgStyle, AsyncPipe, TranslatePipe,
    IonButton, IonIcon
  ],
  styles: [`
    .container { margin: 0 auto !important; text-align: center; vertical-align: middle;}
    ion-button {
      width: var(--button-width);
      height: var(--button-height);
      min-width: var(--button-width);
      min-height: var(--button-height);
    }
    /* a button without fill reads as a link: as it is written, not in capitals */
    ion-button.link { text-transform: none; letter-spacing: normal; }
  `],
  template: `
    <div class="container">
      <ion-button (click)="action()"
        [class.link]="fill() === 'clear'"
        [ngStyle]="buttonStyle()"
        shape="{{ shape() }}"
        fill="{{ fill() }}"
        color="{{ colorName() }}"
        size="large"
        [attr.aria-label]="ariaLabel() || ((actionI18nBase() + '.label') | translate | async)"
      >
        @if(iconName()) {
          <ion-icon [ngStyle]="iconStyle()" src="{{ iconSrc() }}" slot="{{ iconSlot() }}" aria-hidden="true" />
        }
        @if(label(); as label) { {{ label }} }
      </ion-button>
    </div>
  `
})
export class ButtonWidget {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly router = inject(Router);
  protected readonly env = inject(ENV);

  // inputs
  /** a button that raises the alarm is drawn as the emergency button, whatever its stored style (`withFixedEmergencyLook`) */
  public section = input.required<ButtonSection, ButtonSection>({ transform: withFixedEmergencyLook });
  public editMode = input<boolean>(false);
  public readonly i18n = input.required<ButtonWidgetI18n>();

  public clicked = output<string>();
  /** ButtonAction.Workflow: the press itself is the event. Deliberately NOT `clicked`, whose
   *  payload is the modal-config string the section resolves through the modal registry. */
  public workflow = output<void>();
  /** ButtonAction.Contract (spec 1.87): the section runs the request; the kind is read server-side. */
  public contract = output<void>();
  /** ButtonAction.ContractDocument (spec 1.97): the section signs the shared file(s); payload = contractKey. */
  public contractDocument = output<string>();
  /** ButtonAction.Emergency: the section raises the alarm of the emergency group (it needs no url). */
  public emergency = output<void>();

  private readonly imgixBaseUrl = this.env.services.imgixBaseUrl;

  // derived values
  /** no icon name = a text-only button */
  protected iconName = computed(() => this.section().properties?.icon?.name ?? '');
  protected iconSlot = computed(() => this.section().properties?.icon?.slot ?? 'start');
  protected label = computed(() => this.section().properties?.style?.label ?? '');
  protected shape = computed(() => this.section().properties?.style?.shape ?? 'default');
  protected fill = computed(() => this.section().properties?.style?.fill ?? 'solid');
  /** stored as digits ("60") — a unit-less custom property made `width: var(--button-width)` invalid, so it was ignored */
  protected width = computed(() => toCssLength(this.section().properties?.style?.width, BUTTON_WIDTH));
  protected height = computed(() => toCssLength(this.section().properties?.style?.height, BUTTON_HEIGHT));
  protected iconStyle = computed(() => ({ 'font-size': (this.section().properties?.icon?.size ?? DEFAULT_BUTTON_ICON_SIZE) + 'px' }));
  protected actionType = computed(() => this.section().properties?.action?.type ?? ButtonAction.None);
  protected url = computed(() => this.section().properties?.action?.url ?? '');
  protected buttonStyle = computed(() => {
    return {
      '--button-width': this.width(),
      '--button-height': this.height(),
      'color': this.color()
    };
  });

  // an icon name is bare for the default set (`download`) or `<set>:<name>` for any other (`filetypes:pdf`)
  protected iconSrc = computed(() => getSvgIconUrl(this.imgixBaseUrl, this.iconName()));
  protected color = computed(() => this.section().properties?.style?.color ?? ColorIonic.Primary);
  protected colorName = computed(() => getCategoryStringField(ColorsIonic, this.color(), 'name'));
 
  /** the alt text, else the label, else the section's title; empty → the template falls back to the translated name of the action */
  protected ariaLabel = computed(() => this.section().properties?.action?.altText || this.label() || this.section().title?.trim() || '');
  protected actionI18nBase = computed(() =>
    ButtonActions.find((a) => a.id === this.actionType())?.i18nBase ?? '@shared/categories.buttonAction.none');

  protected imageStyle = computed(() => this.section()?.properties?.imageStyle ?? IMAGE_STYLE_SHAPE);

  protected async action(): Promise<void> {
    if (this.editMode()) return;
    // Dispatched BEFORE the `if (url)` guard on purpose: a workflow button has no url, so
    // handling it inside that guard would make every trigger silently do nothing. This is the
    // single most likely implementation bug in spec 2026-08-29 §2, and it is called out there.
    if (this.actionType() === ButtonAction.Emergency) {
      this.emergency.emit();
      return;
    }
    if (this.actionType() === ButtonAction.Workflow) {
      this.workflow.emit();
      return;
    }
    if (this.actionType() === ButtonAction.Contract) {
      this.contract.emit();
      return;
    }
    if (this.actionType() === ButtonAction.ContractDocument) {
      this.contractDocument.emit(this.url());
      return;
    }
    const url = this.url();
    if (url) {
      switch (this.actionType()) {
        case ButtonAction.Download:
          if (url.startsWith('http'))  await downloadToBrowser(this.toastController, url);
          else                         await downloadToBrowser(this.toastController, this.imgixBaseUrl + '/' + url);
          break;
        case ButtonAction.Navigate:
          await navigateByUrl(this.router, this.url());
          break;
        case ButtonAction.Browse:
          await Browser.open({ url: this.url() });
          break;
        case ButtonAction.Zoom:
          await showZoomedImage(this.modalController, this.url(), this.i18n().button_image_zoomed(), this.imageStyle(), this.label(), 'modal-fullscreen'); 
          break;
        case ButtonAction.None:
          break;
        case ButtonAction.Notify:
          this.clicked.emit(this.url())
          break;
      }
    }
  }
}