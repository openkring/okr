import { Signal } from '@angular/core';

export const DOCUMENT_I18N_KEYS = {
  documents:        '@document/feature.documents',
  revisions:        '@document/feature.revisions',
  empty:            '@document/feature.empty',
  name:             '@document/feature.name',
  size:             '@document/feature.size',
  lastUpdate:       '@document/feature.lastUpdate',
  revision_list:    '@document/feature.revision.list.title',

  upload_new:       '@document/feature.upload.new',
  upload_single:    '@document/feature.upload.single.title',
  upload_multiple:  '@document/feature.upload.multiple.title',
  delete:           '@document/feature.delete.label',
  delete_conf:      '@document/feature.delete.conf',
  delete_confirm:   '@document/feature.delete.confirm',
  delete_error:     '@document/feature.delete.error',
  view:             '@document/feature.view.label',
  view_revisions:   '@document/feature.view.revisions',
  update:           '@document/feature.update.label',
  update_conf:      '@document/feature.update.conf',
  update_error:     '@document/feature.update.error',
  create:           '@document/feature.create.label',
  create_conf:      '@document/feature.create.conf',
  create_error:     '@document/feature.create.error',
  download:         '@document/feature.download',
  share:            '@document/feature.share',

  image_add:        '@document/feature.image.add',
  image_select:     '@document/feature.image.select',
  image_upload:     '@document/feature.image.upload',
  image_edit:       '@document/feature.image.edit',
  image_type_name:  '@document/feature.image.type.name',
  image_type_label: '@document/feature.image.type.label',
  image_type_helper: '@document/feature.image.type.helper',

  bkey_label:                    '@document/feature.bkey.label',
  bkey_placeholder:              '@document/feature.bkey.placeholder',
  bkey_helper:                   '@document/feature.bkey.helper',

  label_label:                   '@document/feature.label.label',
  label_placeholder:             '@document/feature.label.placeholder',
  label_helper:                  '@document/feature.label.helper',

  url_label:                     '@document/feature.url.label',
  url_placeholder:               '@document/feature.url.placeholder',
  url_helper:                    '@document/feature.url.helper',

  actionUrl_helper:              '@document/feature.actionUrl.helper',
  actionUrl_label:               '@document/feature.actionUrl.label',
  actionUrl_placeholder:         '@document/feature.actionUrl.placeholder',

  altText_label:                 '@document/feature.altText.label',
  altText_placeholder:           '@document/feature.altText.placeholder',
  altText_helper:                '@document/feature.altText.helper',

  overlay_label:                 '@document/feature.overlay.label',
  overlay_placeholder:           '@document/feature.overlay.placeholder',
  overlay_helper:                '@document/feature.overlay.helper',

  fullPath_label:                '@document/feature.fullPath.label',
  fullPath_placeholder:          '@document/feature.fullPath.placeholder',
  fullPath_helper:               '@document/feature.fullPath.helper',

  title_label:                   '@document/feature.title.label',
  title_placeholder:             '@document/feature.title.placeholder',
  title_helper:                  '@document/feature.title.helper',

  mimeType_label:                '@document/feature.mimeType.label',
  mimeType_placeholder:          '@document/feature.mimeType.placeholder',
  mimeType_helper:               '@document/feature.mimeType.helper',

  authorKey_label:               '@document/feature.authorKey.label',
  authorKey_placeholder:         '@document/feature.authorKey.placeholder',
  authorKey_helper:              '@document/feature.authorKey.helper',

  authorName_label:              '@document/feature.authorName.label',
  authorName_placeholder:        '@document/feature.authorName.placeholder',
  authorName_helper:             '@document/feature.authorName.helper',

  locationKey_label:             '@document/feature.locationKey.label',
  locationKey_placeholder:       '@document/feature.locationKey.placeholder',
  locationKey_helper:            '@document/feature.locationKey.helper',

  hash_label:                    '@document/feature.hash.label',
  hash_placeholder:              '@document/feature.hash.placeholder',
  hash_helper:                   '@document/feature.hash.helper',

  priorVersionKey_label:         '@document/feature.priorVersionKey.label',
  priorVersionKey_placeholder:   '@document/feature.priorVersionKey.placeholder',
  priorVersionKey_helper:        '@document/feature.priorVersionKey.helper',

  version_label:                 '@document/feature.version.label',
  version_placeholder:           '@document/feature.version.placeholder',
  version_helper:                '@document/feature.version.helper',

  description_label:             '@document/feature.description.label',
  description_placeholder:       '@document/feature.description.placeholder',

  dateOfDocCreation_label:       '@document/feature.dateOfDocCreation.label',
  dateOfDocCreation_placeholder: '@document/feature.dateOfDocCreation.placeholder',
  dateOfDocCreation_helper:      '@document/feature.dateOfDocCreation.helper',

  dateOfDocLastUpdate_label:     '@document/feature.dateOfDocLastUpdate.label',
  dateOfDocLastUpdate_placeholder: '@document/feature.dateOfDocLastUpdate.placeholder',
  dateOfDocLastUpdate_helper:    '@document/feature.dateOfDocLastUpdate.helper',

  description:                  '@description',
  as_title:                     '@actionsheet.title',
  copy_conf:                    '@copy.conf',
  ok:                           '@ok',
  cancel:                       '@cancel',
  save:                         '@save.label',
} satisfies Record<string, string>;

export type DocumentI18n = { [K in keyof typeof DOCUMENT_I18N_KEYS]: Signal<string> };
