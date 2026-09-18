export type BikeInfo = {
  make?: string;
  model?: string;
  year?: number;
  nickname?: string;
  engineCc?: number;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  profileImage: string | null;
  bikeInfo: BikeInfo;
  emailVerifiedAt: string | null;
  createdAt: string;
};

export type PrivateUser = PublicUser & {
  email: string | null;
  phone: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
  role: "rider" | "admin";
};

export type Me = PrivateUser;

export type Profile = PublicUser & {
  followerCount: number;
  followingCount: number;
  postCount: number;
  isSelf: boolean;
  viewerIsFollowing: boolean;
  followsViewer: boolean;
};

export type Community = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  image: string | null;
  ownerId: string;
  joinPolicy: "open" | "request";
  memberCount: number;
  followerCount: number;
  createdAt: string;
  owner?: PublicUser;
  viewerRole: "owner" | "admin" | "moderator" | "member" | null;
  viewerStatus: string | null;
  viewerIsFollowing: boolean;
  viewerJoinRequestStatus: "pending" | null;
};

export type CommunityMemberItem = PublicUser & {
  role: "owner" | "admin" | "moderator" | "member";
  joinedAt: string;
};

export type JoinRequest = {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  user: PublicUser | null;
};

export type PageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

export type Page<T> = {
  items: T[];
  pageInfo: PageInfo;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  clientNonce: string | null;
  createdAt: string;
  sender?: PublicUser;
  pending?: boolean;
  failed?: boolean;
};

export type ConversationListItem = {
  id: string;
  type: "direct" | "community";
  communityId: string | null;
  community: { id: string; name: string; slug: string; image: string | null } | null;
  participants: PublicUser[];
  title: string;
  lastMessage: { id: string; content: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastReadAt: string | null;
};

export type RideParticipant = {
  userId: string;
  status: "joined" | "left";
  joinedAt: string;
  leftAt: string | null;
  helpRequestedAt: string | null;
  stoppedAt: string | null;
  user: PublicUser | null;
};

export type RideRelation = {
  creatorFollowsViewer: boolean;
  viewerFollowsCreator: boolean;
  isFriend: boolean;
  mutualCommunities: { id: string; name: string; slug: string }[];
  hasMutualRelation: boolean;
};

export type Ride = {
  id: string;
  name: string;
  status: "active" | "ended";
  voiceMode: "ptt" | "open";
  inviteCode: string;
  maxParticipants: number;
  creatorId: string;
  creator?: PublicUser;
  createdAt: string;
  endedAt: string | null;
  participants?: RideParticipant[];
};

export type NotificationItem = {
  id: string;
  type: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  actor: PublicUser | null;
};

export type SupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: "open" | "resolved";
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  creator?: PublicUser;
  resolver?: PublicUser;
};

export type Peer = {
  socketId: string;
  userId: string;
  username: string;
};

export type ConnectedUser = {
  user: Me;
  accessToken: string;
};

export type ApiErrorBody = {
  error?: {
    message?: string;
    code?: string;
    details?: unknown[];
  };
  message?: string;
};

export type PostMedia = {
  url: string;
  type: "image" | "video";
  width?: number;
  height?: number;
};

export type Post = {
  id: string;
  content: string;
  media: PostMedia[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewerLiked: boolean;
  editedAt: string | null;
  mediaEditableUntil: string;
  createdAt: string;
  user: PublicUser | null;
};

export type PostCommentItem = {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  user: PublicUser | null;
};