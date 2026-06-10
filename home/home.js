// 主应用模块
class HomeApp {
    constructor() {
        // 状态管理
        this.state = {
            currentUser: null,
            currentChat: null,
            conversations: [],
            friends: [],
            groups: [],
            searchKeyword: '',
            activeTab: 'conversations',
            userStatus: 'online',
            // 通知状态
            notifications: [],          // 通知列表 [{id, type, title, subtitle, detail, time, status, data}]
            unreadNotificationCount: 0  // 未读通知数
        };

        // 缓存数据
        this.cache = {
            friends: {}, groups: {},
            // 消息缓存: { "friend_101": { messages: [...], lastMessageId: "xxx" }, "group_g1": {...} }
            chatHistory: {}
        };

        // 图片缓存: pic_id → dataURL（内存缓存，减小服务器压力）
        this.cache.picCache = new Map();

        // 图片获取请求回调: pic_id → callback（用于异步加载完成后更新 UI）
        this._pendingImageCallbacks = {};

        // 已发起请求的 pic_id 集合（防止对同一图片重复发送 IPC）
        this._requestedPics = new Set();

        // 同步定时器（每 5 分钟从服务器拉取最新消息）
        this.syncTimer = null;
        this.SYNC_INTERVAL = 5 * 60 * 1000; // 5 分钟

        // 初始化
        this.init();
    }

    // 初始化应用
    init() {
        this.bindEvents();
        this.updateUI();
        this.showToast('欢迎使用内网即时通讯系统', 'info');
        ipcRenderer.send("home:LoadUserData")
    }

    // 生成消息缓存 key
    _chatKey(type, targetId) {
        return `${type}_${String(targetId)}`;
    }

    // 获取缓存中的消息
    _getCachedMessages(type, targetId) {
        const cache = this.cache.chatHistory[this._chatKey(type, targetId)];
        return cache ? cache.messages : null;
    }

    // 将消息写入缓存
    _cacheMessages(type, targetId, messages, lastMessageId) {
        const key = this._chatKey(type, targetId);
        this.cache.chatHistory[key] = {
            messages: messages,
            lastMessageId: lastMessageId || (messages.length > 0 ? String(messages[messages.length - 1].message_id || messages[messages.length - 1].id) : null)
        };
    }

    // 向缓存追加单条消息
    _appendMessageToCache(type, targetId, message) {
        const key = this._chatKey(type, targetId);
        if (!this.cache.chatHistory[key]) {
            this.cache.chatHistory[key] = { messages: [], lastMessageId: null };
        }
        this.cache.chatHistory[key].messages.push(message);
        // 更新 lastMessageId（仅用服务端分配的 ID）
        if (message.message_id) {
            this.cache.chatHistory[key].lastMessageId = String(message.message_id);
        }
    }

    // ===== 图片缓存与加载 =====

    // 解析消息内容，返回 { isImage, picId, text }
    _parseMessageContent(content) {
        if (typeof content === 'string') {
            return { isImage: false, picId: null, text: content };
        }
        if (content && typeof content === 'object') {
            if (content.pic_id) {
                return { isImage: true, picId: content.pic_id, text: '[图片]' };
            }
            return { isImage: false, picId: null, text: content.text || '' };
        }
        return { isImage: false, picId: null, text: '' };
    }

    // 获取消息预览文本（用于会话列表显示）
    _getMessagePreview(content) {
        const parsed = this._parseMessageContent(content);
        return parsed.isImage ? '[图片]' : parsed.text;
    }

    // 从内存缓存获取图片 dataURL
    _getCachedImage(picId) {
        return this.cache.picCache.get(picId) || null;
    }

    // 将图片 dataURL 写入缓存
    _cacheImageData(picId, dataUrl) {
        if (picId && dataUrl) {
            this.cache.picCache.set(picId, dataUrl);
        }
    }

    // 确保图片已加载：命中缓存直接返回，否则请求服务器
    _ensureImageLoaded(picId, imgElement) {
        const cached = this._getCachedImage(picId);
        if (cached) {
            imgElement.src = cached;
            imgElement.style.opacity = '1';
            return;
        }

        // 显示加载状态
        imgElement.classList.add('loading');

        // 注册回调（多个元素可以等待同一个 pic_id）
        if (!this._pendingImageCallbacks[picId]) {
            this._pendingImageCallbacks[picId] = [];
        }
        this._pendingImageCallbacks[picId].push(imgElement);

        // 仅在尚未发起请求时才发送 IPC（避免重复请求和 once handler 竞争）
        if (!this._requestedPics.has(picId)) {
            this._requestedPics.add(picId);
            ipcRenderer.send("home:getImage", { pic_id: picId });
        }
    }

    // 处理图片获取响应（全局监听）
    _handleGetImageResponse(data) {
        if (!data) return;

        const { pic_id, success } = data;
        const pendingElements = this._pendingImageCallbacks[pic_id] || [];
        delete this._pendingImageCallbacks[pic_id];
        // 清除请求标记（失败时允许后续重试）
        this._requestedPics.delete(pic_id);

        if (success && data.data) {
            const contentType = data.content_type || 'image/png';
            const dataUrl = `data:${contentType};base64,${data.data}`;

            // 写入内存缓存
            this._cacheImageData(pic_id, dataUrl);

            // 更新所有等待该图片的 DOM 元素
            pendingElements.forEach(el => {
                if (el && el.isConnected) {
                    el.src = dataUrl;
                    el.style.opacity = '1';
                    el.classList.remove('loading');
                }
            });
        } else {
            // 加载失败，显示错误占位
            pendingElements.forEach(el => {
                if (el && el.isConnected) {
                    el.alt = '图片加载失败';
                    el.classList.remove('loading');
                    el.classList.add('load-error');
                }
            });
        }
    }

    // 预加载图片到缓存（收到图片消息时调用，不依赖 DOM 元素）
    _prefetchImage(picId) {
        if (this._getCachedImage(picId)) return; // 已在缓存中
        if (this._requestedPics.has(picId)) return; // 已在请求中
        // 注册空回调列表，让响应处理器将数据写入缓存
        if (!this._pendingImageCallbacks[picId]) {
            this._pendingImageCallbacks[picId] = [];
        }
        this._requestedPics.add(picId);
        ipcRenderer.send("home:getImage", { pic_id: picId });
    }

    // 选择并上传图片，发送图片消息
    sendImage() {
        if (!this.state.currentChat) {
            this.showToast('请先选择一个聊天对象', 'warning');
            return;
        }

        // 清除旧监听器
        ipcRenderer.removeAllListeners('home:uploadImageRes');

        ipcRenderer.once('home:uploadImageRes', (event, response) => {
            if (!response.success) {
                if (response.message && response.message !== '已取消') {
                    this.showToast(response.message || '图片上传失败', 'error');
                }
                return;
            }

            const picId = response.pic_id;
            const contentType = response.content_type || 'image/png';

            // 构造客户端消息
            const clientMsgId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const message = {
                id: clientMsgId,
                messageId: '',  // 发送时暂无 server message_id
                sender: this.state.currentUser.id,
                content: { pic_id: picId, type: 'image' },
                time: new Date(),
                type: 'image'
            };

            // 渲染到聊天窗口
            this.appendMessageToChat(message);

            // 通过 IPC 发送消息（content 为 pic_id，msgType 标记为 image）
            ipcRenderer.send("home:sendMessage", {
                ...message,
                content: picId,  // 发送 pic_id 作为 content
                msgType: 'image',
                senderId: this.state.currentUser.id,
                targetId: this.state.currentChat.id,
                type: this.state.currentChat.type
            });

            // 更新会话列表
            this.updateConversationWithMessage(
                this.state.currentChat.id,
                this.state.currentChat.type,
                { content: '[图片]', time: new Date() }
            );

            // 写入消息缓存
            this._appendMessageToCache(this.state.currentChat.type, this.state.currentChat.id, {
                message_id: null,
                client_msg_id: clientMsgId,  // 用于匹配服务端响应
                sender_id: this.state.currentUser.id,
                receiver_id: this.state.currentChat.type === 'friend' ? this.state.currentChat.id : undefined,
                group_id: this.state.currentChat.type === 'group' ? this.state.currentChat.id : undefined,
                content: { pic_id: picId, type: 'image' },
                timestamp: Date.now(),
                type: 'image'
            });

            this.showToast('图片已发送', 'success');
        });

        // 触发文件选择对话框
        ipcRenderer.send('home:uploadImage');
    }

    // 启动定时同步
    startSyncTimer() {
        this.stopSyncTimer();
        this.syncTimer = setInterval(() => {
            this.syncCurrentChat();
        }, this.SYNC_INTERVAL);
    }

    // 停止定时同步
    stopSyncTimer() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    // 同步当前聊天
    syncCurrentChat() {
        const chat = this.state.currentChat;
        if (!chat) return;

        const key = this._chatKey(chat.type, chat.id);
        const cache = this.cache.chatHistory[key];
        if (!cache) return; // 无本地缓存，不触发同步

        console.log(`[Sync] 定时同步: ${key}`);

        // 用 limit=1 请求服务器最新消息，用于比较
        ipcRenderer.removeAllListeners("home:SyncChatHistoryRes");
        ipcRenderer.once("home:SyncChatHistoryRes", (event, data) => {
            if (!data || data.length === 0) return;

            const serverLatest = data[0];
            const serverLatestId = String(serverLatest.message_id);

            if (cache.lastMessageId && serverLatestId === cache.lastMessageId) {
                console.log(`[Sync] ${key}: 消息一致，无需更新`);
                return;
            }

            // ID 不一致 → 全量拉取
            console.log(`[Sync] ${key}: 消息不一致 (本地=${cache.lastMessageId}, 服务器=${serverLatestId})，全量拉取`);
            this._fetchFullHistory(chat.id, chat.type);
        });

        ipcRenderer.send("home:syncChatHistory", { targetId: chat.id, type: chat.type, limit: 1 });
    }

    // 全量拉取并更新缓存
    _fetchFullHistory(targetId, type) {
        ipcRenderer.removeAllListeners("home:LoadChatHistoryRes");
        ipcRenderer.once("home:LoadChatHistoryRes", (event, data) => {
            if (data && data.length > 0) {
                this._cacheMessages(type, targetId, data, String(data[data.length - 1].message_id));

                // 如果当前仍在查看该聊天，刷新显示
                if (this.state.currentChat && String(this.state.currentChat.id) === String(targetId) && this.state.currentChat.type === type) {
                    this._renderMessages(data, type);
                }
                console.log(`[Sync] 全量拉取完成: ${this._chatKey(type, targetId)}, ${data.length} 条消息`);
            }
        });
        ipcRenderer.send("home:loadChatHistory", { targetId: targetId, type: type });
    }

