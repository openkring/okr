import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonLabel, IonRow, IonToggle } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonComponent, HeaderComponent, ResultLogComponent, StringSelectComponent } from '@bk2/shared-ui';

import { AocAdminOpsStore } from './aoc-adminops.store';

@Component({
  selector: 'bk-aoc-adminops',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent, ButtonComponent, ResultLogComponent, StringSelectComponent,
    IonContent, IonCardHeader, IonCardTitle, IonCardContent, IonCard, IonGrid, IonRow, IonCol, IonLabel, IonToggle,
    FormsModule
  ],
  providers: [AocAdminOpsStore],
  template: `
    <bk-header title="@aoc.title" />
    <ion-content>
      <!-- Debug Card -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Debug Tools</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="8">
                <ion-label>Enable Focus Event Logging</ion-label>
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
          <ion-card-title>{{ '@aoc.adminops.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <!-- IBAN -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.iban.label' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.adminops.iban.button' | translate | async }}" iconName="checkbox-circle" (click)="listIban()" />
              </ion-col>
            </ion-row>
            <!-- Old Juniors -->
            <ion-row>
              <ion-col size="6">{{ '@aoc.adminops.oldJuniors.label' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button label=" {{ '@aoc.adminops.oldJuniors.button' | translate | async }}" iconName="checkbox-circle" (click)="listOldJuniors()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col><ion-label>Änderungen der Mitgliederkategorie</ion-label></ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <bk-string-select name="club"  [selectedString]="club()" (selectedStringChange)="onFieldChange('club', $event)" [readOnly]="false" [stringList] = "['scs', 'srv']" />
              </ion-col>
              <ion-col size="6">      
                <bk-string-select name="year"  [selectedString]="year()" (selectedStringChange)="onFieldChange('year', $event)" [readOnly]="false" [stringList] = "['2026', '2025', '2024', '2023', '2022', '2021']" />           
              </ion-col>
              <ion-col size="6">
              </ion-col>
              <ion-col size="6">
                <bk-button label="Anzeigen" iconName="checkbox-circle" (click)="showMembershipCategoryChanges()" />
              </ion-col>
            </ion-row>
            <!-- Find orphaned sections -->
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocAdminOpsComponent {
  private readonly aocAdminOpsStore = inject(AocAdminOpsStore);

  protected readonly logTitle = computed(() => this.aocAdminOpsStore.logTitle());
  protected readonly logInfo = computed(() => this.aocAdminOpsStore.log());
  protected readonly isLoading = computed(() => this.aocAdminOpsStore.isLoading());

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
    this.aocAdminOpsStore.listIban();
  }

  public listOldJuniors(): void {
    this.aocAdminOpsStore.listJuniorsOlderThan();
  }

  public showMembershipCategoryChanges(): void {
    this.aocAdminOpsStore.setModelType('membership');
    this.aocAdminOpsStore.showMembershipCategoryChanges(this.club(), parseInt(this.year(), 10));
  }

  protected onFieldChange(fieldName: string, $event: string): void {
    if (fieldName === 'club') {
      this.club.set($event);
    } else if (fieldName === 'year') {
      this.year.set($event);
    }
  }

  protected onToggleChange(event: any): void {
    const checked = event.detail.checked;
    console.log('Toggle changed:', checked);
    this.enableFocusLogging.set(checked);
  }
}
