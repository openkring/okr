/** The slate look: dark green-black board, chalk-white strokes, a hand-drawn feel from CSS only. */
export const JASS_CHALK_STYLES = `
  :host { --jass-board: #1f2a24; --jass-chalk: #f2f0e6; --jass-chalk-dim: rgba(242, 240, 230, 0.55);
    display: flex; flex-direction: column; min-height: 0; }
  .jass-board { flex: 1; min-height: 0; box-sizing: border-box; overflow: auto; background: var(--jass-board); color: var(--jass-chalk); border-radius: 12px;
    border: 10px solid #7a5230; box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.6); padding: 12px;
    font-family: 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', ui-rounded, system-ui, sans-serif; }
  .jass-chalk { stroke: var(--jass-chalk); stroke-width: 4; stroke-linecap: round; fill: none; filter: url(#jass-rough); }
  .jass-dim { color: var(--jass-chalk-dim); }
`;
