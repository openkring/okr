import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_RES_REASON, DEFAULT_TIME } from '@bk2/shared-constants';
import { CategoryListModel, ReservationApplyModel, ReservationModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, CheckboxComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent, TimeInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, debugFormModel, getAvatarName, hasRole } from '@bk2/shared-util-core';

import { reservationApplyValidations } from '@bk2/relationship-reservation-util';

@Component({
  selector: 'bk-reservation-apply-form',
  standalone: true,
  imports: [
    vestForms,
    TextInputComponent,
    NumberInputComponent, NotesInputComponent, CategorySelectComponent, DateInputComponent, 
    CheckboxComponent, TimeInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ol { padding-bottom: 10px; }
  `],
  template: `
    <form scVestForm
      [formValue]="formData()"
      (formValueChange)="onFormChange($event)"
      [suite]="suite" 
      (validChange)="valid.emit($event)"
    >

      <ion-card>
        <ion-card-header>
          <ion-card-title>Zeitliche Angaben</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="fullDay" [checked]="fullDay()" (checkedChange)="onFullDayChange($event)" [showHelper]="true" [readOnly]="false" />
              </ion-col>
            </ion-row>
            @if(!fullDay()) {
              <ion-row>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-date-input name="startDate"  [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="false" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-time-input name="startTime" [value]="startTime()" (valueChange)="onFieldChange('startTime', $event)" [locale]="locale()" [readOnly]="false" />
                </ion-col>
                <ion-col size="12" size-md="6" size-lg="4">
                  <bk-number-input name="durationMinutes" [value]="durationMinutes()" (valueChange)="onFieldChange('durationMinutes', $event)" [readOnly]="false" />
                </ion-col>
              </ion-row>
            } @else {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-date-input name="startDate"  [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [locale]="locale()" [readOnly]="false" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-date-input name="endDate"  [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [locale]="locale()" [readOnly]="false" [showHelper]=true />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Angaben zum Anlass</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [readOnly]="false" /> 
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6"> 
                <bk-cat-select [category]="reasons()" [selectedItemName]="reason()" (selectedItemNameChange)="onFieldChange('reason', $event)" [withAll]=false [readOnly]="false" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="participants" [value]="participants()" (valueChange)="onFieldChange('participants', $event)"  [readOnly]="false" />                                        
              </ion-col>

              <ion-col size="12" size-md="6"> 
                <bk-text-input name="area" [value]="area()" (valueChange)="onFieldChange('area', $event)" [maxLength]=20 [readOnly]="false" />                                        
              </ion-col>
              <ion-col size="12" size-md="6"> 
                <bk-text-input name="bhcomp" [value]="company()" (valueChange)="onFieldChange('company', $event)" [maxLength]=50 [readOnly]="false" />                                        
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="usesTent" [checked]="usesTent()" (checkedChange)="onFieldChange('usesTent', $event)" [showHelper]="true" [readOnly]="false" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-notes name="bhdesc" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="false" />

      <ion-card>
        <ion-card-header>
            <ion-card-title>Vertragsbedingungen</ion-card-title>
            </ion-card-header>
        <ion-card-content class="ion-no-padding">
            <ol>
                <li>Der <b>Ruderbetrieb</b> hat immer Vorrang. Dazu gehören das Bereitstellen der Boote, das Ein- und
Auswassern, sowie die Benützung der Garderoben und Toiletten. Ebenfalls sind die Mitgliederrechte
gemäss Ziffer 1.b) zu gewährleisten. Eine Ausnahme stellt die Mitbenutzung des Aussencheminées
durch ein nicht an der Veranstaltung teilnehmendes Mitglied dar. Dies ist nur nach Absprache mit der
Mieterin/dem Mieter möglich.</li>
                <li>Für einen genehmigten Anlass dürfen <b>Fahrzeuge</b> fur das Anliefern und Abtransportieren von 
Materialien jeweils fur maximal eine halbe Stunde das Grundstück befahren und dort abgestellt 
werden.</li>
                <li>Das Aufstellen von <b>Zelten</b> auf der Spielwiese ist nur in Absprache mit der für die Infrastruktur
zuständigen Person gestattet. Die Beseitigung von allfälligen Rasenschäden, welche nicht innerhalb
von zwei Wochen auswachsen, werden durch die für die Infrastruktur zuständige Person organisiert
und müssen von der Mieterin/vom Mieter bezahlt werden.</li>
                <li>Die Benützung von <b>Sportgeräten</b> des Clubs (Ruderboote, Ergometer, Geräte im Kraftraum, und
Motorboote) durch die Gäste der Mieterin/des Mieters ist untersagt. Gästen unter 10 Jahren ist das
Betreten des Clubhauses nur unter Aufsicht erlaubt.</li>
                <li>Die <b>Tore</b> zu den Bootshallen sind während der gesamten Veranstaltung geschlossen zu halten
(Ausnahme ist der Ruderbetrieb). Die Bootshallen dürfen nicht betreten werden. Zwischen der
Haupteingangstüre und der Treppe ist mit Absperrband ein Durchgang einzurichten. Die
Absperrbänder dürfen nicht übertreten werden. Ein allfällig gemieteter Kühlschrank ist links von der
Haupteingangstüre an der Hausmauer aufzustellen. Beispielbilder sind auf der folgenden Seite zu
finden.</li>
                <li>Veranstaltungen müssen um 24.00 Uhr <b>beendet</b> sein und das Areal ist bis 00.30 Uhr zu verlassen.
Verlängerungen im Rahmen der gesetzlichen Bestimmungen sind auf Beschluss des Vorstandes
möglich. Eine allfällige Polizeibewilligung muss von der Mieterin/vom Mieter bei der
Gemeindebehörde eingeholt werden. </li>
                <li>Der Seeclub Stäfa lehnt jegliche <b>Verantwortung</b> für allfällige Übertretungen oder Verzeigungen ab, die
durch die betreffende Mieterin/den betreffenden Mieter verursacht wurden.</li>
                <li>Die Aufräumarbeiten sind durch die Mieterin/den Mieter in der Regel unmittelbar nach der
Veranstaltung durchzuführen. Falls die Lichtverhältnisse eine gründliche Reinigung und Kontrolle der
Aussenanlagen nicht zulassen, so ist am Folgetag bis spätestens 9.00 Uhr eine Nachreinigung
durchzuführen. </li>
                <li>Allfällige Beanstandungen durch die für die Infrastruktur zuständige Person oder andere
Vorstandsmitglieder sind im Rahmen der gesetzten Frist zu beheben. Andernfalls werden sie zu
Lasten der Mieterin/des Mieters behoben.</li>
                <li>
Die <b>Mietgebühr</b> bezieht sich auf die Veranstaltungsdauer und das Ausmass der Benutzung der
vorhandenen Infrastruktur.<br />
Für die Benutzung des Areals und der Einrichtungen (Wiese, Aussencheminée, sanitäre Anlagen,
Garderoben, Küche) sind folgende Gebühren zu entrichten:<br />
Grundgebühr: CHF 300, ab 50 Gästen CHF 400.-<br />
Zuschlag beim Aufstellen eines Zeltes: CHF 200.-<br />
Die Gebühr muss 5 Tage vor der Durchführung des Anlasses bezahlt werden.</li>
                <li>Die Mieterin/der Mieter setzt sich mindestens eine Woche vor der Veranstaltung mit der
zuständigen Person für die Infrastruktur in Verbindung, damit alle nötigen Details und Fragen geklärt werden können.</li>
                <li>Eine <b>Absage</b> der Veranstaltung ist mindestens 3 Tage vor der Veranstaltung der für die Vermietung
verantwortlichen Person mitzuteilen. Spätere Absagen berechtigen nicht zu einer Erstattung der
bereits bezahlten Mietgebühr.</li>                
            </ol>
            <ion-item lines="none">
                Neben den vertraglichen Bedingungen erklärt sich die Mieterin/der Mieter einverstanden mit den im
Allgemeinen Reglement für die Benutzung des Clubareals“ festgelegten Bedingungen. Bei abweichenden Vorschriften gehen die mietvertraglichen Bedingungen vor.
            </ion-item>
            <ion-item lines="none">
                Bei Nichteinhaltung von Vertragsbedingungen oder des Allgemeinen Reglements werden daraus
entstehende Kosten der Mieterin/dem Mieter nachträglich in Rechnung gestellt (Reparaturen, Reinigung,
nicht nachgefülltes Brennholz, nicht mitgenommene volle Abfallsäcke, herumliegende
Zigarettenstummeln etc.). Der Vorstand behält sich zudem das Recht vor, die Mieterin/den Mieter für
zukünftige Veranstaltungen zu sperren.
</ion-item>
        </ion-card-content>
      </ion-card>
    
      <ion-card>
        <ion-card-header>
            <ion-card-title>Bestätigung</ion-card-title>
            </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <bk-checkbox name="bhresconf" [checked]="isConfirmed()" (checkedChange)="onFieldChange('isConfirmed', $event)" [showHelper]="false" [readOnly]="false" />
        </ion-card-content>
      </ion-card>

    </form>
  `
})
export class ReservationApplyForm {
  // inputs
  public formData = model.required<ReservationApplyModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly reasons = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readonly locale = input.required<string>();

  // signals
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = reservationApplyValidations;
  private readonly validationResult = computed(() => reservationApplyValidations(this.formData()));

  // fields
  protected reserverAvatar = linkedSignal(() => this.formData().reserver);
  protected reserverName = computed(() => getAvatarName(this.reserverAvatar(), this.currentUser()?.nameDisplay));
  protected reserverModelType = computed(() => this.reserverAvatar()?.modelType as string ?? 'person');
  protected reserverKey = computed(() => this.reserverAvatar()?.key ?? DEFAULT_KEY);
  protected reserverAvatarKey = computed(() => `${this.reserverModelType()}.${this.reserverKey()}`);

  protected resourceAvatar = linkedSignal(() => this.formData().resource);
  protected resourceName = computed(() => getAvatarName(this.resourceAvatar()));
  protected resourceType = computed(() => this.resourceAvatar()?.type ?? '');
  protected resourceKey = computed(() => this.resourceAvatar()?.key ?? DEFAULT_KEY);
  protected resourceAvatarKey = computed(() => `resource.${this.resourceType()}:${this.resourceKey()}`);

  protected startDate = linkedSignal(() => this.formData().startDate ?? DEFAULT_DATE);
  protected startTime = linkedSignal(() => this.formData().startTime ?? DEFAULT_TIME);
  protected durationMinutes = linkedSignal(() => this.formData().durationMinutes ?? 60);
  protected endDate = linkedSignal(() => this.formData().endDate ?? this.startDate());
  protected fullDay = linkedSignal(() => this.formData().fullDay ?? false);
  protected company = linkedSignal(() => this.formData().company ?? '');
  protected usesTent = linkedSignal(() => this.formData().usesTent ?? false);
  protected isConfirmed = linkedSignal(() => this.formData().isConfirmed ?? false);

  protected participants = linkedSignal(() => this.formData().participants ?? '');
  protected area = linkedSignal(() => this.formData().area ?? '');
  protected reason = linkedSignal(() => this.formData().reason ?? DEFAULT_RES_REASON);
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected description = linkedSignal(() => this.formData().description ?? '');

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
  
  protected onFormChange(value: ReservationApplyModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('ReservationApplyForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('ReservationApplyForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFullDayChange(isFullDay: boolean): void {
    if (isFullDay) {
      this.formData.update(vm => ({
        ...vm,
        fullDay: true,
        durationMinutes: 1440,
        startTime: ''
      }));
    } else {
      this.formData.update(vm => ({
        ...vm,
        fullDay: false,
        endDate: vm.startDate
      }));
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
