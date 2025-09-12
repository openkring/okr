
import { CategoryModel, WorkingRelType } from '@bk2/shared-models';

export type WorkingRelTypeCategory = CategoryModel;

export const WorkingRelTypes: WorkingRelTypeCategory[] = [
  {
    id: WorkingRelType.Employee,
    abbreviation: 'EMPL',
    name: 'employee',
    i18nBase: 'categories.working-rel-type.employee',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Contractor,
    abbreviation: 'CNTR',
    name: 'contractor',
    i18nBase: 'categories.working-rel-type.contractor',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Volunteer,
    abbreviation: 'VOLN',
    name: 'volunteer',
    i18nBase: 'categories.working-rel-type.volunteer',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Intern,
    abbreviation: 'INTR',
    name: 'intern',
    i18nBase: 'categories.working-rel-type.intern',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Trainee,
    abbreviation: 'TRAIN',
    name: 'trainee',
    i18nBase: 'categories.working-rel-type.trainee',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Freelancer,
    abbreviation: 'FREL',
    name: 'freelancer',
    i18nBase: 'categories.working-rel-type.freelancer',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Student,
    abbreviation: 'STUD',
    name: 'student',
    i18nBase: 'categories.working-rel-type.student',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.BoardMember,
    abbreviation: 'BORD',
    name: 'boardMember',
    i18nBase: 'categories.working-rel-type.boardMember',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Cooperation,
    abbreviation: 'COOP',
    name: 'cooperation',
    i18nBase: 'categories.working-rel-type.cooperation',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Competition,
    abbreviation: 'COMP',
    name: 'competition',
    i18nBase: 'categories.working-rel-type.competition',
    icon: 'working-rel'
  },
  {
    id: WorkingRelType.Custom,
    abbreviation: 'CUST',
    name: 'custom',
    i18nBase: 'categories.working-rel-type.custom',
    icon: 'working-rel'
  }
];