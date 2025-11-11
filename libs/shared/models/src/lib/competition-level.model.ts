import { DEFAULT_COMPETITION_LEVEL, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, SearchableModel } from './base.model';

export class CompetitionLevelModel implements BkModel, SearchableModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public gender = DEFAULT_GENDER;
  public personKey = DEFAULT_KEY;
  public dateOfBirth = DEFAULT_DATE;
  public competitionLevel = DEFAULT_COMPETITION_LEVEL;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CompetitionLevelCollection = 'competition-levels2';
