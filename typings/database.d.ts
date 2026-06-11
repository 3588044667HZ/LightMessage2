// database.js 类型存根 - LokiJS 本地数据库封装

/** LokiJS Collection 类型（简化） */
interface LokiCollection<T = Record<string, unknown>> {
  insert(doc: T): T & { $loki: number; meta: { created: number; revision: number } };
  update(doc: T & { $loki: number }): void;
  remove(doc: T & { $loki: number }): void;
  find(query?: Record<string, unknown>): T[];
  findOne(query: Record<string, unknown>): (T & { $loki: number }) | null;
  findAndRemove(query: Record<string, unknown>): void;
  clear(): void;
  chain(): LokiChain<T>;
  data: T[];
}

/** LokiJS Chain 查询类型 */
interface LokiChain<T = Record<string, unknown>> {
  find(query?: Record<string, unknown>): LokiChain<T>;
  sort(comparator: string | ((a: T, b: T) => number), desc?: boolean): LokiChain<T>;
  simplesort(prop: string, desc?: boolean): LokiChain<T>;
  offset(offset: number): LokiChain<T>;
  limit(limit: number): LokiChain<T>;
  data(): T[];
}

/** LokiJS 数据库实例（简化） */
interface LokiDatabase {
  addCollection<T = Record<string, unknown>>(name: string, options?: Record<string, unknown>): LokiCollection<T>;
  getCollection<T = Record<string, unknown>>(name: string): LokiCollection<T> | null;
  removeCollection(name: string): void;
  listCollections(): Array<{ name: string }>;
  saveDatabase(callback?: (err: Error | null) => void): void;
}

// ========== 数据模型类型 ==========

interface SettingRecord {
  key: string;
  value: unknown;
}

interface UserRecord {
  id: number;
  username?: string;
  avatar?: string;
  status?: string;
  token?: string;
  user_info?: { avatar: string; status: string };
}

interface MessageRecord {
  message_id?: string;
  sender_id: string | number;
  receiver_id?: string | number;
  group_id?: string | number;
  content: string | Record<string, unknown>;
  timestamp: number;
  type?: string;
  conversation_id?: string;
  read?: boolean;
  read_time?: number;
  recalled?: boolean;
  client_msg_id?: string;
}

interface GroupMessageRecord {
  message_id?: string;
  group_id: string | number;
  sender_id: string | number;
  content: string | Record<string, unknown>;
  timestamp: number;
  type?: string;
  recalled?: boolean;
  client_msg_id?: string;
}

interface GroupRecord {
  id: string | number;
  name?: string;
  avatar?: string;
  owner_id?: string | number;
  members?: Array<string | number>;
  description?: string;
  member_count?: number;
}

interface ContactRecord {
  id: string | number;
  user_id: string | number;
  username?: string;
  nickname?: string;
  avatar?: string;
  status?: string;
  is_starred?: boolean;
  last_contact_time?: number;
}

interface ConversationRecord {
  id: string;
  type?: string;
  user_id?: string | number;
  members?: Array<string | number>;
  last_message?: string;
  last_message_time?: number;
  created_time?: number;
  unread_count?: number;
}

interface FileRecord {
  id?: string;
  message_id?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  upload_time?: number;
  pic_id?: string;
}

// ========== Collections 映射 ==========

interface DatabaseCollections {
  settings: LokiCollection<SettingRecord>;
  users: LokiCollection<UserRecord>;
  messages: LokiCollection<MessageRecord>;
  groupMessages: LokiCollection<GroupMessageRecord>;
  groups: LokiCollection<GroupRecord>;
  contacts: LokiCollection<ContactRecord>;
  conversations: LokiCollection<ConversationRecord>;
  files: LokiCollection<FileRecord>;
}

/**
 * 本地数据库 - 基于 LokiJS 的持久化存储
 *
 * @example
 * ```js
 * const { Database } = require('./database');
 * const db = new Database();
 * await db.initialize();
 * db.saveUser({ id: 1, username: 'test' });
 * ```
 */
