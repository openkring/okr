import { CalEventCollection } from "../calEvent.model";
import { CompetitionLevelCollection } from "../competition-level.model";
import { DocumentCollection } from "../document.model";
import { LocationCollection } from "../location.model";
import { MembershipCollection } from "../membership.model";
import { OrgCollection } from "../org.model";
import { OwnershipCollection } from "../ownership.model";
import { PageCollection } from "../page.model";
import { PersonCollection } from "../person.model";
import { PersonalRelCollection } from "../personal-rel.model";
import { ReservationCollection } from "../reservation.model";
import { ResourceCollection } from "../resource.model";
import { SectionCollection } from "../section.model";
import { TaskCollection } from "../task.model";
import { TransferCollection } from "../transfer.model";
import { UserCollection } from "../user.model";

export enum ModelValidationType {
  Person = PersonCollection,
  Org = OrgCollection,
  Resource = ResourceCollection,
  CompetitionLevel = CompetitionLevelCollection,
  CalEvent = CalEventCollection,
  Document = DocumentCollection,
  Location = LocationCollection,
  Ownership = OwnershipCollection,
  Membership = MembershipCollection,
  Page = PageCollection,
  Section = SectionCollection,
  User = UserCollection,
  Transfer = TransferCollection,
  Reservation = ReservationCollection,
  PersonalRel = PersonalRelCollection,
  WorkingRel = PersonalRelCollection,
  Task = TaskCollection
}