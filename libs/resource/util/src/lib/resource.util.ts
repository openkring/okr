import { ResourceModel, ResourceType, RowingBoatUsage } from "@bk2/shared/models";
import { ResourceFormModel } from "./resource-form.model";
import { doubleNumber2name, extractFirstPartOfOptionalTupel, extractSecondPartOfOptionalTupel } from "@bk2/shared/util-core";
import { ResourceTypes } from "@bk2/shared/categories";


/* ----------------------------- */
export function convertResourceToForm(resource: ResourceModel | undefined): ResourceFormModel {
    if (!resource) return {};

    // locker:  name = lockerNr/keyNr, subType = GenderType
    // key:     name = keyNr
    // boat:    name = boatName, subType = boatType
    // car:     name = carName, subType = carType
    // default: name = name, subType = undefined
    return {
      bkey: resource.bkey,
      name: resource.name,
      keyNr: getKeyNr(resource),
      lockerNr: getLockerNr(resource),
      type: resource.type,
      gender: getGender(resource),
      rowingBoatType: getRowingBoatType(resource),
      carType: getCarType(resource),
      usage: resource.usage,
      currentValue: resource.currentValue,
      weight: resource.weight,
      load: resource.load,
      brand: resource.brand,
      model: resource.model,
      serialNumber: resource.serialNumber,
      seats: resource.seats,
      length: resource.length,
      width: resource.width,
      height: resource.height,
      data: resource.data,
      hexColor: resource.color,
      description: resource.description,
      tags: resource.tags,
    }
}

function getKeyNr(resource: ResourceModel): number {
  if (resource.type === ResourceType.Locker) {
    return parseInt(extractSecondPartOfOptionalTupel(resource.name, '/'));
  } else {
    return 0;
  }
}

function getLockerNr(resource: ResourceModel): number {
  return resource.type === ResourceType.Locker ? parseInt(extractFirstPartOfOptionalTupel(resource.name, '/')) : 0;
}

function getGender(resource: ResourceModel): number {
  return resource.type === ResourceType.Locker ? resource.subType : 0
}

function getRowingBoatType(resource: ResourceModel): number {
  return resource.type === ResourceType.RowingBoat ? resource.subType : 0
}

function getCarType(resource: ResourceModel): number {
  return resource.type === ResourceType.Car ? resource.subType : 0
}

export function convertFormToResource(resource: ResourceModel | undefined, vm: ResourceFormModel, tenantId: string): ResourceModel {
    resource ??= new ResourceModel(tenantId);

    resource.bkey = vm.bkey ?? '';
    switch (vm.type) {
        case ResourceType.RowingBoat: 
          resource.name = vm.name ?? ''; 
          resource.subType = vm.rowingBoatType ?? 0;
          break;
        case ResourceType.Locker: 
          resource.name = doubleNumber2name(vm.lockerNr, vm.keyNr, '/', 2); 
          resource.subType = vm.gender ?? 0;
          break;
        case ResourceType.Car:
          resource.name = vm.name ?? '';
          resource.subType = vm.carType ?? 0;
          break;
        case ResourceType.Key: 
        default: 
          resource.name = vm.name ?? ''; 
          resource.subType = 0;
          break;
    }
    resource.type = vm.type ?? ResourceType.RowingBoat;
    resource.usage = vm.usage ?? RowingBoatUsage.Breitensport;
    resource.currentValue = parseInt(vm.currentValue + ''); // make sure it's a number (input returns string)
    resource.weight = parseInt(vm.weight + ''); // make sure it's a number (input returns string)
    resource.load = vm.load ?? '';
    resource.color = vm.hexColor ?? '';
    resource.description = vm.description ?? '';
    resource.tags = vm.tags ?? '';

    return resource;
}

export function isReservable(resourceType: ResourceType): boolean {
  switch(resourceType) {
    case ResourceType.RowingBoat: return true;
    case ResourceType.Boat:       return true;
    case ResourceType.Car:        return true;
    case ResourceType.Locker:     return false;
    case ResourceType.Key:        return false;
    case ResourceType.RealEstate: return true;
    case ResourceType.Other:      return true;
    default:                      return false;
  }
}


/* ---------------------- Getters -------------------------*/
export function getResourceLogo(resourceType: ResourceType): string {
  return ResourceTypes[resourceType].icon;
}

export function getResourceSlug(resourceType: ResourceType): string {
  return ResourceTypes[resourceType].name;
}

export function getResourceTitle(resourceType: ResourceType, operation: string | undefined, isResourceAdmin: boolean): string {
  const _operation = operation || isResourceAdmin ? 'update' : 'view';
  const _slug = getResourceSlug(resourceType);
  return `@resource.${_slug}.operation.${_operation}.label`;
}

/* ---------------------- Index operations -------------------------*/



