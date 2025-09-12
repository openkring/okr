import { inject, Pipe, PipeTransform } from '@angular/core';

import { ENV } from '@bk2/shared-config';
import { ResourceType } from '@bk2/shared-models';

import { getResourceLogo } from './resource.util';

@Pipe({
  name: 'resourceLogo',
  standalone: true
})
export class ResourceLogoPipe implements PipeTransform {
  private readonly env = inject(ENV);

  transform(resourceType: ResourceType): string {
    const _iconName = getResourceLogo(resourceType);
    return `logo/ionic/${_iconName}.svg`;
  }
}