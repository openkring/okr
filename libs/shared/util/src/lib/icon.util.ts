import { ModelType, ResourceType } from "@bk2/shared/models";

export function getIconColor(isValidated: boolean): string {
  return (isValidated ? 'gold' : '#009D53');
}

// 20.0:key for a rowing boat, 20.4:key for a locker
// 20.0_0:key for a skiff -> ModelType.ResourceType_SubType:key
export function getAvatarKey(modelType: ModelType, key: string, resourceType?:number, subType?: number): string {
  if (modelType === ModelType.Resource && resourceType !== undefined) {
    if (resourceType === ResourceType.RowingBoat && subType !== undefined) {
      return `${modelType}.${resourceType}_${subType}:${key}`;
    } else {
      return `${modelType}.${resourceType}:${key}`;
    }
  } else {
    return `${modelType}.${key}`;
  }
}