declare class Database {
  /** LokiJS 数据库实例 */
  db: LokiDatabase | null;
  /** 集合映射 */
  collections: DatabaseCollections;
  /** 数据库文件路径 */
  dbPath: string;

  constructor();

  /** 初始化数据库（加载或创建） */
  initialize(): Promise<void>;

  /** 创建所有集合 */
  createCollections(): void;

  /** 写入默认设置项 */
  initializeDefaultSettings(): void;

  // ===== Settings =====

  /**
   * 获取设置项
   * @param key - 设置键名
   * @param defaultValue - 默认值
   */
  getSetting<T = unknown>(key: string, defaultValue?: T | null): T | null;

  /**
   * 设置配置项
   * @param key - 设置键名
   * @param value - 设置值
   */
  setSetting(key: string, value: unknown): void;

  // ===== Users =====

  /** 保存/更新用户 */
  saveUser(user: UserRecord): void;

  /** 按 ID 获取用户 */
  getUser(id: number): (UserRecord & { $loki: number }) | null;

  /** 更新用户信息 */
  updateUser(id: number, updates: Partial<UserRecord>): void;

  // ===== Messages (单聊) =====

  /** 保存私聊消息 */
  saveMessage(message: MessageRecord): MessageRecord & { $loki: number };

  /** 保存群聊消息 */
  saveGroupMessage(message: GroupMessageRecord): GroupMessageRecord & { $loki: number };

  /**
   * 获取会话消息列表
   * @param conversationId - 会话ID
   * @param limit - 返回数量
   * @param offset - 偏移量
   */
  getMessages(conversationId: string, limit?: number, offset?: number): MessageRecord[];

  /**
   * 获取群消息列表
   * @param groupId - 群组ID
   * @param limit - 返回数量
   * @param offset - 偏移量
   */
  getGroupMessages(groupId: string | number, limit?: number, offset?: number): GroupMessageRecord[];

  /**
   * 获取未读消息数量
   * @param userId - 用户ID
   * @param conversationId - 可选会话ID筛选
   */
  getUnreadCount(userId: string | number, conversationId?: string | null): number;

  /** 标记消息为已读 */
  markAsRead(messageIds: string | number | Array<string | number>): void;

  // ===== Conversations =====

  /** 创建或更新会话 */
  updateOrCreateConversation(conversation: ConversationRecord): void;

  /** 获取用户的所有会话 */
  getConversations(userId: string | number): ConversationRecord[];

  /** 删除会话 */
  deleteConversation(conversationId: string): void;

  // ===== Groups =====

  /** 保存/更新群组 */
  saveGroup(group: GroupRecord): void;

  /** 按 ID 获取群组 */
  getGroup(id: string | number): (GroupRecord & { $loki: number }) | null;

  /** 获取用户所在的所有群组 */
  getUserGroups(userId: string | number): GroupRecord[];

  // ===== Contacts =====

  /** 保存/更新联系人 */
  saveContact(contact: ContactRecord): void;

  /** 获取用户的所有联系人 */
  getContacts(userId: string | number): ContactRecord[];

  // ===== Utilities =====

  /**
   * 生成会话ID（双方ID排序拼接）
   * @param user1 - 用户1 ID
   * @param user2 - 用户2 ID
   */
  getConversationId(user1: string | number, user2: string | number): string;

  /**
   * 搜索消息内容
   * @param keyword - 搜索关键词
   * @param limit - 最大返回数量
   */
  searchMessages(keyword: string, limit?: number): MessageRecord[];

  /**
   * 获取用户统计数据
   * @param userId - 用户ID
   */
  getStatistics(userId: string | number): {
    total_messages: number;
    total_conversations: number;
    unread_messages: number;
    last_active: number;
  };

  /** 手动备份数据库到磁盘 */
  backup(): Promise<void>;

  /** 导出所有数据 */
  exportData(): Record<string, unknown[]>;

  /** 导入数据并备份 */
  importData(data: Record<string, unknown[]>): Promise<void>;

  /**
   * 清理过期数据
   * @param days - 保留天数，默认30天
   */
  cleanupOldData(days?: number): void;
}

declare module './database' {
  export { Database };
}
