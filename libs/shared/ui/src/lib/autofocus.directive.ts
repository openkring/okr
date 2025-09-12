
import { AfterViewInit, Directive, ElementRef, input } from '@angular/core';

/**
 * According to the HTML specification, the native autofocus attribute indicates 
 * that a control is to be focues as the page is loaded - only once. This leads 
 * to problems in a SPA application (e.g. after refreshing the page). This directive
 * is an alternative implementation that can be used in Angular applications.
 * source: https://medium.com/netanelbasal/autofocus-that-works-anytime-in-angular-apps-68cb89a3f057  
 * 
 * Usage: <input bkAutofocus>
 */
@Directive({
  selector: '[bkFocus]',
  standalone: true
})
export class AutofocusDirective implements AfterViewInit {
  public readonly hostElement = input.required<ElementRef>();

  ngAfterViewInit() {
    this.hostElement().nativeElement.focus();
  }
}