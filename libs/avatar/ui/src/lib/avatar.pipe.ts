import { Pipe, PipeTransform, inject } from '@angular/core';
import { AvatarService } from '@bk2/avatar-data-access';
import { Observable } from 'rxjs';

@Pipe({
  name: 'avatar',
  standalone: true,
})
export class AvatarPipe implements PipeTransform {
  private readonly avatarService = inject(AvatarService);

  transform(key: string): Observable<string> {
    return this.avatarService.getAvatarImgixUrl(key);
  }
}
