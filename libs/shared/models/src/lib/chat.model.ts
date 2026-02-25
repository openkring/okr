
export interface MatrixConfig {
  homeserverUrl: string;
  userId?: string;
  accessToken?: string;
  deviceId?: string;
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
