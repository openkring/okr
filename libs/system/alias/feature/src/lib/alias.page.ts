import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AliasModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { DateFormat, convertDateFormatToString, getTodayStr } from '@okr/shared-util-core';
import { AliasService } from '@okr/system-alias-data-access';
import { AliasQr } from '@okr/system-alias-ui';
import { ALIAS_I18N_KEYS, AliasI18n, buildTargetUrl, getAliasUsability } from '@okr/system-alias-util';

/**
 * Die Detailseite eines Alias (`/alias/:aliasKey`).
 *
 * Sie ist bewusst READ-ONLY. Alias und Space stehen in der Document-ID und damit in jeder
 * gedruckten Adresse; wer das Ziel umleiten will, tut das über das Formular, wer den Code
 * ändern will, prägt einen neuen.
 *
 * Die Statistik zeigt heute nur `useCount` und `lastUsedAt` vom Alias selbst. Die Tagesaggregate
 * (`aliasStats`) schreibt erst Teilprojekt 4 — deshalb ein ehrlicher Leerzustand statt eines
 * Diagramms, das dauerhaft null anzeigt.
 */
@Component({
  selector: 'okr-alias-page',
  standalone: true,
  imports: [
    Spinner, AliasQr, SvgIconPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonNote, IonChip,
  ],
  styles: [`
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/alias/all/alias-context" /></ion-buttons>
        <ion-title>{{ i18n.detail_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (alias(); as alias) {
        <ion-card>
          <ion-card-header>
            <ion-card-title class="mono">{{ alias.space }}/{{ alias.alias }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="none">
              <ion-item>
                <ion-label>
                  <p>{{ i18n.detail_shorturl() }}</p>
                  <h2 class="mono">{{ shortUrl() }}</h2>
                </ion-label>
                <ion-button slot="end" fill="clear" (click)="copy()">
                  <ion-icon slot="start" src="{{ 'copy' | svgIcon }}" />
                  {{ copied() ? i18n.detail_copied() : i18n.detail_copy() }}
                </ion-button>
              </ion-item>
              <ion-item>
                <ion-label>
                  <p>{{ i18n.detail_target() }}</p>
                  <h2 class="mono">{{ target() || '—' }}</h2>
                </ion-label>
              </ion-item>
              @if (stateLabel(); as state) {
                <ion-item><ion-chip color="medium">{{ state }}</ion-chip></ion-item>
              }
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n.detail_qr_title() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <okr-alias-qr [value]="shortUrl()" [fileName]="alias.space + '-' + alias.alias"
              [downloadLabel]="i18n.detail_qr_download()" ecc="Q" />
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n.detail_stats_title() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            @if (alias.useCount === 0) {
              <ion-note>{{ i18n.detail_stats_empty() }}</ion-note>
            } @else {
              <ion-list lines="none">
                <ion-item>
                  <ion-label>{{ i18n.detail_stats_usecount() }}</ion-label>
                  <ion-label slot="end">{{ alias.useCount }}</ion-label>
                </ion-item>
                <ion-item>
                  <ion-label>{{ i18n.detail_stats_lastused() }}</ion-label>
                  <ion-label slot="end">{{ lastUsed() }}</ion-label>
                </ion-item>
              </ion-list>
            }
          </ion-card-content>
        </ion-card>
      } @else {
        <okr-spinner />
      }
    </ion-content>
  `,
})
export class AliasPage {
  private readonly aliasService = inject(AliasService);
  protected readonly i18n = inject(I18nService).translateAll(ALIAS_I18N_KEYS) as AliasI18n;

  /** Route-Parameter: die Document-ID `<tenant>__<space>__<alias>`. */
  public readonly aliasKey = input.required<string>();

  protected readonly copied = signal(false);

  /**
   * rxResource statt toSignal: `aliasKey` ist ein REQUIRED input und darf im
   * Feld-Initialisierer noch nicht gelesen werden (Angular wirft NG0950). rxResource liest den
   * Parameter erst im params-Callback, also nachdem der Router ihn gebunden hat — und lädt neu,
   * wenn sich die Route ändert.
   */
  private readonly aliasResource = rxResource({
    params: () => ({ key: this.aliasKey() }),
    stream: ({ params }) => this.aliasService.read(params.key),
  });
  protected readonly alias = computed<AliasModel | undefined>(() => this.aliasResource.value());

  /** Origin der laufenden App — dieselbe Domain, auf der auch der Resolver antwortet. */
  private readonly origin = typeof window !== 'undefined' ? window.location.origin : '';

  protected readonly shortUrl = computed(() => {
    const alias = this.alias();
    return alias ? `${this.origin}/s/${alias.space}/${alias.alias}` : '';
  });

  protected readonly target = computed(() => {
    const alias = this.alias();
    return alias ? buildTargetUrl(alias, this.origin) : '';
  });

  protected readonly lastUsed = computed(() => {
    const raw = this.alias()?.lastUsedAt ?? '';
    if (!raw) return this.i18n.detail_stats_never();
    return convertDateFormatToString(raw, DateFormat.StoreDateTime, DateFormat.ViewDate, false);
  });

  protected stateLabel(): string {
    const alias = this.alias();
    if (!alias) return '';
    switch (getAliasUsability(alias, getTodayStr(DateFormat.StoreDate))) {
      case 'disabled': return this.i18n.state_disabled();
      case 'archived': return this.i18n.state_archived();
      case 'notYetValid': return this.i18n.state_notyetvalid();
      case 'expired': return this.i18n.state_expired();
      case 'exhausted': return this.i18n.state_exhausted();
      default: return '';
    }
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.shortUrl());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
