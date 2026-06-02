import { Signal } from '@angular/core';

const PFX = '@cms/page/feature.';

export const PAGE_I18N_KEYS = {
  pages:                        PFX + 'pages',
  sections:                     PFX + 'sections',
  empty:                        PFX + 'empty',
  empty_page:                   PFX + 'emptyPage',
  empty_readonly:               PFX + 'emptyPageReadOnly',
  not_found:                    PFX + 'notfound',
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
  notes_label:                  PFX + 'notes.label',
  notes_placeholder:            PFX + 'notes.placeholder',

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
  blog_search:                  PFX + 'type.blog.search',
  blog_filter_all:              PFX + 'type.blog.filter.all',
  blog_type_label:              PFX + 'type.blog.label',

  section_add:                  PFX + 'section.add',
  section_edit:                 PFX + 'section.edit',
  section_send:                 PFX + 'section.send',
  section_remove:               PFX + 'section.remove',
  section_label:                PFX + 'section.label',

  as_title:                     '@actionsheet.title',
  ok:                           '@ok',
  cancel:                       '@cancel',
  save:                         '@save.label',
} satisfies Record<string, string>;

export type PageI18n = { [K in keyof typeof PAGE_I18N_KEYS]: Signal<string> };
