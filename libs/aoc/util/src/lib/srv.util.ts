import { MembershipModel } from "@bk2/shared-models";

export const SRV_FILTERS = ['all', 'bk', 'srv', 'both'];

export function applyFilter(m: MembershipModel, filter: string): boolean {
    switch(filter) {
        case 'all': return true;
        case 'bk':  
        case 'srv':
        case 'both':
    }
    return false;
}