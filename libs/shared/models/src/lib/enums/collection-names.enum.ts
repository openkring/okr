/* eslint-disable @typescript-eslint/no-duplicate-enum-values */
/* we need this exception because we want to give some firestore collections several names */

/**
 * Collection names for Firestore
 * BEWARE: collectionName is not the same as the route:
 *       e.g. resources6 -> resources
 */
export enum CollectionNames {
    Statistics = 'statistics2',
    SwissCities = 'swissCities2',
    MemberStatistics = 'memberStatistics2',
    ChatGroup = 'chatGroups',
    ChatMessage = 'chatMessages',
}
