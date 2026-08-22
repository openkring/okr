import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { IonButton, IonIcon, IonLabel } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { renderQrSvg } from '@okr/system-alias-util';

/**
 * QR-Vorschau eines Kurzlinks.
 *
 * Der Encoder ist unsere eigene Implementierung in `@okr/system-alias-util` — Angular-frei und
 * deshalb von hier UND vom PDF-Generator nutzbar. Das SVG ist selbst erzeugt und enthält weder
 * Skripte noch externe Referenzen; `bypassSecurityTrustHtml` ist hier deshalb vertretbar und
 * nicht der übliche Fehlgriff.
 *
 * Der Download geht über einen Blob und `URL.createObjectURL`, nicht über eine data:-URL:
 * Letztere reisst bei grösseren Codes in Safari ab.
 */
@Component({
  selector: 'okr-alias-qr',
  standalone: true,
  imports: [IonButton, IonIcon, IonLabel, SvgIconPipe],
  styles: [`
    .qr-frame {
      display: flex; justify-content: center; padding: 1rem;
      background: #ffffff; border-radius: 8px;
    }
    .qr-frame ::ng-deep svg { width: 100%; max-width: 220px; height: auto; }
    .qr-actions { display: flex; justify-content: center; margin-top: .5rem; }
  `],
  template: `
    <div class="qr-frame">
      <div [innerHTML]="svg()"></div>
    </div>
    @if (showDownload()) {
      <div class="qr-actions">
        <ion-button fill="clear" size="small" (click)="download()">
          <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
          <ion-label>{{ downloadLabel() }}</ion-label>
        </ion-button>
      </div>
    }
  `,
})
export class AliasQr {
  private readonly sanitizer = inject(DomSanitizer);

  public readonly value = input.required<string>();
  public readonly fileName = input('qr-code');
  public readonly downloadLabel = input('SVG');
  public readonly showDownload = input(true);
  /** 'Q' (25 %) für gedruckte Plakate, 'M' (15 %) für den Bildschirm. */
  public readonly ecc = input<'L' | 'M' | 'Q' | 'H'>('M');

  protected readonly rawSvg = computed(() => renderQrSvg(this.value(), { ecc: this.ecc() }));
  protected readonly svg = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.rawSvg()),
  );

  protected download(): void {
    const blob = new Blob([this.rawSvg()], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.fileName()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
