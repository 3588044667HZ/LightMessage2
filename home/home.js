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
            userStatus: 'online'
        };

        // 缓存数据
        this.cache = {
            friends: {}, groups: {},
            // 消息缓存: { "friend_101": { messages: [...], lastMessageId: "xxx" }, "group_g1": {...} }
            chatHistory: {}
        };

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

        // 监听群组通知（成员加入、离开等）
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
        });

        // 监听群组邀请
        ipcRenderer.on("home:groupInvitation", (event, data) => {
            this.showToast(`收到来自 ${data.inviter_name || '未知'} 的群「${data.group_name}」邀请`, 'info');
        });

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

        // 创建消息对象
        const message = {
            id: messageData.message_id || Date.now(),
            sender: messageData.sender_id,
            content: messageData.content,
            time: new Date(messageData.timestamp || Date.now()),
            type: 'text'
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
            type: 'text'
        });

        // 如果当前正在与消息发送方/群组聊天，则显示消息
        if (this.state.currentChat && String(this.state.currentChat.id) === String(targetId)) {
            this.appendMessageToChat(message);
        }
    }

    // 添加创建新会话的方法
    createNewConversation(targetId, type, message) {
        let conversation = {
            id: Date.now(), // 临时ID，后续可以从服务器获取
            type: type,
            lastMessage: (message.content && message.content.text) || message.content || '',
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

        const messageEl = document.createElement('div');
        messageEl.className = `message-item ${isSent ? 'sent' : 'received'}`;
        messageEl.innerHTML = `
        <div class="message-content">
            ${type === 'group' && !isSent ? `<div class="message-sender">${senderName}</div>` : ''}
            <div class="message-text">${(message.content && message.content.text) || message.content || ''}</div>
            <div class="message-time">${this.formatTime(message.time)}</div>
        </div>
    `;

        messagesList.appendChild(messageEl);

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
            // 更新现有会话
            conversation.lastMessage = (message.content && message.content.text) || message.content || '';
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

        messagesList.innerHTML = messages.map(msg => {
            const isSent = msg.sender_id === this.state.currentUser.id;
            const senderName = isSent ? '我' : this.getSenderName(msg.sender_id, type);

            return `
                <div class="message-item ${isSent ? 'sent' : 'received'}">
                    <div class="message-content">
                        ${type === 'group' && !isSent ? `<div class="message-sender">${senderName}</div>` : ''}
                        <div class="message-text">${(msg.content && msg.content.text) ? msg.content.text : (msg.content || '')}</div>
                        <div class="message-time">${this.formatTime(msg.timestamp)}</div>
                    </div>
                </div>
            `;
        }).join('');

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
    }

    // 过滤列表
    filterLists() {
        if (this.state.activeTab === 'conversations') {
            this.updateConversationsList();
        } else if (this.state.activeTab === 'friends') {
            this.updateFriendsList();
        } else if (this.state.activeTab === 'groups') {
            this.updateGroupsList();
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
        messageEl.innerHTML = `
            <div class="message-content">
                ${type === 'group' && !isSent ? `<div class="message-sender">${senderName}</div>` : ''}
                <div class="message-text">${message.content}</div>
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

    // 显示添加好友模态框
    showAddFriendModal() {
        const modal = this.createModal({
            title: '添加好友', body: `
                <div class="form-group">
                    <label class="form-label">用户ID或用户名</label>
                    <input type="text" class="form-control" id="addFriendInput" placeholder="请输入用户ID或用户名">
                </div>
                <div class="form-group">
                    <label class="form-label">验证消息</label>
                    <textarea class="form-control" id="addFriendMessage" placeholder="请输入验证消息（可选）" rows="3"></textarea>
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '发送请求', type: 'primary', action: 'sendRequest'
            }]
        });

        modal.show();

        // 绑定按钮事件
        modal.onButtonClick = (action) => {
            if (action === 'sendRequest') {
                const input = document.getElementById('addFriendInput');
                const message = document.getElementById('addFriendMessage');

                if (!input.value.trim()) {
                    this.showToast('请输入用户ID或用户名', 'warning');
                    return;
                }

                this.showToast('好友请求已发送', 'success');
                modal.hide();
            } else if (action === 'cancel') {
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
    `;
    document.head.appendChild(style);
});