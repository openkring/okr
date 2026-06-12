import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonLabel, IonRow, IonToggle } from '@ionic/angular/standalone';

import { Button, Header, ResultLog, StringSelect, StringSelectI18n } from '@bk2/shared-ui';

import { AocAdminOpsStore } from './aoc-adminops.store';

@Component({
  selector: 'bk-aoc-adminops',
  standalone: true,
  imports: [
    Header, Button, ResultLog, StringSelect,
    IonContent, IonCardHeader, IonCardTitle, IonCardContent, IonCard, IonGrid, IonRow, IonCol, IonLabel, IonToggle,
    FormsModule
  ],
  providers: [AocAdminOpsStore],
  template: `
    <bk-header [i18n]="{ title: adminOpsTitle() }" />
    <ion-content>
      <!-- Debug Card -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.adminops_debug_tools() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="8">
                <ion-label>{{ store.i18n.adminops_focus_event_logging() }}</ion-label>
              </ion-col>
              <ion-col size="4">
                <ion-toggle [checked]="enableFocusLogging()" (ionChange)="onToggleChange($event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.adminops_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <!-- IBAN -->
            <ion-row>
              <ion-col size="6">{{ store.i18n.adminops_iban_label() }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ store.i18n.adminops_iban_button() }}" iconName="checkbox-circle" (click)="listIban()" />
              </ion-col>
            </ion-row>
            <!-- Old Juniors -->
            <ion-row>
              <ion-col size="6">{{ store.i18n.adminops_oldJuniors_label() }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ store.i18n.adminops_oldJuniors_button() }}" iconName="checkbox-circle" (click)="listOldJuniors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col><ion-label>"{{ store.i18n.adminops_mcatchange_title() }}"</ion-label></ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <bk-string-select [i18n]="clubI18n()" [selectedString]="club()" (selectedStringChange)="onFieldChange('club', $event)" [readOnly]="false" [stringList]="['scs', 'srv']" />
              </ion-col>
              <ion-col size="6">      
                <bk-string-select [i18n]="yearI18n()" [selectedString]="year()" (selectedStringChange)="onFieldChange('year', $event)" [readOnly]="false" [stringList]="['2026', '2025', '2024', '2023', '2022', '2021']" />           
              </ion-col>
              <ion-col size="6">
              </ion-col>
              <ion-col size="6">
                <bk-button [label]="store.i18n.adminops_mcatchange_button()" iconName="checkbox-circle" (click)="showMembershipCategoryChanges()" />
              </ion-col>
            </ion-row>
            <!-- Find orphaned sections -->
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [cardTitle]="store.i18n.result_title()" [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocAdminOps {
  protected readonly store = inject(AocAdminOpsStore);

  // derived
  protected readonly logTitle = computed(() => this.store.logTitle());
  protected readonly logInfo = computed(() => this.store.log());
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly adminOpsTitle = computed(() => this.store.i18n.adminops_title());

  protected clubI18n = computed(() => ({ name: 'club', label: this.store.i18n.adminops_club_label() } as StringSelectI18n));
  protected yearI18n = computed(() => ({ name: 'year', label: this.store.i18n.adminops_year_label() } as StringSelectI18n));

  // signals
  protected club = signal('scs');
  protected year = signal('2025');
  protected enableFocusLogging = signal(false);

  constructor() {
    // Setup focus event listener based on toggle
    effect((onCleanup) => {
      if (typeof document === 'undefined') return;

      const enabled = this.enableFocusLogging();
      
      if (enabled) {
        const focusListener = (e: FocusEvent) => {
          console.log('🔍 Focus on:', e.target, {
            tagName: (e.target as HTMLElement).tagName,
            className: (e.target as HTMLElement).className,
            id: (e.target as HTMLElement).id,
            tabIndex: (e.target as HTMLElement).tabIndex,
            name: (e.target as HTMLInputElement).name
          });
        };
        
        document.addEventListener('focusin', focusListener);
        console.log('✅ Focus logging enabled');
        
        onCleanup(() => {
          document.removeEventListener('focusin', focusListener);
          console.log('❌ Focus logging disabled');
        });
      }
    });
  }

  public listIban(): void {
    this.store.listIban();
  }

  public listOldJuniors(): void {
    this.store.listJuniorsOlderThan();
  }

  public showMembershipCategoryChanges(): void {
    this.store.setModelType('membership');
    this.store.showMembershipCategoryChanges(this.club(), parseInt(this.year(), 10));
  }

  protected onFieldChange(fieldName: string, $event: string): void {
    if (fieldName === 'club') {
      this.club.set($event);
    } else if (fieldName === 'year') {
      this.year.set($event);
    }
  }

  protected onToggleChange(event: any): void {
    this.enableFocusLogging.set(event.detail.checked);
  }
}
