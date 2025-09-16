import { Component, inject, input } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { User } from 'firebase/auth';

import { UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { NetworkStatusService } from './network-status.service';


@Component({
  selector: 'bk-auth-info',
  standalone: true,
  imports: [FullNamePipe, IonGrid, IonRow, IonCol],
  template: `
    <ion-grid>
      <ion-row>
        <ion-col>System:</ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>online status:</small></ion-col>
        <ion-col>
          <small>{{ networkStatusService.isOnline() }} ({{ networkStatusService.onlineStatus()}})</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col>Authorization:</ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>isAuthenticated:</small></ion-col>
        <ion-col>
          <small>{{ isAuthenticated() }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>fbUser.loginEmail:</small></ion-col>
        <ion-col>
          <small>{{ fbUser()?.email ?? 'not defined' }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>fbUser.uid:</small></ion-col>
        <ion-col>
          <small>{{ fbUser()?.uid ?? 'not defined' }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col>Current User:</ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>loginEmail:</small></ion-col>
        <ion-col>
          <small>{{ currentUser()?.loginEmail ?? 'not defined' }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>personKey:</small></ion-col>
        <ion-col>
          <small>{{ currentUser()?.personKey ?? 'not defined' }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>personName:</small></ion-col>
        <ion-col>
          <small>{{ currentUser()?.firstName ?? '' | fullName : currentUser()?.lastName ?? 'not defined' }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>roles:</small></ion-col>
        <ion-col>
          <small>{{ printRoles() }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>tenant:</small></ion-col>
        <ion-col>
          <small>{{ currentUser()?.tenants ?? 'not defined' }}</small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>isAdmin:</small></ion-col>
        <ion-col>
          <small>{{ isAdmin() }}</small>
        </ion-col>
      </ion-row>
    </ion-grid>
  `,
})
export class AuthInfoComponent {
  protected networkStatusService = inject(NetworkStatusService);
  public currentUser = input.required<UserModel | undefined>();
  public fbUser = input.required<User | null | undefined>();
  public isAuthenticated = input.required<boolean>();
  public isAdmin = input.required<boolean>();

  public printRoles(): string {
    const _roles = this.currentUser()?.roles ?? [];
    return JSON.stringify(_roles);
  }
}
