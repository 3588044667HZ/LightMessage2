// 简单的JavaScript客户端示例
class IMClient {
    constructor(serverUrl = "ws://localhost:8765") {
        this.ws = null;
        this.serverUrl = serverUrl;
        this.connected = false;
        this.authenticated = false;
        this.userId = null;
        this.token = null;
        this.heartbeatInterval = null;
        this.messageHandlers = {};
        this.onceHandlers = {}; // 添加一次性处理器
        this.onconnected = function () {
            console.log("onconnected");
        }
        this.connectionCallbacks = {
            onopen: [], onerror: [], onclose: []
        };
        this.registerGroupMessageHandlers();

        // 注册消息处理器
        this.registerMessageHandlers();
    }

    // 注册一次性事件处理器
    once(endpoint, handler) {
        if (!this.onceHandlers[endpoint]) {
            this.onceHandlers[endpoint] = [];
        }
        this.onceHandlers[endpoint].push(handler);
    }

    // 移除事件处理器
    off(endpoint, handler) {
        if (this.messageHandlers[endpoint]) {
            delete this.messageHandlers[endpoint];
            // if (index > -1) {
            //     this.messageHandlers[endpoint].splice(index, 1);
            // }
        }
    }

    registerGroupMessageHandlers() {
        // 群聊消息接收
        this.on("/group/receive_message", (data) => {
            console.log("收到群消息:", data);
            // 触发自定义事件，让组件可以监听
            this.dispatchEvent(new CustomEvent('groupMessage', {detail: data}));
        });

        // 群聊通知
        this.on("/group/notification", (data) => {
            console.log("群通知:", data);
            this.dispatchEvent(new CustomEvent('groupNotification', {detail: data}));
        });

        // 群邀请
        this.on("/group/invitation_received", (data) => {
            console.log("收到群邀请:", data);
            this.dispatchEvent(new CustomEvent('groupInvitation', {detail: data}));
        });
    }

    // 创建群组
    createGroup(name, description = '', initialMembers = []) {
        this.sendMessage("/group/create", {
            name: name, description: description, initial_members: initialMembers
        });
    }

    // 加入群组
    joinGroup(groupId, password = '') {
        this.sendMessage("/group/join", {
            group_id: groupId, password: password
        });
    }

    // 邀请加入群组
    inviteToGroup(groupId, inviteeIds) {
        this.sendMessage("/group/invite", {
            group_id: groupId, invitee_ids: Array.isArray(inviteeIds) ? inviteeIds : [inviteeIds]
        });
    }

    // 获取群组信息
    getGroupInfo(groupId) {
        this.sendMessage("/group/info", {
            group_id: groupId
        });
    }

    // 获取群组列表
    getGroupList(category = 'all') {
        this.sendMessage("/group/list", {
            category: category
        });
    }

    // 触发自定义事件的方法
    dispatchEvent(event) {
        // 如果有事件监听器，可以在这里实现
        if (this.eventListeners && this.eventListeners[event.type]) {
            this.eventListeners[event.type].forEach(handler => handler(event));
        }
    }

    // 添加事件监听
    addEventListener(type, handler) {
        if (!this.eventListeners) {
            this.eventListeners = {};
        }
        if (!this.eventListeners[type]) {
            this.eventListeners[type] = [];
        }
        this.eventListeners[type].push(handler);
    }

    // 移除事件监听
    removeEventListener(type, handler) {
        if (this.eventListeners && this.eventListeners[type]) {
            const index = this.eventListeners[type].indexOf(handler);
            if (index > -1) {
                this.eventListeners[type].splice(index, 1);
            }
        }
    }

    // 客户端消息ID生成
    generateClientMsgId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }


// 发送群聊文本消息
    sendGroupTextMessage(groupId, text, clientMsgId = null) {
        const msgId = clientMsgId || this.generateClientMsgId();

        this.sendMessage("/group/message/send", {
            group_id: groupId, type: "text", content: {text: text}, client_msg_id: msgId
        });
    }

    connect() {
        // 如果已经有连接，先关闭
        if (this.ws) {
            this.disconnect();
        }

        console.log(`正在连接服务器: ${this.serverUrl}`);
        this.ws = new WebSocket(this.serverUrl);

        // 重置状态
        this.connected = false;

        // 创建连接Promise
        this.connectionPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('连接超时'));
            }, 10000); // 10秒超时

            this.ws.onopen = () => {
                clearTimeout(timeout);
                console.log("WebSocket连接已建立");
                this.connected = true;
                this.onconnected();
                this.connectionCallbacks.onopen.forEach(callback => callback());
                resolve();
            };

            this.ws.onmessage = (event) => {
                // try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
                // } catch (error) {
                //     console.error("解析消息失败:", error);
                // }
            };

            this.ws.onclose = () => {
                clearTimeout(timeout);
                console.log("连接已关闭");
                this.connected = false;
                this.stopHeartbeat();
                this.connectionCallbacks.onclose.forEach(callback => callback());

                // 5秒后尝试重连
                setTimeout(() => {
                    if (!this.connected && this.token) {
                        console.log("尝试重连...");
                        this.connect();
                    }
                }, 5000);
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                console.error("WebSocket错误:", error);
                this.connectionCallbacks.onerror.forEach(callback => callback(error));
                reject(error);
            };
        });

        return this.connectionPromise;
    }

