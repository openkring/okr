# shared-ui-editor

The rich-text editor on ProseMirror (specs 1.170 and 1.175).

| Export | What it is |
| --- | --- |
| `okr-rich-text-input` | The form field: frame, label, footer, toolbar above the text. Html or markdown. |
| `okr-rich-text-inline` | A text edited where it is drawn: no frame, no padding, the toolbar in a place the host names (`toolbarHost`). Html. |
| `okr-rich-text-view` | Read-only display of a stored text. |

All exports are light. The engine (`src/lib/engine/`: `okr-rich-text-engine`, `okr-rich-text-toolbar`, ProseMirror) is only
reached through `import()` inside the two editing components. Never export it from `index.ts` and never import it
statically (`lazy-loading` skill, Pattern A).

## okr-rich-text-inline

It is empty until `ready`, so the host keeps its drawing until then. `failed` means that the engine could not be loaded: the
drawing stays. Destroyed while loading, it creates nothing.

- `hiddenFeatures` leaves out groups of buttons and their keys. Without `'history'` undo is the host's job: there is no history,
  the key events bubble and the browser's own undo is off. Colours, alignment and indents that are hidden are also not shown
  in the text, because readers do not see them either; they stay stored. An empty line has no height unless the cursor is in it.
- ProseMirror prevents the default of Mod-z (and Mod-b, -i, -y) in any case: a host that undoes must not skip events that are
  `defaultPrevented`.
- `blockEditing`: Enter in an empty last paragraph emits `split` (the text without it), Backspace at the very start emits `join`.
- `caret`: where the cursor goes when the text is ready, when another html is loaded and when the input changes. The html that
  `valueChange` emitted can be passed back: the cursor stays.
