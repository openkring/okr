import { Component, inject, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';

import { ButtonSection } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

/**
 * We do not consider the config from the button section for the emergency button.
 * The emergency button configuration ist fix.
 * 
 * The Emergency Button has some special styling:
 *   3D effect — a stacked box-shadow creates a dark red "bottom face" (0 6px 0 #8b0000) that makes the button look raised, plus a soft ambient shadow beneath it and a subtle inner highlight at the top to simulate light hitting a curved surface.
 *   Hover — the button lifts up (translateY(-3px)) and scales up slightly, and the shadow grows deeper, reinforcing the 3D feel.
 *   Active/click — the button presses down (translateY(4px)) and the shadow shrinks to give a satisfying "push" feedback.
 * Note: Since ion-button uses Shadow DOM, --box-shadow is its exposed CSS custom property — using it is the correct Ionic way to style the shadow rather than targeting .button-native directly.
 */
@Component({
  selector: 'bk-emergency-button-widget',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonButton, IonIcon
  ],
  styles: [`
    .container {
    display: flex;
    justify-content: center;
    align-items: center;
    ion-button {
        --border-radius: 50%;
        --box-shadow:
        0 6px 0 #8b0000,
        0 8px 6px rgba(0,0,0,0.4),
        inset 0 2px 4px rgba(255, 80, 80, 0.4);
        transition: transform 0.1s ease, --box-shadow 0.1s ease;
        transform: translateY(0);
        &:hover {
        --box-shadow:
            0 8px 0 #8b0000,
            0 12px 12px rgba(0, 0, 0, 0.35),
            inset 0 2px 4px rgba(255, 80, 80, 0.5);
        transform: translateY(-3px) scale(1.05);
        cursor: pointer;
        }
        &:active {
        --box-shadow:
            0 2px 0 #8b0000,
            0 3px 4px rgba(0, 0, 0, 0.3),
            inset 0 3px 6px rgba(0, 0, 0, 0.25);
        transform: translateY(4px);
        }
    }
    }
  `],
  template: `
    <div class="container">
      <ion-button (click)="action()"
        shape="round"
        fill="solid"
        color="danger"
        size="large"
      >
        <ion-icon size="large" src="{{ 'alert' | svgIcon }}" slot="icon-only" />
      </ion-button>
    </div>
  `
})
export class EmergencyButtonWidget {
  // inputs
  public section = input.required<ButtonSection>();
  public editMode = input<boolean>(false);

  // sendEmergency
  public send = output();
 
  protected async action(): Promise<void> {
    if (this.editMode()) return;
    this.send.emit();
  }
}