/**
 * Shared by the two panels of the article editor (spec 1.175 §7.2). The reused cards lay their fields out by the width of the
 * viewport; the panel beside the canvas is 360 px wide, so there every field takes the whole width. `size="6"` is a pair of a label
 * and its select and stays side by side.
 */
export const ARTICLE_PANEL_STYLES = `
    :host { display: block; container-type: inline-size; }
    .panel-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px 4px; }
    .panel-head ion-icon { font-size: 1.25rem; flex: none; }
    .panel-head h2 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    .note { display: block; padding: 4px 16px; }
    .outdated { margin: 4px 16px; padding: 2px 8px; border-inline-start: 3px solid var(--ion-color-warning); }
    .field-label { display: block; margin: 8px 0 4px; font-size: 0.8rem; opacity: 0.75; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 0 8px 8px; }
    :host ::ng-deep ion-card { margin: 8px; }
    @container (max-width: 520px) {
      :host ::ng-deep ion-col:not([size="6"]) { flex: 0 0 100% !important; width: 100% !important; max-width: 100% !important; }
    }
`;
