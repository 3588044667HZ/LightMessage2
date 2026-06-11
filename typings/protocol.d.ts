// protocol.js (IMClient) 类型存根

/** WebSocket 连接回调 */
interface ConnectionCallbacks {
  onopen: Array<() => void>;
  onerror: Array<(error: unknown) => void>;
  onclose: Array<() => void>;
}

/** 消息处理器签名 */
type MessageHandler = (data: Record<string, unknown> & { code?: number }) => void;

/**
 * IM 客户端 - WebSocket 通信核心模块
 *
 * @example
 * ```js
 * const IMClient = require("./protocol");
 * const client = new IMClient("ws://127.0.0.1:8765");
 * await client.connect();
 * client.login("user1", "password");
 * client.on("/message/receive", (data) => { console.log(data); });
 * ```
 */
declare class IMClient {
  /** 底层 WebSocket 实例 */
  ws: WebSocket | null;
  /** 服务器地址 */
  serverUrl: string;
  /** 是否已连接 */
  connected: boolean;
  /** 是否已认证 */
  authenticated: boolean;
  /** 当前用户ID */
  userId: string | null;
  /** 认证 token */
  token: string | null;
  /** 用户密码（用于自动重连） */
  password: string | null;
  /** 设备标识 */
  deviceId: string;
  /** 心跳定时器 */
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  /** 是否主动断开 */
  intentionalDisconnect: boolean;
  /** 持久消息处理器映射 */
  messageHandlers: Record<string, MessageHandler>;
  /** 一次性消息处理器映射 */
  onceHandlers: Record<string, MessageHandler[]>;
  /** 自定义事件监听器 */
  eventListeners: Record<string, Array<(event: CustomEvent) => void>>;
  /** 连接状态回调 */
  connectionCallbacks: ConnectionCallbacks;
  /** 连接成功回调 */
  onconnected: () => void;

  /**
   * @param serverUrl - WebSocket 服务器地址
   */
  constructor(serverUrl?: string);

  /**
   * 注册一次性消息处理器（响应后自动删除）
   * @param endpoint - 消息端点路径，如 `/recall_msg_response`
   * @param handler - 响应处理函数
   */
  once(endpoint: string, handler: MessageHandler): void;

  /**
   * 移除持久消息处理器
   * @param endpoint - 消息端点路径
   * @param handler - 要移除的处理函数（当前实现直接 delete 整个 key）
   */
  off(endpoint: string, handler?: MessageHandler): void;

  /**
   * 注册持久消息处理器
   * @param endpoint - 消息端点路径，如 `/message/receive`
   * @param handler - 处理函数
   */
  on(endpoint: string, handler: MessageHandler): void;

  /**
   * 发送消息到服务器
   * @param endpoint - 消息端点路径
   * @param data - 消息体
   * @param requestId - 可选的请求ID
   * @returns Promise<void> - 消息发送完成后 resolve
   * @throws 连接未就绪时抛出错误
   */
  sendMessage(endpoint: string, data?: Record<string, unknown>, requestId?: string | null): Promise<void>;

  /**
   * 建立 WebSocket 连接
   * @returns Promise<void> - 连接成功后 resolve，10秒超时 reject
   */
  connect(): Promise<void>;

  /**
   * 等待连接就绪（已连接则直接返回，否则重新连接）
   */
  waitForConnection(): Promise<void>;

  /**
   * 执行登录
   * @param userid - 用户ID
   * @param password - 密码
   * @param deviceId - 设备标识，默认 "web"
   */
  login(userid?: string | number, password?: string, deviceId?: string): void;

  /**
   * 发送私聊文本消息
   * @param receiverId - 接收者ID
   * @param text - 消息文本
   * @param clientMsgId - 客户端消息ID（可选，自动生成）
   */
  sendTextMessage(receiverId: string | number, text: string, clientMsgId?: string | null): void;

  /**
   * 发送群聊文本消息
   * @param groupId - 群组ID
   * @param text - 消息文本
   * @param clientMsgId - 客户端消息ID（可选，自动生成）
   */
  sendGroupTextMessage(groupId: string | number, text: string, clientMsgId?: string | null): void;

  /**
   * 创建群组
   * @param name - 群组名称
   * @param description - 群组描述
   * @param initialMembers - 初始成员ID列表
   */
  createGroup(name: string, description?: string, initialMembers?: Array<string | number>): void;

  /**
   * 加入群组
   * @param groupId - 群组ID
   * @param password - 群组密码
   */
  joinGroup(groupId: string | number, password?: string): void;

  /**
   * 邀请成员加入群组
   * @param groupId - 群组ID
   * @param inviteeIds - 被邀请者ID列表
   */
  inviteToGroup(groupId: string | number, inviteeIds: string | number | Array<string | number>): void;

  /**
   * 获取群组信息
   * @param groupId - 群组ID
   */
  getGroupInfo(groupId: string | number): void;

  /**
   * 获取群组列表
   * @param category - 分类筛选，默认 'all'
   */
  getGroupList(category?: string): void;

  /** 生成客户端消息ID */
  generateClientMsgId(): string;

  /** 启动心跳（每30秒发送一次） */
  startHeartbeat(): void;

  /** 停止心跳 */
  stopHeartbeat(): void;

  /** 断开连接（标记为主动断连，不触发自动重连） */
  disconnect(): void;

  /**
   * 注册连接状态回调
   * @param type - 回调类型: 'onopen' | 'onerror' | 'onclose'
   * @param callback - 回调函数
   */
  addConnectionCallback(type: 'onopen' | 'onerror' | 'onclose', callback: Function): void;

  /**
   * 移除连接状态回调
   * @param type - 回调类型
   * @param callback - 要移除的回调函数
   */
  removeConnectionCallback(type: 'onopen' | 'onerror' | 'onclose', callback: Function): void;

  /** 触发自定义事件 */
  dispatchEvent(event: CustomEvent): void;

  /**
   * 添加事件监听
   * @param type - 事件类型
   * @param handler - 处理函数
   */
  addEventListener(type: string, handler: (event: CustomEvent) => void): void;

  /**
   * 移除事件监听
   * @param type - 事件类型
   * @param handler - 要移除的处理函数
   */
  removeEventListener(type: string, handler: (event: CustomEvent) => void): void;

  /** 内部：处理接收到的 WebSocket 消息 */
  handleMessage(data: { endpoint: string; code?: number; data?: Record<string, unknown> }): void;

  /** 内部：注册默认消息处理器 */
  registerMessageHandlers(): void;

  /** 内部：注册群组相关消息处理器 */
  registerGroupMessageHandlers(): void;
}

declare module './protocol' {
  export = IMClient;
}
