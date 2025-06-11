import { Injectable, inject } from '@angular/core';
import { combineLatest, firstValueFrom, map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { END_FUTURE_DATE_STR, ENV, FIRESTORE } from '@bk2/shared/config';
import { CategoryListModel, MembershipCollection, MembershipModel, ModelType, PersonCollection, PersonModel, UserModel } from '@bk2/shared/models';
import { addDuration, createModel, getSystemQuery, getTodayStr, searchData, updateModel } from '@bk2/shared/util';
import { copyToClipboardWithConfirmation } from '@bk2/shared/i18n';

import { saveComment } from '@bk2/comment/util';
import { getCategoryAttribute } from '@bk2/category/util';

import { CategoryChangeFormModel, getMembershipCategoryChangeComment, getMembershipSearchIndex, getMembershipSearchIndexInfo, getRelLogEntry } from '@bk2/membership/util';
  

  @Injectable({
    providedIn: 'root'
  })
  export class MembershipService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
    /**
   * Create a new membership and save it to the database.
   * @param membership the new membership to save
   * @returns the document id of the stored membership in the database
   */
  public async create(membership: MembershipModel, currentUser?: UserModel): Promise<string> {
    membership.index = this.getSearchIndex(membership);
    const _key = await createModel(this.firestore, MembershipCollection, membership, this.tenantId, '@membership.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, MembershipCollection, _key, '@comment.operation.initial.conf');  
    return _key;
  }

  /**
   * Retrieve an existing membership from the database.
   * @param key the key of the membership to retrieve
   * @returns the membership as an Observable
   */
  public read(key: string): Observable<MembershipModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((memberships: MembershipModel[]) => {
        return memberships.find((membership: MembershipModel) => membership.bkey === key);
      }));
  }

  public async update(membership: MembershipModel, confirmMessage = '@membership.operation.update'): Promise<void> {
    membership.index = this.getSearchIndex(membership);
    await updateModel(this.firestore, MembershipCollection, membership, confirmMessage, this.toastController);
  }

  public async delete(membership: MembershipModel): Promise<void> {
    membership.isArchived = true;
    await this.update(membership, `@membership.operation.delete`);
  }

  /**
   * End an existing membership by setting its validTo date.
   * @param membership the membership to end
   * @param dateOfExit the end date of the membership
   */
  public async endMembershipByDate(membership: MembershipModel, dateOfExit: string, currentUser?: UserModel): Promise<void> {
    if (membership.dateOfExit.startsWith('9999') && dateOfExit && dateOfExit.length === 8) {
      membership.dateOfExit = dateOfExit;
      membership.relIsLast = true;
      await this.update(membership);
      await saveComment(this.firestore, this.tenantId, currentUser, MembershipCollection, membership.bkey, '@comment.message.membership.deleted');  
    }
  }

  /**
   * Conclude a membership category change by ending the existing membership and creating a new one with the new category.
   * The existing membership is ended one day before the given newValidFrom.
   * The new membership starts on the given newValidFrom.
   * @param oldMembership the existing membership that will be ended
   * @param membershipChange the view model from the modal with the new membership category and the date of the category change
   */
  public async saveMembershipCategoryChange(oldMembership: MembershipModel, membershipChange: CategoryChangeFormModel, membershipCategory: CategoryListModel, currentUser?: UserModel): Promise<void> {
    oldMembership.relIsLast = false;
    oldMembership.dateOfExit = addDuration(membershipChange.dateOfChange ?? getTodayStr(), { days: -1});
    await this.update(oldMembership);

    // add a comment about the category change to the current membership
    const _comment = getMembershipCategoryChangeComment(membershipChange.membershipCategoryOld ?? 'undefined', membershipChange.membershipCategoryNew ?? 'undefined');
    await saveComment(this.firestore, this.tenantId, currentUser, MembershipCollection, oldMembership.bkey, _comment);  

    // create a new membership with the new type and the start date
    const _newMembership = this.copyMembershipWithNewType(oldMembership, membershipChange, membershipCategory);
    const _key = await this.create(_newMembership);

    // add a comment about the category change to the new membership
    await saveComment(this.firestore, this.tenantId, currentUser, MembershipCollection, _key, _comment);  
 
  }

  /**
   * Clone a membership with a new type and apply the changes needed for a category change. 
   * It is used for membership category changes, where we end the existing membership and create a new one with the new type.
   * @param oldMembership the existing membership that is cloned into a new one
   * @param newMembershipType the new membership type
   * @returns the copied membership
   */
  public copyMembershipWithNewType(oldMembership: MembershipModel, membershipChange: CategoryChangeFormModel, membershipCategory: CategoryListModel): MembershipModel {
    const _newMembership = structuredClone(oldMembership);
    _newMembership.bkey = '';  // the new membership gets a new key (generated in create method)
    _newMembership.membershipCategory = membershipChange.membershipCategoryNew ?? 'active';
    _newMembership.membershipState = getCategoryAttribute(membershipCategory, _newMembership.membershipCategory, 'state') as string;
    _newMembership.dateOfEntry = membershipChange.dateOfChange ?? getTodayStr();
    _newMembership.dateOfExit = END_FUTURE_DATE_STR;
    _newMembership.priority =  (oldMembership.priority ?? 0) + 1;
    _newMembership.relIsLast = true;
    const _cat = getCategoryAttribute(membershipCategory, _newMembership.membershipCategory, 'abbreviation') + '';
    _newMembership.relLog = getRelLogEntry(_newMembership.priority, oldMembership.relLog, _newMembership.dateOfEntry, _cat);
    _newMembership.price = getCategoryAttribute(membershipCategory, _newMembership.membershipCategory, 'price') as number;
    return _newMembership;
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'memberName2', sortOrder = 'asc'): Observable<MembershipModel[]> {
    return searchData<MembershipModel>(this.firestore, MembershipCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /**
   * List the memberships of a given subject (person or organization).
   * @param memberKey the given subject to list its memberships for.
   * @returns a list of the subject's memberships as an Observable
   */
  public listMembershipsOfMember(memberKey: string, modelType: ModelType): Observable<MembershipModel[]> {
    if (!memberKey || memberKey.length === 0) return of([]);
    if (!modelType || (modelType !== ModelType.Person && modelType !== ModelType.Org)) return of([]);
    return this.list().pipe(
      map((memberships: MembershipModel[]) => {
        return memberships.filter((membership: MembershipModel) => membership.memberKey === memberKey && membership.memberModelType === modelType);
      }));
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
  
  /*------------------------------ copy email addresses ------------------------------*/
  public getAllEmailAddresses(memberships$: Observable<MembershipModel[]>): Observable<string[]> {
    const _persons$ =  searchData<PersonModel>(this.firestore, PersonCollection, getSystemQuery(this.tenantId), 'lastName', 'asc');

    // join the two streams to retrieve the email addresses of the selected memberships
      const _emails$ = combineLatest([memberships$, _persons$]).pipe(
        map(([_memberships,_persons]) =>_memberships.map(_membership=> {
          if (_membership.memberModelType !== ModelType.Person) return '';
          const _person = _persons.find(a => a.bkey === _membership.memberKey);
          return _person?.fav_email ?? '';
        })));
      return _emails$.pipe(map(_emails => _emails.filter(_email => _email !== '')));
    }

  // tbd: should we show a modal with all email addresses as deletable ion-chips ?
  public async copyAllEmailAddresses(memberships$: Observable<MembershipModel[]>): Promise<void> {
    const _emails = await firstValueFrom(this.getAllEmailAddresses(memberships$));
    await copyToClipboardWithConfirmation(this.toastController, this.env.settingsDefaults.toastLength, _emails.toString() ?? '', '@subject.address.operation.emailCopy.conf');
  }

  /*-------------------------- exports --------------------------------*/
  public async export(): Promise<void> {
    console.log('MembershipService.export: export are not implemented yet.');
  }

  /*   const _index = await this.selectExportType();
    if (_index === undefined) return;
    if (_index === 0) {
      await this.exportAddressesFromJoinedList('');
      // tbd: check whether it really is a joined list. Currently, it is only callable from ScsContactsListComponent
      //await exportXlsx(this.filteredItems(), 'all', 'all');
    }
    if (_index === 1) await this.exportSrvList('srv');
    if (_index === 2) await this.exportAddressList('address');
  } */

/*   private async selectExportType(): Promise<number | undefined> {
    const _modal = await this.modalController.create({
      component: BkLabelSelectModalComponent,
      componentProps: {
        labels: [
          '@membership.operation.select.default', 
          '@membership.operation.select.srv', 
          '@membership.operation.select.address'
        ],
        icons: ['list-circle-outline', 'menu-outline', 'list-outline'],
        title: '@membership.operation.select.title'
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (data !== undefined) {
        return parseInt(data);
      }
    }
    return undefined;
  } */

 /*  // we start with SCS members list. For each SCS member, we read its SRV member and subject, and merge to the needed information.
  public async exportSrvList(tableName: string): Promise<void> {
    const _table: string[][] = [];
    _table.push(getSrvHeaderRow());
    for (const _member of this.filteredItems()) {
      this.addSrvRowToTable(_table, _member);
    }
    // add all Austritte from last year with SRV info to this list
    const _exits = await firstValueFrom(this.getAllExitsFromLastYear());
    for (const _exit of _exits) {
      this.addExitedMembershipsToTable(_table, _exit);
    }
    exportXlsx(_table, getExportFileName('scsSrv', EXPORT_FORMATS[ExportFormat.XLSX].abbreviation), tableName);
  } */
  
/*   private async addSrvRowToTable(table: string[][], member: BaseModel): Promise<void> {
    if (isMembership(member)) {
      const _row = await (member.objectKey === OrgKey.SCS ? this.getSrvRowFromScsMember(member) : this.getSrvRowFromSrvMember(member));
      if (_row) table.push(_row);       
    }
  } */

/*   private async addExitedMembershipsToTable(table: string[][], member: BaseModel): Promise<void> {
    if (isMembership(member)) {
      const _mcat = await this.getMembershipByDate(member.subjectKey);
      if (_mcat) {
        console.log(`${member.subjectName2} ${member.subjectName} is still member of SCS with category ${getCategoryAbbreviation(ScsMemberTypes, _mcat)} and validTo ${member.validTo}`);
      } else {  // exited
        const _row = await this.getSrvRowFromScsMember(member);
        if (_row) table.push(_row);         
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
    const _srvMember$ = this.dataService.searchData(CollectionNames.Membership, [
      { key: 'objectKey', operator: '==', value: OrgKey.SRV },
      { key: 'subjectKey', operator: '==', value: scsMember.subjectKey },
    ], 'validFrom', 'desc');     // the sorting is to select the last membership
    
    //this.dataService.readModel(CollectionNames.Membership, _scsMember.bkey);
    const _person$ = this.dataService.readModel(CollectionNames.Subject, scsMember.subjectKey);
    return await firstValueFrom(combineLatest([_srvMember$, _person$]).pipe(map(([_srvMembers, _person]) => {
      if (_srvMembers.length > 0) {
        return (isMembership(_srvMembers[0]) && isSubject(_person)) ? convertToSrvDataRow(_person, scsMember, _srvMembers[0]) : undefined;
      } else {
        return (isSubject(_person)) ? convertToSrvDataRow(_person, scsMember, undefined) : undefined;
      }
    }))); 
  }
 */
/*   private async getSrvRowFromSrvMember(srvMember: RelationshipModel): Promise<string[] | undefined> {
    const _scsMember$ = this.dataService.searchData(CollectionNames.Membership, [
      { key: 'objectKey', operator: '==', value: OrgKey.SCS },
      { key: 'subjectKey', operator: '==', value: srvMember.subjectKey },
    ], 'validFrom', 'desc');   // the sorting is to select the last membership
    
    //this.dataService.readModel(CollectionNames.Membership, _scsMember.bkey);
    const _person$ = this.dataService.readModel(CollectionNames.Subject, srvMember.subjectKey);
    return await firstValueFrom(combineLatest([_scsMember$, _person$]).pipe(map(([_scsMembers, _person]) => {
      if (isMembership(_scsMembers[0]) && isSubject(_person)) {
        return convertToSrvDataRow(_person, _scsMembers[0], srvMember);
      } else {
        return undefined;
      }
    }))); 
  } */

      
/*   public async exportAddressList(tableName: string): Promise<void> {
    const _table: string[][] = [];
    const _fn = generateRandomString(10) + '.' + EXPORT_FORMATS[ExportFormat.XLSX].abbreviation;
    _table.push(['SubjectKey', 'MembershipKey', 'Vorname', 'Name', 'Strasse', 'PLZ', 'Ort', 'Telefon', 'Email', 'Geburtsdatum', 'Eintrittsdatum', 'MKat']);
    for (const _item of this.filteredItems()) {
      const _member = _item as RelationshipModel;
      const _person = await firstValueFrom(this.dataService.readModel(CollectionNames.Subject, _member.subjectKey)) as SubjectModel;
      if (_person) {
        _table.push([
          _person.bkey!,
          _member.bkey!,
          _person.firstName,
          _person.name,
          _person.fav_street,
          _person.fav_zip,
          _person.fav_city,
          _person.fav_phone,
          _person.fav_email,
          _person.dateOfBirth,
          _member.relLog.substring(0, 4),
          getCategoryAbbreviation(ScsMemberTypes, _member.subType)
        ]);
      }
    }
    exportXlsx(_table, _fn, tableName);
  } */

 /*  public async exportAddressesFromJoinedList(tableName: string): Promise<void> {
    const _table: string[][] = [];
    const _fn = generateRandomString(10) + '.' + EXPORT_FORMATS[ExportFormat.XLSX].abbreviation;
    _table.push(['SubjectKey', 'MembershipKey', 'Vorname', 'Name', 'Strasse', 'PLZ', 'Ort', 'Telefon', 'Email', 'Geburtsdatum', 'Eintrittsdatum', 'MKat']);
    for (const _item of this.filteredItems()) {
      const _member = _item as MembershipSubjectModel;
      _table.push([
        _member.subjectKey,
        _member.bkey!,
        _member.subjectName2, 
        _member.subjectName, 
        _member.subjectStreet, 
        _member.subjectZipCode, 
        _member.subjectCity, 
        _member.subjectPhone, 
        _member.subjectEmail, 
        _member.subjectDateOfBirth,
        _member.relLog.substring(0, 4),
        getCategoryAbbreviation(ScsMemberTypes, _member.subType)
      ]);
    }
    exportXlsx(_table, _fn, tableName);
  } */

/*   public async getMembershipByDate(subjectKey: string, evalDate = getTodayStr(DateFormat.StoreDate), orgKey = OrgKey.SCS): Promise<number | undefined> {
    const _memberships = await firstValueFrom(this.dataService.searchData(CollectionNames.Membership, [
      { key: 'objectKey', operator: '==', value: orgKey },
      { key: 'subjectKey', operator: '==', value: subjectKey },
      { key: 'validFrom', operator: '<=', value: evalDate },
    ], 'validFrom', 'desc'));        // keep open membership (empty string) at the beginning of the list
    if (_memberships.length === 0) return undefined;      // the given subjectKey does not have any memberships
    if (_memberships.length > 1) {
      warn(`MembershipService.getMembershipByDate: there are ${_memberships.length} memberships for ${subjectKey} on ${evalDate} (overlapping memberships should not exist).`);
      return undefined;
    }
    const _membership = _memberships[0] as RelationshipModel;
    if (isMembership(_membership)) {
      if (_membership.validTo >= evalDate) return _membership.subType;   // there is a current membership (either ScsMemberType or MemberType)
    }
    return undefined;   // member exited before evalDate
  } */
  

  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(membership: MembershipModel): string {
    return getMembershipSearchIndex(membership);
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return getMembershipSearchIndexInfo();
  }
}
