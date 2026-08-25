
export interface MatrixConfig {
  homeserverUrl: string;
  userId?: string;
  accessToken?: string;
  deviceId?: string;
  /**
   * Epoch ms at which `accessToken` stops working, as reported by the
   * `getMatrixCredentials` Cloud Function (SCS-92). Optional: credentials cached
   * before this field existed have none, and are treated as expired so they refresh.
   */
  expiresAt?: number;
}

export interface MatrixMessage {
  eventId: string;
  roomId: string;
  sender: string;
  senderName: string;
  senderAvatar?: string;
  body: string;
  timestamp: number;
  type: string;
  content: any;
  mediaUrl?: string; // resolved HTTP/blob URL for image and file messages
  relatesTo?: {
    eventId: string;
    relationType: string;
  };
  reactions?: Map<string, Set<string>>; // emoji -> Set of user IDs
  isRedacted: boolean;
  isEdited: boolean;
  // Poll fields — only populated on org.matrix.msc3381.poll.start messages
  pollAnswers?: Array<{ id: string; body: string }>;
  pollVotes?: Record<string, number>;         // answerId → vote count
  pollVoters?: Record<string, MatrixReadReceipt[]>; // answerId → voters list
  myVoteAnswerId?: string;                    // first selected answerId (single-select compat)
  myVoteAnswerIds?: string[];                 // all selected answerIds (multi-select)
  maxSelections?: number;                     // 1 = single, >1 = multi
  pollEnded?: boolean;
}

export interface MatrixReadReceipt {
  userId: string;
  displayName: string;
  avatarUrl?: string;  // HTTP URL (18×18 crop via mxcUrlToHttp), may be undefined
  ts: number;          // epoch ms from the receipt event
}

export interface MatrixRoom {
  roomId: string;
  name: string;
  avatar?: string;
  topic?: string;
  isDirect: boolean;
  unreadCount: number;
  lastMessage?: MatrixMessage;
  members: MatrixMember[];
  typingUsers: string[];
  /**
   * The okr tenants this room belongs to, read from the room's `org.okr.tenant` state event
   * (see OKR_TENANT_EVENT in `@okr/chat-util`). NOT a Firestore field — a Matrix room is not a
   * Firestore document; this only mirrors room state. Undefined for rooms created before the
   * marker existed and not covered by `backfillMatrixRoomTenants`; such rooms stay visible in
   * every tenant.
   */
  tenants?: string[];
  /**
   * For a DM: the other member's Matrix user id (`@<personKey>:<server>`). Lets the tenant
   * filter place a DM without any room state — a DM belongs to the tenants the two people
   * actually share. Undefined for group rooms.
   */
  directUserId?: string;
}

export const ROOM_SHAPE: MatrixRoom = {
  roomId: '',
  name: '',
  avatar: '',
  topic: '',
  isDirect: false,
  unreadCount: 0,
  members: [],
  typingUsers: []
};

export interface MatrixMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  membership: string;
}

export interface TypingNotification {
  roomId: string;
  users: string[];
}

export interface MatrixUser {
  id: string; // Matrix user ID (@user:homeserver)
  name: string;
  imageUrl: string;
}

export interface MatrixAuthToken {
  accessToken: string;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}
