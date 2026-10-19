/** One row of the Bexio contact index: a person or org of the app, matched with its Bexio contact. */
export interface BexioIndex {
  // person or org
  key: string;      // getFullName(name1, name2).trim().toLowerCase(), the trim is important to remove the leading bank in orgs
  okey: string;     // BK document key (person.okey or org.okey)
  name1: string;   // first name (person) or '' (org)
  name2: string;   // last name (person) or company name (org)
  type: 'person' | 'org'; 
  bexioId: string; // BK-stored bexio ID (from membership.memberBexioId)
  streetName: string,
  streetNumber: string,
  zipCode: string,
  city: string,
  email: string,
  phone: string,    // BK favPhone

  // membership
  mkey: string;     // membership okey
  mname: string;          // membership full name (getFullName(memberName1, memberName2))
  memberModelType: string; // membership.memberModelType ('person' | 'org')
  mbexioId: string; // membership.memberBexioId
  dateOfExit: string;   // exit date, this is needed to finde the current members
  mcat: string;

  // bexio
  bx_id: string;     // Bexio contact ID
  bx_name1: string;  // Bexio first name (contact.name_2)
  bx_name2: string;  // Bexio last/company name (contact.name_1)
  bx_type: 'person' | 'org';
  bx_streetName: string;
  bx_streetNumber: string;
  bx_zipCode: string;
  bx_city: string;
  bx_email: string;
  bx_phone: string;
}
