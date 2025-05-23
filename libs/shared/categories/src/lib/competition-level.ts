import { CategoryModel, CompetitionLevel } from "@bk2/shared/models";

export type CompetitionLevelCategory = CategoryModel;



export const CompetitionLevels: CompetitionLevelCategory[] = [   
    {
        id: CompetitionLevel.U15,
        abbreviation: 'U15',
        name: 'u15',
        i18nBase: 'competitionLevel.type.u15',
        icon: 'medal'
    },
    {
        id: CompetitionLevel.U17,
        abbreviation: 'U17',
        name: 'u17',
        i18nBase: 'competitionLevel.type.u17',
        icon: 'medal'
    },    {
        id: CompetitionLevel.U19,
        abbreviation: 'U19',
        name: 'u19',
        i18nBase: 'competitionLevel.type.u19',
        icon: 'medal'
    },    {
        id: CompetitionLevel.U23,
        abbreviation: 'U23',
        name: 'u23',
        i18nBase: 'competitionLevel.type.u23',
        icon: 'medal'
    },    {
        id: CompetitionLevel.Elite,
        abbreviation: 'Elite',
        name: 'elite',
        i18nBase: 'competitionLevel.type.elite',
        icon: 'medal'
    },    {
        id: CompetitionLevel.Masters,
        abbreviation: 'Masters',
        name: 'masters',
        i18nBase: 'competitionLevel.type.masters',
        icon: 'medal'
    }
]
