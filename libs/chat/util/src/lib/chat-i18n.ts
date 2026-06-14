import { Signal } from '@angular/core';

const PFX = '@chat/feature.';

export const MATRIX_CHAT_I18N_KEYS = {
  roomId_label:              PFX + 'roomId.label',
  roomId_placeholder:        PFX + 'roomId.placeholder',
  roomId_helper:             PFX + 'roomId.helper',
  roomId_error:              PFX + 'roomId.error',

  name_label:                PFX + 'name.label',
  name_placeholder:          PFX + 'name.placeholder',
  name_helper:               PFX + 'name.helper',

  invite_label:              PFX + 'invite.label',
  invite_placeholder:        PFX + 'invite.placeholder',
  invite_helper:             PFX + 'invite.helper',

  unreadCount_label:         PFX + 'unreadCount.label',
  unreadCount_placeholder:   PFX + 'unreadCount.placeholder',
  unreadCount_helper:        PFX + 'unreadCount.helper',

  topic_label:               PFX + 'topic.label',
  topic_placeholder:         PFX + 'topic.placeholder',

  avatar_label:              PFX + 'avatar.label',
  avatar_placeholder:        PFX + 'avatar.placeholder',
  avatar_helper:             PFX + 'avatar.helper',

  isDirect_label:            PFX + 'isDirect.label',
  isDirect_helper:           PFX + 'isDirect.helper',

  reconnecting:              PFX + 'reconnecting',
  connectionError:           PFX + 'connectionError',
  connecting:                PFX + 'connecting',
  selectRoom:                PFX + 'selectRoom',
  noRoomsError:              PFX + 'noRoomsError',
  createTestRoom:            PFX + 'createTestRoom',
  type_essage:               PFX + 'typeMessage',
  record_audio:              PFX + 'recordAudio',
  video_call:                PFX + 'videoCall',
  recording:                 PFX + 'recording',
  add_attachment:            PFX + 'addAttachment',
  no_messages_start_conversation: PFX + 'noMessagesStartConversation',

  rooms:                     PFX + 'room.rooms',
  room_empty:                PFX + 'room.empty',
  room_none:                 PFX + 'room.none',
  room_create_header:        PFX + 'room.create.header',
  room_create_conf:          PFX + 'room.create.conf',
  room_create_error:         PFX + 'room.create.error',
  room_update_header:        PFX + 'room.update.header',
  room_update_conf:          PFX + 'room.update.conf',
  room_update_error:         PFX + 'room.update.error',

  msg_edit:                  PFX + 'message.edit',
  msg_reply:                 PFX + 'message.reply.label',
  msg_reply_to:              PFX + 'message.reply.to',
  msg_copy:                  PFX + 'message.copy',
  msg_share:                 PFX + 'message.share',
  msg_download:              PFX + 'message.download',
  msg_raw:                   PFX + 'message.raw',
  msg_react_header:          PFX + 'message.react.header',
  msg_react_add:             PFX + 'message.react.add',
  msg_react_cancel:          PFX + 'message.react.cancel',

  msg_report_header:         PFX + 'message.report.header',
  msg_report_placeholder:    PFX + 'message.report.placeholder',
  msg_report_noChannel:      PFX + 'message.report.noChannel',
  msg_report_messageFrom:    PFX + 'message.report.messageFrom',
  msg_report_message:        PFX + 'message.report.message',
  msg_report_comment:        PFX + 'message.report.comment',
  msg_report_showMessage:    PFX + 'message.report.showMessage',
  msg_report_conf:           PFX + 'message.report.conf',
  msg_report_error:          PFX + 'message.report.error',

  msg_update_header:         PFX + 'message.update.header',
  msg_update_placeholder:    PFX + 'message.update.placeholder',
  msg_update_conf:           PFX + 'message.update.conf',
  msg_update_error:          PFX + 'message.update.error',

  msg_delete:                PFX + 'message.delete.label',
  msg_delete_confirm:        PFX + 'message.delete.confirm',
  msg_delete_conf:           PFX + 'message.delete.conf',
  msg_delete_error:          PFX + 'message.delete.error',

  thread_open:               PFX + 'thread.open',
  thread_reply_header:       PFX + 'thread.reply.header',
  thread_reply_placeholder:  PFX + 'thread.reply.placeholder',
  thread_reply_error:        PFX + 'thread.reply.error',
  thread_empty:              PFX + 'thread.empty',

  video_incoming:            PFX + 'video.incoming',
  video_connecting:          PFX + 'video.connecting',

  survey_title:              PFX + 'survey.title',
  survey_create:             PFX + 'survey.create',
  allowMultipleAnswers_label:  PFX + 'survey.allowMultipleAnswers.label',
  allowMultipleAnswers_helper: PFX + 'survey.allowMultipleAnswers.helper',
  question_label:            PFX + 'survey.question.label',
  question_placeholder:      PFX + 'survey.question.placeholder',
  answer_create:             PFX + 'survey.answer.create',
  answer_add:                PFX + 'survey.answer.add',
  results_show:              PFX + 'survey.results.show',
  results_title:             PFX + 'survey.results.title',
  survey_empty:              PFX + 'survey.empty',
  survey_total:              PFX + 'survey.total',
  survey_done:               PFX + 'survey.done',
  survey_end:                PFX + 'survey.end',
  survey_ended:              PFX + 'survey.ended',
  survey_voted:              PFX + 'survey.voted',
  choose_multiple:           PFX + 'survey.choose.multiple',
  choose_one:                PFX + 'survey.choose.one',

  attach_title:              PFX + 'attach.title',
  attach_image:              PFX + 'attach.image',
  attach_file:               PFX + 'attach.file',
  attach_position:           PFX + 'attach.position',
  attach_survey:             PFX + 'attach.survey',

  isTypeing:                 PFX + 'isTypeing',
  and:                       PFX + 'and',
  areTypeing:                PFX + 'areTypeing',
  othersTypeing:             PFX + 'othersTypeing',
  severalTypeing:            PFX + 'severalTypeing',

  as_title:                  '@actionsheet.title',
  copy_conf:                 '@copy.conf',
  cancel:                    '@cancel',
  ok:                        '@ok',
  save:                      '@save.label',

  validation_name_required:  PFX + 'validation.nameRequired',
} satisfies Record<string, string>;

export type MatrixChatI18n = { [K in keyof typeof MATRIX_CHAT_I18N_KEYS]: Signal<string> };
