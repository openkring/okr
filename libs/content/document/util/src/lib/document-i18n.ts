import { Signal } from '@angular/core';

export const DOCUMENT_I18N_KEYS = {
  documents:        '@content/document/feature.documents',
  revisions:        '@content/document/feature.revisions',
  empty:            '@content/document/feature.empty',
  name:             '@content/document/feature.name',
  size:             '@content/document/feature.size',
  lastUpdate:       '@content/document/feature.lastUpdate',
  revision_list:    '@content/document/feature.revision.list.title',

  upload_new:       '@content/document/feature.upload.new',
  upload_single:    '@content/document/feature.upload.single.title',
  upload_multiple:  '@content/document/feature.upload.multiple.title',
  delete:           '@content/document/feature.delete.label',
  delete_conf:      '@content/document/feature.delete.conf',
  delete_confirm:   '@content/document/feature.delete.confirm',
  delete_error:     '@content/document/feature.delete.error',
  view:             '@content/document/feature.view.label',
  view_revisions:   '@content/document/feature.view.revisions',
  update:           '@content/document/feature.update.label',
  update_conf:      '@content/document/feature.update.conf',
  update_error:     '@content/document/feature.update.error',
  create:           '@content/document/feature.create.label',
  create_conf:      '@content/document/feature.create.conf',
  create_error:     '@content/document/feature.create.error',
  download:         '@content/document/feature.download',
  share:            '@content/document/feature.share',

  folder_open:           '@content/document/feature.folder.open',
  folder_edit:           '@content/document/feature.folder.edit',
  folder_delete:         '@content/document/feature.folder.delete.label',
  folder_delete_confirm: '@content/document/feature.folder.delete.confirm',
  folder_not_empty:      '@content/document/feature.folder.notEmpty',

  vectorize:            '@content/document/feature.vectorize.label',
  vectorize_title:      '@content/document/feature.vectorize.title',
  vectorize_source:     '@content/document/feature.vectorize.source',
  vectorize_result:     '@content/document/feature.vectorize.result',
  vectorize_preset:     '@content/document/feature.vectorize.preset.label',
  vectorize_preset_logo:  '@content/document/feature.vectorize.preset.logo',
  vectorize_preset_photo: '@content/document/feature.vectorize.preset.photo',
  vectorize_detail:     '@content/document/feature.vectorize.detail',
  vectorize_generate:   '@content/document/feature.vectorize.generate',
  vectorize_hint:       '@content/document/feature.vectorize.hint',
  vectorize_empty:      '@content/document/feature.vectorize.empty',
  vectorize_error:      '@content/document/feature.vectorize.error',

  image_add:        '@content/document/feature.image.add',
  image_select:     '@content/document/feature.image.select',
  image_upload:     '@content/document/feature.image.upload',
  image_edit:       '@content/document/feature.image.edit',
  image_type_name:  '@content/document/feature.image.type.name',
  image_type_label: '@content/document/feature.image.type.label',
  image_type_helper: '@content/document/feature.image.type.helper',

  okey_label:                    '@content/document/feature.okey.label',
  okey_placeholder:              '@content/document/feature.okey.placeholder',
  okey_helper:                   '@content/document/feature.okey.helper',

  label_label:                   '@content/document/feature.label.label',
  label_placeholder:             '@content/document/feature.label.placeholder',
  label_helper:                  '@content/document/feature.label.helper',

  url_label:                     '@content/document/feature.url.label',
  url_placeholder:               '@content/document/feature.url.placeholder',
  url_helper:                    '@content/document/feature.url.helper',

  actionUrl_helper:              '@content/document/feature.actionUrl.helper',
  actionUrl_label:               '@content/document/feature.actionUrl.label',
  actionUrl_placeholder:         '@content/document/feature.actionUrl.placeholder',

  altText_label:                 '@content/document/feature.altText.label',
  altText_placeholder:           '@content/document/feature.altText.placeholder',
  altText_helper:                '@content/document/feature.altText.helper',

  credit_label:                  '@content/document/feature.credit.label',
  credit_placeholder:            '@content/document/feature.credit.placeholder',
  credit_helper:                 '@content/document/feature.credit.helper',

  overlay_label:                 '@content/document/feature.overlay.label',
  overlay_placeholder:           '@content/document/feature.overlay.placeholder',
  overlay_helper:                '@content/document/feature.overlay.helper',

  fullPath_label:                '@content/document/feature.fullPath.label',
  fullPath_placeholder:          '@content/document/feature.fullPath.placeholder',
  fullPath_helper:               '@content/document/feature.fullPath.helper',

  title_label:                   '@content/document/feature.title.label',
  title_placeholder:             '@content/document/feature.title.placeholder',
  title_helper:                  '@content/document/feature.title.helper',

  mimeType_label:                '@content/document/feature.mimeType.label',
  mimeType_placeholder:          '@content/document/feature.mimeType.placeholder',
  mimeType_helper:               '@content/document/feature.mimeType.helper',

  authorKey_label:               '@content/document/feature.authorKey.label',
  authorKey_placeholder:         '@content/document/feature.authorKey.placeholder',
  authorKey_helper:              '@content/document/feature.authorKey.helper',

  authorName_label:              '@content/document/feature.authorName.label',
  authorName_placeholder:        '@content/document/feature.authorName.placeholder',
  authorName_helper:             '@content/document/feature.authorName.helper',

  locationKey_label:             '@content/document/feature.locationKey.label',
  locationKey_placeholder:       '@content/document/feature.locationKey.placeholder',
  locationKey_helper:            '@content/document/feature.locationKey.helper',

  hash_label:                    '@content/document/feature.hash.label',
  hash_placeholder:              '@content/document/feature.hash.placeholder',
  hash_helper:                   '@content/document/feature.hash.helper',

  priorVersionKey_label:         '@content/document/feature.priorVersionKey.label',
  priorVersionKey_placeholder:   '@content/document/feature.priorVersionKey.placeholder',
  priorVersionKey_helper:        '@content/document/feature.priorVersionKey.helper',

  version_label:                 '@content/document/feature.version.label',
  version_placeholder:           '@content/document/feature.version.placeholder',
  version_helper:                '@content/document/feature.version.helper',

  description_label:             '@content/document/feature.description.label',
  description_placeholder:       '@content/document/feature.description.placeholder',

  dateOfDocCreation_label:       '@content/document/feature.dateOfDocCreation.label',
  dateOfDocCreation_placeholder: '@content/document/feature.dateOfDocCreation.placeholder',
  dateOfDocCreation_helper:      '@content/document/feature.dateOfDocCreation.helper',

  dateOfDocLastUpdate_label:     '@content/document/feature.dateOfDocLastUpdate.label',
  dateOfDocLastUpdate_placeholder: '@content/document/feature.dateOfDocLastUpdate.placeholder',
  dateOfDocLastUpdate_helper:    '@content/document/feature.dateOfDocLastUpdate.helper',

  description:                  '@description',
  as_title:                     '@actionsheet.title',
  copy_conf:                    '@copy.conf',
  ok:                           '@ok',
  cancel:                       '@cancel',
  save:                         '@save.label',
  file_count:       '@content/document/feature.fileCount',
} satisfies Record<string, string>;

export type DocumentI18n = { [K in keyof typeof DOCUMENT_I18N_KEYS]: Signal<string> };
