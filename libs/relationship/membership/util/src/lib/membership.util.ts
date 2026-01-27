import { DEFAULT_KEY, DEFAULT_MCAT, DEFAULT_NAME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { CategoryItemModel, GroupModel, GroupModelName, MembershipModel, MoneyModel, OrgModel, OrgModelName, PersonModel, PersonModelName } from '@bk2/shared-models';
import { addIndexElement, convertDateFormatToString, DateFormat, die, getTodayStr } from '@bk2/shared-util-core';

import { CategoryChangeFormModel } from './category-change-form.model';

export function newMembershipForPerson(person: PersonModel, orgKey: string, orgName: string, membershipCategory: CategoryItemModel, dateOfEntry = getTodayStr(DateFormat.StoreDate)): MembershipModel {
  const membership = new MembershipModel('dummy');
  membership.tenants = person.tenants;

  membership.memberKey = person.bkey ?? die('membership.util.newMembershipForPerson: person.bkey is undefined');
  membership.memberName1 = person.firstName;
  membership.memberName2 = person.lastName;
  membership.memberModelType = 'person';
  membership.memberType = person.gender;
  membership.memberDateOfBirth = person.dateOfBirth;
  membership.memberDateOfDeath = person.dateOfDeath;
  membership.memberZipCode = person.favZipCode;
  membership.memberBexioId = person.bexioId;

  membership.orgKey = orgKey;
  membership.orgName = orgName;

  membership.dateOfEntry = dateOfEntry;
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.category = membershipCategory.name;

  membership.order = 1;
  membership.relLog = getRelLogEntry(membership.order, '', membership.dateOfEntry, membershipCategory.abbreviation);
  membership.relIsLast = true;

  // membership.price may be undefined

  return membership;
}

export function newMembershipForOrg(org: OrgModel, orgKey: string, orgName: string, membershipCategory: CategoryItemModel, dateOfEntry = getTodayStr(DateFormat.StoreDate)): MembershipModel {
  const membership = new MembershipModel('dummy');
  membership.tenants = org.tenants;

  membership.memberKey = org.bkey ?? die('membership.util.newMembershipForOrg: org.bkey is undefined');
  membership.memberName1 = DEFAULT_NAME;
  membership.memberName2 = org.name;
  membership.memberModelType = 'org';
  membership.memberType = org.type;
  membership.memberDateOfBirth = org.dateOfFoundation;
  membership.memberDateOfDeath = org.dateOfLiquidation;
  membership.memberZipCode = org.favZipCode;
  membership.memberBexioId = org.bexioId;

  membership.orgKey = orgKey;
  membership.orgName = orgName;

  membership.dateOfEntry = dateOfEntry;
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.category = membershipCategory.name;

  membership.order = 1;
  membership.relLog = getRelLogEntry(membership.order, '', membership.dateOfEntry, membershipCategory.abbreviation);
  membership.relIsLast = true;

  // membership.price may be undefined

  return membership;
}

export function convertMembershipToCategoryChangeForm(membership: MembershipModel): CategoryChangeFormModel {
  return {
    bkey: membership.bkey ?? DEFAULT_KEY, // readonly
    memberName: membership.memberName1 + ' ' + membership.memberName2, // readonly
    orgName: membership.orgName ?? DEFAULT_NAME, // readonly
    dateOfChange: getTodayStr(DateFormat.StoreDate),
    membershipCategoryOld: membership.category ?? DEFAULT_MCAT, // readonly
    membershipCategoryNew: membership.category ?? DEFAULT_MCAT,
  };
}

export function convertMemberAndOrgToMembership(member: PersonModel | OrgModel | GroupModel, org: OrgModel | GroupModel, tenantId: string, modelType: 'person' | 'org' | 'group'): MembershipModel {
  let membership = new MembershipModel(tenantId);
  switch (modelType) {
    case PersonModelName:
      membership = addPersonInfoToMembership(membership, member as PersonModel);
      break;
    case OrgModelName:
      membership = addOrgInfoToMembership(membership, member as OrgModel);
      break;
    case GroupModelName:
      membership = addGroupInfoToMembership(membership, member as GroupModel);
      break;
  }
  membership.orgKey = org.bkey;
  membership.orgName = org.name;
  membership.dateOfEntry = getTodayStr();
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.category = DEFAULT_MCAT;
  return membership;
}

export function addPersonInfoToMembership(membership: MembershipModel, person: PersonModel): MembershipModel {
  membership.memberKey = person.bkey;
  membership.memberName1 = person.firstName;
  membership.memberName2 = person.lastName;
  membership.memberModelType = PersonModelName;
  membership.memberType = person.gender;
  membership.memberDateOfBirth = person.dateOfBirth;
  membership.memberDateOfDeath = person.dateOfDeath;
  membership.memberZipCode = person.favZipCode;
  membership.memberBexioId = person.bexioId;
  return membership;
}

export function addOrgInfoToMembership(membership: MembershipModel, org: OrgModel): MembershipModel {
  membership.memberKey = org.bkey;
  membership.memberName1 = DEFAULT_NAME;
  membership.memberName2 = org.name;
  membership.memberModelType = OrgModelName;
  membership.memberType = org.type;
  membership.memberDateOfBirth = org.dateOfFoundation;
  membership.memberDateOfDeath = org.dateOfLiquidation;
  membership.memberZipCode = org.favZipCode;
  membership.memberBexioId = org.bexioId;
  return membership;
}

export function addGroupInfoToMembership(membership: MembershipModel, group: GroupModel): MembershipModel {
  membership.memberKey = group.bkey;
  membership.memberName1 = DEFAULT_NAME;
  membership.memberName2 = group.name;
  membership.memberModelType = GroupModelName;
  return membership;
}

/**
 * Generate a relLog entry for a membership change.
 * @param priority the priority of the current membership
 * @param priorRelLog the relLog entry of the previous membership
 * @param dateOfEntry the start date of the current membership
 * @param category the membership category abbreviation for the current membership
 * @returns
 */
export function getRelLogEntry(priority: number, priorRelLog: string, dateOfEntry: string, category: string): string {
  let relLog = '';
  if (priority === 1) {
    // first membership
    relLog = `${dateOfEntry}:${category}`;
  } else {
    relLog = `${priorRelLog},${category}`;
  }
  return relLog;
}

/**
 * Generate a comment for a membership change. e.g. J -> A
 * @param oldMembershipType the old membership type
 * @param newMembershipType the new membership type
 * @returns a short description of the membership change
 */
export function getMembershipCategoryChangeComment(oldMembershipCategory?: string, newMembershipCategory?: string): string {
  const oldMembershipCat = oldMembershipCategory || 'undefined';
  const newMembershipCat = newMembershipCategory || 'undefined';
  return `${oldMembershipCat} -> ${newMembershipCat}`;
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given membership based on its values.
 * @param membership the membership for which to create the index
 * @returns the index string
 */
export function getMembershipIndex(membership: MembershipModel): string {
  let index = '';
  index = addIndexElement(index, 'mn', membership.memberName1 + ' ' + membership.memberName2);
  index = addIndexElement(index, 'mk', membership.memberKey);
  index = addIndexElement(index, 'ok', membership.orgKey);
  index = addIndexElement(index, 'on', membership.orgName);
  if (membership?.memberNickName) {
    index = addIndexElement(index, 'nn', membership.memberNickName);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getMembershipIndexInfo(): string {
  return 'mn:memberName mk:memberKey ok:orgKey on:orgName [nn:nickName]';
}


// ---------------------- Emails -------------------------------
// tbd: add cc: email addresses
// tbd: should we show a modal with all email addresses as deletable ion-chips ?
  export function getMemberEmailAddresses(memberships: MembershipModel[], persons: PersonModel[]): string[] {
    const memberKeys = new Set(memberships.map(m => m.memberKey));
    return persons
      .filter(p => p.bkey && memberKeys.has(p.bkey))
      .map(p => p.favEmail)
      .filter(email => !!email);   // remove empty/null
  }

  // ---------------------- SRV List -------------------------------
  /**
   * For each active SCS member, there should be an active SRV member.
   * If not, we export the SCS member data only with a comment that this is a new member.
   * If there is a current SRV member, but no corresponding SCS member, we add a comment that this member exited in the previous year.
   * @param person  The person that has the following memberships:
   * @param currentScs  an optional currently valid SCS membership
   * @param lastYearExit an optional exit of SCS membership in the last year
   * @param currentSrv an optional currently valid SRV membership
   * @returns 
   */
  export function convertToSrvDataRow(person: PersonModel, currentScs?: MembershipModel, lastYearExit?: MembershipModel, currentSrv?: MembershipModel): string[] {
    if (currentScs) {
      const srvCat = getSrvMemberCategory(person.dateOfBirth);
      if (currentSrv) { // both SCS and SRV member -> current SRV member, potential address change
        return [
          'Seeclub Stäfa',
          getMGRART_Titel(currentSrv.category, person.dateOfBirth),
          getSrvMembershipFee(currentSrv.category, person.dateOfBirth),
          person.lastName,
          person.firstName,
          currentSrv.memberId,
          getSafeDateInSrvFormat(person.dateOfBirth),
          person.favStreetName + ' ' + person.favStreetNumber,
          person.favZipCode,
          person.favCity,
          person.favPhone,
          person.favEmail,
          currentSrv.orgFunction,
          checkForChanges(currentScs, currentSrv, srvCat)
        ];
      } else {  // new SRV member
        return [
          'Seeclub Stäfa',
          getMGRART_Titel('', person.dateOfBirth),
          getSrvMembershipFee('', person.dateOfBirth),
          person.lastName,
          person.firstName,
          '',
          getSafeDateInSrvFormat(person.dateOfBirth),
          person.favStreetName + ' ' + person.favStreetNumber,
          person.favZipCode,
          person.favCity,
          person.favPhone,
          person.favEmail,
          'Eintritt per 1.1.2026: neu erfassen'
        ];
      }
    } else {  // no current SCS member
      if (currentSrv) { // exited SCS member -> exited SRV member
        const comment = 
          lastYearExit ? `Austritt per ${getSafeDateInSrvFormat(lastYearExit.dateOfExit)}: löschen` : 
          '*** DATENFEHLER ? *** Kein SCS Mitglied, aber SRV Mitglied (prüfe die Daten in der App, wahrscheinlich ist die SRV MItgliedschaft nicht nachgeführt)'; 
        return [
          'Seeclub Stäfa',
          getMGRART_Titel(currentSrv.category, person.dateOfBirth),
          getSrvMembershipFee(currentSrv.category, person.dateOfBirth),
          person.lastName,
          person.firstName,
          currentSrv.memberId,
          getSafeDateInSrvFormat(person.dateOfBirth),
          person.favStreetName + ' ' + person.favStreetNumber,
          person.favZipCode,
          person.favCity,
          person.favPhone,
          person.favEmail,
          currentSrv.orgFunction,
          comment
        ];
      } else {  // no SCS and no SRV membership -> should not happen / ignore
        console.warn(`MembershipUtil.convertToSrvDataRow: person ${person.bkey} has no SCS and no SRV membership`);
        return [];
      }
    }
  }

  export function getSafeDateInSrvFormat(dateStr: string): string {
    if (!dateStr || dateStr.length !== 8) return '';
    return convertDateFormatToString(dateStr, DateFormat.StoreDate, DateFormat.SrvDate);
  }

  export function getSrvMemberCategory(birthdate: string): string {
    const currentYear = Number(getTodayStr(DateFormat.Year));
    if (!birthdate || birthdate.length !== 8) return '';
    const birthYear = Number(convertDateFormatToString(birthdate, DateFormat.StoreDate, DateFormat.Year));
    return (currentYear - birthYear > 18) ? 'A' : 'J';
  }

  // ---------------------- Raw List -------------------------------
  export function convertToRawDataRow(membership: MembershipModel): string[] {
    return [
      membership.bkey,
      membership.tenants.join('|'),
      membership.isArchived.toString(),
      membership.index,
      membership.tags,
      membership.notes,
      membership.memberKey,
      membership.memberName1,
      membership.memberName2,
      membership.memberModelType as string,
      membership.memberType,
      membership.memberNickName,
      membership.memberAbbreviation,
      membership.memberDateOfBirth,
      membership.memberDateOfDeath,
      membership.memberZipCode,
      membership.memberBexioId,
      membership.memberId,
      membership.orgKey,
      membership.orgName,
      membership.orgModelType as string,
      membership.dateOfEntry,
      membership.dateOfExit,
      membership.category,
      membership.state,
      membership.orgFunction,
      membership.order.toString(),
      membership.relLog,
      membership.relIsLast.toString(),
      getPrice(membership.price)
    ];
  }

  function getPrice(price: MoneyModel | undefined): string {
    if (!price) return '';
    return (price.amount / 100).toFixed(2) + ' ' + price.currency;
  }

  // ---------------------- Address List -------------------------------
  export function convertToAddressDataRow(person: PersonModel): string[] {
    return [
      person.firstName,
      person.lastName, 
      person.favStreetName + ' ' + person.favStreetNumber,
      person.favZipCode,
      person.favCity,
      person.favPhone,
      person.favEmail
    ];
  }

  // ---------------------- Member List -------------------------------
  export function convertToMemberDataRow(membership: MembershipModel): string[] {
    return [
      membership.memberId,
      membership.memberName1,
      membership.memberName2,
      membership.memberDateOfBirth,
      membership.dateOfEntry,
      membership.category,
      membership.orgFunction
    ];
  }

  // Returns true if any address-relevant field differs between SCS and SRV membership
  export function checkForChanges(scsMember: MembershipModel, srvMember: MembershipModel, srvCat: string): string {
    let answer = '';
    if (scsMember.memberName1 !== srvMember.memberName1 || scsMember.memberName2 !== srvMember.memberName2) {
      answer += 'Namensänderung ';
    }
    // for address changes, we can only check the zip code. In SRV, we do not store street and city in the membership.
    if (scsMember.memberZipCode !== srvMember.memberZipCode) {
      answer += 'Adressänderung ';
    }
    // membership category change
    // srvCat is A or J, category is 'active' or 'junior'
    let cat: string | undefined;
    switch(srvMember.category) {
      case 'junior': cat = 'J'; break;
      case 'double': 
      case 'active': cat = 'A'; break;
      case 'honorary':
      case 'passive': cat = undefined; break;
    }
    if (cat && cat !== srvCat) {
      answer += 'Kategorieänderung ';
    } else {
      answer += '*** Unerlaubte Kategorie ***: ' + srvMember.category;
    }
    return answer.trim();
  }

  export function getMGRART_Titel(category: string, dob: string): string {
    const cat = getSrvMemberCategory(dob);  // 'A' or 'J'
    switch(category) {
      case '': 
      case 'junior': return cat === 'J' ? 'Junioren' : 'Aktive';
      case 'double': return 'Double';
      case 'active': return 'Aktive';
      case 'honorary': return 'Aktive';
      case 'passive': return 'Passive';
    }
    return 'ERROR: Unknown Category';
  }

  export function getSrvMembershipFee(category: string, dob: string): string {
    if (category === 'double') return '0';
    return getSrvMemberCategory(dob) === 'J' ? '0' : '75';
  }