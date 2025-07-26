import { Pipe, PipeTransform, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AvatarService } from '@bk2/avatar/data-access';

@Pipe({
  name: 'avatar',
})
export class AvatarPipe implements PipeTransform {
  private readonly avatarService = inject(AvatarService);

  transform(key: string): Observable<string> {
    return this.avatarService.getAvatarImgixUrl(key);
  }
}
