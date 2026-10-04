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
  status: "active" | "suspended";
  suspendedAt: string | null;
  suspensionReason: string | null;
  usernameChangedAt: string | null;
};

export type Me = PrivateUser;

/** A user as the admin console sees them: private details included. */
export type AdminUser = PrivateUser;

/**
 * The admin console's activity list — the admin's own actions, newest first.
 *
 * `metadata` is free-form context the backend stores per action: the previous
 * and new role, or the reason a rider was suspended. It is shaped by the
 * validator rather than by a column type, so it is read as an open record.
 */
export type AdminActivity = {
  id: string;
  action: string;
  targetUsername: string | null;
  adminUsername: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/** The admin console's headline counts. */
export type AdminStats = {
  usersTotal: number;
  usersActive: number;
  usersSuspended: number;
  ridesActive: number;
  postsTotal: number;
};

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
  /** Set when the message forwards a post instead of (or alongside) text. */
  sharedPostId: string | null;
  /** The forwarded post, resolved server-side so the bubble can render it inline. */
  sharedPost: SharedPost | null;
  clientNonce: string | null;
  createdAt: string;
  sender?: PublicUser;
  pending?: boolean;
  failed?: boolean;
};

/**
 * A post as it appears inside a chat bubble: enough to render the card and open
 * the post. Viewer-specific fields (did *I* like it) are deliberately absent.
 */
export type SharedPost = {
  id: string;
  content: string;
  media: PostMedia[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  user: PublicUser | null;
};

/**
 * Someone the signed-in rider can send a post to: a connection in either
 * direction, with `isMutual` saying whether it goes both ways.
 */
export type Friend = PublicUser & {
  isMutual: boolean;
  followsYou: boolean;
  viewerIsFollowing: boolean;
};

export type ConversationListItem = {
  id: string;
  type: "direct" | "community";
  communityId: string | null;
  community: { id: string; name: string; slug: string; image: string | null } | null;
  participants: PublicUser[];
  title: string;
  lastMessage: { id: string; content: string; hasSharedPost?: boolean; senderId: string; createdAt: string } | null;
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
  /**
   * Still frame shown before a video starts. Filled in by the API for videos it
   * can derive one for; absent for third-party or image media.
   */
  posterUrl?: string;
};

export type Post = {
  id: string;
  content: string;
  media: PostMedia[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  repostCount: number;
  viewerLiked: boolean;
  /** Whether the signed-in viewer has reposted this post to their own profile. */
  viewerReposted: boolean;
  /**
   * Set when the post appears in someone's reposts tab, so the card can name who
   * reposted it while still crediting the original author.
   */
  repostedBy: PublicUser | null;
  editedAt: string | null;
  mediaEditableUntil: string;
  createdAt: string;
  user: (PublicUser & { viewerIsFollowing?: boolean }) | null;
};

export type PostCommentItem = {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  likeCount: number;
  viewerLiked: boolean;
  user: PublicUser | null;
  /** Set on the local stand-in shown between submitting a comment and it landing. */
  pending?: boolean;
};