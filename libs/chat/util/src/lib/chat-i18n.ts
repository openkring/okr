import { Signal } from '@angular/core';

export const MATRIX_CHAT_I18N_KEYS = {
  roomId_label:              '@chat/feature.roomId.label',
  roomId_placeholder:        '@chat/feature.roomId.placeholder',
  roomId_helper:             '@chat/feature.roomId.helper',
  roomId_error:              '@chat/feature.roomId.error',

  name_label:                '@chat/feature.name.label',
  name_placeholder:          '@chat/feature.name.placeholder',
  name_helper:               '@chat/feature.name.helper',

  invite_label:              '@chat/feature.invite.label',
  invite_placeholder:        '@chat/feature.invite.placeholder',
  invite_helper:             '@chat/feature.invite.helper',

  unreadCount_label:         '@chat/feature.unreadCount.label',
  unreadCount_placeholder:   '@chat/feature.unreadCount.placeholder',
  unreadCount_helper:        '@chat/feature.unreadCount.helper',

  topic_label:               '@chat/feature.topic.label',
  topic_placeholder:         '@chat/feature.topic.placeholder',

  avatar_label:              '@chat/feature.avatar.label',
  avatar_placeholder:        '@chat/feature.avatar.placeholder',
  avatar_helper:             '@chat/feature.avatar.helper',

  isDirect_label:            '@chat/feature.isDirect.label',
  isDirect_helper:           '@chat/feature.isDirect.helper',

  reconnecting:              '@chat/feature.reconnecting',
  connectionError:           '@chat/feature.connectionError',
  connecting:                '@chat/feature.connecting',
  selectRoom:                '@chat/feature.selectRoom',
  noRoomsError:              '@chat/feature.noRoomsError',
  createTestRoom:            '@chat/feature.createTestRoom',
  type_essage:               '@chat/feature.typeMessage',
  record_audio:              '@chat/feature.recordAudio',
  video_call:                '@chat/feature.videoCall',
  recording:                 '@chat/feature.recording',
  add_attachment:            '@chat/feature.addAttachment',
  no_messages_start_conversation: '@chat/feature.noMessagesStartConversation',

  rooms:                     '@chat/feature.room.rooms',
  room_empty:                '@chat/feature.room.empty',
  room_none:                 '@chat/feature.room.none',
  room_create_header:        '@chat/feature.room.create.header',
  room_create_conf:          '@chat/feature.room.create.conf',
  room_create_error:         '@chat/feature.room.create.error',
  room_update_conf:          '@chat/feature.room.update.conf',
  room_update_error:         '@chat/feature.room.update.error',

  msg_edit:                  '@chat/feature.message.edit',
  msg_reply:                 '@chat/feature.message.reply',
  msg_copy:                  '@chat/feature.message.copy',
  msg_raw:                   '@chat/feature.message.raw',
  msg_react_header:          '@chat/feature.message.react.header',
  msg_react_cancel:          '@chat/feature.message.react.cancel',

  msg_report_header:         '@chat/feature.message.report.header',
  msg_report_placeholder:    '@chat/feature.message.report.placeholder',
  msg_report_noChannel:      '@chat/feature.message.report.noChannel',
  msg_report_messageFrom:    '@chat/feature.message.report.messageFrom',
  msg_report_message:        '@chat/feature.message.report.message',
  msg_report_comment:        '@chat/feature.message.report.comment',
  msg_report_showMessage:    '@chat/feature.message.report.showMessage',
  msg_report_conf:           '@chat/feature.message.report.conf',
  msg_report_error:          '@chat/feature.message.report.error',

  msg_update_header:         '@chat/feature.message.update.header',
  msg_update_placeholder:    '@chat/feature.message.update.placeholder',
  msg_update_conf:           '@chat/feature.message.update.conf',
  msg_update_error:          '@chat/feature.message.update.error',

  msg_delete:                '@chat/feature.message.delete.label',
  msg_delete_confirm:        '@chat/feature.message.delete.confirm',
  msg_delete_conf:           '@chat/feature.message.delete.conf',
  msg_delete_error:          '@chat/feature.message.delete.error',

  thread_open:               '@chat/feature.thread.open',
  thread_reply_header:       '@chat/feature.thread.reply.header',
  thread_reply_placeholder:  '@chat/feature.thread.reply.placeholder',
  thread_reply_error:        '@chat/feature.thread.reply.error',
  thread_empty:              '@chat/feature.thread.empty',

  video_incoming:            '@chat/feature.video.incoming',
  video_connecting:          '@chat/feature.video.connecting',

  survey_title:              '@chat/feature.survey.title',
  survey_create:             '@chat/feature.survey.create',
  allowMultipleAnswers_label:  '@chat/feature.survey.allowMultipleAnswers.label',
  allowMultipleAnswers_helper: '@chat/feature.survey.allowMultipleAnswers.helper',
  question_label:            '@chat/feature.survey.question.label',
  question_placeholder:      '@chat/feature.survey.question.placeholder',
  answer_create:             '@chat/feature.survey.answer.create',
  answer_add:                '@chat/feature.survey.answer.add',
  results_show:              '@chat/feature.survey.results.show',
  results_title:             '@chat/feature.survey.results.title',
  survey_empty:              '@chat/feature.survey.empty',
  survey_total:              '@chat/feature.survey.total',
  survey_done:               '@chat/feature.survey.done',
  survey_end:                '@chat/feature.survey.end',
  survey_ended:              '@chat/feature.survey.ended',
  survey_voted:              '@chat/feature.survey.voted',
  choose_multiple:           '@chat/feature.survey.choose.multiple',
  choose_one:                '@chat/feature.survey.choose.one',

  attach_title:              '@chat/feature.attach.title',
  attach_image:              '@chat/feature.attach.image',
  attach_file:               '@chat/feature.attach.file',
  attach_position:           '@chat/feature.attach.position',
  attach_survey:             '@chat/feature.attach.survey',

  isTypeing:                 '@chat/feature.isTypeing',
  and:                       '@chat/feature.and',
  areTypeing:                '@chat/feature.areTypeing',
  othersTypeing:             '@chat/feature.othersTypeing',
  severalTypeing:            '@chat/feature.severalTypeing',

  as_title:                  '@actionsheet.title',
  copy_conf:                 '@copy.conf',
  cancel:                    '@cancel',
  ok:                        '@ok',
  save:                      '@save.label',

  validation_name_required:  '@chat/feature.validation.nameRequired',
} satisfies Record<string, string>;

export type MatrixChatI18n = { [K in keyof typeof MATRIX_CHAT_I18N_KEYS]: Signal<string> };
