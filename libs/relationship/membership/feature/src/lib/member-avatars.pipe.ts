import { firstValueFrom, map } from 'rxjs';
import { inject, Pipe, PipeTransform } from '@angular/core';

import { MembershipService } from '@bk2/relationship-membership-data-access';
import { AvatarInfo, GroupModel } from '@bk2/shared-models';

@Pipe({
  name: 'memberAvatars',
  standalone: true
})
export class MemberAvatarsPipe implements PipeTransform {
  private membershipService = inject(MembershipService);

  async transform(group: GroupModel): Promise<AvatarInfo[]> {
    const members$ =  this.membershipService.listMembersOfOrg(group.bkey);
    return await firstValueFrom(members$.pipe(map(memberships => this.membershipService.getMemberAvatars(memberships))));
  }
}