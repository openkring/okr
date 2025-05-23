import { BkModel, SearchableModel } from "./base.model";
import { CompetitionLevel } from "./enums/competition-level.enum";
import { GenderType } from "./enums/gender-type.enum";

export class CompetitionLevelModel implements BkModel, SearchableModel  {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public firstName = '';
  public lastName = ''; 
  public gender: GenderType | undefined = undefined;
  public personKey = '';
  public dateOfBirth = '';
  public competitionLevel: CompetitionLevel | undefined = undefined; 

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CompetitionLevelCollection = 'competition-levels2';