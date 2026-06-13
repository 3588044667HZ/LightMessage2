// 全局类型声明 - 渲染进程中可直接使用的全局变量和扩展

// ========== Electron 全局导出 ==========
// contextIsolation: false + nodeIntegration: true 时，渲染进程可直接 require
declare const require: NodeRequire;
declare const module: NodeModule;
declare const __dirname: string;
declare const __filename: string;
declare const process: NodeJS.Process;

// ========== IPC 通道常量 ==========
// 主进程 → 渲染进程 (push)
type IpcMainToRendererChannels =
  | 'login:success'
  | 'login:error'
  | 'home:LoadUserDataRes'
  | 'home:LoadFriendsRes'
  | 'home:LoadGroupsRes'
  | 'home:LoadChatHistoryRes'
  | 'home:SyncChatHistoryRes'
  | 'home:MessageReceive'
  | 'home:MessageSendResponse'
  | 'home:createGroupRes'
  | 'home:joinGroupRes'
  | 'home:inviteMemberRes'
  | 'home:getGroupInfoRes'
  | 'home:kickMemberRes'
  | 'home:banMemberRes'
  | 'home:uploadImageRes'
  | 'home:getImageRes'
  | 'home:groupNotification'
  | 'home:groupInvitation'
  | 'home:sendFriendRequestRes'
  | 'home:respondFriendRequestRes'
  | 'home:friendRequestReceive'
  | 'home:friendRequestReject'
  | 'home:recallMessageRes'
  | 'home:recallMsgEvent'
  | 'home:uploadAvatarRes'
  | 'home:uploadGroupAvatarRes';

// 渲染进程 → 主进程 (request)
type IpcRendererToMainChannels =
  | 'login'
  | 'home:LoadUserData'
  | 'home:loadChatHistory'
  | 'home:syncChatHistory'
  | 'home:sendMessage'
  | 'home:createGroup'
  | 'home:joinGroup'
  | 'home:inviteMember'
  | 'home:getGroupInfo'
  | 'home:kickMember'
  | 'home:banMember'
  | 'home:uploadImage'
  | 'home:getImage'
  | 'home:sendFriendRequest'
  | 'home:respondFriendRequest'
  | 'home:recallMessage'
  | 'home:uploadAvatar'
  | 'home:uploadGroupAvatar';

// ========== WebSocket 协议端点 ==========
type ProtocolEndpoints =
  | '/auth/login'
  | '/auth/login_response'
  | '/heartbeat'
  | '/heartbeat_response'
  | '/message/send'
  | '/message/send_response'
  | '/message/receive'
  | '/group/message/send'
  | '/group/message/receive'
  | '/group/create'
  | '/group/create_response'
  | '/group/join'
  | '/group/join_response'
  | '/group/invite'
  | '/group/invite_response'
  | '/group/info'
  | '/group/info_response'
  | '/group/list'
  | '/group/list_response'
  | '/group/kick'
  | '/group/kick_response'
  | '/group/ban'
  | '/group/ban_response'
  | '/group/notification'
  | '/group/invitation_received'
  | '/history/get'
  | '/history/get_response'
  | '/contacts/list'
  | '/contacts/list_response'
  | '/friend_request'
  | '/friend_request_response'
  | '/friend_request_resp'
  | '/friend_request_resp_response'
  | '/friend_request/receive'
  | '/friend_request_reject'
  | '/recall_msg'
  | '/recall_msg_response'
  | '/recall_msg_event'
  | '/upload_pic'
  | '/upload_pic_response'
  | '/get_pic'
  | '/get_pic_response'
  | '/presence/change'
  | '/system/notification'
  | '/error';

// ========== 消息数据类型 ==========

interface RecievedMessageData {
  message_id: string;
  sender_id: string | number;
  target_id: string | number;
  target_type: 'user' | 'group';
  group_id?: string | number;
  content: string | { text: string } | { pic_id: string; type: 'image' };
  timestamp: number;
  type?: 'text' | 'image';
  code?: number;
}

interface RecallEventData {
  uid: string | number;
  type: 'group' | 'private';
  msg_id: string;
  timestamp: number;
  session_id?: string | number;
  group_id?: string | number;
}

interface LoginSuccessData {
  id: string | number;
  username: string;
  avatar: string;
  status: string;
}

// ========== Pinia Store 类型辅助 ==========

interface AuthState {
  user: LoginSuccessData | null;
  token: string | null;
  serverUrl: string;
}

interface ChatState {
  conversations: Array<Record<string, unknown>>;
  friends: Array<Record<string, unknown>>;
  groups: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  currentChat: { type: 'group' | 'private'; id: string | number; name: string } | null;
  activeTab: 'conversations' | 'friends' | 'groups' | 'notifications';
  searchKeyword: string;
  chatHistory: Record<string, Array<Record<string, unknown>>>;
}
