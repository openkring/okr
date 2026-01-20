import { Pipe, PipeTransform, inject } from '@angular/core';

import { AvatarService } from '@bk2/avatar-data-access';

@Pipe({
  name: 'avatar',
  standalone: true,
  pure: false, // Make impure to react to cache updates
})
export class AvatarPipe implements PipeTransform {
  private readonly avatarService = inject(AvatarService);

  transform(key: string, defaultIcon?: string): string {
    return this.avatarService.getAvatarUrl(key, defaultIcon ?? 'other');
  }
}
