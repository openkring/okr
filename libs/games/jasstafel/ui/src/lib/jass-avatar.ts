import { Component, computed, input } from '@angular/core';
import { IonAvatar, IonImg } from '@ionic/angular/standalone';

import { AvatarPipe } from '@okr/avatar-ui';
import { AvatarInfo } from '@okr/shared-models';
import { getAvatarName } from '@okr/shared-util-core';

/** A player's round photo, or the initials of a typed guest (key ''). Names are never shown. */
@Component({
  selector: 'okr-jass-avatar',
  standalone: true,
  imports: [IonAvatar, IonImg, AvatarPipe],
  styles: [`
    :host { display: inline-block; }
    ion-avatar { width: 44px; height: 44px; border: 2px solid transparent; }
    ion-avatar.marked { border-color: #f2d56b; }
    .initials { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
      border: 2px dashed rgba(242, 240, 230, 0.7); font-weight: 600; }
    .initials.marked { border-style: solid; border-color: #f2d56b; }
  `],
  template: `
    @if (avatar().key) {
      <ion-avatar [class.marked]="marked()" [title]="name()">
        <ion-img src="{{ 'person.' + avatar().key | avatar:'person' }}" [alt]="name()" />
      </ion-avatar>
    } @else {
      <div class="initials" [class.marked]="marked()" [title]="name()">{{ initials() }}</div>
    }
  `,
})
export class JassAvatar {
  public readonly avatar = input.required<AvatarInfo>();
  public readonly marked = input(false);

  protected readonly name = computed(() => getAvatarName(this.avatar()));
  protected readonly initials = computed(() =>
    this.name().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join(''));
}
