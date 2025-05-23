import { Injectable } from "@angular/core";
import { swissCities } from "./swisscities.data";


@Injectable({
  providedIn: 'root'
})
export class SwissCitiesService {
  public cities = swissCities;
}
