import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/**
 * Ionic renders the clearInput button inside ion-input's shadow DOM as a real
 * <button>, so Tab stops on it before reaching the next field. Ionic exposes
 * neither a prop nor a CSS part for it, so we take it out of the tab order by hand.
 *
 * Usage: just add the directive to a component's imports; it matches every
 * <ion-input clearInput> / <ion-input [clearInput]="..."> in that template.
 */
@Directive({
  selector: 'ion-input[clearInput]',
  standalone: true
})
export class SkipClearTab {
  private readonly el = inject<ElementRef<HTMLIonInputElement>>(ElementRef);

  constructor() {
    // Stencil renders the shadow DOM on its own schedule, so the button is usually
    // not there yet when Angular is done rendering -> retry for a few frames.
    // ponytail: set once; if clearInput/readonly is toggled at runtime the button is
    // re-created and gets its tabindex back -> use a MutationObserver if that happens.
    const patch = (tries: number) => {
      const button = this.el.nativeElement.shadowRoot?.querySelector('.input-clear-icon');
      if (button) button.setAttribute('tabindex', '-1');
      else if (tries > 0) requestAnimationFrame(() => patch(tries - 1));
    };
    afterNextRender(() => patch(20));
  }
}
