import { Signal } from '@angular/core';

const PFX = '@cms/page/feature.';

export const PAGE_I18N_KEYS = {
  pages:                        PFX + 'pages',
  sections:                     PFX + 'sections',
  empty:                        PFX + 'empty',
  empty_page:                   PFX + 'emptyPage',
  empty_readonly:               PFX + 'emptyPageReadOnly',
  not_exist:                    PFX + 'notexist',
  help:                         PFX + 'help',

  key:                          '@key',
  copy_conf:                    '@copy.conf',
  name_label:                   PFX + 'name.label',
  name_placeholder:             PFX + 'name.placeholder',
  name_helper:                  PFX + 'name.helper',
  description:                  PFX + 'description',
  title_label:                  PFX + 'title.label',
  title_placeholder:            PFX + 'title.placeholder',
  title_helper:                 PFX + 'title.helper',
  notes_label:                  '@notes.label',
  notes_placeholder:            '@notes.placeholder',

  view:                         PFX + 'view',
  edit:                         PFX + 'edit',
  show:                         PFX + 'show',
  create:                       PFX + 'create',
  add_label:                    PFX + 'add.label',
  add_placeholder:              PFX + 'add.placeholder',
  add_section:                  PFX + 'add.section',
  delete_label:                 PFX + 'delete.label',
  delete_confirm:               PFX + 'delete.confirm',
  search_article:               PFX + 'search.article',
  sort_label:                   PFX + 'sort.label',
  sort_noSections:              PFX + 'sort.noSections',
  sort_onlyOneSection:          PFX + 'sort.onlyOneSection',
  upload_image:                 PFX + 'upload.image',
  upload_file:                  PFX + 'upload.file',

  graph_nomain:                 PFX + 'type.graph.nomain',
  graph_description:            PFX + 'type.graph.description',
  graph_description2:           PFX + 'type.graph.description2',
  blog_type_label:              PFX + 'type.blog.label',
  blog_search:                  PFX + 'type.blog.search',
  blog_filter_all:              PFX + 'type.blog.filter.all',

  section_add:                  PFX + 'section.add',
  section_edit:                 PFX + 'section.edit',
  section_send:                 PFX + 'section.send',
  section_remove:               PFX + 'section.remove',
  section_label:                PFX + 'section.label',

  welcome_title:                PFX + 'welcome.title',
  welcome_subTitle:             PFX + 'welcome.subTitle',
  welcome_abstract:             PFX + 'welcome.abstract',
  welcome_logoAltText:          PFX + 'welcome.logoAltText',
  welcome_bannerAltText:        PFX + 'welcome.bannerAltText',
  
  notfound_error:               PFX + 'notfound.error',
  notfound_title:               PFX + 'notfound.title',
  notfound_subTitle:            PFX + 'notfound.subTitle',
  notfound_abstract:            PFX + 'notfound.abstract',
  notfound_logoAltText:         PFX + 'notfound.logoAltText',
  notfound_bannerAltText:       PFX + 'notfound.bannerAltText',

  unknownpagetype_title:        PFX + 'unknownpagetype.title',
  unknownpagetype_subTitle:     PFX + 'unknownpagetype.subTitle',
  unknownpagetype_abstract:     PFX + 'unknownpagetype.abstract',
  unknownpagetype_logoAltText:  PFX + 'unknownpagetype.logoAltText',
  unknownpagetype_bannerAltText: PFX + 'unknownpagetype.bannerAltText',

  as_title:                     '@actionsheet.title',
  ok:                           '@ok',
  cancel:                       '@cancel',
  save:                         '@save.label',
} satisfies Record<string, string>;

export type PageI18n = { [K in keyof typeof PAGE_I18N_KEYS]: Signal<string> };
