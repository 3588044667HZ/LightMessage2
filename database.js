// src/main/database.js
const loki = require("lokijs");
const path = require("path");
const fs = require("fs");

// const { getPath } = require("../renderer/src/App.vue");

class Database {
    constructor() {
        this.db = null;
        this.collections = {};
        this._initialized = false;
        this._initPromise = null;
        this.dbPath = path.join(__dirname, "data", "im.db");

        // 确保目录存在
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
        }
    }

    initialize() {
        if (this._initPromise) return this._initPromise;
        this._initPromise = new Promise((resolve) => {
            this.db = new loki(this.dbPath, {
                autoload: true, autoloadCallback: () => {
                    this.createCollections();
                    this._initialized = true;
                    console.log("[DB] 初始化完成");
                    resolve();
                }, autosave: true, autosaveInterval: 4000, serializationMethod: "pretty"
            });
        });
        return this._initPromise;
    }

    // 安全获取或创建集合（防止重复创建抛错）
    getOrCreateCollection(name, options) {
        let col = this.db.getCollection(name);
        if (!col) {
            col = this.db.addCollection(name, options);
        }
        return col;
    }

    createCollections() {
        // 用户配置
        this.collections.settings = this.getOrCreateCollection("settings", {
            indices: ["key"], unique: ["key"]
        });

        // 用户信息
        this.collections.users = this.getOrCreateCollection("users", {
            indices: ["id"], unique: ["id"], autoupdate: true
        });

        // 消息记录（单聊）
        this.collections.messages = this.getOrCreateCollection("messages", {
            indices: ["id", "sender_id", "receiver_id", "timestamp", "conversation_id"], autoupdate: true
        });

        // 群组消息
        this.collections.groupMessages = this.getOrCreateCollection("group_messages", {
            indices: ["id", "group_id", "sender_id", "timestamp"], autoupdate: true
        });

        // 群组信息
        this.collections.groups = this.getOrCreateCollection("groups", {
            indices: ["id"], unique: ["id"], autoupdate: true
        });

        // 联系人
        this.collections.contacts = this.getOrCreateCollection("contacts", {
            indices: ["id"], unique: ["id"], autoupdate: true
        });

        // 会话列表
        this.collections.conversations = this.getOrCreateCollection("conversations", {
            indices: ["id", "type", "last_message_time"], autoupdate: true
        });

        // 文件传输记录
        this.collections.files = this.getOrCreateCollection("files", {
            indices: ["id", "message_id", "upload_time"], autoupdate: true
        });

        // 初始化默认设置
        this.initializeDefaultSettings();
    }

    initializeDefaultSettings() {
        const defaultSettings = [{key: "autoLogin", value: false}, {
            key: "rememberPassword", value: false
        }, {key: "serverUrl", value: "ws://localhost:8765"}, {key: "notifySound", value: true}, {
            key: "notifyDesktop", value: true
        }, {key: "messageHistoryDays", value: 30}, {key: "theme", value: "light"}, {key: "fontSize", value: 14}];

        defaultSettings.forEach((setting) => {
            const existing = this.collections.settings.findOne({key: setting.key});
            if (!existing) {
                this.collections.settings.insert(setting);
            }
        });
    }

    // ========== Settings 操作 ==========
    getSetting(key, defaultValue = null) {
        const setting = this.collections.settings.findOne({key});
        return setting ? setting.value : defaultValue;
    }

    setSetting(key, value) {
        const existing = this.collections.settings.findOne({key});
        if (existing) {
            existing.value = value;
            this.collections.settings.update(existing);
        } else {
            this.collections.settings.insert({key, value});
        }
    }

    // ========== Users 操作 ==========
    saveUser(user) {
        const existing = this.collections.users.findOne({id: user.id});
        if (existing) {
            Object.assign(existing, user);
            this.collections.users.update(existing);
        } else {
            this.collections.users.insert(user);
        }
    }

    getUser(id) {
        return this.collections.users.findOne({id});
    }

    updateUser(id, updates) {
        const user = this.collections.users.findOne({id});
        if (user) {
            Object.assign(user, updates);
            this.collections.users.update(user);
        }
    }

    // ========== Messages 操作 ==========
    saveMessage(message) {
        try {
            if (!this.collections.messages) {
                console.error("[DB] messages collection not ready");
                return null;
            }
            // 去重：如果 message_id 已存在则跳过
            if (message.message_id) {
                const existing = this.collections.messages.findOne({ message_id: message.message_id });
                if (existing) return existing;
            }
            // 生成会话ID（单聊）
            message.conversation_id = this.getConversationId(message.sender_id, message.receiver_id || message.group_id);
            message.timestamp = message.timestamp || Date.now();

            const result = this.collections.messages.insert(message);
            console.log("[DB] 保存私聊消息, conv:", message.conversation_id, "sender:", message.sender_id);
            return result;
        } catch (err) {
            console.error("[DB] saveMessage error:", err);
            return null;
        }
    }

    saveGroupMessage(message) {
        try {
            if (!this.collections.groupMessages) {
                console.error("[DB] groupMessages collection not ready");
                return null;
            }
            // 去重：如果 message_id 已存在则跳过
            if (message.message_id) {
                const existing = this.collections.groupMessages.findOne({ message_id: message.message_id });
                if (existing) return existing;
            }
            message.timestamp = message.timestamp || Date.now();
            const result = this.collections.groupMessages.insert(message);
            console.log("[DB] 保存群消息, group:", message.group_id, "sender:", message.sender_id);
            return result;
        } catch (err) {
            console.error("[DB] saveGroupMessage error:", err);
            return null;
        }
    }

    // 强制刷盘（重要消息保存后调用，确保数据持久化）
    forceSave() {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve(); return; }
            this.db.saveDatabase((err) => {
                if (err) {
                    console.error("[DB] 强制刷盘失败:", err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    getMessages(conversationId, limit = 50, offset = 0) {
        return this.collections.messages
            .chain()
            .find({conversation_id: conversationId})
            .sort((a, b) => a.timestamp - b.timestamp)
            .offset(offset)
            .limit(limit)
            .data();
    }

    getGroupMessages(groupId, limit = 50, offset = 0) {
        return this.collections.groupMessages
            .chain()
            .find({group_id: groupId})
            .sort((a, b) => a.timestamp - b.timestamp)
            .offset(offset)
            .limit(limit)
            .data();
    }

    getUnreadCount(userId, conversationId = null) {
        const query = {
            receiver_id: userId, read: {$ne: true}
        };

        if (conversationId) {
            query.conversation_id = conversationId;
        }

        return this.collections.messages.find(query).length;
    }

    markAsRead(messageIds) {
        const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
        ids.forEach((id) => {
            const message = this.collections.messages.findOne({id});
            if (message) {
                message.read = true;
                message.read_time = Date.now();
                this.collections.messages.update(message);
            }
        });
    }

    // ========== Conversations 操作 ==========
    updateOrCreateConversation(conversation) {
        const existing = this.collections.conversations.findOne({id: conversation.id});
        if (existing) {
            Object.assign(existing, conversation);
            existing.last_message_time = Date.now();
            this.collections.conversations.update(existing);
        } else {
            conversation.last_message_time = Date.now();
            conversation.created_time = Date.now();
            this.collections.conversations.insert(conversation);
        }
    }

    getConversations(userId) {
        return this.collections.conversations
            .chain()
            .find({
                $or: [{user_id: userId}, {members: {$contains: userId}}]
            })
            .simplesort("last_message_time", true)
            .data();
    }

    deleteConversation(conversationId) {
        this.collections.conversations.findAndRemove({id: conversationId});
    }

    // ========== Groups 操作 ==========
    saveGroup(group) {
        const existing = this.collections.groups.findOne({id: group.id});
        if (existing) {
            Object.assign(existing, group);
            this.collections.groups.update(existing);
        } else {
            this.collections.groups.insert(group);
        }
    }

    getGroup(id) {
        return this.collections.groups.findOne({id});
    }

    getUserGroups(userId) {
        return this.collections.groups.find({
            $or: [{owner_id: userId}, {members: {$contains: userId}}]
        });
    }

    // ========== Contacts 操作 ==========
    saveContact(contact) {
        const existing = this.collections.contacts.findOne({id: contact.id});
        if (existing) {
            Object.assign(existing, contact);
            this.collections.contacts.update(existing);
        } else {
            this.collections.contacts.insert(contact);
        }
    }

    getContacts(userId) {
        return this.collections.contacts.find({user_id: userId}).sort((a, b) => {
            if (a.is_starred && !b.is_starred) return -1;
            if (!a.is_starred && b.is_starred) return 1;
            return (b.last_contact_time || 0) - (a.last_contact_time || 0);
        });
    }

    // ========== Utilities ==========
    getConversationId(user1, user2) {
        const ids = [String(user1), String(user2)].sort();
        return `conv_${ids.join("_")}`;
    }

    searchMessages(keyword, limit = 100) {
        const regex = new RegExp(keyword, "i");
        return this.collections.messages
            .find({
                $or: [{content: {$regex: regex}}, {"content.text": {$regex: regex}}]
            })
            .slice(0, limit);
    }

    // 统计数据
    getStatistics(userId) {
        const messages = this.collections.messages.find({
            $or: [{sender_id: userId}, {receiver_id: userId}]
        });

        const groupMessages = this.collections.groupMessages.find({
            sender_id: userId
        });

        const conversations = this.collections.conversations.find({
            user_id: userId
        });

        return {
            total_messages: messages.length + groupMessages.length,
            total_conversations: conversations.length,
            unread_messages: this.getUnreadCount(userId),
            last_active: Math.max(...messages.map((m) => m.timestamp), ...groupMessages.map((m) => m.timestamp))
        };
    }

    // 备份和恢复
    backup() {
        return new Promise((resolve, reject) => {
            this.db.saveDatabase((err) => {
                if (err) reject(err); else resolve();
            });
        });
    }

    exportData() {
        const data = {};
        Object.keys(this.collections).forEach((key) => {
            data[key] = this.collections[key].data;
        });
        return data;
    }

    importData(data) {
        Object.keys(data).forEach((key) => {
            if (this.collections[key]) {
                this.collections[key].clear();
                data[key].forEach((item) => {
                    this.collections[key].insert(item);
                });
            }
        });
        return this.backup();
    }

    // 清理旧数据
    cleanupOldData(days = 30) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        // 清理旧消息但保留最近的一些
        this.collections.messages
            .chain()
            .find({timestamp: {$lt: cutoff}})
            .remove();

        // 清理空会话
        const conversations = this.collections.conversations.data;
        conversations.forEach((conv) => {
            const messageCount = this.collections.messages.find({conversation_id: conv.id}).length;
            if (messageCount === 0) {
                this.collections.conversations.remove(conv);
            }
        });
    }

    /**
     * 登出时清理当前用户的所有数据
     * 清除消息、群消息、联系人、会话列表，保留 settings 和 groups 元数据
     */
    clearUserData() {
        try {
            if (this.collections.messages) this.collections.messages.clear();
            if (this.collections.groupMessages) this.collections.groupMessages.clear();
            if (this.collections.contacts) this.collections.contacts.clear();
            if (this.collections.conversations) this.collections.conversations.clear();
            if (this.collections.users) this.collections.users.clear();
            console.log("[DB] 用户数据已清理");
            this.forceSave().catch(() => {});
        } catch (err) {
            console.error("[DB] 清理用户数据失败:", err);
        }
    }
}

// 单例模式
// let instance = null;

module.exports = {
    Database: Database,
};
