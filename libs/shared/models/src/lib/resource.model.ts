import { BaseProperty, BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { DocumentType } from './enums/document-type.enum';
import { GenderType } from './enums/gender-type.enum';
import { ResourceType } from './enums/resource-type.enum';
import { RowingBoatType } from './enums/rowing-boat-type.enum';
import { RowingBoatUsage } from './enums/rowing-boat-usage.enum';

/**
 * A resource is a physical object that is owned by a subject (group, person, org)
 * If a resource has its own type, it should be a separate model (e.g. rowingBoat has boatType, boatUsage, etc.)
 */
export class ResourceModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = ''; // e.g. id like Kasten-Nr, Key Nr, Plate
  public index = '';
  public tags = '';
  public description = ''; // a detailed description of the resource
  public type = 0;
  public subType = 0; // GenderType for Lockers, RowingBoatType for RowingBoats, CarType for Cars
  public usage?: RowingBoatUsage;
  public currentValue = 0; // e.g. boat valuation
  public load = '';
  public weight = 0;
  public color = ''; // hexcolor
  public brand = '';
  public model = '';
  public serialNumber = '';
  public seats = 0;
  public length = 0;
  public width = 0;
  public height = 0;
  public data?: BaseProperty[] = []; // URL parameters that should be passed to the url

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ResourceCollection = 'resources6';

// model type is implicitly always Resource
export interface ResourceInfo {
  key: string;
  name: string;
  type: ResourceType;
  subType: GenderType | RowingBoatType | DocumentType;
}

export const DefaultResourceInfo: ResourceInfo = {
  key: '',
  name: '',
  type: ResourceType.RowingBoat,
  subType: RowingBoatType.b1x,
};
