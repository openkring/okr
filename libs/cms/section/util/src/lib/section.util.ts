import { SectionTypes } from '@bk2/shared-categories';
import { bkTranslate } from '@bk2/shared-i18n';
import { AlbumConfig, AlbumStyle, Avatar, ChatConfig, ColorIonic, ContentConfig, GalleryEffect, NameDisplay, newButton, newDefaultImageConfig, newIcon, newImage, RoleName, SectionModel, SectionType, Table, TableConfig, ViewPosition } from '@bk2/shared-models';
import { isType } from '@bk2/shared-util-core';

import { convertRoleEnumToName, convertRoleNameToEnum } from '@bk2/cms-menu-util';

import { SectionFormModel } from './section-form.model';

/**
 * Convenience function to create a new SectionModel with given values.
 * @param category
 * @returns
 */
export function createSection(type: SectionType, tenantId: string): SectionModel {
  const _section = new SectionModel(tenantId);
  _section.type = type;
  _section.name = SectionTypes[type].name;
  _section.color = ColorIonic.Primary;
  _section.roleNeeded = 'contentAdmin';
  switch (type) {
    case SectionType.Album:
      _section.properties.imageList = [];
      break;
    case SectionType.Article:
      _section.properties.content = newContentConfig(bkTranslate('@content.section.default.content'));
      _section.properties.image = newImage('', bkTranslate('@content.section.default.url'));
      break;
    case SectionType.PeopleList:
      _section.properties.persons = [];
      _section.properties.avatar = newAvatar();
      _section.color = ColorIonic.Light;
      break;
    case SectionType.Button:
      _section.properties.content = newContentConfig('Download', 2, ViewPosition.Left);
      _section.properties.button = newButton();
      _section.properties.icon = newIcon();
      break;
    case SectionType.Table:
      _section.properties.table = newTable();
      break;
  }
  return _section;
}

export function convertSectionToForm(section: SectionModel): SectionFormModel {
  return {
    bkey: section.bkey,
    name: section.name,
    tags: section.tags,
    description: section?.description,
    roleNeeded: convertRoleNameToEnum(section.roleNeeded as RoleName),
    color: section.color,
    title: section.title,
    subTitle: section.subTitle,
    type: section.type,
    properties: section.properties,
  };
}

export function convertFormToSection(section: SectionModel | undefined, vm: SectionFormModel, tenantId: string): SectionModel {
  section ??= new SectionModel(tenantId);
  section.name = vm.name ?? '';
  section.bkey = !vm.bkey || vm.bkey.length === 0 ? section.name : vm.bkey; // we want to use the name as the key of the menu item in the database
  section.tags = vm.tags ?? '';
  section.description = vm.description ?? '';
  section.roleNeeded = convertRoleEnumToName(vm.roleNeeded) ?? 'privileged'; // be on the safe side, restrict access by default
  section.color = vm.color ?? ColorIonic.Primary;
  section.title = vm.title ?? '';
  section.subTitle = vm.subTitle ?? '';
  section.type = vm.type ?? SectionType.Article;
  section.properties = vm.properties ?? {};
  return section;
}

export function newAvatar(): Avatar {
  return {
    cols: 1,
    showName: true,
    showLabel: false,
    nameDisplay: NameDisplay.FirstLast,
    altText: 'avatar',
    title: '',
    linkedSection: '',
  };
}

export function newContentConfig(text = '<p></p>', colSize = 4, position = ViewPosition.None): ContentConfig {
  return {
    htmlContent: text,
    colSize: colSize,
    position: position,
  };
}

export function newAlbumConfig(tenantId?: string, year?: string): AlbumConfig {
  const _directory = tenantId && tenantId.length > 0 && year ? `tenant/${tenantId}/album/${year}` : '';
  return {
    directory: _directory,
    albumStyle: AlbumStyle.Pinterest,
    defaultImageConfig: newDefaultImageConfig(),
    recursive: false,
    showVideos: false,
    showStreamingVideos: true,
    showDocs: false,
    showPdfs: true,
    galleryEffect: GalleryEffect.Slide,
  };
}

export function newChatConfig(imgixBaseUrl: string): ChatConfig {
  return {
    channelId: `chat-${Math.random().toString(36).substring(2)}`,
    channelName: 'Gruppenchat',
    channelImageUrl: imgixBaseUrl + '/logo/icons/chatbox.svg',
    channelDescription: '',
    channelType: 'messaging',
  };
}

export function newTableConfig(): TableConfig {
  return {
    gridTemplate: 'auto auto',
    gridGap: '1px',
    gridBackgroundColor: 'grey',
    gridPadding: '1px',
    headerBackgroundColor: 'lightgrey',
    headerTextAlign: 'center',
    headerFontSize: '1rem',
    headerFontWeight: 'bold',
    headerPadding: '5px',
    cellBackgroundColor: 'white',
    cellTextAlign: 'left',
    cellFontSize: '0.8rem',
    cellFontWeight: 'normal',
    cellPadding: '5px',
  };
}

export function newTable(): Table {
  return {
    config: newTableConfig(),
    title: '',
    subTitle: '',
    description: '',
    header: [],
    data: [],
  };
}

export function isSection(section: unknown, tenantId: string): section is SectionModel {
  return isType(section, new SectionModel(tenantId));
}
