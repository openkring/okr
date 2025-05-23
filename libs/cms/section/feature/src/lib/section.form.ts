import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { vestForms } from 'ngx-vest-forms';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';

import { CategoryComponent, NotesInputComponent, TextInputComponent, ButtonCopyComponent, ChipsComponent, ErrorNoteComponent } from '@bk2/shared/ui';
import { RoleEnums, SectionTypes, ViewPositions } from '@bk2/shared/categories';
import { CategoryNamePipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ModelType, RoleEnum, SectionType, Table, UserModel } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { debugFormErrors, hasRole, isPerson } from '@bk2/shared/util';
import { PersonSelectModalComponent } from '@bk2/shared/feature';

import { AppStore } from '@bk2/auth/feature';

import { newButton, newIcon, newTable, SectionFormModel, sectionFormValidations } from '@bk2/cms/section/util';
import { AlbumSectionConfigComponent, ArticleSectionConfigComponent, ButtonSectionConfigComponent, IframeSectionFormComponent, ImageConfigFormComponent, ImageListComponent, MapSectionFormComponent, PeopleListFormComponent, SingleImageComponent, TableSectionFormComponent, VideoSectionFormComponent } from '@bk2/cms/section/ui';

@Component({
  selector: 'bk-section-form',
  imports: [
    vestForms, FormsModule,
    TranslatePipe, AsyncPipe, CategoryNamePipe,
    ChipsComponent, NotesInputComponent, TextInputComponent, CategoryComponent,
    ImageConfigFormComponent, SingleImageComponent,
    IframeSectionFormComponent, ImageListComponent, ErrorNoteComponent,
    MapSectionFormComponent, TableSectionFormComponent, ButtonSectionConfigComponent,
    VideoSectionFormComponent, PeopleListFormComponent, ArticleSectionConfigComponent,
    IonGrid, IonRow, IonCol, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem,
    ButtonCopyComponent, AlbumSectionConfigComponent

],
  template: `
  <form scVestForm
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-grid>
      <!---------------------------------------------------
      CONTENT 
      --------------------------------------------------->
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ '@content.section.forms.title' | translate | async }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item lines="none">
                <ion-label>{{ '@content.section.default.type' | translate | async }}: {{ vm().type | categoryName:STS }}</ion-label>
              </ion-item>
              @if(bkey(); as bkey) {
                <ion-item lines="none">
                  <ion-label>Section Key: {{ bkey }}</ion-label>
                  <bk-button-copy [value]="bkey" />
                </ion-item>
              }
              <bk-text-input name="name" [value]="vm().name ?? ''" [showHelper]=true />
              <bk-error-note [errors]="nameErrors()" />

              <bk-cat name="roleNeeded" [value]="roleNeeded()" [categories]="roles" (changed)="onChange('roleNeeded', $event)"/>
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>

      <!-- section specific settings must be defined within ion-row -->
      @switch(vm().type) {
        @case(ST.Album) { 
          <bk-album-section-config [vm]="vm()" (changed)="onChange()" />
          <bk-image-config-form [vm]="vm()" />
        }
        @case(ST.Article) {
          <bk-single-image [vm]="vm()" />
          <bk-article-section-config [vm]="vm()" />
        }
        <!-- tbd: ChartSectionForm is not yet implemented -->

        @case(ST.Gallery) {
          <bk-image-list [vm]="vm()" />
          <bk-image-config-form [vm]="vm()" />
        }
                       
        @case(ST.Hero) {
          <ion-row>
            <ion-col size="12">
              <ion-label>{{ '@content.section.forms.imageConfig.heroInfo' | translate | async }}</ion-label>
            </ion-col>
          </ion-row>
          <bk-image-list [vm]="vm()" />
        }
        @case(ST.Map) {
          <bk-map-section-form [vm]="vm()" />
        }
        @case(ST.PeopleList) {
          <bk-people-list-form [vm]="vm()" (changed)="onChange()" (selectClicked)="selectPerson()" />
        }
        @case(ST.Slider) {
          <bk-image-list [vm]="vm()" />
          <bk-image-config-form [vm]="vm()" />
        }
        <!-- tbd: ListSectionForm is not yet implemented -->
        @case(ST.Video) {
          <bk-video-section-form [vm]="vm()" />
        }
        <!-- tbd: CalendarSectionForm is not yet implemented --> 
        @case(ST.Button) {
          <bk-button-section-config [vm]="vm()" />
        }
        @case(ST.Table) {
          <bk-table-section-form [table]="table()!" (changed)="onChange('table', $event)" />  
        }
        @case(ST.Iframe) {     
          <bk-iframe-section-form [vm]="vm()" />
        }
      }

      <!---------------------------------------------------
      TAG, NOTES 
      --------------------------------------------------->
      @if(hasRole('privileged')) {
        <ion-row>                       
          <ion-col>
            <bk-chips chipName="tag" [storedChips]="vm().tags ?? ''" [allChips]="sectionTags()" />
          </ion-col>
        </ion-row>
      }
      @if(hasRole('admin')) {
        <ion-row>
          <ion-col>
          <bk-notes [value]="vm().description ?? ''" />
          </ion-col>
        </ion-row>
      }
    </ion-grid>
  </form>
  `
})
export class SectionFormComponent {
  protected modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public readonly vm = model.required<SectionFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly sectionTags = input.required<string>();
  
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = sectionFormValidations;
  //protected readonly shape = sectionFormModelShape;
  private readonly validationResult = computed(() => sectionFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  public table = computed(() => this.vm().properties?.table ?? newTable());
  public icon = computed(() => this.vm().properties?.icon ?? newIcon());
  public button = computed(() => this.vm().properties?.button ?? newButton()); 
  protected roleNeeded = computed(() => this.vm().roleNeeded ?? RoleEnum.Registered);
  protected bkey = computed(() => this.vm().bkey ?? '');
  protected persons = computed(() => this.vm().properties?.persons ?? []);

  public viewPositions = ViewPositions;
  public STS = SectionTypes;
  public ST = SectionType;
  protected roles = RoleEnums;

  protected onValueChange(value: SectionFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName?: string, $event?: string | string[] | number | Table): void {
    if (fieldName) {
      this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    }
    debugFormErrors('SectionForm (onChange)', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  public async selectPerson(): Promise<void> {
    console.log('selectPerson');
    const _modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.env.owner.tenantId)) {
        const persons = this.persons();
        persons.push({
          key: data.bkey,
          name1: data.firstName,
          name2: data.lastName,
          label: '',
          modelType: ModelType.Person
        });
        this.vm.update((vm) => ({ ...vm, properties: { ...vm.properties, persons } }));
        debugFormErrors('SectionForm (modal)', this.validationResult().errors, this.currentUser());
        this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
        this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());    
      }
    }
  }
}
