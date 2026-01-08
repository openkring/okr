import { Component, computed, input, linkedSignal, model } from '@angular/core';

import { AlbumConfig, AlbumSection, ArticleSection, ButtonActionConfig, ButtonSection, ButtonStyle, CategoryListModel, ChatConfig, ChatSection, EDITOR_CONFIG_SHAPE, EditorConfig, GallerySection, HeroSection, IconConfig, IframeConfig, IframeSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, MapConfig, MapSection, PeopleConfig, PeopleSection, RoleName, SectionModel, SliderSection, TableGrid, TableSection, TableStyle, TrackerConfig, TrackerSection, UserModel, VideoConfig, VideoSection } from '@bk2/shared-models';
import { ChipsComponent, ImageConfigComponent, NotesInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

import { SectionConfigComponent } from './section-config';
import { EditorConfigComponent } from './editor-config';
import { ImageStyleComponent } from './image-style';
import { AlbumConfigComponent } from './album-config';
import { IframeConfigComponent } from './iframe-config';
import { PeopleConfigComponent } from './people-config';
import { VideoConfigComponent } from './video-config';
import { ButtonStyleComponent } from './button-style';
import { ButtonActionComponent } from './button-action';
import { IconConfigComponent } from './icon-config';
import { ChatConfigComponent } from './chat-config';
import { MapConfigComponent } from './map-config';
import { TrackerConfigComponent } from './tracker-config';
import { TableGridComponent } from './table-grid';
import { TableStyleComponent } from './table-style';
import { TableDataComponent } from './table-data';

@Component({
  selector: 'bk-section-form',
  standalone: true,
  imports: [
    ChipsComponent, NotesInputComponent,
    SectionConfigComponent, EditorConfigComponent, ImageConfigComponent, ImageStyleComponent, AlbumConfigComponent,
    IframeConfigComponent, PeopleConfigComponent, VideoConfigComponent, ButtonStyleComponent, ButtonActionComponent, IconConfigComponent,
    ChatConfigComponent, MapConfigComponent, TrackerConfigComponent, TableGridComponent, TableStyleComponent, TableDataComponent
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <bk-section-config [(formData)]="formData" [currentUser]="currentUser()" [roles]="roles()" [readOnly]="isReadOnly()" />

      @switch (formData().type) {
        @case('album') {
          @if(albumConfig(); as albumConfig) {
            <bk-album-config [formData]="albumConfig" (formDataChange)="onAlbumConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }

        @case('article') {
          @if(content(); as content) {
            <bk-editor-config [formData]="content" (formDataChange)="onContentChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(imageConfig(); as imageConfig) {
            <bk-image-config [formData]="imageConfig" (formDataChange)="onImageConfigChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }
        }

        @case('button') {
          @if(content(); as content) {
            <bk-editor-config [formData]="content" (formDataChange)="onContentChange($event)" [readOnly]="isReadOnly()" />
          } 
          @if(buttonActionConfig(); as buttonActionConfig) {
            <bk-button-action [formData]="buttonActionConfig" (formDataChange)="onButtonActionChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(iconConfig(); as iconConfig) {
            <bk-icon-config [formData]="iconConfig" (formDataChange)="onIconConfigChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(buttonStyle(); as buttonStyle) {
            <bk-button-style [formData]="buttonStyle" (formDataChange)="onButtonStyleChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('cal') {
          <!-- Calendar-specific, e.g., calendarOptions -->
        }
        @case('chart') {
          <!-- Chart-specific, e.g., chartOptions -->
        }
        @case('chat') {
          @if(chatConfig(); as chatConfig) {
            <bk-chat-config [formData]="chatConfig" (formDataChange)="onChatConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('gallery') {
          <!-- tbd: GalleryConfig add images: ImageConfig[] -->
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('hero') {
          @if(logoConfig(); as logoConfig) {
            <bk-image-config [formData]="logoConfig" (formDataChange)="onImageConfigChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(heroConfig(); as heroConfig) {
            <bk-image-config [formData]="heroConfig" (formDataChange)="onImageConfigChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }

        }
        @case('iframe') {
          @if(iframeConfig(); as iframeConfig) {
            <bk-iframe-config [formData]="iframeConfig" (formDataChange)="onIframeConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('map') {
          @if(mapConfig(); as mapConfig) {
            <bk-map-config [formData]="mapConfig" (formDataChange)="onMapConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('people') {
          /**
            avatar: AvatarConfig;
            persons: AvatarInfo[]; // list of persons to be shown
          tbd: peopleConfig: AvatarInfo triggert noch nicht und select funktioniert noch nicht
          */
          @if(peopleConfig(); as peopleConfig) {
              <bk-people-config [formData]="peopleConfig" (formDataChange)="onPeopleConfigChange($event)" [currentUser]="currentUser()" [readOnly]="isReadOnly()" />
          }
        }
        @case('slider') {
          <!-- tbd: SliderConfig add images: ImageConfig[] -->
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('table') {
          @if(tableGrid(); as tableGrid) {
            <bk-table-grid [formData]="tableGrid" (formDataChange)="onTableGridChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(headerStyle(); as headerStyle) {
            <bk-table-style name="header" [formData]="headerStyle" (formDataChange)="onHeaderStyleChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(bodyStyle(); as bodyStyle) {
            <bk-table-style name="body" [formData]="bodyStyle" (formDataChange)="onBodyStyleChange($event)" [readOnly]="isReadOnly()" />
          }
          <bk-table-data name="tableHeader" [formData]="headerData()" (formDataChange)="onTableHeaderChange($event)" [readOnly]="isReadOnly()" />
          <bk-table-data name="tableBody" [formData]="bodyData()" (formDataChange)="onTableBodyChange($event)" [readOnly]="isReadOnly()" />
        }
        @case('tracker') {
          @if(trackerConfig(); as trackerConfig) {
            <bk-tracker-config [formData]="trackerConfig" (formDataChange)="onTrackerConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('video') {
          @if(videoConfig(); as videoConfig) {
            <bk-video-config [formData]="videoConfig" (formDataChange)="onVideoConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
      }
    
      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [readOnly]="isReadOnly()" [allChips]="allTags()" />
      }
      @if(hasRole('admin')) {
        <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    }
  `
})
/** 
 * Because vest validation is type specific and we want to have a generic section form component for all union types, we do not use vest here.
 */
export class SectionFormComponent {
  // inputs
  public formData = model.required<SectionModel>();
  public currentUser = input.required<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived linked signals
  protected directory = linkedSignal(() => this.formData().type === 'album' ? (this.formData() as any).directory ?? '' : '' );
  protected content = linkedSignal(() => this.getContent());
  protected albumConfig = linkedSignal(() => this.getAlbumConfig());
  protected imageConfig = linkedSignal(() => this.getImageConfig());
  protected imageStyle = linkedSignal(() => this.getImageStyle());
  protected buttonActionConfig = linkedSignal(() => this.getButtonActionConfig());
  protected buttonStyle = linkedSignal(() => this.getButtonStyle());
  protected iconConfig = linkedSignal(() => this.getIconConfig());
  protected chatConfig = linkedSignal(() => this.getChatConfig());
  protected logoConfig = linkedSignal(() => this.getLogoConfig());
  protected heroConfig = linkedSignal(() => this.getHeroConfig());
  protected iframeConfig = linkedSignal(() => this.getIframeConfig());
  protected mapConfig = linkedSignal(() => this.getMapConfig());
  protected peopleConfig = linkedSignal(() => this.getPeopleConfig());
  protected headerData = linkedSignal(() => this.getHeaderData());
  protected bodyData = linkedSignal(() => this.getBodyData());
  protected tableGrid = linkedSignal(() => this.getTableGrid());
  protected headerStyle = linkedSignal(() => this.getHeaderStyle());
  protected bodyStyle = linkedSignal(() => this.getBodyStyle());
  
  protected trackerConfig = linkedSignal(() => this.getTrackerConfig());
  protected videoConfig = linkedSignal(() => this.getVideoConfig());
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
  
  protected onSectionChange(section: SectionModel): void {
    if (section && section.type === 'article') {
    this.formData.update((vm) => ({...vm, ...section}));
    debugFormModel('SectionForm.onFormChange', this.formData(), this.currentUser());
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /************************************** property getters (section type specific) *********************************************** */
  // used by multiple sections
  private getContent(): EditorConfig | undefined {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).content || EDITOR_CONFIG_SHAPE;
      case 'button': return (this.formData() as ButtonSection).content || EDITOR_CONFIG_SHAPE;
      default: 
        console.log(`SectionForm.getContent: no content for section type ${this.formData().type}`);
        return undefined;
    }
  }

  private getAlbumConfig(): AlbumConfig | undefined {
    if (this.formData().type === 'album') {
      return ((this.formData() as AlbumSection).properties as AlbumConfig);
    }
  }

  private getImageConfig(): ImageConfig | undefined {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).properties.image || IMAGE_CONFIG_SHAPE;
      default: return undefined;
    }
  }

  private getImageStyle(): ImageStyle | undefined {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'button': return (this.formData() as ButtonSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'gallery': return (this.formData() as GallerySection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'hero': return (this.formData() as HeroSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'slider': return (this.formData() as SliderSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      default: return undefined;
    }
  }

  private getButtonActionConfig(): ButtonActionConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.action);
    }
  }

  private getIconConfig(): IconConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.icon);
    }
  }

  private getButtonStyle(): ButtonStyle | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.style);
    }
  }

  private getChatConfig(): ChatConfig | undefined {
    if (this.formData().type === 'chat') {
      return ((this.formData() as ChatSection).properties as ChatConfig);
    }
  }

  private getLogoConfig(): ImageConfig | undefined {
    switch (this.formData().type) {
      case 'hero': return (this.formData() as HeroSection).properties.logo || IMAGE_CONFIG_SHAPE;
      default: return undefined;
    }
  }

  private getHeroConfig(): ImageConfig | undefined {
    switch (this.formData().type) {
      case 'hero': return (this.formData() as HeroSection).properties.hero || IMAGE_CONFIG_SHAPE;
      default: return undefined;
    }
  }

  private getIframeConfig(): IframeConfig | undefined {
    if (this.formData().type === 'iframe') {
      return ((this.formData() as IframeSection).properties as IframeConfig);
    }
  }

  private getMapConfig(): MapConfig | undefined {  
    if (this.formData().type === 'map') {
      return ((this.formData() as MapSection).properties as MapConfig);
    }
  }

  private getPeopleConfig(): PeopleConfig | undefined {  
    if (this.formData().type === 'people') {
      return ((this.formData() as PeopleSection).properties as PeopleConfig);
    }
  }

  private getHeaderData(): string[] {
    if (this.formData().type === 'table') {
      return ((this.formData() as TableSection).properties.data?.header as string[]) || [];
    }
    return [];
  }

  private getBodyData(): string[] {
    if (this.formData().type === 'table') {
      return ((this.formData() as TableSection).properties.data?.body as string[]) || [];
    }
    return [];
  }

  private getTableGrid(): TableGrid | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.grid as TableGrid);
    }
  }

  private getHeaderStyle(): TableStyle | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.header as TableStyle);
    }
  }

  private getBodyStyle(): TableStyle | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.body as TableStyle);
    }
  }

  private getTrackerConfig(): TrackerConfig | undefined {  
    if (this.formData().type === 'tracker') {
      return ((this.formData() as TrackerSection).properties as TrackerConfig);
    }
  }

  private getVideoConfig(): VideoConfig | undefined {
    if (this.formData().type === 'video') {
      return ((this.formData() as VideoSection).properties as VideoConfig);
    }
  }

  /************************************** property setters (section type specific) *********************************************** */
  protected onContentChange(content: EditorConfig): void {
    this.formData.set({ ...this.formData(), content: content });
  }

  protected onImageConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'article') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, image }
      } as ArticleSection);
    }
  }


  protected onLogoConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, logo: image }
      } as HeroSection);
    }
  }

  protected onHeroConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, hero: image }
      } as HeroSection);
    }
  }

  protected onImageStyleChange(imageStyle: ImageStyle): void {
    const section = this.formData();
    switch (section.type) {
      case 'article':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as ArticleSection);
        break;
      case 'button':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as ButtonSection);
        break;
      case 'gallery':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as GallerySection);
        break;
      case 'hero':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as HeroSection);
        break;
      case 'slider':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as SliderSection);
        break;
    }
  }

  protected onAlbumConfigChange(config: AlbumConfig): void {
    const section = this.formData();
    if (section.type === 'album') {
      this.formData.set({
        ...section,
        properties: config
      } as AlbumSection);
    }
  }

  protected onButtonActionChange(config: ButtonActionConfig): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, action: config }
      } as ButtonSection);
    }
  }

  protected onButtonStyleChange(config: ButtonStyle): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, style: config }
      } as ButtonSection);
    }
  }

  protected onIconConfigChange(config: IconConfig): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, icon: config }
      } as ButtonSection);
    }
  }

  protected onChatConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'chat') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onIframeConfigChange(config: IframeConfig): void {
    const section = this.formData();
    if (section.type === 'iframe') {
      this.formData.set({
        ...section,
        properties: config
      } as IframeSection);
    }
  }

  protected onMapConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'map') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onPeopleConfigChange(config: PeopleConfig): void {
    const section = this.formData();
    if (section.type === 'people') {
      this.formData.set({
        ...section,
        properties: config
      } as PeopleSection);
    }
  }

  protected onTableHeaderChange(data: string[]): void {
    const section = this.formData();
    if (section.type === 'table') {
      const currentData = section.properties.data || { header: [], values: [] };
      this.formData.set({
        ...section,
        properties: { ...section.properties, data: { ...currentData, header: data } }
      } as TableSection);
    }
  }

  protected onTableBodyChange(data: string[]): void {
    const section = this.formData();
    if (section.type === 'table') {
      const currentData = section.properties.data || { header: [], values: [] };
      this.formData.set({
        ...section,
        properties: { ...section.properties, data: { ...currentData, body: data } }
      } as TableSection);
    }
  }

  protected onTableGridChange(config: TableGrid): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, grid: config }
      } as TableSection);
    }
  }

  protected onHeaderStyleChange(config: TableStyle): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, header: config }
      } as TableSection);
    }
  }

  protected onBodyStyleChange(config: TableStyle): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, body: config }
      } as TableSection);
    }
  }

  protected onTrackerConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'tracker') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onVideoConfigChange(config: VideoConfig): void {
    const section = this.formData();
    if (section.type === 'video') {
      this.formData.set({
        ...section,
        properties: config
      } as VideoSection);
    }
  }
}