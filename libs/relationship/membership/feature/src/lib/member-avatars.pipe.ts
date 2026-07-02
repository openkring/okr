import { firstValueFrom, map } from 'rxjs';
import { inject, Pipe, PipeTransform } from '@angular/core';

import { MembershipService } from '@okr/relationship-membership-data-access';
import { AvatarInfo, GroupModel } from '@okr/shared-models';

@Pipe({
  name: 'memberAvatars',
  standalone: true
})
export class MemberAvatarsPipe implements PipeTransform {
  private membershipService = inject(MembershipService);

  async transform(group: GroupModel): Promise<AvatarInfo[]> {
    const members$ =  this.membershipService.listMembersOfOrg(group.bkey, 'group');
    return await firstValueFrom(members$.pipe(map(memberships => this.membershipService.getMemberAvatars(memberships))));
  }
}