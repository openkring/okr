import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner, IonText } from '@ionic/angular/standalone';

/**
 * Component to handle Matrix OIDC callback after SSO redirect
 * 
 * This component should be mapped to the route: /auth/matrix-callback
 * 
 * Matrix will redirect here with a loginToken parameter after successful authentication.
 */
@Component({
  selector: 'bk-matrix-oidc-callback',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonSpinner, IonText],
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      width: 100vw;
    }

    .callback-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px;
      text-align: center;
    }

    .error-message {
      color: var(--ion-color-danger);
      max-width: 400px;
      margin-top: 16px;
    }
  `],
  template: `
    <ion-content>
      <div class="callback-container">
        @if (!error()) {
          <ion-spinner name="crescent"></ion-spinner>
          <ion-text>
            <h2>Completing Matrix authentication...</h2>
            <p>Please wait while we finalize your login.</p>
          </ion-text>
        } @else {
          <ion-text color="danger">
            <h2>Authentication Failed</h2>
          </ion-text>
          <div class="error-message">
            <p>{{ error() }}</p>
            <p>
              <a [routerLink]="['/']">Return to home page</a>
            </p>
          </div>
        }
      </div>
    </ion-content>
  `
})
export class MatrixOidcCallbackComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  error = signal<string | null>(null);

  ngOnInit() {
    this.handleOidcCallback();
  }

  private async handleOidcCallback() {
    try {
      // Get the loginToken from URL parameters
      const params = this.route.snapshot.queryParams;
      const loginToken = params['loginToken'];

      if (!loginToken) {
        throw new Error('No login token received from Matrix');
      }

      // Verify OIDC state to prevent CSRF
      const storedState = sessionStorage.getItem('oidc_state');
      const returnedState = params['state'];

      if (storedState && returnedState && storedState !== returnedState) {
        throw new Error('Invalid OIDC state - possible CSRF attempt');
      }

      // Store the login token for the Matrix chat component to use
      localStorage.setItem('matrix_login_token', loginToken);
      sessionStorage.setItem('matrix_needs_token_exchange', 'true');

      // Clean up
      sessionStorage.removeItem('oidc_state');

      // Redirect back to the chat page
      const returnUrl = sessionStorage.getItem('matrix_return_url') || '/';
      sessionStorage.removeItem('matrix_return_url');

      console.log('Matrix OIDC callback successful, redirecting to:', returnUrl);
      
      // Small delay to show the loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      this.router.navigateByUrl(returnUrl);
    } catch (err: any) {
      console.error('Matrix OIDC callback error:', err);
      this.error.set(err.message || 'Unknown authentication error');
    }
  }
}