// 等待连接就绪
    waitForConnection() {
        if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        return this.connectionPromise || this.connect();
    }

    registerMessageHandlers() {
        // 群聊相关处理器
        this.on("/group/create_response", (data) => {
            if (data.code === 200) {
            } else {
            }
        });

        this.on("/group/receive_message", (data) => {
        });

        this.on("/group/notification", (data) => {
        });

        this.on("/history/get_response", (data) => {
        });

        this.on("/contacts/list_response", (data) => {
        });
        this.on("/presence/change", (data) => {
        });


        // 消息接收
        this.on("/message/receive", (data) => {
            console.log("收到消息:", data);
            // 处理消息...
        });

        // 心跳响应
        this.on("/heartbeat_response", (data) => {
            console.log("心跳响应");
        });

        // 系统通知
        this.on("/system/notification", (data) => {
            console.log("系统通知:", data.message);
        });

        // 联系人状态变更
        this.on("/presence/change", (data) => {
            console.log("联系人状态变更:", data.username, data.status);
        });

        // 错误处理
        this.on("/error", (data) => {
            console.log(data);
            console.error("服务器错误:", data.message);
        });
    }

    on(endpoint, handler) {
        this.messageHandlers[endpoint] = handler;
    }

    handleMessage(data) {
        console.log(data);
        const endpoint = data.endpoint;
        if (this.onceHandlers[endpoint]) {
            this.onceHandlers[endpoint].forEach(handler => {
                handler({...data.data, code: data.code} || {});
            });
            delete this.onceHandlers[endpoint];
        }
        const handler = this.messageHandlers[endpoint];
        if (handler) {
            handler({...data.data, code: data.code} || {});
        } else {
            console.log("未处理的消息:", data);
        }
    }

    sendMessage(endpoint, data, requestId = null) {
        // 确保连接已建立
        return this.waitForConnection().then(() => {
            if (this.ws.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket连接未就绪');
            }

            const message = {
                endpoint: endpoint, data: data, timestamp: Date.now(),
            };

            if (requestId) {
                message.request_id = requestId;
            }

            // 如果已登录，添加token
            if (this.token) {
                message.data = message.data || {};
                message.data.token = this.token;
            }

            console.log(`发送消息到 ${endpoint}:`, message);
            this.ws.send(JSON.stringify(message));
        }).catch(error => {
            console.error("发送消息失败:", error);
            throw error;
        });
    }

    // 添加连接状态监听
    addConnectionCallback(type, callback) {
        if (this.connectionCallbacks[type]) {
            this.connectionCallbacks[type].push(callback);
        }
    }

    removeConnectionCallback(type, callback) {
        if (this.connectionCallbacks[type]) {
            const index = this.connectionCallbacks[type].indexOf(callback);
            if (index > -1) {
                this.connectionCallbacks[type].splice(index, 1);
            }
        }
    }

    login(userid = 0, password = '', deviceId = "web") {
        this.userId = userid;
        this.password = password;
        this.deviceId = deviceId;
        if (userid && password) {
            this.sendMessage("/auth/login", {
                userid: userid, password: password, device_id: deviceId
            });
        } else {
            this.sendMessage("/auth/login", {
                userid: this.userId, password: this.password, device_id: this.deviceId,
            });
        }

    }

    sendTextMessage(receiverId, text, clientMsgId = null) {
        const msgId = clientMsgId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.sendMessage("/message/send", {
            receiver_id: receiverId, type: "text", content: {text: text}, client_msg_id: msgId
        });
    }

    startHeartbeat() {
        // 每25秒发送一次心跳
        this.heartbeatInterval = setInterval(() => {
            this.sendMessage("/heartbeat", {
                timestamp: Date.now()
            });
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
    }

}

// 扩展IMClient类，使用日志管理器
module.exports = IMClient;
//
// export default {
//     IMClient
// }

// 使用示例
// const client = new IMClient("ws://localhost:8765");
// client.connect();
// client.login("lwr", "NieQie123");