import { Toolbar } from 'ngx-editor';

// 'horizontal_rule' is not working
export const EditorToolbar: Toolbar = [
  ['undo', 'redo'],
  [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
  [ 'bold', 'italic', 'underline', 'strike', 'superscript', 'subscript' ],
  ['text_color', 'background_color'],
  ['ordered_list', 'bullet_list'],
  ['align_left', 'align_center', 'align_right', 'align_justify', 'code', 'blockquote'],
  ['indent', 'outdent'],
  ['link', 'image']
];