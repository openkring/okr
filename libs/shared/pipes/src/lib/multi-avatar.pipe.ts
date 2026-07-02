import { Pipe, PipeTransform } from '@angular/core';
import { MatrixRoom } from '@okr/shared-models';

@Pipe({
  name: 'multiAvatar',
  standalone: true
})
export class MultiAvatarPipe implements PipeTransform {
  
  transform(room: MatrixRoom): string {
    if (!room.avatar || room.avatar.trim() === '') {
      return room.isDirect ? 'person' : 'people';
    }
    if (room.avatar.length >= 3 &&room.avatar.startsWith('@@')) {
        return room.avatar.substring(2, 3);
    }
    return room.avatar;
  }
}