    // 绑定事件监听器
    bindEvents() {
        // 用户菜单
        document.getElementById('userMenuBtn').addEventListener('click', (e) => {
            this.toggleDropdown('userMenu', e);
        });

        // 用户菜单选项
        document.querySelectorAll('#userMenu .dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleUserAction(action);
            });
        });

        // 侧边栏头像点击 - 触发头像上传
        const userAvatar = document.querySelector('.user-avatar');
        if (userAvatar) {
            userAvatar.style.cursor = 'pointer';
            userAvatar.title = '点击更换头像';
            userAvatar.addEventListener('click', () => {
                this.uploadUserAvatar();
            });
        }

        // 标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // 搜索框
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.state.searchKeyword = e.target.value;
            this.filterLists();
        });

        // 添加好友按钮
        document.getElementById('addFriendBtn').addEventListener('click', () => {
            this.showAddFriendModal();
        });

        // 创建群组按钮
        document.getElementById('createGroupBtn').addEventListener('click', () => {
            this.showCreateGroupModal();
        });

        // 加入群组按钮
        document.getElementById('joinGroupBtn').addEventListener('click', () => {
            this.showJoinGroupModal();
        });

        // 聊天菜单
        document.getElementById('chatMenuBtn').addEventListener('click', (e) => {
            this.toggleDropdown('chatMenu', e);
        });

        // 聊天菜单选项
        document.querySelectorAll('#chatMenu .dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleChatAction(action);
            });
        });

        // 发送消息
        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 发送图片按钮
        document.getElementById('imageBtn').addEventListener('click', () => {
            this.sendImage();
        });

        // 监听图片获取响应（全局，用于懒加载聊天中的图片）
        ipcRenderer.on("home:getImageRes", (event, data) => {
            this._handleGetImageResponse(data);
        });

        // 模态框关闭按钮
        document.getElementById('closeModalBtn').addEventListener('click', () => {
            this.hideModal();
        });

        // 点击模态框外部关闭
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'modalOverlay') {
                this.hideModal();
            }
        });

        // 点击外部关闭所有下拉菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-menu') && !e.target.closest('.icon-btn')) {
                this.hideAllDropdowns();
            }
        });
        // 监听服务器推送的消息
        ipcRenderer.on("home:MessageReceive", (event, data) => {
            this.handleReceivedMessage(data);
        });

        // 监听消息发送响应 — 获取 server message_id 用于后续撤回
        ipcRenderer.on("home:MessageSendResponse", (event, data) => {
            const clientMsgId = data.client_msg_id;
            const serverMsgId = data.message_id || data.server_msg_id;
            if (!clientMsgId || !serverMsgId) return;

            // 找到 DOM 中 client_msg_id 对应的消息元素，更新 server message_id
            const msgEl = document.querySelector(`.message-item[data-client-msg-id="${clientMsgId}"]`);
            if (msgEl && !msgEl.dataset.messageId) {
                msgEl.dataset.messageId = String(serverMsgId);
                console.log(`[Send] 消息 ${clientMsgId} 获取到 server ID: ${serverMsgId}`);
            }

            // 同步更新缓存
            const chat = this.state.currentChat;
            if (chat) {
                const cached = this._getCachedMessages(chat.type, chat.id);
                if (cached) {
                    const msg = cached.find(m => m.client_msg_id === clientMsgId && !m.message_id);
                    if (msg) {
                        msg.message_id = serverMsgId;
                    }
                }
            }
        });

        // 监听群组通知（成员加入、离开等）— 同时写入通知列表
        ipcRenderer.on("home:groupNotification", (event, data) => {
            const typeMap = {
                member_joined: '加入群组',
                member_left: '离开了群组',
                member_kicked: '被移出群组',
                settings_updated: '群设置已更新'
            };
            const action = typeMap[data.type] || data.type;
            const name = data.user_name || '';
            this.showToast(`${name} ${action}`, 'info');
            // 添加到通知列表
            this.addNotification({
                type: 'group_notification',
                title: '群组通知',
                subtitle: `${name} ${action}`,
                detail: data.group_name ? `群组: ${data.group_name}` : '',
                time: new Date(),
                status: 'info',
                data: data
            });
        });

        // 监听群组邀请 — 同时写入通知列表
        ipcRenderer.on("home:groupInvitation", (event, data) => {
            this.showToast(`收到来自 ${data.inviter_name || '未知'} 的群「${data.group_name}」邀请`, 'info');
            this.addNotification({
                type: 'group_invitation',
                title: '群组邀请',
                subtitle: `${data.inviter_name || '未知'} 邀请您加入「${data.group_name}」`,
                detail: '',
                time: new Date(),
                status: 'pending',
                data: data
            });
        });

        // 监听好友申请通知（服务端推送给目标用户）
        ipcRenderer.on("home:friendRequestReceive", (event, data) => {
            console.log("收到好友申请:", data);
            this.showToast(`${data.from_nickname || '未知用户'} 请求添加您为好友`, 'info');
            this.addNotification({
                type: 'friend_request',
                title: '好友申请',
                subtitle: `${data.from_nickname || '未知用户'} 请求添加您为好友`,
                detail: data.reason || '',
                time: new Date((data.timestamp || Date.now() / 1000) * 1000),
                status: 'pending',
                data: data  // 包含 invitation_id, from_user_id, from_nickname, from_avatar, reason
            });
        });

        // 监听好友申请被拒绝通知（服务端推送给申请者）
        ipcRenderer.on("home:friendRequestReject", (event, data) => {
            console.log("好友申请被拒绝:", data);
            this.showToast(`${data.nickname || '用户'} 拒绝了您的好友申请`, 'info');
            this.addNotification({
                type: 'friend_request_reject',
                title: '好友申请被拒绝',
                subtitle: `${data.nickname || '用户'} 拒绝了您的好友申请`,
                detail: data.reason ? `原因: ${data.reason}` : '',
                time: new Date((data.timestamp || Date.now() / 1000) * 1000),
                status: 'rejected',
                data: data
            });
        });

        // 全部已读按钮
        const clearNotifBtn = document.getElementById('clearNotificationsBtn');
        if (clearNotifBtn) {
            clearNotifBtn.addEventListener('click', () => {
                this.clearUnreadNotifications();
            });
        }

        // 加载好友列表响应
        ipcRenderer.on("home:LoadFriendsRes", (event, data) => {
            this.state.friends = data;
            this.updateFriendsList();
            this.state.friends.forEach(friend => {
                this.cache.friends[friend.id] = friend;
            });
        });

        // 加载用户数据响应
        ipcRenderer.on("home:LoadUserDataRes", (event, data) => {
            this.state.currentUser = {
                id: data.id, name: data.username, avatar: data.avatar, status: data.status
            };
            this.updateUserInfo();
        });

        // 加载群组列表响应
        ipcRenderer.on("home:LoadGroupsRes", (event, data) => {
            this.state.groups = data;
            this.updateGroupsList();
            this.state.groups.forEach(group => {
                this.cache.groups[group.id] = group;
            });
        });

        // ===== 消息右键菜单 =====

        // 在消息列表区域拦截右键
        document.getElementById('messagesList').addEventListener('contextmenu', (e) => {
            const item = e.target.closest('.message-item');
            if (!item) return;
            e.preventDefault();
            this._showMessageContextMenu(e, item);
        });

        // 点击其他位置关闭右键菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                this._hideContextMenu();
            }
        });

        // 监听撤回事件推送（服务端推送给相关在线用户，包括发起者自己）
        ipcRenderer.on("home:recallMsgEvent", (event, data) => {
            console.log("撤回事件:", data);
            this._handleRecallEvent(data);
        });
    }

    // 添加处理接收消息的方法
    handleReceivedMessage(messageData) {
        console.log("收到新消息:", messageData);

        // 安全检查：currentUser 可能尚未通过异步 IPC 加载完成
        if (!this.state.currentUser) {
            console.warn("用户数据未加载完成，忽略消息:", messageData);
            return;
        }

        // 根据消息类型（私聊/群聊）确定目标ID
        let targetId, type;

        if (messageData.target_type === 'user') {
            // 私聊消息
            targetId = messageData.sender_id === this.state.currentUser.id ? messageData.target_id : messageData.sender_id;
            type = 'friend';
        } else if (messageData.target_type === 'group') {
            // 群聊消息
            targetId = messageData.group_id;
            type = 'group';
            // 缓存群成员信息（来自服务端推送的 sender_info）
            if (messageData.sender_info && targetId) {
                if (!this.cache.groupMembers) this.cache.groupMembers = {};
                if (!this.cache.groupMembers[targetId]) this.cache.groupMembers[targetId] = {};
                this.cache.groupMembers[targetId][messageData.sender_id] = messageData.sender_info;
            }
        } else {
            console.warn("未知的消息类型:", messageData.target_type);
            return;
        }

        // 解析消息内容类型
        const parsed = this._parseMessageContent(messageData.content);
        const msgType = parsed.isImage ? 'image' : 'text';

        // 创建消息对象
        const message = {
            id: messageData.message_id || Date.now(),
            messageId: messageData.message_id || '',  // 服务端 message_id
            sender: messageData.sender_id,
            content: messageData.content,
            time: new Date(messageData.timestamp || Date.now()),
            type: msgType
        };

        // 更新会话列表
        this.updateConversationWithMessage(targetId, type, message);

        // 写入消息缓存（使用服务端原始格式，与 _fetchFullHistory 返回格式一致）
        this._appendMessageToCache(type, targetId, {
            message_id: messageData.message_id,
            sender_id: messageData.sender_id,
            receiver_id: type === 'friend' ? messageData.target_id : undefined,
            group_id: type === 'group' ? targetId : undefined,
            content: messageData.content,
            timestamp: messageData.timestamp,
            type: msgType
        });

        // 如果是图片消息，预加载图片到缓存（无论当前是否在该聊天窗口）
        if (parsed.isImage && parsed.picId) {
            this._prefetchImage(parsed.picId);
        }

        // 如果当前正在与消息发送方/群组聊天，则显示消息
        if (this.state.currentChat && String(this.state.currentChat.id) === String(targetId) && this.state.currentChat.type === type) {
            this.appendMessageToChat(message);
        }
    }

    // 添加创建新会话的方法
    createNewConversation(targetId, type, message) {
        let conversation = {
            id: Date.now(), // 临时ID，后续可以从服务器获取
            type: type,
            lastMessage: this._getMessagePreview(message.content),
            unread: 1,
            time: this.formatRelativeTime(message.time),
            lastMessageTime: message.time,
            targetId: targetId
        };

        // 根据类型设置会话名称和头像
        if (type === 'friend') {
            const friend = this.cache.friends[targetId];
            if (friend) {
                conversation.name = friend.nickname;
                conversation.avatar = friend.avatar;
            } else {
                // 如果好友信息不在缓存中，显示默认信息
                conversation.name = `用户${targetId}`;
                conversation.avatar = 'https://via.placeholder.com/48';
            }
        } else if (type === 'group') {
            const group = this.cache.groups[targetId];
            if (group) {
                conversation.name = group.name;
                conversation.avatar = group.avatar;
            } else {
                conversation.name = `群组${targetId}`;
                conversation.avatar = 'https://via.placeholder.com/48';
                //     todo 头像
            }
        }

        return conversation;
    }

    // 添加将消息追加到聊天窗口的方法
    appendMessageToChat(message) {
        const messagesList = document.getElementById('messagesList');
        const isSent = message.sender === this.state.currentUser.id;
        const senderName = isSent ? '我' : this.getSenderName(message.sender, this.state.currentChat.type);
        const type = this.state.currentChat.type;
        const parsed = this._parseMessageContent(message.content);

        const messageEl = document.createElement('div');
        messageEl.className = `message-item ${isSent ? 'sent' : 'received'}`;
        // 存储消息元数据供右键菜单/撤回使用
        messageEl.dataset.messageId = message.messageId || '';  // 服务端 message_id（可能尚未获得）
        messageEl.dataset.clientMsgId = message.messageId ? '' : String(message.id || '');  // 客户端 msg_id（仅发送时有值）
        messageEl.dataset.senderId = String(message.sender || '');
        messageEl.dataset.timestamp = String(message.time ? (message.time.getTime ? message.time.getTime() : message.time) : '');

        let bodyHtml;
        if (parsed.isImage) {
            const imgId = `msg-img-${message.id || Date.now()}`;
            bodyHtml = `
                <div class="message-image-wrapper">
                    <img id="${imgId}" class="message-image lazy-image" data-pic-id="${parsed.picId}"
                         alt="加载中..." style="max-width: 200px; max-height: 200px; border-radius: 8px; cursor: pointer; opacity: 0.3; transition: opacity 0.3s;">
                </div>
            `;
        } else {
            bodyHtml = `<div class="message-text">${this._escapeHtml(parsed.text)}</div>`;
        }

        messageEl.innerHTML = `
            <div class="message-content">
                ${type === 'group' && !isSent ? `<div class="message-sender">${senderName}</div>` : ''}
                ${bodyHtml}
                <div class="message-time">${this.formatTime(message.time)}</div>
            </div>
        `;

        messagesList.appendChild(messageEl);

        // 如果是图片消息，触发懒加载
        if (parsed.isImage) {
            const imgEl = messageEl.querySelector('.lazy-image');
            if (imgEl) {
                this._ensureImageLoaded(parsed.picId, imgEl);
                imgEl.addEventListener('click', () => this._showImagePreview(imgEl.src));
            }
        }

        // 滚动到底部
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

// 添加格式化相对时间的方法（用于会话列表显示）
    formatRelativeTime(date) {
        const now = new Date();
        const diff = now - date;
        const oneDay = 24 * 60 * 60 * 1000;
        const oneWeek = 7 * oneDay;

        if (diff < oneDay) {
            // 今天
            return date.toLocaleTimeString('zh-CN', {
                hour: '2-digit', minute: '2-digit'
            });
        } else if (diff < 2 * oneDay) {
            // 昨天
            return '昨天';
        } else if (diff < 7 * oneDay) {
            // 一周内
            const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return days[date.getDay()];
        } else {
            // 更早
            return `${date.getMonth() + 1}-${date.getDate()}`;
        }
    }

    // 修改getSenderName方法，添加对群聊消息发送者的处理
    getSenderName(senderId, type) {
        if (senderId === this.state.currentUser.id) return '我';

        if (type === 'friend') {
            const friend = this.cache.friends[senderId];
            return friend ? friend.nickname : `用户${senderId}`;
        } else {
            // 群聊中，先从群成员缓存中查找
            if (this.cache.groupMembers && this.state.currentChat) {
                const groupMembers = this.cache.groupMembers[this.state.currentChat.id];
                if (groupMembers && groupMembers[senderId]) {
                    return groupMembers[senderId].nickname || groupMembers[senderId].username;
                }
            }
            // 再从好友缓存中查找
            const friend = this.cache.friends[senderId];
            return friend ? friend.nickname : `用户${senderId}`;
        }
    }

    // 添加更新会话列表的方法
    updateConversationWithMessage(targetId, type, message) {
        // 查找是否已有该会话（使用字符串比较，确保类型一致）
        let conversation = this.state.conversations.find(
            conv => String(conv.targetId) === String(targetId) && conv.type === type
        );

        if (conversation) {
            // 更新现有会话：根据消息内容类型显示预览文本
            const preview = this._getMessagePreview(message.content);
            conversation.lastMessage = preview;
            conversation.lastMessageTime = message.time;
            conversation.time = this.formatRelativeTime(message.time);

            // 如果当前没有打开这个会话，增加未读计数
            if (!this.state.currentChat || String(this.state.currentChat.id) !== String(targetId) || this.state.currentChat.type !== type) {
                conversation.unread = (conversation.unread || 0) + 1;
            }
        } else {
            // 创建新会话
            conversation = this.createNewConversation(targetId, type, message);
            this.state.conversations.unshift(conversation); // 添加到列表开头
        }

        // 重新排序会话列表（按最后消息时间倒序）
        this.state.conversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

        // 更新UI
        this.updateConversationsList();
    }


    // 更新UI
    updateUI() {
        this.updateUserInfo();
        this.updateConversationsList();
        this.updateFriendsList();
        this.updateGroupsList();
        this.updateChatWindow();
        this.updateNotificationBadge();
    }

    // 更新用户信息
    updateUserInfo() {
        const user = this.state.currentUser;
        if (user) {
            document.querySelector('.user-info .avatar').src = user.avatar;
            document.querySelector('.username').textContent = user.name;
            document.querySelector('.user-status-text').textContent = this.getStatusText(user.status);
            document.querySelector('.user-status').className = `user-status ${user.status}`;
        }
    }

    // 更新会话列表
    updateConversationsList() {
        const container = document.getElementById('conversationsList');
        const conversations = this.filterConversations();

        container.innerHTML = conversations.map(conv => `
            <div class="conversation-item" data-id="${conv.id}" data-type="${conv.type}" data-target="${conv.targetId}">
                <div class="conversation-avatar">
                    <img src="${conv.avatar}" alt="${conv.name}" class="avatar">
                    ${conv.unread > 0 ? `<span class="unread-badge">${conv.unread > 99 ? '99+' : conv.unread}</span>` : ''}
                </div>
                <div class="conversation-info">
                    <div class="conversation-header">
                        <div class="conversation-name">${conv.name}</div>
                        <div class="conversation-time">${conv.time}</div>
                    </div>
                    <div class="conversation-preview">
                        <div class="preview-text">${conv.lastMessage}</div>
                        ${conv.unread > 0 ? '<div class="unread-indicator"></div>' : ''}
                    </div>
                </div>
            </div>
        `).join('');

        // 绑定点击事件
        container.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                const targetId = e.currentTarget.dataset.target;
                this.selectConversation(type, targetId);
            });
        });
    }

    // 更新好友列表
    updateFriendsList() {
        const container = document.getElementById('friendsList');
        const friends = this.filterFriends();

        container.innerHTML = friends.map(friend => `
            <div class="friend-item ${friend.status === 'online' ? 'online' : ''}" data-id="${friend.id}">
                <div class="friend-avatar">
                    <img src="${friend.avatar}" alt="${friend.name}" class="avatar">
                </div>
                <div class="friend-info">
                    <div class="friend-name">${friend.nickname}</div>
                    <div class="friend-department">${friend.department}</div>
                </div>
                <div class="friend-status">
                    <span class="status-dot ${friend.status}"></span>
                </div>
            </div>
        `).join('');

        // 绑定点击事件
        container.querySelectorAll('.friend-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                this.selectFriend(id);
            });
        });
    }

    // 更新群组列表
    updateGroupsList() {
        const container = document.getElementById('groupsList');
        const groups = this.filterGroups();

        container.innerHTML = groups.map(group => `
            <div class="group-item" data-id="${group.id}">
                <div class="group-avatar">
                    <img src="${group.avatar}" alt="${group.name}" class="avatar">
                </div>
                <div class="group-info">
                    <div class="group-name">${group.name}</div>
                    <div class="group-meta">
                        <span class="members">${group.members} 人</span>
                        <span class="last-active">${this.formatRelativeTime(group.lastActive instanceof Date ? group.lastActive : new Date(group.lastActive || Date.now()))}</span>
                    </div>
                </div>
                ${group.unread > 0 ? `
                    <div class="unread-count">${group.unread > 99 ? '99+' : group.unread}</div>
                ` : ''}
            </div>
        `).join('');

        // 绑定点击事件
        container.querySelectorAll('.group-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.selectGroup(id);
            });
        });
    }

    // 更新聊天窗口
    updateChatWindow() {
        console.log("updateChatWindow")
        const chat = this.state.currentChat;

        if (chat) {
            // 显示聊天窗口，隐藏欢迎页面
            document.getElementById('welcomeScreen').style.display = 'none';
            document.getElementById('chatWindow').classList.add('active');

            // 更新聊天头部信息
            document.getElementById('chatName').textContent = chat.name;
            document.getElementById('chatStatus').textContent = chat.type === 'friend' ? this.getStatusText(chat.status) : `${chat.members} 名成员`;

            // 更新聊天头像
            document.querySelector('.chat-avatar .avatar').src = chat.avatar;

            // 更新聊天菜单（显示/隐藏群组相关选项）
            const groupItems = document.querySelectorAll('.group-only');
            groupItems.forEach(item => {
                item.style.display = chat.type === 'group' ? 'block' : 'none';
            });

            // 切换聊天时先清空消息列表，避免旧消息闪现
            document.getElementById('messagesList').innerHTML = '';

            // 加载聊天记录
            this.loadChatHistory(chat.id, chat.type);
        } else {
            // 显示欢迎页面，隐藏聊天窗口
            document.getElementById('welcomeScreen').style.display = 'flex';
            document.getElementById('chatWindow').classList.remove('active');
        }
    }

    // 加载聊天记录（优先使用本地缓存）
    loadChatHistory(targetId, type) {
        console.log("loadChatHistory", targetId, type);

        // 启动定时同步（每次切换聊天都重启定时器）
        this.startSyncTimer();

        const cached = this._getCachedMessages(type, targetId);

        if (cached && cached.length > 0) {
            // 有缓存 → 立即渲染，不请求服务器
            console.log(`[Cache] 命中缓存: ${this._chatKey(type, targetId)}, ${cached.length} 条消息`);
            this._renderMessages(cached, type);
            return;
        }

        // 无缓存 → 从服务器加载
        console.log(`[Cache] 未命中: ${this._chatKey(type, targetId)}, 请求服务器`);
        const messagesList = document.getElementById('messagesList');
        messagesList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #909399;">
                <div class="loading-spinner" style="display: inline-block; width: 24px; height: 24px; border: 3px solid #e4e7ed; border-top: 3px solid #409eff; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 12px;"></div>
                <div>加载聊天记录中...</div>
            </div>
        `;

        ipcRenderer.removeAllListeners("home:LoadChatHistoryRes");
        ipcRenderer.once("home:LoadChatHistoryRes", (event, data) => {
            if (!data || data.length === 0) {
                messagesList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #c0c4cc;">
                        暂无聊天记录
                    </div>
                `;
                // 即使无消息也建立空缓存，避免反复请求
                this._cacheMessages(type, targetId, [], null);
                return;
            }

            // 写入缓存
            this._cacheMessages(type, targetId, data, String(data[data.length - 1].message_id));

            // 渲染
            this._renderMessages(data, type);
        });

        ipcRenderer.send("home:loadChatHistory", { targetId: targetId, type: type });
    }

    // 渲染消息列表到 DOM
    _renderMessages(messages, type) {
        const messagesList = document.getElementById('messagesList');
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #c0c4cc;">
                    暂无聊天记录
                </div>
            `;
            return;
        }

        // 收集需要懒加载的图片（渲染完成后统一触发加载）
        const imageLoadTasks = [];

        messagesList.innerHTML = messages.map((msg, idx) => {
            const isSent = msg.sender_id === this.state.currentUser.id;
            const senderName = isSent ? '我' : this.getSenderName(msg.sender_id, type);

            // 已撤回的消息
            if (msg.recalled) {
                const recallText = isSent ? '你撤回了一条消息' : `${senderName} 撤回了一条消息`;
                return `
                    <div class="message-item ${isSent ? 'sent' : 'received'} recalled"
                         data-message-id="${msg.message_id || ''}"
                         data-sender-id="${msg.sender_id || ''}"
                         data-timestamp="${msg.timestamp || ''}">
                        <div class="message-recall-notice">
                            <i class="fas fa-info-circle"></i>
                            <span>${this._escapeHtml(recallText)}</span>
                        </div>
                    </div>
                `;
            }

            const parsed = this._parseMessageContent(msg.content);

            let bodyHtml;
            if (parsed.isImage) {
                // 图片消息：渲染占位 img，稍后通过缓存或服务器加载
                const imgId = `msg-img-${msg.message_id || idx}`;
                bodyHtml = `
                    <div class="message-image-wrapper">
                        <img id="${imgId}" class="message-image lazy-image" data-pic-id="${parsed.picId}"
                             alt="加载中..." style="max-width: 200px; max-height: 200px; border-radius: 8px; cursor: pointer; opacity: 0.3; transition: opacity 0.3s;">
                    </div>
                `;
                imageLoadTasks.push({ imgId, picId: parsed.picId });
            } else {
                bodyHtml = `<div class="message-text">${this._escapeHtml(parsed.text)}</div>`;
            }

            return `
                <div class="message-item ${isSent ? 'sent' : 'received'}"
                     data-message-id="${msg.message_id || ''}"
                     data-sender-id="${msg.sender_id || ''}"
                     data-timestamp="${msg.timestamp || ''}">
                    <div class="message-content">
                        ${type === 'group' && !isSent ? `<div class="message-sender">${senderName}</div>` : ''}
                        ${bodyHtml}
                        <div class="message-time">${this.formatTime(msg.timestamp)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // 触发图片懒加载（优先读缓存，缓存未命中则请求服务器）
        imageLoadTasks.forEach(task => {
            const el = document.getElementById(task.imgId);
            if (el) {
                this._ensureImageLoaded(task.picId, el);
                // 点击放大预览
                el.addEventListener('click', () => this._showImagePreview(el.src));
            }
        });

        // 滚动到底部
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    // 切换标签页
    switchTab(tabName) {
        this.state.activeTab = tabName;

        // 更新标签按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 更新标签内容
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // 切换到通知标签页时清除未读标记并刷新列表
        if (tabName === 'notifications') {
            this.clearUnreadNotifications();
            this.updateNotificationsList();
        }
    }

    // 过滤列表
    filterLists() {
        if (this.state.activeTab === 'conversations') {
            this.updateConversationsList();
        } else if (this.state.activeTab === 'friends') {
            this.updateFriendsList();
        } else if (this.state.activeTab === 'groups') {
            this.updateGroupsList();
        } else if (this.state.activeTab === 'notifications') {
            this.updateNotificationsList();
        }
    }

    // 过滤会话
    filterConversations() {
        if (!this.state.searchKeyword) {
            return this.state.conversations;
        }

        const keyword = this.state.searchKeyword.toLowerCase();
        return this.state.conversations.filter(conv => conv.name.toLowerCase().includes(keyword) || conv.lastMessage.toLowerCase().includes(keyword));
    }

    // 过滤好友
    filterFriends() {
        if (!this.state.searchKeyword) {
            return this.state.friends;
        }

        const keyword = this.state.searchKeyword.toLowerCase();
        return this.state.friends.filter(friend => friend.name.toLowerCase().includes(keyword) || (friend.nickname && friend.nickname.toLowerCase().includes(keyword)) || (friend.department && friend.department.toLowerCase().includes(keyword)));
    }

    // 过滤群组
    filterGroups() {
        if (!this.state.searchKeyword) {
            return this.state.groups;
        }

        const keyword = this.state.searchKeyword.toLowerCase();
        return this.state.groups.filter(group => group.name.toLowerCase().includes(keyword) || (group.description && group.description.toLowerCase().includes(keyword)));
    }

    // 选择会话
    selectConversation(type, targetId) {
        // 使用 targetId + type 定位会话（targetId 来自 data 属性，为字符串）
        const conversation = this.state.conversations.find(
            c => String(c.targetId) === String(targetId) && c.type === type
        );

        if (type === 'friend') {
            this.selectFriend(targetId);
        } else {
            this.selectGroup(targetId);
        }

        // 标记为已读
        if (conversation) {
            conversation.unread = 0;
        }
        this.updateConversationsList();
        // 高亮会话项
        this.highlightActiveItem('conversation', targetId);
    }

    // 选择好友
    selectFriend(friendId) {
        console.log('selectFriend', friendId);
        const friend = this.cache.friends[Number(friendId)];
        console.log(this.cache.friends)
        if (!friend) return;

        this.state.currentChat = {
            id: friendId, type: 'friend', name: friend.nickname, avatar: friend.avatar, status: friend.status
        };

        this.updateChatWindow();
        this.highlightActiveItem('friend', friendId);
    }

    // 选择群组
    selectGroup(groupId) {
        const group = this.cache.groups[groupId];
        if (!group) return;

        this.state.currentChat = {
            id: groupId,
            type: 'group',
            name: group.name,
            avatar: group.avatar,
            members: group.members || 0
        };

        this.updateChatWindow();
        this.highlightActiveItem('group', groupId);
    }

    // 高亮活动项
    highlightActiveItem(type, id) {
        // 清除所有活动状态
        document.querySelectorAll('.conversation-item.active, .friend-item.active, .group-item.active').forEach(item => {
            item.classList.remove('active');
        });

        // 设置当前活动项
        if (type === 'friend') {
            document.querySelector(`.friend-item[data-id="${id}"]`)?.classList.add('active');
        } else if (type === 'group') {
            document.querySelector(`.group-item[data-id="${id}"]`)?.classList.add('active');
        }

        // 始终高亮对应的会话项（通过 data-target 匹配）
        document.querySelector(`.conversation-item[data-target="${id}"]`)?.classList.add('active');
    }

    // 发送消息
    sendMessage() {
        // 客户端消息ID生成规则
        function generateClientMsgId() {
            return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        const input = document.getElementById('messageInput');
        const content = input.value.trim();

        if (!content || !this.state.currentChat) {
            return;
        }

        // 创建消息对象
        const message = {
            id: generateClientMsgId(),
            sender: this.state.currentUser.id,
            content: content,
            time: new Date(),
            type: 'text'
        };

        // 添加到消息列表
        const messagesList = document.getElementById('messagesList');
        const isSent = true;
        const senderName = '我';
        const type = this.state.currentChat.type;

        const messageEl = document.createElement('div');
        messageEl.className = `message-item ${isSent ? 'sent' : 'received'}`;
        // 发送的文本消息暂无 server message_id，通过 client_msg_id 关联后续响应
        messageEl.dataset.messageId = '';
        messageEl.dataset.clientMsgId = message.id;
        messageEl.dataset.senderId = String(this.state.currentUser.id);
        messageEl.dataset.timestamp = String(message.time.getTime());
        messageEl.innerHTML = `
            <div class="message-content">
                ${type === 'group' && !isSent ? `<div class="message-sender">${senderName}</div>` : ''}
                <div class="message-text">${this._escapeHtml(message.content)}</div>
                <div class="message-time">${this.formatTime(message.time)}</div>
            </div>
        `;

        messagesList.appendChild(messageEl);

        // 清空输入框
        input.value = '';
        input.focus();

        // 滚动到底部
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            container.scrollTop = container.scrollHeight;
        }, 100);

        ipcRenderer.send("home:sendMessage", {
            ...message,
            senderId: this.state.currentUser.id,
            targetId: this.state.currentChat.id,
            type: this.state.currentChat.type
        });

        // 更新会话列表（更新已有会话的 lastMessage 或创建新会话）
        this.updateConversationWithMessage(
            this.state.currentChat.id,
            this.state.currentChat.type,
            message
        );

        // 写入消息缓存（客户端发送的消息暂无 server message_id，同步时会全量校正）
        this._appendMessageToCache(this.state.currentChat.type, this.state.currentChat.id, {
            message_id: null, // 客户端消息，尚无服务端 ID
            client_msg_id: message.id,  // 用于匹配服务端响应
            sender_id: this.state.currentUser.id,
            receiver_id: this.state.currentChat.type === 'friend' ? this.state.currentChat.id : undefined,
            group_id: this.state.currentChat.type === 'group' ? this.state.currentChat.id : undefined,
            content: message.content,
            timestamp: message.time.getTime ? message.time.getTime() : Date.now(),
            type: 'text'
        });
    }

    // 切换下拉菜单
    toggleDropdown(menuId, event) {
        event.stopPropagation();
        const menu = document.getElementById(menuId);
        menu.classList.toggle('show');
    }

    // 隐藏所有下拉菜单
    hideAllDropdowns() {
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
    }

    // 处理用户操作
    handleUserAction(action) {
        this.hideAllDropdowns();

        switch (action) {
            case 'status':
                this.showStatusModal();
                break;
            case 'profile':
                this.showProfileModal();
                break;
            case 'settings':
                this.showSettingsModal();
                break;
            case 'logout':
                this.handleLogout();
                break;
        }
    }

    // 处理聊天操作
    handleChatAction(action) {
        this.hideAllDropdowns();

        switch (action) {
            case 'viewProfile':
                this.showUserProfile(this.state.currentChat.id);
                break;
            case 'groupInfo':
                this.showGroupInfo(this.state.currentChat.id);
                break;
            case 'searchHistory':
                this.showSearchHistoryModal();
                break;
            case 'clearHistory':
                this.clearChatHistory();
                break;
            case 'inviteMember':
                this.showInviteMemberModal();
                break;
        }
    }

    // 显示添加好友模态框（对接 /friend_request 接口）
    showAddFriendModal() {
        const modal = this.createModal({
            title: '添加好友', body: `
                <div class="form-group">
                    <label class="form-label">用户 ID</label>
                    <input type="number" class="form-control" id="addFriendInput" placeholder="请输入目标用户的数字 ID">
                </div>
                <div class="form-group">
                    <label class="form-label">申请理由</label>
                    <textarea class="form-control" id="addFriendMessage" placeholder="请输入申请理由（可选）" rows="3"></textarea>
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '发送申请', type: 'primary', action: 'sendRequest'
            }]
        });

        modal.show();

        // 绑定响应处理器
        const responseHandler = (event, response) => {
            if (response.success) {
                this.showToast('好友申请已发送', 'success');
                // 添加到通知列表（已发出）
                this.addNotification({
                    type: 'friend_request_sent',
                    title: '好友申请已发送',
                    subtitle: `向用户 ${document.getElementById('addFriendInput')?.value || ''} 发送了好友申请`,
                    detail: '',
                    time: new Date(),
                    status: 'sent',
                    data: response
                });
                modal.hide();
            } else {
                this.showToast(response.message || '发送好友申请失败', 'error');
            }
            ipcRenderer.removeListener('home:sendFriendRequestRes', responseHandler);
        };

        ipcRenderer.on('home:sendFriendRequestRes', responseHandler);

        // 绑定按钮事件
        modal.onButtonClick = (action) => {
            if (action === 'sendRequest') {
                const input = document.getElementById('addFriendInput');
                const message = document.getElementById('addFriendMessage');

                if (!input || !input.value.trim()) {
                    this.showToast('请输入用户 ID', 'warning');
                    return;
                }

                const targetId = Number(input.value.trim());
                if (!targetId || isNaN(targetId)) {
                    this.showToast('用户 ID 必须是数字', 'warning');
                    return;
                }

                ipcRenderer.send('home:sendFriendRequest', {
                    id: targetId,
                    reason: message ? message.value.trim() : ''
                });
            } else if (action === 'cancel') {
                ipcRenderer.removeListener('home:sendFriendRequestRes', responseHandler);
                modal.hide();
            }
        };
    }

    // 显示创建群组模态框
// home.js - 修改 showCreateGroupModal 方法
    showCreateGroupModal() {
        const modal = this.createModal({
            title: '创建群组',
            body: `
            <div class="form-group">
                <label class="form-label">群组名称</label>
                <input type="text" class="form-control" id="groupNameInput" placeholder="请输入群组名称">
            </div>
            <div class="form-group">
                <label class="form-label">群组描述</label>
                <textarea class="form-control" id="groupDescriptionInput" placeholder="请输入群组描述（可选）" rows="3"></textarea>
            </div>
        `,
            buttons: [
                { text: '取消', type: 'secondary', action: 'cancel' },
                { text: '创建', type: 'primary', action: 'create' }
            ]
        });

        modal.show();

        // 处理创建结果
        const createGroupHandler = (event, response) => {
            if (response.success) {
                const newGroup = {
                    id: response.group_id,
                    name: response.group_name,
                    description: response.description,
                    avatar: 'https://via.placeholder.com/48',
                    members: response.member_count || 1,
                    ownerId: response.owner_id,
                    lastActive: new Date()
                };
                this.state.groups.push(newGroup);
                this.cache.groups[newGroup.id] = newGroup;
                this.updateGroupsList();
                this.showToast('群组创建成功', 'success');
                modal.hide();
            } else {
                this.showToast(response.message || '创建群组失败', 'error');
            }
            ipcRenderer.removeListener('home:createGroupRes', createGroupHandler);
        };

        ipcRenderer.on('home:createGroupRes', createGroupHandler);

        modal.onButtonClick = (action) => {
            if (action === 'create') {
                const nameInput = document.getElementById('groupNameInput');
                const descInput = document.getElementById('groupDescriptionInput');
                const name = nameInput.value.trim();
                const description = descInput.value.trim();

                if (!name) {
                    this.showToast('请输入群组名称', 'warning');
                    return;
                }

                // 发送创建请求
                ipcRenderer.send('home:createGroup', { name, description });

                // 可选：禁用按钮防止重复点击，这里省略
            } else if (action === 'cancel') {
                ipcRenderer.removeListener('home:createGroupRes', createGroupHandler);
                modal.hide();
            }
        };
    }
    // 显示加入群组模态框
    showJoinGroupModal() {
        const modal = this.createModal({
            title: '加入群组', body: `
                <div class="form-group">
                    <label class="form-label">群组ID</label>
                    <input type="text" class="form-control" id="joinGroupInput" placeholder="请输入群组ID">
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '加入', type: 'primary', action: 'join'
            }]
        });

        modal.show();

        // 处理加入群组响应
        const joinGroupHandler = (event, response) => {
            if (response.success) {
                this.showToast(response.message || '成功加入群组', 'success');
                // 刷新群组列表
                ipcRenderer.send("home:getGroupInfo", { groupId: response.group_id });
                // 添加群组到本地列表
                const newGroup = {
                    id: response.group_id,
                    name: response.group_name,
                    avatar: 'https://via.placeholder.com/48',
                    members: 1,
                    description: '',
                    lastActive: new Date()
                };
                if (!this.cache.groups[newGroup.id]) {
                    this.state.groups.push(newGroup);
                    this.cache.groups[newGroup.id] = newGroup;
                    this.updateGroupsList();
                }
                modal.hide();
            } else {
                this.showToast(response.message || '加入群组失败', 'error');
            }
            ipcRenderer.removeListener('home:joinGroupRes', joinGroupHandler);
        };

        ipcRenderer.on('home:joinGroupRes', joinGroupHandler);

        modal.onButtonClick = (action) => {
            if (action === 'join') {
                const input = document.getElementById('joinGroupInput');
                const groupId = input.value.trim();

                if (!groupId) {
                    this.showToast('请输入群组ID', 'warning');
                    return;
                }

                ipcRenderer.send('home:joinGroup', { groupId: groupId });
            } else if (action === 'cancel') {
                ipcRenderer.removeListener('home:joinGroupRes', joinGroupHandler);
                modal.hide();
            }
        };
    }

    // 显示状态选择模态框
    showStatusModal() {
        const statusOptions = [{value: 'online', label: '在线', color: '#52c41a'}, {
            value: 'away', label: '离开', color: '#faad14'
        }, {value: 'busy', label: '忙碌', color: '#f5222d'}, {value: 'offline', label: '离线', color: '#8c8c8c'}];

        const body = statusOptions.map(option => `
            <div class="status-option" data-value="${option.value}">
                <span class="status-dot" style="background-color: ${option.color}"></span>
                <span>${option.label}</span>
            </div>
        `).join('');

        const modal = this.createModal({
            title: '更改在线状态',
            body: `<div class="status-options">${body}</div>`,
            buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '确定', type: 'primary', action: 'confirm'
            }]
        });

        modal.show();

        // 绑定状态选项点击事件
        let selectedStatus = this.state.userStatus;
        modal.modalBody.querySelectorAll('.status-option').forEach(option => {
            option.addEventListener('click', () => {
                modal.modalBody.querySelectorAll('.status-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');
                selectedStatus = option.dataset.value;
            });

            if (option.dataset.value === selectedStatus) {
                option.classList.add('selected');
            }
        });

        modal.onButtonClick = (action) => {
            if (action === 'confirm') {
                this.state.userStatus = selectedStatus;
                this.state.currentUser.status = selectedStatus;
                this.updateUserInfo();
                this.showToast('状态已更新', 'success');
                modal.hide();
            } else if (action === 'cancel') {
                modal.hide();
            }
        };
    }

    // 显示用户资料模态框
    showUserProfile(userId) {
        const user = this.cache.friends[userId];
        if (!user) return;

        const modal = this.createModal({
            title: '用户资料', body: `
                <div class="profile-header">
                    <img src="${user.avatar}" alt="${user.name}" class="avatar" style="width: 80px; height: 80px;">
                    <h3 style="margin-top: 12px;">${user.nickname}</h3>
                    <div style="color: #909399; margin-bottom: 20px;">${user.department}</div>
                </div>
                <div class="profile-details">
                    <div class="detail-item">
                        <span class="detail-label">用户名</span>
                        <span class="detail-value">${user.name}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">状态</span>
                        <span class="detail-value">${this.getStatusText(user.status)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">标签</span>
                        <span class="detail-value">${Array.isArray(user.tags) ? user.tags.join(', ') : (user.tags || '无')}</span>
                    </div>
                </div>
            `, buttons: [{text: '关闭', type: 'primary', action: 'close'}]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            modal.hide();
        };
    }

    // 显示群组信息模态框（从服务器获取详细信息含成员列表）
    showGroupInfo(groupId) {
        const group = this.cache.groups[groupId];
        if (!group) return;

        // 判断当前用户是否为群主或管理员（后续通过服务器返回的 info 确认）
        const currentUserId = this.state.currentUser ? this.state.currentUser.id : null;
        const isOwner = String(group.ownerId) === String(currentUserId);

        const avatarUploadHtml = (isOwner || true) ? `
            <div style="position: relative; display: inline-block; cursor: pointer;" id="groupAvatarUploadWrapper">
                <img src="${group.avatar}" alt="${group.name}" class="avatar" id="groupAvatarPreview"
                     style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover; border: 2px solid #e4e7ed;">
                <div style="position: absolute; bottom: 0; right: 0; width: 24px; height: 24px; background: #409eff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; border: 2px solid white;">
                    <i class="fas fa-camera" style="font-size: 10px;"></i>
                </div>
            </div>
        ` : `
            <img src="${group.avatar}" alt="${group.name}" class="avatar"
                 style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover;">
        `;

        // 先显示基础信息（带加载状态）
        const modal = this.createModal({
            title: '群组信息', body: `
                <div class="profile-header">
                    ${avatarUploadHtml}
                    <h3 style="margin-top: 12px;">${group.name}</h3>
                    <div style="color: #909399; margin-bottom: 20px;">${group.members || 0} 名成员</div>
                    <div id="groupAvatarUploadStatus" style="font-size: 12px;"></div>
                </div>
                <div class="profile-details">
                    <div class="detail-item">
                        <span class="detail-label">描述</span>
                        <span class="detail-value">${group.description || '暂无描述'}</span>
                    </div>
                </div>
                <div style="margin-top: 16px;">
                    <div style="font-weight: 500; margin-bottom: 8px; color: #606266;">成员列表</div>
                    <div id="groupMemberList" style="max-height: 300px; overflow-y: auto;">
                        <div style="text-align: center; color: #909399; padding: 20px;">加载中...</div>
                    </div>
                </div>
            `, buttons: [{text: '关闭', type: 'primary', action: 'close'}]
        });

        modal.show();

        // 群头像点击上传
        const groupAvatarWrapper = document.getElementById('groupAvatarUploadWrapper');
        if (groupAvatarWrapper) {
            groupAvatarWrapper.addEventListener('click', () => {
                this.uploadGroupAvatar(groupId);
            });
        }

        modal.onButtonClick = (action) => {
            ipcRenderer.removeAllListeners('home:getGroupInfoRes');
            ipcRenderer.removeAllListeners('home:uploadGroupAvatarRes');
            modal.hide();
        };

        // 从服务器获取详细信息
        ipcRenderer.removeAllListeners('home:getGroupInfoRes');
        ipcRenderer.once('home:getGroupInfoRes', (event, response) => {
            const memberListEl = document.getElementById('groupMemberList');
            if (!memberListEl) return; // 模态框已关闭

            if (response.group_info && response.members) {
                // 更新群组信息
                const info = response.group_info;
                const members = response.members;

                // 缓存成员信息（用于消息发送者名称显示）
                members.forEach(m => {
                    if (!this.cache.groupMembers) this.cache.groupMembers = {};
                    if (!this.cache.groupMembers[info.group_id]) this.cache.groupMembers[info.group_id] = {};
                    this.cache.groupMembers[info.group_id][m.user_id] = m;
                });

                // 判断当前用户在群中的角色
                const currentUserId = this.state.currentUser ? this.state.currentUser.id : null;
                const currentMember = members.find(m => Number(m.user_id) === Number(currentUserId));
                const currentUserRole = currentMember ? currentMember.role : 'member';
                const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

                const roleMap = { owner: '群主', admin: '管理员', member: '成员' };
                memberListEl.innerHTML = members.map(m => {
                    const onlineStyle = m.is_online ? 'color: #52c41a;' : 'color: #909399;';
                    const onlineText = m.is_online ? '在线' : '离线';
                    const roleText = roleMap[m.role] || m.role;
                    const roleBadge = m.role === 'owner' ? ' style="color: #e6a23c; font-weight: 500;"'
                        : m.role === 'admin' ? ' style="color: #409eff; font-weight: 500;"' : '';
                    const isSelf = Number(m.user_id) === Number(currentUserId);
                    const isOwner = m.role === 'owner';

                    // 操作按钮：当前用户是群主/管理员，且目标不是自己和群主
                    let actionsHtml = '';
                    if (canManage && !isSelf && !isOwner) {
                        // 管理员不能操作其他管理员
                        if (currentUserRole === 'admin' && m.role === 'admin') {
                            // 无操作权限
                        } else {
                            const displayName = (m.nickname || m.username || '').replace(/'/g, "\\'");
                            actionsHtml = `
                                <div style="display: flex; gap: 4px; margin-left: 8px;">
                                    <button class="member-action-btn ban-btn" data-user-id="${m.user_id}" data-user-name="${displayName}" data-group-id="${info.group_id}"
                                        style="padding: 2px 8px; font-size: 11px; border: 1px solid #e6a23c; color: #e6a23c; border-radius: 4px; background: transparent; cursor: pointer;"
                                        title="禁言成员">禁言</button>
                                    <button class="member-action-btn kick-btn" data-user-id="${m.user_id}" data-user-name="${displayName}" data-group-id="${info.group_id}"
                                        style="padding: 2px 8px; font-size: 11px; border: 1px solid #f56c6c; color: #f56c6c; border-radius: 4px; background: transparent; cursor: pointer;"
                                        title="踢出群组">踢出</button>
                                </div>
                            `;
                        }
                    }

                    return `
                        <div style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <img src="${m.avatar || 'https://via.placeholder.com/32'}" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px;">
                            <div style="flex: 1;">
                                <div style="font-size: 14px;">${m.nickname || m.username}${m.group_nickname ? ` (${m.group_nickname})` : ''}${isSelf ? ' <span style="color: #909399; font-size: 11px;">(我)</span>' : ''}</div>
                                <div style="font-size: 12px; ${onlineStyle}">${onlineText}</div>
                            </div>
                            <span${roleBadge} style="font-size: 12px;">${roleText}</span>
                            ${actionsHtml}
                        </div>
                    `;
                }).join('');

                // 绑定操作按钮事件
                memberListEl.querySelectorAll('.kick-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const userId = e.currentTarget.dataset.userId;
                        const userName = e.currentTarget.dataset.userName;
                        const gId = e.currentTarget.dataset.groupId;
                        this.kickMember(gId, userId, userName);
                    });
                });
                memberListEl.querySelectorAll('.ban-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const userId = e.currentTarget.dataset.userId;
                        const userName = e.currentTarget.dataset.userName;
                        const gId = e.currentTarget.dataset.groupId;
                        this.showBanMemberModal(gId, userId, userName);
                    });
                });
            } else {
                memberListEl.innerHTML = '<div style="text-align: center; color: #f56c6c; padding: 20px;">获取成员列表失败</div>';
            }
        });

        ipcRenderer.send('home:getGroupInfo', { groupId: groupId });
    }

    // 踢出群成员
    kickMember(groupId, targetUserId, userName) {
        if (!confirm(`确定要将「${userName}」踢出群组吗？`)) return;

        // 可选输入原因
        const reason = prompt('请输入踢出原因（可选）：') || '';

        ipcRenderer.removeAllListeners('home:kickMemberRes');
        ipcRenderer.once('home:kickMemberRes', (event, response) => {
            if (response.success) {
                this.showToast(`已将「${userName}」踢出群组`, 'success');
                // 刷新群信息（成员列表会更新）
                if (this.state.currentChat && String(this.state.currentChat.id) === String(groupId)) {
                    this.showGroupInfo(groupId);
                }
            } else {
                this.showToast(response.message || '踢出成员失败', 'error');
            }
        });

        ipcRenderer.send('home:kickMember', { groupId, targetUserId, reason });
    }

    // 显示禁言成员模态框
    showBanMemberModal(groupId, targetUserId, userName) {
        const modal = this.createModal({
            title: `禁言成员 - ${userName}`,
            body: `
                <div style="margin-bottom: 16px;">
                    <label class="form-label">选择禁言时长</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        <button class="ban-duration-btn" data-seconds="300" style="padding: 6px 14px; border: 1px solid #dcdfe6; border-radius: 6px; background: #f5f7fa; cursor: pointer;">5 分钟</button>
                        <button class="ban-duration-btn" data-seconds="1800" style="padding: 6px 14px; border: 1px solid #dcdfe6; border-radius: 6px; background: #f5f7fa; cursor: pointer;">30 分钟</button>
                        <button class="ban-duration-btn" data-seconds="3600" style="padding: 6px 14px; border: 1px solid #dcdfe6; border-radius: 6px; background: #f5f7fa; cursor: pointer;">1 小时</button>
                        <button class="ban-duration-btn" data-seconds="86400" style="padding: 6px 14px; border: 1px solid #dcdfe6; border-radius: 6px; background: #f5f7fa; cursor: pointer;">1 天</button>
                        <button class="ban-duration-btn" data-seconds="604800" style="padding: 6px 14px; border: 1px solid #dcdfe6; border-radius: 6px; background: #f5f7fa; cursor: pointer;">7 天</button>
                        <button class="ban-duration-btn" data-seconds="forever" style="padding: 6px 14px; border: 1px solid #f56c6c; color: #f56c6c; border-radius: 6px; background: #fef0f0; cursor: pointer;">永久禁言</button>
                    </div>
                </div>
                <div style="margin-bottom: 12px;">
                    <label class="form-label">或自定义时长（秒）</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="number" class="form-control" id="banCustomSeconds" placeholder="输入秒数（最少60）" min="60" style="flex: 1;">
                        <button id="banCustomBtn" style="padding: 6px 16px; border: 1px solid #409eff; color: #409eff; border-radius: 6px; background: transparent; cursor: pointer; white-space: nowrap;">确认禁言</button>
                    </div>
                </div>
                <div style="padding: 10px; background: #fdf6ec; border-radius: 6px; margin-bottom: 8px;">
                    <button id="unbanBtn" style="padding: 6px 14px; border: 1px solid #52c41a; color: #52c41a; border-radius: 6px; background: transparent; cursor: pointer; width: 100%;">解除禁言</button>
                </div>
            `,
            buttons: [{ text: '取消', type: 'secondary', action: 'cancel' }]
        });

        modal.show();

        ipcRenderer.removeAllListeners('home:banMemberRes');
        ipcRenderer.on('home:banMemberRes', (event, response) => {
            if (response.success) {
                this.showToast(response.message || '操作成功', 'success');
                modal.hide();
            } else {
                this.showToast(response.message || '禁言操作失败', 'error');
            }
        });

        // 预设时长按钮
        modal.modalBody.querySelectorAll('.ban-duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const seconds = btn.dataset.seconds;
                ipcRenderer.send('home:banMember', { groupId, targetUserId, time: seconds === 'forever' ? 'forever' : Number(seconds) });
            });
        });

        // 解除禁言按钮
        const unbanBtn = document.getElementById('unbanBtn');
        if (unbanBtn) {
            unbanBtn.addEventListener('click', () => {
                ipcRenderer.send('home:banMember', { groupId, targetUserId, time: 0 });
            });
        }

        // 自定义时长确认按钮
        const banCustomBtn = document.getElementById('banCustomBtn');
        const banCustomInput = document.getElementById('banCustomSeconds');
        if (banCustomBtn && banCustomInput) {
            const submitCustom = () => {
                const seconds = Number(banCustomInput.value);
                if (!seconds || seconds < 60) {
                    this.showToast('请输入至少 60 秒的禁言时长', 'warning');
                    return;
                }
                ipcRenderer.send('home:banMember', { groupId, targetUserId, time: seconds });
            };
            banCustomBtn.addEventListener('click', submitCustom);
            banCustomInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitCustom(); }
            });
        }

        modal.onButtonClick = (action) => {
            if (action === 'cancel') {
                ipcRenderer.removeAllListeners('home:banMemberRes');
                modal.hide();
            }
        };
    }

    // 上传群头像
    uploadGroupAvatar(groupId) {
        const statusEl = document.getElementById('groupAvatarUploadStatus');
        if (statusEl) {
            statusEl.style.color = '#409eff';
            statusEl.textContent = '正在选择文件...';
        }

        ipcRenderer.removeAllListeners('home:uploadGroupAvatarRes');

        ipcRenderer.once('home:uploadGroupAvatarRes', (event, response) => {
            if (response.success) {
                const preview = document.getElementById('groupAvatarPreview');
                if (preview && response.avatar_url) {
                    preview.src = response.avatar_url + '?t=' + Date.now();
                }

                // 更新群组缓存
                if (this.cache.groups[groupId]) {
                    this.cache.groups[groupId].avatar = response.avatar_url;
                }
                // 更新群组列表 UI
                this.updateGroupsList();
                // 更新聊天窗口头像
                if (this.state.currentChat && String(this.state.currentChat.id) === String(groupId)) {
                    this.state.currentChat.avatar = response.avatar_url;
                    document.querySelector('.chat-avatar .avatar').src = response.avatar_url;
                }

                if (statusEl) {
                    statusEl.style.color = '#52c41a';
                    statusEl.textContent = '群头像上传成功';
                }
                this.showToast('群头像上传成功', 'success');
            } else {
                if (statusEl) {
                    statusEl.style.color = '#f56c6c';
                    statusEl.textContent = response.message || '上传失败';
                }
                if (response.message !== '已取消') {
                    this.showToast(response.message || '群头像上传失败', 'error');
                }
            }
        });

        ipcRenderer.send('home:uploadGroupAvatar', { groupId: groupId });
    }

    // 显示查找聊天记录模态框
    showSearchHistoryModal() {
        const modal = this.createModal({
            title: '查找聊天记录', body: `
                <div class="form-group">
                    <label class="form-label">搜索关键词</label>
                    <input type="text" class="form-control" id="searchHistoryInput" placeholder="请输入搜索关键词">
                </div>
                <div class="form-group">
                    <label class="form-label">时间范围</label>
                    <select class="form-control" id="timeRangeSelect">
                        <option value="all">全部时间</option>
                        <option value="today">今天</option>
                        <option value="week">最近一周</option>
                        <option value="month">最近一月</option>
                    </select>
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '搜索', type: 'primary', action: 'search'
            }]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            if (action === 'search') {
                this.showToast('搜索功能开发中', 'info');
                modal.hide();
            } else if (action === 'cancel') {
                modal.hide();
            }
        };
    }

    // 显示邀请成员模态框
    showInviteMemberModal() {
        const groupId = this.state.currentChat ? this.state.currentChat.id : null;
        if (!groupId) {
            this.showToast('请先选择一个群组', 'warning');
            return;
        }

        const modal = this.createModal({
            title: '邀请成员', body: `
                <div class="form-group">
                    <label class="form-label">用户ID（多个用逗号分隔）</label>
                    <input type="text" class="form-control" id="inviteMembersInput" placeholder="请输入用户ID，多个用逗号分隔">
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '发送邀请', type: 'primary', action: 'invite'
            }]
        });

        modal.show();

        // 处理邀请响应
        const inviteHandler = (event, response) => {
            if (response.success) {
                const successCount = response.success_invites ? response.success_invites.length : 0;
                const failedCount = response.failed_invites ? response.failed_invites.length : 0;
                let msg = `成功邀请 ${successCount} 人`;
                if (failedCount > 0) msg += `，${failedCount} 人邀请失败`;
                this.showToast(msg, successCount > 0 ? 'success' : 'warning');
                modal.hide();
            } else {
                this.showToast(response.message || '邀请失败', 'error');
            }
            ipcRenderer.removeListener('home:inviteMemberRes', inviteHandler);
        };

        ipcRenderer.on('home:inviteMemberRes', inviteHandler);

        modal.onButtonClick = (action) => {
            if (action === 'invite') {
                const input = document.getElementById('inviteMembersInput');
                const rawValue = input.value.trim();
                if (!rawValue) {
                    this.showToast('请输入用户ID', 'warning');
                    return;
                }

                const inviteeIds = rawValue.split(',').map(id => id.trim()).filter(id => id);
                if (inviteeIds.length === 0) {
                    this.showToast('请输入有效的用户ID', 'warning');
                    return;
                }

                ipcRenderer.send('home:inviteMember', { groupId: groupId, inviteeIds: inviteeIds });
            } else if (action === 'cancel') {
                ipcRenderer.removeListener('home:inviteMemberRes', inviteHandler);
                modal.hide();
            }
        };
    }

    // ===== 通知管理 =====

    // 添加一条通知
    addNotification(notification) {
        const notif = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: notification.type,
            title: notification.title,
            subtitle: notification.subtitle,
            detail: notification.detail || '',
            time: notification.time || new Date(),
            status: notification.status || 'info',  // info, pending, accepted, rejected, sent
            data: notification.data || {},
            read: false
        };

        // 插入到列表开头（最新的在前）
        this.state.notifications.unshift(notif);

        // 仅在非通知标签页时增加未读数
        if (this.state.activeTab !== 'notifications') {
            this.state.unreadNotificationCount++;
        }

        this.updateNotificationBadge();

        // 如果当前在通知标签页，刷新列表
        if (this.state.activeTab === 'notifications') {
            this.updateNotificationsList();
        }
    }

    // 更新通知角标
    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;
        const count = this.state.unreadNotificationCount;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    // 清除未读通知标记
    clearUnreadNotifications() {
        this.state.unreadNotificationCount = 0;
        // 将所有通知标记为已读
        this.state.notifications.forEach(n => { n.read = true; });
        this.updateNotificationBadge();
    }

    // 渲染通知列表
    updateNotificationsList() {
        const container = document.getElementById('notificationsList');
        if (!container) return;

        const notifications = this.state.notifications;
        if (notifications.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #c0c4cc;">
                    <i class="fas fa-bell-slash" style="font-size: 40px; margin-bottom: 12px; display: block;"></i>
                    <div>暂无通知</div>
                </div>
            `;
            return;
        }

        container.innerHTML = notifications.map(notif => {
            const iconMap = {
                friend_request: 'fa-user-plus',
                friend_request_reject: 'fa-user-times',
                friend_request_sent: 'fa-paper-plane',
                group_invitation: 'fa-users',
                group_notification: 'fa-bell'
            };
            const colorMap = {
                pending: '#409eff',
                accepted: '#52c41a',
                rejected: '#f56c6c',
                info: '#909399',
                sent: '#909399'
            };

            const icon = iconMap[notif.type] || 'fa-bell';
            const color = colorMap[notif.status] || '#909399';
            const unreadClass = notif.read ? '' : 'notification-unread';
            const timeStr = this._formatNotifTime(notif.time);

            // 操作按钮：仅好友申请（待处理）显示同意/拒绝
            let actionsHtml = '';
            if (notif.type === 'friend_request' && notif.status === 'pending') {
                actionsHtml = `
                    <div class="notification-actions">
                        <button class="notif-action-btn accept-btn" data-notif-id="${notif.id}"
                            style="padding: 4px 12px; font-size: 12px; border: 1px solid #52c41a; color: #52c41a; border-radius: 4px; background: transparent; cursor: pointer;">
                            <i class="fas fa-check"></i> 同意
                        </button>
                        <button class="notif-action-btn reject-btn" data-notif-id="${notif.id}"
                            style="padding: 4px 12px; font-size: 12px; border: 1px solid #f56c6c; color: #f56c6c; border-radius: 4px; background: transparent; cursor: pointer;">
                            <i class="fas fa-times"></i> 拒绝
                        </button>
                    </div>
                `;
            } else if (notif.status === 'accepted') {
                actionsHtml = '<div class="notification-status" style="color: #52c41a; font-size: 12px;"><i class="fas fa-check-circle"></i> 已同意</div>';
            } else if (notif.status === 'rejected') {
                actionsHtml = '<div class="notification-status" style="color: #f56c6c; font-size: 12px;"><i class="fas fa-times-circle"></i> 已拒绝</div>';
            }

            return `
                <div class="notification-item ${unreadClass}" data-notif-id="${notif.id}">
                    <div class="notification-icon" style="color: ${color};">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="notification-body">
                        <div class="notification-title">${this._escapeHtml(notif.title)}</div>
                        <div class="notification-subtitle">${this._escapeHtml(notif.subtitle)}</div>
                        ${notif.detail ? `<div class="notification-detail">${this._escapeHtml(notif.detail)}</div>` : ''}
                        <div class="notification-time">${timeStr}</div>
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }).join('');

        // 绑定操作按钮事件
        container.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const notifId = e.currentTarget.dataset.notifId;
                this.respondToFriendRequest(notifId, true);
            });
        });
        container.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const notifId = e.currentTarget.dataset.notifId;
                this.respondToFriendRequest(notifId, false);
            });
        });
    }

    // 格式化通知时间
    _formatNotifTime(time) {
        if (!time) return '';
        const date = (time instanceof Date) ? time : new Date(time);
        const now = new Date();
        const diff = now - date;
        if (diff < 60 * 1000) return '刚刚';
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 24 * 60 * 60 * 1000) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // 响应好友申请（同意/拒绝）
    respondToFriendRequest(notifId, accept) {
        const notif = this.state.notifications.find(n => n.id === notifId);
        if (!notif || !notif.data) return;

        const invitationId = notif.data.invitation_id;
        if (!invitationId) {
            this.showToast('邀请信息已过期', 'warning');
            return;
        }

        if (!accept) {
            // 拒绝时弹出原因输入框
            const reason = prompt('请输入拒绝原因（可选）：') || '';
            this._sendFriendRequestResponse(invitationId, false, reason, notifId);
        } else {
            this._sendFriendRequestResponse(invitationId, true, '', notifId);
        }
    }

    // 发送好友申请响应 IPC
    _sendFriendRequestResponse(invitationId, accept, reason, notifId) {
        const responseHandler = (event, response) => {
            if (response.success) {
                // 更新通知状态
                const notif = this.state.notifications.find(n => n.id === notifId);
                if (notif) {
                    notif.status = accept ? 'accepted' : 'rejected';
                }
                this.showToast(accept ? '已接受好友申请' : '已拒绝好友申请', 'success');
                this.updateNotificationsList();

                // 同意后刷新好友列表
                if (accept) {
                    ipcRenderer.send("home:LoadUserData");
                }
            } else {
                this.showToast(response.message || '操作失败', 'error');
            }
            ipcRenderer.removeListener('home:respondFriendRequestRes', responseHandler);
        };

        ipcRenderer.on('home:respondFriendRequestRes', responseHandler);
        ipcRenderer.send('home:respondFriendRequest', {
            invitationId: invitationId,
            accept: accept,
            reason: reason
        });
    }

    // 清除聊天记录
    clearChatHistory() {
        if (confirm('确定要清空聊天记录吗？此操作不可恢复。')) {
            document.getElementById('messagesList').innerHTML = '';
            // 同时清除本地缓存
            if (this.state.currentChat) {
                const key = this._chatKey(this.state.currentChat.type, this.state.currentChat.id);
                delete this.cache.chatHistory[key];
            }
            this.showToast('聊天记录已清空', 'success');
        }
    }

    // 显示个人资料模态框
    showProfileModal() {
        const currentUser = this.state.currentUser;
        const avatarUrl = currentUser.avatar || 'https://via.placeholder.com/80';

        const modal = this.createModal({
            title: '个人资料', body: `
                <div style="text-align: center; margin-bottom: 20px;">
                    <div class="avatar-upload-wrapper" id="avatarUploadWrapper" style="position: relative; display: inline-block; cursor: pointer;">
                        <img src="${avatarUrl}" alt="头像" class="avatar" id="profileAvatarPreview"
                             style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #e4e7ed;">
                        <div style="position: absolute; bottom: 0; right: 0; width: 28px; height: 28px; background: #409eff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; border: 2px solid white;">
                            <i class="fas fa-camera" style="font-size: 12px;"></i>
                        </div>
                    </div>
                    <div style="margin-top: 8px; color: #909399; font-size: 12px;">点击头像更换（支持 jpg/png/webp/gif，不超过 2MB）</div>
                    <div id="avatarUploadStatus" style="margin-top: 4px; font-size: 12px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">昵称</label>
                    <input type="text" class="form-control" value="${currentUser.name}" readonly style="background: #f5f7fa;">
                </div>
                <div class="form-group">
                    <label class="form-label">个性签名</label>
                    <textarea class="form-control" rows="3" placeholder="请输入个性签名"></textarea>
                </div>
            `, buttons: [{text: '关闭', type: 'primary', action: 'close'}]
        });

        modal.show();

        // 头像点击上传
        const wrapper = document.getElementById('avatarUploadWrapper');
        if (wrapper) {
            wrapper.addEventListener('click', () => {
                this.uploadUserAvatar();
            });
        }

        modal.onButtonClick = (action) => {
            if (action === 'close') {
                ipcRenderer.removeAllListeners('home:uploadAvatarRes');
                modal.hide();
            }
        };
    }

    // 上传用户头像
    uploadUserAvatar() {
        const statusEl = document.getElementById('avatarUploadStatus');
        if (statusEl) {
            statusEl.style.color = '#409eff';
            statusEl.textContent = '正在选择文件...';
        }

        // 清除旧监听器，防止重复注册
        ipcRenderer.removeAllListeners('home:uploadAvatarRes');

        ipcRenderer.once('home:uploadAvatarRes', (event, response) => {
            if (response.success) {
                // 更新头像预览
                const preview = document.getElementById('profileAvatarPreview');
                if (preview && response.avatar_url) {
                    // 加时间戳防缓存
                    preview.src = response.avatar_url + '?t=' + Date.now();
                }

                // 更新用户状态
                if (this.state.currentUser) {
                    this.state.currentUser.avatar = response.avatar_url;
                }
                // 更新侧边栏头像
                this.updateUserInfo();

                if (statusEl) {
                    statusEl.style.color = '#52c41a';
                    statusEl.textContent = '头像上传成功';
                }
                this.showToast('头像上传成功', 'success');
            } else {
                if (statusEl) {
                    statusEl.style.color = '#f56c6c';
                    statusEl.textContent = response.message || '上传失败';
                }
                if (response.message !== '已取消') {
                    this.showToast(response.message || '头像上传失败', 'error');
                }
            }
        });

        ipcRenderer.send('home:uploadAvatar');
    }

    // 显示系统设置模态框
    showSettingsModal() {
        const modal = this.createModal({
            title: '系统设置', body: `
                <div class="form-group">
                    <label class="form-label">消息通知</label>
                    <div style="margin-top: 8px;">
                        <label style="display: flex; align-items: center; margin-bottom: 8px;">
                            <input type="checkbox" checked style="margin-right: 8px;">
                            <span>新消息提醒</span>
                        </label>
                        <label style="display: flex; align-items: center;">
                            <input type="checkbox" checked style="margin-right: 8px;">
                            <span>声音提醒</span>
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">隐私设置</label>
                    <select class="form-control">
                        <option value="all">所有人</option>
                        <option value="friends">仅好友</option>
                        <option value="none">不展示</option>
                    </select>
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '保存', type: 'primary', action: 'save'
            }]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            if (action === 'save') {
                this.showToast('设置保存成功', 'success');
                modal.hide();
            } else if (action === 'cancel') {
                modal.hide();
            }
        };
    }

    // 处理退出登录
    handleLogout() {
        if (confirm('确定要退出登录吗？')) {
            this.showToast('已退出登录', 'info');
            // 这里应该跳转到登录页面
            // window.location.href = 'login.html';
        }
    }

    // 创建模态框
    createModal(config) {
        return {
            title: config.title, body: config.body, buttons: config.buttons,

            show: () => {
                document.getElementById('modalTitle').textContent = this.title;
                document.getElementById('modalBody').innerHTML = this.body;

                const footer = document.getElementById('modalFooter');
                footer.innerHTML = this.buttons.map(btn => `
                    <button class="btn ${btn.type === 'primary' ? 'btn-primary' : ''}" data-action="${btn.action}">
                        ${btn.text}
                    </button>
                `).join('');

                document.getElementById('modalOverlay').classList.add('show');

                // 绑定按钮事件
                footer.querySelectorAll('button').forEach(button => {
                    button.addEventListener('click', () => {
                        if (this.onButtonClick) {
                            this.onButtonClick(button.dataset.action);
                        }
                    });
                });
            },

            hide: () => {
                document.getElementById('modalOverlay').classList.remove('show');
            },

            modalBody: document.getElementById('modalBody')
        };
    }

    // 隐藏模态框
    hideModal() {
        document.getElementById('modalOverlay').classList.remove('show');
    }

    // 显示提示消息
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: '✓', error: '✗', warning: '!', info: 'i'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || 'i'}</div>
            <div class="toast-content">${message}</div>
            <div class="toast-close" onclick="this.parentElement.remove()">×</div>
        `;

        container.appendChild(toast);

        // 自动移除
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }
        }, 3000);
    }

    // 辅助方法
    getStatusText(status) {
        const statusMap = {
            online: '在线', away: '离开', busy: '忙碌', offline: '离线'
        };
        return statusMap[status] || '未知';
    }

    // 添加处理消息发送成功回调的方法
    handleMessageSent(message) {
        console.log("消息发送成功:", message);
        // 可以在这里更新消息状态（如将消息标记为已发送）
    }

    // HTML 转义（防止 XSS）
    _escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    // 图片预览模态框
    _showImagePreview(src) {
        if (!src || src.startsWith('about:')) return;
        const overlay = document.createElement('div');
        overlay.className = 'image-preview-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;cursor:zoom-out;';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'max-width:90%;max-height:90%;object-fit:contain;border-radius:4px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
        overlay.appendChild(img);
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    }

    // ===== 消息右键菜单与撤回 =====

    // 显示消息右键菜单
    _showMessageContextMenu(e, msgEl) {
        this._hideContextMenu();

        const messageId = msgEl.dataset.messageId;
        const senderId = msgEl.dataset.senderId;
        const timestamp = msgEl.dataset.timestamp;
        const currentUserId = this.state.currentUser ? String(this.state.currentUser.id) : '';
        const isSentByMe = senderId === currentUserId;
        const chatType = this.state.currentChat ? this.state.currentChat.type : null;

        // 判断是否有权限撤回
        let canRecall = false;
        if (messageId && messageId !== '') {
            if (isSentByMe) {
                // 自己发的消息：检查 2 分钟时限
                if (timestamp) {
                    const nowSec = Math.floor(Date.now() / 1000);
                    const msgTs = Math.floor(Number(timestamp) / 1000);  // timestamp 可能是毫秒
                    const msgTsSec = Number(timestamp) > 1e12 ? msgTs : Number(timestamp);
                    canRecall = (nowSec - msgTsSec) <= 120;
                }
            } else if (chatType === 'group') {
                // 别人发的群消息：检查当前用户是否是群主/管理员
                const groupId = this.state.currentChat.id;
                const group = this.cache.groups[groupId];
                if (group && String(group.ownerId) === currentUserId) {
                    canRecall = true;  // 群主可撤回任意消息
                }
                // TODO: 管理员权限需要服务器返回 role 信息
            }
        }

        if (!canRecall) return;  // 无可操作项，不弹出菜单

        // 创建菜单 DOM
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" data-action="recall">
                <i class="fas fa-undo"></i>
                <span>撤回消息</span>
            </div>
        `;

        // 定位
        const x = e.clientX;
        const y = e.clientY;
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        // 防止超出视口
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }

        // 绑定操作
        menu.addEventListener('click', (ev) => {
            const action = ev.target.closest('.context-menu-item')?.dataset.action;
            if (action === 'recall') {
                this._hideContextMenu();
                this.recallMessage(msgEl);
            }
        });
    }

    // 隐藏右键菜单
    _hideContextMenu() {
        const existing = document.querySelector('.context-menu');
        if (existing) existing.remove();
    }

    // 发起撤回
    recallMessage(msgEl) {
        const messageId = msgEl.dataset.messageId;
        if (!messageId) {
            this.showToast('消息正在发送中，暂时无法撤回', 'warning');
            return;
        }

        if (!confirm('确定要撤回这条消息吗？')) return;

        const chat = this.state.currentChat;
        if (!chat) return;

        const msgType = chat.type === 'group' ? 'group' : 'private';
        const sessionId = String(chat.id);  // 群 ID 或对方用户 ID

        // 发送 IPC
        ipcRenderer.removeAllListeners('home:recallMessageRes');
        ipcRenderer.once('home:recallMessageRes', (event, response) => {
            if (response.success) {
                // 撤回成功 → 由 push event 统一处理 UI 替换
                this.showToast('消息已撤回', 'success');
            } else {
                this.showToast(response.message || '撤回失败', 'error');
            }
        });

        ipcRenderer.send('home:recallMessage', {
            msgId: messageId,
            msgType: msgType,
            sessionId: sessionId
        });
    }

    // 处理撤回事件推送（自己撤回和对方撤回都会触发）
    _handleRecallEvent(data) {
        const msgId = data.msg_id;
        if (!msgId) return;

        const currentUserId = this.state.currentUser ? String(this.state.currentUser.id) : '';
        const isRecalledByMe = String(data.uid) === currentUserId;

        // 在所有缓存中查找并标记消息为已撤回（无论是否在 DOM 中）
        for (const key of Object.keys(this.cache.chatHistory)) {
            const cache = this.cache.chatHistory[key];
            if (!cache || !cache.messages) continue;
            const msg = cache.messages.find(m => String(m.message_id) === String(msgId));
            if (msg) {
                msg.recalled = true;
                const recallerName = isRecalledByMe ? '你' : this._getRecallerName(data.uid);
                msg.content = { text: `${recallerName} 撤回了一条消息`, type: 'recall' };
                break;
            }
        }

        // 在当前 DOM 中找到对应消息并替换
        const msgEl = document.querySelector(`.message-item[data-message-id="${msgId}"]`);
        if (msgEl) {
            this._replaceMessageWithRecallNotice(msgEl, data);
        } else {
            console.log(`[Recall] 消息 ${msgId} 不在当前视图中，仅更新缓存`);
        }
    }

    // 获取撤回者的显示名称
    _getRecallerName(uid) {
        const uidNum = Number(uid);
        // 在好友缓存中查找
        if (this.cache.friends[uidNum]) {
            return this.cache.friends[uidNum].nickname || this.cache.friends[uidNum].name;
        }
        // 在群成员缓存中查找
        for (const gid of Object.keys(this.cache.groupMembers || {})) {
            const members = this.cache.groupMembers[gid];
            if (members && members[uidNum]) {
                return members[uidNum].nickname || members[uidNum].username;
            }
        }
        return `用户${uid}`;
    }

    // 将消息替换为撤回提示
    _replaceMessageWithRecallNotice(msgEl, data) {
        const currentUserId = this.state.currentUser ? String(this.state.currentUser.id) : '';
        const isRecalledByMe = String(data.uid) === currentUserId;

        // 根据谁撤回的，显示不同文案
        const recallerName = isRecalledByMe ? '你' : this._getRecallerName(data.uid);
        const noticeText = `${recallerName} 撤回了一条消息`;

        msgEl.classList.add('recalled');
        msgEl.innerHTML = `
            <div class="message-recall-notice">
                <i class="fas fa-info-circle"></i>
                <span>${this._escapeHtml(noticeText)}</span>
            </div>
        `;
    }

    formatTime(time) {
        if (!time) return '';
        const date = new Date(time);
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit'
        });
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HomeApp();

    // 添加额外的CSS样式
    const style = document.createElement('style');
    style.textContent = `
        .status-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .status-option {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .status-option:hover {
            background-color: #f5f7fa;
        }
        
        .status-option.selected {
            background-color: #e6f7ff;
        }
        
        .status-option .status-dot {
            width: 12px;
            height: 12px;
            margin-right: 12px;
        }
        
        .profile-header {
            text-align: center;
            margin-bottom: 20px;
        }
        
        .profile-details {
            border-top: 1px solid #e4e7ed;
            padding-top: 20px;
        }
        
        .detail-item {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .detail-label {
            color: #606266;
            font-weight: 500;
        }
        
        .detail-value {
            color: #303133;
        }
        
        .btn-secondary {
            background-color: #f5f7fa;
            color: #606266;
            border: 1px solid #dcdfe6;
        }
        
        .btn-secondary:hover {
            background-color: #e4e7ed;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* 图片消息样式 */
        .message-image-wrapper {
            display: inline-block;
            position: relative;
            overflow: hidden;
            border-radius: 8px;
            background: #f0f2f5;
        }

        .message-image {
            display: block;
            border-radius: 8px;
            transition: opacity 0.3s ease, transform 0.2s ease;
        }

        .message-image:hover {
            transform: scale(1.02);
        }

        .message-image.loading {
            animation: imgPulse 1.5s ease-in-out infinite;
        }

        .message-image.load-error {
            opacity: 0.5;
            min-width: 80px;
            min-height: 60px;
            background: #fef0f0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #f56c6c;
            font-size: 12px;
        }

        @keyframes imgPulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.5; }
        }

        /* 图片预览遮罩 */
        .image-preview-overlay {
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* 通知标签页样式 */
        .notification-badge {
            display: inline-block;
            background: #f56c6c;
            color: white;
            font-size: 10px;
            min-width: 16px;
            height: 16px;
            line-height: 16px;
            border-radius: 8px;
            padding: 0 4px;
            margin-left: 2px;
            text-align: center;
            font-weight: 600;
        }

        .notifications-header {
            padding: 10px 16px;
            border-bottom: 1px solid #ebeef5;
            display: flex;
            justify-content: flex-end;
        }

        .notifications-list {
            overflow-y: auto;
            height: calc(100vh - 200px);
        }

        .notification-item {
            display: flex;
            padding: 12px 16px;
            border-bottom: 1px solid #f0f0f0;
            transition: background-color 0.2s;
            cursor: default;
        }

        .notification-item:hover {
            background-color: #f5f7fa;
        }

        .notification-item.notification-unread {
            background-color: #ecf5ff;
            border-left: 3px solid #409eff;
        }

        .notification-icon {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #f0f2f5;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            margin-right: 12px;
            font-size: 14px;
        }

        .notification-body {
            flex: 1;
            min-width: 0;
        }

        .notification-title {
            font-size: 13px;
            font-weight: 600;
            color: #303133;
            margin-bottom: 2px;
        }

        .notification-subtitle {
            font-size: 13px;
            color: #606266;
            margin-bottom: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .notification-detail {
            font-size: 12px;
            color: #909399;
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .notification-time {
            font-size: 11px;
            color: #c0c4cc;
        }

        .notification-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        .notif-action-btn:hover {
            opacity: 0.8;
        }

        .notification-status {
            margin-top: 4px;
        }

        /* ===== 右键菜单 ===== */
        .context-menu {
            position: fixed;
            z-index: 9999;
            background: #fff;
            border: 1px solid #e4e7ed;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.12);
            padding: 4px 0;
            min-width: 120px;
            animation: ctxFadeIn 0.12s ease-out;
        }
        @keyframes ctxFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to   { opacity: 1; transform: scale(1); }
        }
        .context-menu-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            font-size: 13px;
            color: #303133;
            cursor: pointer;
            transition: background 0.15s;
        }
        .context-menu-item:hover {
            background: #f5f7fa;
            color: #409eff;
        }
        .context-menu-item i {
            width: 14px;
            text-align: center;
            font-size: 12px;
        }

        /* ===== 撤回通知 ===== */
        .message-item.recalled {
            background: transparent !important;
            padding: 4px 0 !important;
        }
        .message-item.recalled .message-content {
            display: none;
        }
        .message-recall-notice {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            font-size: 12px;
            color: #909399;
            background: #f4f4f5;
            border-radius: 12px;
            max-width: 260px;
        }
        .message-recall-notice i {
            font-size: 12px;
            color: #c0c4cc;
        }
    `;
    document.head.appendChild(style);
});