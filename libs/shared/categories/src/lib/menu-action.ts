import { CategoryModel, MenuAction } from '@bk2/shared-models';

export type MenuActionCategory = CategoryModel; 

export const MenuActions: MenuActionCategory[] = [
{
  id: MenuAction.Navigate,
  abbreviation: 'NAV',
  name: 'navigate',
  i18nBase: 'content.menuAction.navigate',
  icon: 'compass'
},
{
  id: MenuAction.Browse,
  abbreviation: 'BRWS',
  name: 'browse',
  i18nBase: 'content.menuAction.browse',
  icon: 'globe'
},
{
  id: MenuAction.SubMenu,
  abbreviation: 'SM',
  name: 'submenu',
  i18nBase: 'content.menuAction.submenu',
  icon: 'menu'
},
{
  id: MenuAction.Divider,
  abbreviation: 'DIV',
  name: 'divider',
  i18nBase: 'content.menuAction.divider',
  icon: 'remove'
},
{
  id: MenuAction.MainMenu,
  abbreviation: 'MAIN',
  name: '',
  i18nBase: 'content.menuAction.mainMenu',
  icon: 'menu'
},
{
  id: MenuAction.ContextMenu,
  abbreviation: 'CTXM',
  name: 'contextmenu',
  i18nBase: 'content.menuAction.contextMenu',
  icon: 'menu'
},
{
  id: MenuAction.CallFunction,
  abbreviation: 'CALL',
  name: 'callFunction',
  i18nBase: 'content.menuAction.callFunction',
  icon: 'menu'
}
];
