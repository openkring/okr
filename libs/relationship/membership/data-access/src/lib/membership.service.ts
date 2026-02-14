import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { FirestoreService } from '@bk2/shared-data-access';
import { CategoryListModel, MembershipCollection, MembershipModel, UserModel } from '@bk2/shared-models';
import { error } from '@bk2/shared-util-angular';
import { addDuration, findByKey, getCategoryAttribute, getSystemQuery, getTodayStr } from '@bk2/shared-util-core';

import { createComment } from '@bk2/comment-util';

import { CategoryChangeFormModel, getMembershipCategoryChangeComment, getMembershipIndex, getRelLogEntry } from '@bk2/relationship-membership-util';


@Injectable({
  providedIn: 'root'
})
export class MembershipService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
 * Create a new membership and save it to the database.
 * @param membership the new membership to save
 * @param currentUser the UserModel of the currently logged in user, used for logging and confirmation messages.
 * @returns the document id of the stored membership in the database or undefined if the operation failed
 */
  public async create(membership: MembershipModel, currentUser?: UserModel): Promise<string | undefined> {
    membership.index = getMembershipIndex(membership);
    return await this.firestoreService.createModel<MembershipModel>(MembershipCollection, membership, '@membership.operation.create', currentUser);
  }

  /**
   * Retrieve an existing membership from the database.
   * @param key the key of the membership to retrieve
   * @returns the membership as an Observable or undefined if not found
   */
  public read(key: string): Observable<MembershipModel | undefined> {
    return findByKey<MembershipModel>(this.list(), key);
  }

  public async update(membership: MembershipModel, currentUser?: UserModel, confirmMessage = '@membership.operation.update'): Promise<string | undefined> {
    membership.index = getMembershipIndex(membership);
    return await this.firestoreService.updateModel<MembershipModel>(MembershipCollection, membership, false, confirmMessage, currentUser);
  }

  public async delete(membership: MembershipModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<MembershipModel>(MembershipCollection, membership, '@membership.operation.delete', currentUser);
  }

  /**
   * End an existing membership by setting its validTo date.
   * @param membership the membership to end
   * @param dateOfExit the end date of the membership
   * @param currentUser the UserModel of the currently logged in user, used for logging and confirmation messages.
   * @returns the document id of the updated membership in the database or undefined if the operation failed
   */
  public async endMembershipByDate(membership: MembershipModel, dateOfExit: string, currentUser?: UserModel): Promise<string | undefined> {
    if (membership.dateOfExit.startsWith('9999') && dateOfExit && dateOfExit.length === 8) {
      membership.dateOfExit = dateOfExit;
      membership.relIsLast = true;
      membership.relLog = getRelLogEntry(dateOfExit, 'X', membership.relLog);
      return await this.firestoreService.updateModel<MembershipModel>(MembershipCollection, membership, false, '@membership.operation.end', currentUser);
    }
    return undefined;
  }

  /**
   * Conclude a membership category change by ending the existing membership and creating a new one with the new category.
   * The existing membership is ended one day before the given newValidFrom.
   * The new membership starts on the given newValidFrom.
   * @param oldMembership the existing membership that will be ended
   * @param membershipChange the view model from the modal with the new membership category and the date of the category change
   * @param membershipCategory the list of membership categories to use for the new membership
   * @param currentUser the UserModel of the currently logged in user, used for logging and confirmation messages.
   * @return the document id of the newly created membership in the database or undefined if the operation failed
   */
  public async saveMembershipCategoryChange(
    oldMembership: MembershipModel,
    membershipChange: CategoryChangeFormModel,
    membershipCategory: CategoryListModel,
    currentUser?: UserModel): Promise<string | undefined> {
    if (!currentUser) {
      return error(undefined, 'FirestoreService.saveMembershipCategoryChange: currentUser is mandatory.', true);
    }
    oldMembership.relIsLast = false;
    oldMembership.dateOfExit = addDuration(membershipChange.dateOfChange ?? getTodayStr(), { days: -1 });
    await this.update(oldMembership, currentUser);

    // add a comment about the category change to the current membership
    const message = getMembershipCategoryChangeComment(oldMembership.category, membershipChange.membershipCategoryNew);;
    const comment = createComment(currentUser.bkey, currentUser.firstName + ' ' + currentUser.lastName, message, MembershipCollection + '.' + oldMembership.bkey, this.env.tenantId);
    await this.firestoreService.saveComment(comment);

    // create a new membership with the new type and the start date
    const newMembership = this.copyMembershipWithNewType(oldMembership, membershipChange, membershipCategory);
    const key = await this.create(newMembership, currentUser);

    if (key) {
      // add a comment about the category change to the new membership
      await this.firestoreService.saveComment(comment);
      return key;
    }
    return undefined;
  }

  /**
   * Clone a membership with a new type and apply the changes needed for a category change. 
   * It is used for membership category changes, where we end the existing membership and create a new one with the new type.
   * @param oldMembership the existing membership that is cloned into a new one
   * @param membershipChange the data neede for the category change (old and new category, date of change)
   * @param membershipCategory the list of membership categories to use for the new membership
   * @returns the copied membership
   */
  public copyMembershipWithNewType(oldMembership: MembershipModel, membershipChange: CategoryChangeFormModel, membershipCategory: CategoryListModel): MembershipModel {
    const newMembership = structuredClone(oldMembership);
    newMembership.bkey = '';  // the new membership gets a new key (generated in create method)
    newMembership.category = membershipChange.membershipCategoryNew ?? 'active';

    // finds the mcat category and returns its state attribute (mapping the category to its state)
    newMembership.state = getCategoryAttribute(membershipCategory, newMembership.category, 'state') as string;
    newMembership.dateOfEntry = membershipChange.dateOfChange ?? getTodayStr();
    newMembership.dateOfExit = END_FUTURE_DATE_STR;
    newMembership.order = (oldMembership.order ?? 0) + 1;
    newMembership.relIsLast = true;
    const cat = getCategoryAttribute(membershipCategory, newMembership.category, 'abbreviation') + '';
    newMembership.relLog = getRelLogEntry(newMembership.dateOfEntry, cat, oldMembership.relLog);
    return newMembership;
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'memberName2', sortOrder = 'asc'): Observable<MembershipModel[]> {
    return this.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /**
   * List the memberships of a given subject (person or organization).
   * @param memberKey the given subject to list its memberships for.
   * @returns a list of the subject's memberships as an Observable
   */
  public listMembershipsOfMember(memberKey?: string, modelType?: string): Observable<MembershipModel[]> {
    if (!memberKey || memberKey.length === 0) return of([]);
    if (!modelType || (modelType !== 'person' && modelType !== 'org')) return of([]);
    return this.list().pipe(
      map((memberships: MembershipModel[]) => {
        return memberships.filter((membership: MembershipModel) => membership.memberKey === memberKey && membership.memberModelType === modelType);
      }));
  }

  /**
   * Returns a list of unique org|group keys for the given member.
   * @param memberKey The member's key (person or org).
   * @param modelType The model type ('person' or 'org').
   * @returns Observable<string[]> of unique org|group keys.
   */
  public listOrgsOfMember(memberKey: string, modelType: string): Observable<string[]> {
    return this.listMembershipsOfMember(memberKey, modelType).pipe(
      map(memberships => {
        const seen = new Set<string>();
        const orgKeys: string[] = [];
        for (const m of memberships) {
          const key = `${m.orgModelType}.${m.orgKey}`;
          if (!seen.has(key)) {
            seen.add(key);
            orgKeys.push(key);
          }
        }
        return orgKeys;
      })
    );
  }

  /**
 * List the members of a given organization or group.
 * @param orgKey the given organization or group to list its members for.
 * @returns a list of the memberships as an Observable
 */
  public listMembersOfOrg(orgKey: string): Observable<MembershipModel[]> {
    if (!orgKey || orgKey.length === 0) return of([]);
    return this.list().pipe(
      map((memberships: MembershipModel[]) => {
        return memberships.filter((membership: MembershipModel) => membership.orgKey === orgKey);
      }));
  }

  /*-------------------------- exports --------------------------------*/
  public async export(): Promise<void> {
    console.log('MembershipService.export: export are not implemented yet.');
  }

  /*   const index = await this.selectExportType();
    if (index === undefined) return;
    if (index === 0) {
      await this.exportAddressesFromJoinedList('');
      // tbd: check whether it really is a joined list. Currently, it is only callable from ScsContactsListComponent
      //await exportXlsx(this.filteredItems(), 'all', 'all');
    }
    if (index === 1) await this.exportSrvList('srv');
    if (index === 2) await this.exportAddressList('address');
  } */

  /*   private async selectExportType(): Promise<number | undefined> {
      const modal = await this.modalController.create({
        component: BkLabelSelectModalComponent,
        componentProps: {
          labels: [
            '@membership.operation.select.default', 
            '@membership.operation.select.srv', 
            '@membership.operation.select.address'
          ],
          icons: ['list-circle', 'menu', 'list'],
          title: '@membership.operation.select.title'
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm') {
        if (data !== undefined) {
          return parseInt(data);
        }
      }
      return undefined;
    } */

  /*  // we start with SCS members list. For each SCS member, we read its SRV member and subject, and merge to the needed information.
   public async exportSrvList(tableName: string): Promise<void> {
     const table: string[][] = [];
     table.push(getSrvHeaderRow());
     for (const member of this.filteredItems()) {
       this.addSrvRowToTable(table, member);
     }
     // add all Austritte from last year with SRV info to this list
     const exits = await firstValueFrom(this.getAllExitsFromLastYear());
     for (const exit of exits) {
       this.addExitedMembershipsToTable(table, exit);
     }
     exportXlsx(table, getExportFileName('scsSrv', EXPORT_FORMATS[ExportFormat.XLSX].abbreviation), tableName);
   } */

  /*   private async addSrvRowToTable(table: string[][], member: BaseModel): Promise<void> {
      if (isMembership(member)) {
        const row = await (member.objectKey === OrgKey.SCS ? this.getSrvRowFromScsMember(member) : this.getSrvRowFromSrvMember(member));
        if (row) table.push(row);       
      }
    } */

  /*   private async addExitedMembershipsToTable(table: string[][], member: BaseModel): Promise<void> {
      if (isMembership(member)) {
        const mcat = await this.getMembershipByDate(member.subjectKey);
        if (mcat) {
          console.log(`${member.subjectName2} ${member.subjectName} is still member of SCS with category ${getCategoryAbbreviation(ScsMemberTypes, mcat)} and validTo ${member.validTo}`);
        } else {  // exited
          const row = await this.getSrvRowFromScsMember(member);
          if (row) table.push(row);         
        }
      }
    } */

  /*   private getAllExitsFromLastYear(): Observable<BaseModel[]> {
      return this.dataService.searchData(CollectionNames.Membership, [
        { key: 'objectKey', operator: '==', value: OrgKey.SCS },
        { key: 'state', operator: '==', value: MembershipState.Active },
        { key: 'validTo', operator: '>=', value: getStartOfYear(-1)+'' },
        { key: 'validTo', operator: '<=', value: getEndOfYear(-1)+'' }
      ], 'validTo', 'desc');
    } */

  /*   private async getSrvRowFromScsMember(scsMember: RelationshipModel): Promise<string[] | undefined> {
      const srvMember$ = this.dataService.searchData(CollectionNames.Membership, [
        { key: 'objectKey', operator: '==', value: OrgKey.SRV },
        { key: 'subjectKey', operator: '==', value: scsMember.subjectKey },
      ], 'validFrom', 'desc');     // the sorting is to select the last membership
      
      //this.dataService.readModel(CollectionNames.Membership, scsMember.bkey);
      const person$ = this.dataService.readModel(CollectionNames.Subject, scsMember.subjectKey);
      return await firstValueFrom(combineLatest([srvMember$, person$]).pipe(map(([srvMembers, person]) => {
        if (srvMembers.length > 0) {
          return (isMembership(srvMembers[0]) && isSubject(person)) ? convertToSrvDataRow(person, scsMember, srvMembers[0]) : undefined;
        } else {
          return (isSubject(person)) ? convertToSrvDataRow(person, scsMember, undefined) : undefined;
        }
      }))); 
    }
   */
  /*   private async getSrvRowFromSrvMember(srvMember: RelationshipModel): Promise<string[] | undefined> {
      const scsMember$ = this.dataService.searchData(CollectionNames.Membership, [
        { key: 'objectKey', operator: '==', value: OrgKey.SCS },
        { key: 'subjectKey', operator: '==', value: srvMember.subjectKey },
      ], 'validFrom', 'desc');   // the sorting is to select the last membership
      
      //this.dataService.readModel(CollectionNames.Membership, scsMember.bkey);
      const person$ = this.dataService.readModel(CollectionNames.Subject, srvMember.subjectKey);
      return await firstValueFrom(combineLatest([scsMember$, person$]).pipe(map(([scsMembers, person]) => {
        if (isMembership(scsMembers[0]) && isSubject(person)) {
          return convertToSrvDataRow(person, scsMembers[0], srvMember);
        } else {
          return undefined;
        }
      }))); 
    } */


  /*   public async exportAddressList(tableName: string): Promise<void> {
      const table: string[][] = [];
      const fn = generateRandomString(10) + '.' + EXPORT_FORMATS[ExportFormat.XLSX].abbreviation;
      table.push(['SubjectKey', 'MembershipKey', 'Vorname', 'Name', 'Strasse', 'PLZ', 'Ort', 'Telefon', 'Email', 'Geburtsdatum', 'Eintrittsdatum', 'MKat']);
      for (const item of this.filteredItems()) {
        const member = item as RelationshipModel;
        const person = await firstValueFrom(this.dataService.readModel(CollectionNames.Subject, member.subjectKey)) as SubjectModel;
        if (person) {
          table.push([
            person.bkey!,
            member.bkey!,
            person.firstName,
            person.name,
            person.favStreetName,
            person.favStreetNumber,
            person.favZip,
            person.favCity,
            person.favPhone,
            person.favEmail,
            person.dateOfBirth,
            member.relLog.substring(0, 4),
            getCategoryAbbreviation(ScsMemberTypes, member.subType)
          ]);
        }
      }
      exportXlsx(table, fn, tableName);
    } */

  /*  public async exportAddressesFromJoinedList(tableName: string): Promise<void> {
     const table: string[][] = [];
     const fn = generateRandomString(10) + '.' + EXPORT_FORMATS[ExportFormat.XLSX].abbreviation;
     table.push(['SubjectKey', 'MembershipKey', 'Vorname', 'Name', 'Strasse', 'PLZ', 'Ort', 'Telefon', 'Email', 'Geburtsdatum', 'Eintrittsdatum', 'MKat']);
     for (const item of this.filteredItems()) {
       const member = item as MembershipSubjectModel;
       table.push([
         member.subjectKey,
         member.bkey!,
         member.subjectName2, 
         member.subjectName, 
         member.subjectStreet, 
         member.subjectZipCode, 
         member.subjectCity, 
         member.subjectPhone, 
         member.subjectEmail, 
         member.subjectDateOfBirth,
         member.relLog.substring(0, 4),
         getCategoryAbbreviation(ScsMemberTypes, member.subType)
       ]);
     }
     exportXlsx(table, fn, tableName);
   } */

  /*   public async getMembershipByDate(subjectKey: string, evalDate = getTodayStr(DateFormat.StoreDate), orgKey = OrgKey.SCS): Promise<number | undefined> {
      const memberships = await firstValueFrom(this.dataService.searchData(CollectionNames.Membership, [
        { key: 'objectKey', operator: '==', value: orgKey },
        { key: 'subjectKey', operator: '==', value: subjectKey },
        { key: 'validFrom', operator: '<=', value: evalDate },
      ], 'validFrom', 'desc'));        // keep open membership (empty string) at the beginning of the list
      if (memberships.length === 0) return undefined;      // the given subjectKey does not have any memberships
      if (memberships.length > 1) {
        warn(`MembershipService.getMembershipByDate: there are ${memberships.length} memberships for ${subjectKey} on ${evalDate} (overlapping memberships should not exist).`);
        return undefined;
      }
      const membership = memberships[0] as RelationshipModel;
      if (isMembership(membership)) {
        if (membership.validTo >= evalDate) return membership.subType;   // there is a current membership (either ScsMemberType or MemberType)
      }
      return undefined;   // member exited before evalDate
    } */
}
