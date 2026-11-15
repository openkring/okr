/** Request bodies Apple Contacts sent in spike S1 (macOS 27.2.1 / iOS 26.6.1), spec 1.159 §13. */
export const WELL_KNOWN = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<A:propfind xmlns:A=\"DAV:\">\n  <A:prop>\n    <A:current-user-principal/>\n    <A:principal-URL/>\n    <A:resourcetype/>\n  </A:prop>\n</A:propfind>\n";

export const PRINCIPAL = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<A:propfind xmlns:A=\"DAV:\">\n  <A:prop>\n    <B:addressbook-home-set xmlns:B=\"urn:ietf:params:xml:ns:carddav\"/>\n    <B:directory-gateway xmlns:B=\"urn:ietf:params:xml:ns:carddav\"/>\n    <A:displayname/>\n    <C:email-address-set xmlns:C=\"http://calendarserver.org/ns/\"/>\n    <A:principal-collection-set/>\n    <A:principal-URL/>\n    <A:resource-id/>\n    <A:supported-report-set/>\n  </A:prop>\n</A:propfind>\n";

export const HOME = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<A:propfind xmlns:A=\"DAV:\">\n  <A:prop>\n    <A:add-member/>\n    <D:bulk-requests xmlns:D=\"http://me.com/_namespace/\"/>\n    <A:current-user-privilege-set/>\n    <A:displayname/>\n    <D:guardian-restricted xmlns:D=\"http://me.com/_namespace/\"/>\n    <B:max-image-size xmlns:B=\"urn:ietf:params:xml:ns:carddav\"/>\n    <B:max-resource-size xmlns:B=\"urn:ietf:params:xml:ns:carddav\"/>\n    <C:me-card xmlns:C=\"http://calendarserver.org/ns/\"/>\n    <A:owner/>\n    <C:push-transports xmlns:C=\"http://calendarserver.org/ns/\"/>\n    <C:pushkey xmlns:C=\"http://calendarserver.org/ns/\"/>\n    <E:quota-available xmlns:E=\"urn:mobileme:davservices\"/>\n    <A:quota-available-bytes/>\n    <E:quota-used xmlns:E=\"urn:mobileme:davservices\"/>\n    <A:quota-used-bytes/>\n    <A:resource-id/>\n    <A:resourcetype/>\n    <A:supported-report-set/>\n    <A:sync-token/>\n  </A:prop>\n</A:propfind>\n";

export const BOOK_CTAG = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<A:propfind xmlns:A=\"DAV:\">\n  <A:prop>\n    <C:getctag xmlns:C=\"http://calendarserver.org/ns/\"/>\n    <A:sync-token/>\n  </A:prop>\n</A:propfind>\n";

export const BOOK_ETAGS = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<A:propfind xmlns:A=\"DAV:\">\n  <A:prop>\n    <A:getetag/>\n  </A:prop>\n</A:propfind>\n";

export const MULTIGET = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<B:addressbook-multiget xmlns:B=\"urn:ietf:params:xml:ns:carddav\">\n  <A:prop xmlns:A=\"DAV:\">\n    <A:getetag/>\n    <B:address-data/>\n  </A:prop>\n  <A:href xmlns:A=\"DAV:\">/books/main/org-spike2.vcf</A:href>\n  <A:href xmlns:A=\"DAV:\">/books/main/person-spike1.vcf</A:href>\n</B:addressbook-multiget>\n";

export const ROOT = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<A:propfind xmlns:A=\"DAV:\">\n  <A:prop>\n    <A:current-user-principal/>\n    <A:principal-URL/>\n    <A:resourcetype/>\n  </A:prop>\n</A:propfind>\n";

