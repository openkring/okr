import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  IonAccordion, IonButton, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow,
  IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';

import { TextInput, TextInputI18n } from '@bk2/shared-ui';
import { EmailClient, ProfileI18n } from '@bk2/profile-util';

import { SignatureService } from './signature.service';

/**
 * Email-signature export accordion (spec §6). Follows the `profile-privacy` accordion pattern:
 * an `ion-accordion` panel hosting the (validation-free) three-signal form — function / client /
 * format — plus a live sandboxed preview, a copy button and a client-specific install guide.
 * All assembly + clipboard logic lives in the injected {@link SignatureService}.
 */
@Component({
  selector: 'bk-email-signature-accordion',
  standalone: true,
  providers: [SignatureService],
  imports: [
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol, IonNote, IonButton,
    IonSelect, IonSelectOption, IonSegment, IonSegmentButton,
    TextInput,
  ],
  styles: [`
    /* Display-only preview: ignore pointer/touch so drag-scroll passes through to ion-content
       (otherwise the iframe captures the gesture and the install guide below is unreachable by dragging). */
    .sig-preview { width: 100%; min-height: 220px; border: 1px solid var(--ion-color-light-shade); border-radius: 6px; background: #ffffff; pointer-events: none; }
    .sig-guide ol { margin: 0; padding-left: 18px; }
    .sig-guide li { margin-bottom: 4px; }
    @media (width <= 600px) { ion-card { margin: 5px; } }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="email-signature">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ i18n().sig_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      <ion-grid>
        <ion-row>
          <ion-col>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">{{ i18n().sig_description() }}</ion-label>
            </ion-item>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12" size-md="6">
            <bk-text-input [i18n]="functionI18n()" [value]="signatureService.functionLabel()"
              (valueChange)="signatureService.functionLabel.set($event)" [readOnly]="false" [maxLength]="50" />
          </ion-col>
          <ion-col size="12" size-md="6">
            <ion-item lines="none">
              <ion-select label="{{ i18n().sig_client_label() }}" labelPlacement="stacked" interface="popover"
                [value]="signatureService.client()" (ionChange)="onClientChange($event.detail.value)">
                <ion-select-option value="gmail">{{ i18n().sig_client_gmail() }}</ion-select-option>
                <ion-select-option value="outlook-web">{{ i18n().sig_client_outlookWeb() }}</ion-select-option>
                <ion-select-option value="outlook-win">{{ i18n().sig_client_outlookWin() }}</ion-select-option>
                <ion-select-option value="apple-mail-mac">{{ i18n().sig_client_appleMac() }}</ion-select-option>
                <ion-select-option value="apple-mail-ios">{{ i18n().sig_client_appleIos() }}</ion-select-option>
              </ion-select>
            </ion-item>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12" size-md="6">
            <ion-item lines="none">
              <ion-label position="stacked">{{ i18n().sig_format_label() }}</ion-label>
              <ion-segment [value]="signatureService.format()" (ionChange)="onFormatChange($event.detail.value)">
                <ion-segment-button value="html"><ion-label>{{ i18n().sig_format_html() }}</ion-label></ion-segment-button>
                <ion-segment-button value="raw"><ion-label>{{ i18n().sig_format_raw() }}</ion-label></ion-segment-button>
                <ion-segment-button value="text-only"><ion-label>{{ i18n().sig_format_text() }}</ion-label></ion-segment-button>
              </ion-segment>
            </ion-item>
          </ion-col>
        </ion-row>

        @if (signatureService.plan(); as plan) {
          <ion-row>
            <ion-col>
              <ion-item lines="none"><ion-label>{{ i18n().sig_preview() }}</ion-label></ion-item>
              <iframe class="sig-preview" title="{{ i18n().sig_preview() }}" sandbox="" [srcdoc]="safeSrcdoc()"></iframe>
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col>
              <ion-button expand="block" (click)="signatureService.copy()">{{ copyButtonLabel() }}</ion-button>
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col class="sig-guide">
              <ion-item lines="none"><ion-label><strong>{{ i18n().sig_guide_title() }} — {{ plan.guide.title }}</strong></ion-label></ion-item>
              <ol>
                @for (step of plan.guide.steps; track $index) {
                  <li>{{ step }}</li>
                }
              </ol>
              <ion-item lines="none">
                <ion-note class="ion-text-wrap">{{ plan.guide.rawFallback }}</ion-note>
              </ion-item>
            </ion-col>
          </ion-row>
        } @else {
          <ion-row>
            <ion-col>
              <ion-item lines="none"><ion-note class="ion-text-wrap">{{ i18n().sig_no_org() }}</ion-note></ion-item>
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    </div>
  </ion-accordion>
  `,
})
export class EmailSignatureAccordion {
  protected readonly signatureService = inject(SignatureService);
  private readonly sanitizer = inject(DomSanitizer);

  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  public readonly color = input('light');

  /** Copy-button label reflecting the currently selected format (HTML / RAW / Text). */
  protected readonly copyButtonLabel = computed(() => {
    switch (this.signatureService.format()) {
      case 'raw': return this.i18n().sig_copy_raw();
      case 'text-only': return this.i18n().sig_copy_text();
      default: return this.i18n().sig_copy_html();
    }
  });

  protected readonly functionI18n = computed(() => ({
    name: 'functionLabel',
    label: this.i18n().sig_function_label(),
    placeholder: this.i18n().sig_function_placeholder(),
    helper: this.i18n().sig_function_helper(),
  } as TextInputI18n));

  // The preview HTML carries inline styles/tables that Angular's HTML sanitizer would strip;
  // it is rendered into a sandboxed iframe, so bypassing for srcdoc is safe here.
  protected readonly safeSrcdoc = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.signatureService.previewHtml()));

  /** Switching client pre-selects the recommended format (spec §6.1); the user can override. */
  protected onClientChange(client: EmailClient): void {
    this.signatureService.client.set(client);
    this.signatureService.format.set(this.signatureService.plan()?.recommendedFormat ?? 'html');
  }

  protected onFormatChange(format: string | number | undefined): void {
    if (format === 'html' || format === 'raw' || format === 'text-only') this.signatureService.format.set(format);
  }
}
