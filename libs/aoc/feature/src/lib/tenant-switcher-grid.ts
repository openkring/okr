import { Component, input, output } from '@angular/core';
import { IonIcon, IonImg } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { getImgixUrlWithAutoParams } from '@okr/shared-util-core';
import { TenantSwitcherEntry } from '@okr/aoc-util';

@Component({
  selector: 'okr-tenant-switcher-grid',
  standalone: true,
  imports: [IonIcon, IonImg, SvgIconPipe],
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px; }
    .tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px;
            border-radius: 10px; background: transparent; border: none; cursor: pointer; color: inherit; }
    .tile:hover:not(.current) { background: rgba(0, 0, 0, 0.06); }
    .tile.current { opacity: 0.5; cursor: default; }
    .logo { width: 40px; height: 40px; }
    .placeholder { width: 40px; height: 40px; color: var(--ion-color-medium); }
    .label { font-size: 12px; text-align: center; max-width: 100%; overflow: hidden;
             text-overflow: ellipsis; white-space: nowrap; }
    .badge { font-size: 10px; color: var(--ion-color-medium); }
    @media (prefers-color-scheme: dark) { .tile:hover:not(.current) { background: rgba(255, 255, 255, 0.10); } }
  `],
  template: `
    <div class="grid">
      @for (entry of entries(); track entry.tenantId) {
        <button type="button" class="tile" [class.current]="entry.isCurrent"
                [disabled]="entry.isCurrent" (click)="onSelect(entry)">
          @if (logoSrc(entry); as src) {
            <ion-img class="logo" [src]="src" [alt]="entry.label" />
          } @else {
            <ion-icon class="placeholder" src="{{ 'apps' | svgIcon }}" />
          }
          <span class="label">{{ entry.label }}</span>
          @if (entry.isCurrent) { <span class="badge">{{ currentLabel() }}</span> }
        </button>
      }
    </div>
  `,
})
export class TenantSwitcherGrid {
  public readonly entries = input.required<TenantSwitcherEntry[]>();
  public readonly imgixBaseUrl = input<string>('');
  public readonly currentLabel = input<string>('');
  public readonly select = output<TenantSwitcherEntry>();

  protected logoSrc(entry: TenantSwitcherEntry): string {
    if (!entry.logoUrl || !this.imgixBaseUrl()) return '';
    return `${this.imgixBaseUrl()}/${getImgixUrlWithAutoParams(entry.logoUrl)}`;
  }

  protected onSelect(entry: TenantSwitcherEntry): void {
    if (entry.isCurrent) return;
    this.select.emit(entry);
  }
}
