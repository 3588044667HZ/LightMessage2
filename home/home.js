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
            friends: {}, groups: {}
        };

        // 初始化
        this.init();
    }

    // 初始化应用
    init() {
        this.bindEvents();
        this.loadMockData();
        this.updateUI();
        this.showToast('欢迎使用内网即时通讯系统', 'info');
        ipcRenderer.send("home:LoadUserData")
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
    }

    // 加载模拟数据
    loadMockData() {
        // 模拟会话数据
        this.state.conversations = [{
            id: 1,
            type: 'friend',
            name: '张三',
            avatar: 'https://via.placeholder.com/48',
            lastMessage: '你好，最近怎么样？',
            unread: 2,
            time: '10:30',
            lastMessageTime: new Date(Date.now() - 3600000),
            targetId: 101
        }, {
            id: 2,
            type: 'group',
            name: '项目讨论群',
            avatar: 'https://via.placeholder.com/48',
            lastMessage: '@你 请查看项目文档',
            unread: 5,
            time: '昨天',
            lastMessageTime: new Date(Date.now() - 86400000),
            targetId: 201
        }, {
            id: 3,
            type: 'friend',
            name: '李四',
            avatar: 'https://via.placeholder.com/48',
            lastMessage: '好的，收到',
            unread: 0,
            time: '09:15',
            lastMessageTime: new Date(Date.now() - 5400000),
            targetId: 102
        }];

        // 模拟好友数据
        // this.state.friends = []
        ipcRenderer.on("home:LoadFriendsRes", (event, data) => {
            this.state.friends = data;
            this.updateFriendsList();
            this.state.friends.forEach(friend => {
                this.cache.friends[friend.id] = friend;
            });

        })
        ipcRenderer.on("home:LoadUserDataRes", (event, data) => {
            // 设置当前用户
            this.state.currentUser = {
                id: data.user_id, name: data.username, avatar: data.avatar, status: data.status
            };
            this.updateUserInfo()

        })
        ipcRenderer.on("home:LoadGroupsRes", (event, data) => {
            this.state.groups = data;
            this.updateGroupsList();
            this.state.groups.forEach(group => {
                this.cache.groups[group.id] = group;
            });
        })
        //     id: 101,
        //     name: '张三',
        //     nickname: '张三',
        //     avatar: 'https://via.placeholder.com/40',
        //     status: 'online',
        //     department: '技术部',
        //     tags: ['同事', '项目组A']
        // }, {
        //     id: 102,
        //     name: '李四',
        //     nickname: '李四',
        //     avatar: 'https://via.placeholder.com/40',
        //     status: 'away',
        //     department: '产品部',
        //     tags: ['同事']
        // }, {
        //     id: 103,
        //     name: '王五',
        //     nickname: '老王',
        //     avatar: 'https://via.placeholder.com/40',
        //     status: 'busy',
        //     department: '设计部',
        //     tags: ['朋友']
        // }, {
        //     id: 104,
        //     name: '赵六',
        //     nickname: '小赵',
        //     avatar: 'https://via.placeholder.com/40',
        //     status: 'offline',
        //     department: '市场部',
        //     tags: ['同事']
        // }];

        // 模拟群组数据
        // this.state.groups = [{
        //     id: 201,
        //     name: '项目讨论群',
        //     avatar: 'https://via.placeholder.com/40',
        //     members: 15,
        //     lastActive: '10:30',
        //     description: '项目进度同步和问题讨论',
        //     unread: 3,
        //     ownerId: 101
        // }, {
        //     id: 202,
        //     name: '技术交流群',
        //     avatar: 'https://via.placeholder.com/40',
        //     members: 42,
        //     lastActive: '昨天',
        //     description: '技术问题讨论和分享',
        //     unread: 0,
        //     ownerId: 102
        // }, {
        //     id: 203,
        //     name: '公司通知群',
        //     avatar: 'https://via.placeholder.com/40',
        //     members: 200,
        //     lastActive: '09:15',
        //     description: '公司重要通知发布',
        //     unread: 12,
        //     ownerId: 100
        // }];

        // 缓存数据


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
                const id = parseInt(e.currentTarget.dataset.id);
                const type = e.currentTarget.dataset.type;
                const targetId = parseInt(e.currentTarget.dataset.target);
                this.selectConversation(id, type, targetId);
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
                        <span class="last-active">${group.lastActive}</span>
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
                const id = parseInt(e.currentTarget.dataset.id);
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

            // 加载聊天记录
            this.loadChatHistory(chat.id, chat.type);
        } else {
            // 显示欢迎页面，隐藏聊天窗口
            document.getElementById('welcomeScreen').style.display = 'flex';
            document.getElementById('chatWindow').classList.remove('active');
        }
    }

    // 加载聊天记录
    loadChatHistory(targetId, type) {
        console.log("loadChatHistory", targetId, type)
        const messagesList = document.getElementById('messagesList');
        ipcRenderer.on("home:LoadChatHistoryRes", (event, data) => {
            messagesList.innerHTML = data.map(msg => {
                const isSent = msg.sender === this.state.currentUser.id;
                const senderName = isSent ? '我' : this.getSenderName(msg.sender, type);

                return `
                <div class="message-item ${isSent ? 'sent' : 'received'}">
                    <div class="message-content">
                        ${type === 'group' && !isSent ? `<div class="message-sender">${senderName}</div>` : ''}
                        <div class="message-text">${msg.content.text}</div>
                        <div class="message-time">${this.formatTime(msg.time)}</div>
                    </div>
                </div>
            `;
            }).join('');

            // 滚动到底部
            setTimeout(() => {
                const container = document.getElementById('messagesContainer');
                container.scrollTop = container.scrollHeight;
            }, 100);

        })


        // 模拟消息数据
        // const messages = [{
        //     id: 1, sender: targetId, content: '你好，最近怎么样？', time: new Date(Date.now() - 3600000), type: 'text'
        // }, {
        //     id: 2,
        //     sender: this.state.currentUser.id,
        //     content: '我很好，谢谢关心！',
        //     time: new Date(Date.now() - 1800000),
        //     type: 'text'
        // }, {
        //     id: 3, sender: targetId, content: '晚上一起吃个饭？', time: new Date(Date.now() - 600000), type: 'text'
        // }];
        // const messages = []
        ipcRenderer.send("home:loadChatHistory", {targetId: targetId, type: type});


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
        return this.state.friends.filter(friend => friend.name.toLowerCase().includes(keyword) || friend.nickname.toLowerCase().includes(keyword) || friend.department.toLowerCase().includes(keyword));
    }

    // 过滤群组
    filterGroups() {
        if (!this.state.searchKeyword) {
            return this.state.groups;
        }

        const keyword = this.state.searchKeyword.toLowerCase();
        return this.state.groups.filter(group => group.name.toLowerCase().includes(keyword) || group.description.toLowerCase().includes(keyword));
    }

    // 选择会话
    selectConversation(id, type, targetId) {
        const conversation = this.state.conversations.find(c => c.id === id);
        if (!conversation) return;

        if (type === 'friend') {
            this.selectFriend(targetId);
        } else {
            this.selectGroup(targetId);
        }

        // 标记为已读
        conversation.unread = 0;
        this.updateConversationsList();
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
            id: groupId, type: 'group', name: group.name, avatar: group.avatar, members: group.members
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
            senderId: this.state.senderId,
            targetId: this.state.currentChat.id,
            type: this.state.currentChat.type
        });

        // 模拟对方回复（仅演示用）
        if (this.state.currentChat.type === 'friend') {
            setTimeout(() => {
                this.simulateReply();
            }, 1000);
        }
    }

    // 模拟回复
    simulateReply() {
        if (!this.state.currentChat) return;

        const replies = ['好的，收到', '明白了', '谢谢', '没问题', '好的，我会处理的', '了解'];

        const reply = replies[Math.floor(Math.random() * replies.length)];

        const message = {
            id: Date.now() + 1, sender: this.state.currentChat.id, content: reply, time: new Date(), type: 'text'
        };

        const messagesList = document.getElementById('messagesList');
        const isSent = false;
        const senderName = this.getSenderName(message.sender, this.state.currentChat.type);
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

        // 滚动到底部
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            container.scrollTop = container.scrollHeight;
        }, 100);
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
    showCreateGroupModal() {
        const modal = this.createModal({
            title: '创建群组', body: `
                <div class="form-group">
                    <label class="form-label">群组名称</label>
                    <input type="text" class="form-control" id="groupNameInput" placeholder="请输入群组名称">
                </div>
                <div class="form-group">
                    <label class="form-label">群组描述</label>
                    <textarea class="form-control" id="groupDescriptionInput" placeholder="请输入群组描述（可选）" rows="3"></textarea>
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '创建', type: 'primary', action: 'create'
            }]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            if (action === 'create') {
                const nameInput = document.getElementById('groupNameInput');
                const descInput = document.getElementById('groupDescriptionInput');

                if (!nameInput.value.trim()) {
                    this.showToast('请输入群组名称', 'warning');
                    return;
                }

                // 创建模拟群组
                const newGroup = {
                    id: Date.now(),
                    name: nameInput.value.trim(),
                    avatar: 'https://via.placeholder.com/40',
                    members: 1,
                    lastActive: '刚刚',
                    description: descInput.value.trim(),
                    unread: 0,
                    ownerId: this.state.currentUser.id
                };

                this.state.groups.push(newGroup);
                this.cache.groups[newGroup.id] = newGroup;
                this.updateGroupsList();

                this.showToast('群组创建成功', 'success');
                modal.hide();
            } else if (action === 'cancel') {
                modal.hide();
            }
        };
    }

    // 显示加入群组模态框
    showJoinGroupModal() {
        const modal = this.createModal({
            title: '加入群组', body: `
                <div class="form-group">
                    <label class="form-label">群组ID或邀请码</label>
                    <input type="text" class="form-control" id="joinGroupInput" placeholder="请输入群组ID或邀请码">
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '加入', type: 'primary', action: 'join'
            }]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            if (action === 'join') {
                const input = document.getElementById('joinGroupInput');

                if (!input.value.trim()) {
                    this.showToast('请输入群组ID或邀请码', 'warning');
                    return;
                }

                this.showToast('已发送加入申请', 'success');
                modal.hide();
            } else if (action === 'cancel') {
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
                        <span class="detail-value">${user.tags.join(', ')}</span>
                    </div>
                </div>
            `, buttons: [{text: '关闭', type: 'primary', action: 'close'}]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            modal.hide();
        };
    }

    // 显示群组信息模态框
    showGroupInfo(groupId) {
        const group = this.cache.groups[groupId];
        if (!group) return;

        const modal = this.createModal({
            title: '群组信息', body: `
                <div class="profile-header">
                    <img src="${group.avatar}" alt="${group.name}" class="avatar" style="width: 80px; height: 80px; border-radius: 8px;">
                    <h3 style="margin-top: 12px;">${group.name}</h3>
                    <div style="color: #909399; margin-bottom: 20px;">${group.members} 名成员</div>
                </div>
                <div class="profile-details">
                    <div class="detail-item">
                        <span class="detail-label">描述</span>
                        <span class="detail-value">${group.description || '暂无描述'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">未读消息</span>
                        <span class="detail-value">${group.unread} 条</span>
                    </div>
                </div>
            `, buttons: [{text: '关闭', type: 'primary', action: 'close'}]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            modal.hide();
        };
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
        const modal = this.createModal({
            title: '邀请成员', body: `
                <div class="form-group">
                    <label class="form-label">用户ID（多个用逗号分隔）</label>
                    <input type="text" class="form-control" id="inviteMembersInput" placeholder="请输入用户ID，多个用逗号分隔">
                </div>
                <div class="form-group">
                    <label class="form-label">邀请消息（可选）</label>
                    <textarea class="form-control" id="inviteMessageInput" placeholder="请输入邀请消息" rows="3"></textarea>
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '发送邀请', type: 'primary', action: 'invite'
            }]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            if (action === 'invite') {
                this.showToast('邀请已发送', 'success');
                modal.hide();
            } else if (action === 'cancel') {
                modal.hide();
            }
        };
    }

    // 清除聊天记录
    clearChatHistory() {
        if (confirm('确定要清空聊天记录吗？此操作不可恢复。')) {
            document.getElementById('messagesList').innerHTML = '';
            this.showToast('聊天记录已清空', 'success');
        }
    }

    // 显示个人资料模态框
    showProfileModal() {
        const modal = this.createModal({
            title: '个人资料', body: `
                <div class="form-group">
                    <label class="form-label">昵称</label>
                    <input type="text" class="form-control" value="${this.state.currentUser.name}">
                </div>
                <div class="form-group">
                    <label class="form-label">个性签名</label>
                    <textarea class="form-control" rows="3" placeholder="请输入个性签名"></textarea>
                </div>
            `, buttons: [{text: '取消', type: 'secondary', action: 'cancel'}, {
                text: '保存', type: 'primary', action: 'save'
            }]
        });

        modal.show();

        modal.onButtonClick = (action) => {
            if (action === 'save') {
                this.showToast('资料保存成功', 'success');
                modal.hide();
            } else if (action === 'cancel') {
                modal.hide();
            }
        };
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

    getSenderName(senderId, type) {
        if (senderId === this.state.currentUser.id) return '我';

        if (type === 'friend') {
            const friend = this.cache.friends[senderId];
            return friend ? friend.nickname : `用户${senderId}`;
        } else {
            // 群聊中，可以缓存群成员信息
            return `用户${senderId}`;
        }
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
    `;
    document.head.appendChild(style);
});