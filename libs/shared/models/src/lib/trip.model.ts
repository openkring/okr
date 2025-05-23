import { BkModel, NamedModel, SearchableModel, TaggedModel } from "./base.model";

export class TripModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
    public bkey = '';
    public tenants: string[] = [];
    public isArchived = false;
    public name = ''; // a meaningful name for the trip
    public index = '';
    public tags = '';
    public notes = ''; // a detailed description of the trip
    public startDate = ''; // date when the trip starts
    public startTime = ''; // time when the trip starts
    public endDate = ''; // date when the trip ends
    public endTime = ''; // time when the trip ends
    public resourceKey = ''; // resource.bkey: the resource used for the trip
    public locations: string[] = []; // location.bkey: the locations visited during the trip, ordered by visit
    public persons: string[] = []; // person.bkey: the persons participating in the trip

    constructor(tenantId: string) {
        this.tenants = [tenantId];
    }
}

export const TripCollection = 'trips';