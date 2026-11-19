import { Component, ComponentRef, DestroyRef, ViewContainerRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';

import { SectionModel } from '@okr/shared-models';
import { DeferError, Spinner } from '@okr/shared-ui';
// type-only: a runtime import of the transit lib here would put it back into the dashboard's eager bundle
import type { ConnectionsSectionComponent, DeparturesSectionComponent } from '@okr/mobility-transit-feature';

export type TransitSectionKind = 'connections' | 'departures';
type TransitSection = ConnectionsSectionComponent | DeparturesSectionComponent;

/**
 * Renders a Fahrplan (`connections`) or Abfahrten (`departures`) section with the transit library loaded on demand.
 *
 * The transit lib must not be imported statically from the section dispatcher: `@defer` alone keeps the static
 * import edge, and esbuild then ships the lib with the dashboard's eager JS (spec 1.162, see the `lazy-loading`
 * skill). The component is created by hand after a dynamic `import()` instead.
 */
@Component({
  selector: 'okr-transit-section-host',
  standalone: true,
  imports: [Spinner, DeferError],
  template: `
    <ng-container #host />
    @if (failed()) {
      <okr-defer-error />
    } @else if (!ref()) {
      <okr-spinner />
    }
  `,
})
export class TransitSectionHost {
  public readonly kind = input.required<TransitSectionKind>();
  public readonly section = input.required<SectionModel>();
  public readonly pageLocationKey = input('');

  private readonly host = viewChild('host', { read: ViewContainerRef });
  protected readonly ref = signal<ComponentRef<TransitSection> | undefined>(undefined);
  protected readonly failed = signal(false);
  private loading = false;

  constructor() {
    effect(() => {
      const host = this.host();
      if (!host || this.loading || untracked(() => this.ref())) return;
      this.loading = true;
      const kind = untracked(() => this.kind());
      void (async () => {
        try {
          const lib = await import('@okr/mobility-transit-feature');
          const ref: ComponentRef<TransitSection> = kind === 'connections'
            ? host.createComponent(lib.ConnectionsSectionComponent)
            : host.createComponent(lib.DeparturesSectionComponent);
          ref.setInput('section', untracked(() => this.section()));
          ref.setInput('pageLocationKey', untracked(() => this.pageLocationKey()));
          ref.changeDetectorRef.detectChanges();
          this.ref.set(ref);
        } catch (error) {
          console.error('TransitSectionHost: loading the transit section failed', error);
          this.failed.set(true);
        }
      })();
    });

    // keep the inputs reactive — read every signal before the early return so the effect keeps tracking them
    effect(() => {
      const section = this.section();
      const pageLocationKey = this.pageLocationKey();
      const ref = this.ref();
      if (!ref) return;
      ref.setInput('section', section);
      ref.setInput('pageLocationKey', pageLocationKey);
    });

    inject(DestroyRef).onDestroy(() => this.ref()?.destroy());
  }
}
