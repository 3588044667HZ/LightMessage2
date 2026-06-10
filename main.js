const {app, BrowserWindow, ipcMain, ipcRenderer, dialog} = require('electron')
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const IMClient = require("./protocol")
let Client = new IMClient();

// ===== Vue3 + Vite 开发/生产模式检测 =====
const isDevMode = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

Client.connect().catch(err => {
    console.error("初始连接失败，将在登录时重试:", err.message);
})
let DataBase = require('./database');
let db = new DataBase.Database();
db.initialize().then(r => {
})
db.createCollections()
db.initializeDefaultSettings()

// 全局主窗口引用
let mainWindow = null;

async function login(event, userid, password, autologin, server) {
    console.log("登录请求:", userid, password, "server:", server);
    db.setSetting('autoLogin', autologin)

    try {
        // 如果服务器地址变更，重新连接
        if (server && server !== Client.serverUrl) {
            console.log("服务器地址变更，重新连接:", server);
            Client.serverUrl = server;
            Client.disconnect();
            await Client.connect();
        }

        // 如果未连接，尝试重新连接
        if (!Client.connected || !Client.ws || Client.ws.readyState !== 1) {
            console.log("未连接，尝试重新连接...");
            await Client.connect();
        }

        Client.login(userid, password, "web");
    } catch (error) {
        console.error("登录连接失败:", error);
        // 通知渲染进程登录失败
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("login:error", {message: "无法连接服务器: " + error.message});
        }
    }
}


const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200, height: 800, webPreferences: {
            preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: true, webSecurity: false
        }
    })

    Client.on("/auth/login_response", (data) => {
        console.log("/auth/login_response:", data);
        Client.startHeartbeat();
        if (data.code === 200) {
            console.log("登录成功")
            Client.token = data.token;
            Client.userId = data.user_id;
            if (db.getUser(Number(data.user_id))) {
                db.updateUser(Number(data.user_id), data);
            } else {
                db.saveUser({...data, id: Number(data.user_id)})
            }
            // Vue3: 通知渲染进程登录成功，Vue Router 处理导航到 /home
            mainWindow.webContents.send("login:success", {
                user_id: data.user_id,
                username: data.username,
                token: data.token,
                user_info: data.user_info || { avatar: '', status: 'online' }
            })
        } else {
            console.log("登录失败 msg:", data.message);
            mainWindow.webContents.send("login:error", {message: data.message || '登录失败'});
        }
    })

    // ===== Vue3: 加载 Vite dev server 或生产构建 =====
    if (isDevMode) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    // ===== IPC Handlers (注册在窗口创建时，Vue3 应用可随时调用) =====

    ipcMain.on("home:LoadUserData", (event) => {
        console.log("home:LoadUserData");
        mainWindow.webContents.send("home:LoadUserDataRes", {
            id: Client.userId,
            username: null, // Vue3 从 login:success 获取用户数据
            avatar: null,
            status: null
        });

        // 获取联系人列表
        let friend_data = Client.userId ? db.getContacts(Client.userId) : [];
        if (friend_data.length === 0) {
            Client.sendMessage("/contacts/list", {"category": "all/friends/colleagues"}).then(r => {
                console.log("好友列表请求已发送。")
            })
            delete Client.onceHandlers["/contacts/list_response"];
            Client.once("/contacts/list_response", (data) => {
                if (data.code === 200) {
                    console.log(data.contacts)
                    let friend_list = []
                    for (const i in data.contacts) {
                        friend_list.push({
                            id: data.contacts[i].user_id,
                            name: data.contacts[i].username,
                            nickname: data.contacts[i].nickname,
                            avatar: data.contacts[i].avatar,
                            status: data.contacts[i].status,
                            department: data.contacts[i].department,
                            tags: data.contacts[i].tags,
                            last_seen: data.contacts[i].last_seen,
                        })
                    }
                    console.log("friend_list:", friend_list)
                    mainWindow.webContents.send("home:LoadFriendsRes", friend_list);
                } else {
                    //     好友数据获取错误
                }
            })
        }

        // 每次登录都刷新群组列表
        Client.sendMessage("/group/list", {}).then(r => {
            console.log("群列表请求已发送")
        })
        delete Client.onceHandlers["/group/list_response"];
        Client.once("/group/list_response", (data) => {
            console.log("/group/list_response:data.groups", data.groups)
            let group_list = []
            for (const dataKey in data.groups) {
                group_list.push({
                    id: data.groups[dataKey].group_id,
                    name: data.groups[dataKey].name,
                    avatar: data.groups[dataKey].avatar,
                    members: data.groups[dataKey].member_count,
                    lastActive: data.groups[dataKey].last_message ? new Date(data.groups[dataKey].last_message.timestamp) : new Date(),
                    description: data.groups[dataKey].description,
                    unread: data.groups[dataKey].unread_count,
                    ownerId: data.groups[dataKey].owner_id
                })
            }
            mainWindow.webContents.send("home:LoadGroupsRes", group_list);
        })
    })

    ipcMain.on("home:loadChatHistory", (event, data) => {
        console.log("home:loadChatHistory", data)
        // 清除旧的 once 处理器，防止快速切换聊天时堆积
        delete Client.onceHandlers["/history/get_response"];
        if (data.type === "group") {
            //     加载群聊历史 - 优先从服务器获取
            Client.sendMessage("/history/get", {
                target_type: "group", target_id: String(data.targetId), limit: 50
            }).then(r => {
                console.log("发送群聊消息记录请求")
            }).catch(err => {
                console.error("群聊历史请求失败:", err);
                mainWindow.webContents.send("home:LoadChatHistoryRes", []);
            });
            // 使用 once 避免重复注册监听器
            Client.once("/history/get_response", (responseData) => {
                console.log("群聊消息请求到达：", responseData.messages);
                // 保存到本地数据库
                if (responseData.messages && Array.isArray(responseData.messages)) {
                    responseData.messages.forEach(msg => {
                        db.saveGroupMessage({
                            message_id: msg.message_id,
                            group_id: msg.group_id || String(data.targetId),
                            sender_id: msg.sender_id,
                            content: msg.content,
                            timestamp: msg.timestamp,
                            type: msg.type || 'text'
                        });
                    });
                }
                mainWindow.webContents.send("home:LoadChatHistoryRes", responseData.messages || []);
            })

        } else {
            // 加载私聊历史 - 优先从服务器获取
            Client.sendMessage("/history/get", {
                target_type: "user", target_id: Number(data.targetId), limit: 50
            }).then(r => {
                console.log("发送私聊消息记录请求")
            }).catch(err => {
                console.error("私聊历史请求失败:", err);
                mainWindow.webContents.send("home:LoadChatHistoryRes", []);
            });
            // 使用 once 避免重复注册监听器
            Client.once("/history/get_response", (responseData) => {
                console.log("私聊消息记录到达 :", responseData.messages);
                // 保存到本地数据库
                if (responseData.messages && Array.isArray(responseData.messages)) {
                    responseData.messages.forEach(msg => {
                        db.saveMessage({
                            message_id: msg.message_id,
                            sender_id: msg.sender_id,
                            receiver_id: msg.receiver_id || Number(data.targetId),
                            content: msg.content,
                            timestamp: msg.timestamp,
                            type: msg.type || 'text'
                        });
                    });
                }
                mainWindow.webContents.send("home:LoadChatHistoryRes", responseData.messages || []);
            })
        }
    })

    // 同步聊天历史（轻量级，用于定时检查最新消息ID）
    ipcMain.on("home:syncChatHistory", (event, data) => {
        console.log("home:syncChatHistory", data);
        delete Client.onceHandlers["/history/get_response"];
        const limit = data.limit || 1;

        if (data.type === "group") {
            Client.sendMessage("/history/get", {
                target_type: "group", target_id: String(data.targetId), limit: limit
            }).catch(err => {
                console.error("同步群聊历史失败:", err);
                mainWindow.webContents.send("home:SyncChatHistoryRes", []);
            });
        } else {
            Client.sendMessage("/history/get", {
                target_type: "user", target_id: Number(data.targetId), limit: limit
            }).catch(err => {
                console.error("同步私聊历史失败:", err);
                mainWindow.webContents.send("home:SyncChatHistoryRes", []);
            });
        }

        Client.once("/history/get_response", (responseData) => {
            mainWindow.webContents.send("home:SyncChatHistoryRes", responseData.messages || []);
        });
    });

    ipcMain.on("home:sendMessage", (event, data) => {
        // 构建 content：图片消息使用 pic_id，文本消息使用 text
        const content = data.msgType === 'image'
            ? { pic_id: data.content, type: 'image' }
            : { text: data.content };

        if (data.type === "group") {
            Client.sendMessage("/group/message/send", {
                group_id: data.targetId, content: content, client_msg_id: data.id,
                type: data.msgType === 'image' ? 'image' : 'text'
            }).then(r => {
                console.log("发送群消息：", data)
            })
        } else {
            Client.sendMessage("/message/send", {
                receiver_id: data.targetId, content: content, client_msg_id: data.id,
                type: data.msgType === 'image' ? 'image' : 'text'
            });
        }
    })

    // 转发消息发送响应（用于获取 server message_id 以支持撤回）
    Client.on("/message/send_response", (data) => {
        console.log("/message/send_response", data);
        if (data.message_id || data.server_msg_id) {
            mainWindow.webContents.send("home:MessageSendResponse", data);
        }
    });

    Client.on("/message/receive", (data) => {
        mainWindow.webContents.send("home:MessageReceive", data)
        console.log("/message/receive", data)
        // 将消息保存到数据库
        if (data.target_type === 'user') {
            // 私聊消息
            db.saveMessage({
                message_id: data.message_id,
                sender_id: data.sender_id,
                receiver_id: data.target_id,
                content: data.content,
                timestamp: data.timestamp,
                type: data.type || 'text'
            });
        } else if (data.target_type === 'group') {
            // 群聊消息
            db.saveGroupMessage({
                message_id: data.message_id,
                group_id: data.target_id,
                sender_id: data.sender_id,
                content: data.content,
                timestamp: data.timestamp,
                type: 'text'
            });
        }
    })

    Client.on("/group/message/receive", (data) => {
        data.target_type = "group";
        db.saveGroupMessage({
            message_id: data.message_id,
            group_id: data.group_id,
            sender_id: data.sender_id,
            content: data.content,
            timestamp: data.timestamp,
            type: data.type || 'text'
        });
        mainWindow.webContents.send("home:MessageReceive", data)
    })

    // ===== 群组操作 IPC 处理器 =====

    // 创建群组
    ipcMain.on("home:createGroup", (event, data) => {
        console.log("home:createGroup", data);
        delete Client.onceHandlers["/group/create_response"];
        Client.sendMessage("/group/create", {
            name: data.name,
            description: data.description || ''
        }).then(() => {
            console.log("创建群组请求已发送");
        }).catch(err => {
            console.error("创建群组请求失败:", err);
            mainWindow.webContents.send("home:createGroupRes", {success: false, message: err.message});
        });
        Client.once("/group/create_response", (responseData) => {
            console.log("创建群组响应:", responseData);
            mainWindow.webContents.send("home:createGroupRes", responseData);
        });
    });

    // 加入群组
    ipcMain.on("home:joinGroup", (event, data) => {
        console.log("home:joinGroup", data);
        delete Client.onceHandlers["/group/join_response"];
        Client.sendMessage("/group/join", {
            group_id: data.groupId
        }).then(() => {
            console.log("加入群组请求已发送");
        }).catch(err => {
            console.error("加入群组请求失败:", err);
            mainWindow.webContents.send("home:joinGroupRes", {success: false, message: err.message});
        });
        Client.once("/group/join_response", (responseData) => {
            console.log("加入群组响应:", responseData);
            mainWindow.webContents.send("home:joinGroupRes", responseData);
        });
    });

    // 邀请成员
    ipcMain.on("home:inviteMember", (event, data) => {
        console.log("home:inviteMember", data);
        delete Client.onceHandlers["/group/invite_response"];
        Client.sendMessage("/group/invite", {
            group_id: data.groupId,
            invitee_ids: data.inviteeIds
        }).then(() => {
            console.log("邀请成员请求已发送");
        }).catch(err => {
            console.error("邀请成员请求失败:", err);
            mainWindow.webContents.send("home:inviteMemberRes", {success: false, message: err.message});
        });
        Client.once("/group/invite_response", (responseData) => {
            console.log("邀请成员响应:", responseData);
            mainWindow.webContents.send("home:inviteMemberRes", responseData);
        });
    });

    // 获取群组详细信息（含成员列表）
    ipcMain.on("home:getGroupInfo", (event, data) => {
        console.log("home:getGroupInfo", data);
        delete Client.onceHandlers["/group/info_response"];
        Client.sendMessage("/group/info", {
            group_id: data.groupId
        }).then(() => {
            console.log("获取群组信息请求已发送");
        }).catch(err => {
            console.error("获取群组信息请求失败:", err);
            mainWindow.webContents.send("home:getGroupInfoRes", {success: false, message: err.message});
        });
        Client.once("/group/info_response", (responseData) => {
            console.log("群组信息响应:", responseData);
            mainWindow.webContents.send("home:getGroupInfoRes", responseData);
        });
    });

    // 踢出群成员
    ipcMain.on("home:kickMember", (event, data) => {
        console.log("home:kickMember", data);
        delete Client.onceHandlers["/group/kick_response"];
        Client.sendMessage("/group/kick", {
            group_id: data.groupId,
            target_user_id: Number(data.targetUserId),
            reason: data.reason || ''
        }).then(() => {
            console.log("踢出成员请求已发送");
        }).catch(err => {
            console.error("踢出成员请求失败:", err);
            mainWindow.webContents.send("home:kickMemberRes", { success: false, message: err.message });
        });
        Client.once("/group/kick_response", (responseData) => {
            console.log("踢出成员响应:", responseData);
            mainWindow.webContents.send("home:kickMemberRes", responseData);
        });
    });

    // 禁言/解除禁言群成员
    ipcMain.on("home:banMember", (event, data) => {
        console.log("home:banMember", data);
        delete Client.onceHandlers["/group/ban_response"];
        Client.sendMessage("/group/ban", {
            group_id: data.groupId,
            target_user_id: Number(data.targetUserId),
            time: data.time  // 秒数, "forever", 或 <=0 解除禁言
        }).then(() => {
            console.log("禁言成员请求已发送");
        }).catch(err => {
            console.error("禁言成员请求失败:", err);
            mainWindow.webContents.send("home:banMemberRes", { success: false, message: err.message });
        });
        Client.once("/group/ban_response", (responseData) => {
            console.log("禁言成员响应:", responseData);
            mainWindow.webContents.send("home:banMemberRes", responseData);
        });
    });

    // ===== 图片上传与获取（WebSocket 协议） =====

    // 上传图片：选择文件 → base64 → /upload_pic → 返回 pic_id
    ipcMain.on("home:uploadImage", async (event) => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: '选择图片',
                filters: [
                    { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled || result.filePaths.length === 0) {
                mainWindow.webContents.send("home:uploadImageRes", { success: false, message: '已取消' });
                return;
            }

            const filePath = result.filePaths[0];
            const stats = fs.statSync(filePath);

            // 10MB 限制（与协议一致）
            if (stats.size > 10 * 1024 * 1024) {
                mainWindow.webContents.send("home:uploadImageRes", { success: false, message: '图片大小超过 10MB 限制' });
                return;
            }

            // 读取文件并转为 base64
            const fileBuffer = fs.readFileSync(filePath);
            const base64Data = fileBuffer.toString('base64');

            // 确定 MIME 类型
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.webp': 'image/webp',
                '.gif': 'image/gif', '.bmp': 'image/bmp'
            };
            const contentType = mimeMap[ext] || 'image/png';

            // 通过 WebSocket 发送 /upload_pic
            delete Client.onceHandlers["/upload_pic_response"];

            Client.sendMessage("/upload_pic", {
                data: base64Data,
                content_type: contentType
            }).then(() => {
                console.log("图片上传请求已发送, 大小:", stats.size);
            }).catch(err => {
                console.error("图片上传请求失败:", err);
                mainWindow.webContents.send("home:uploadImageRes", { success: false, message: err.message });
            });

            Client.once("/upload_pic_response", (responseData) => {
                console.log("图片上传响应:", responseData);
                if (responseData.pic_id) {
                    mainWindow.webContents.send("home:uploadImageRes", {
                        success: true,
                        pic_id: responseData.pic_id,
                        size: responseData.size,
                        content_type: responseData.content_type
                    });
                } else {
                    mainWindow.webContents.send("home:uploadImageRes", {
                        success: false,
                        message: responseData.message || '上传失败'
                    });
                }
            });

        } catch (err) {
            console.error("图片上传处理失败:", err);
            mainWindow.webContents.send("home:uploadImageRes", { success: false, message: err.message });
        }
    });

    // 获取图片：通过 pic_id 从服务器拉取图片 base64 数据
    ipcMain.on("home:getImage", (event, data) => {
        const { pic_id } = data;
        if (!pic_id) {
            mainWindow.webContents.send("home:getImageRes", { success: false, message: '缺少 pic_id', pic_id });
            return;
        }

        delete Client.onceHandlers["/get_pic_response"];

        Client.sendMessage("/get_pic", {
            pic_id: pic_id
        }).then(() => {
            console.log("获取图片请求已发送:", pic_id);
        }).catch(err => {
            console.error("获取图片请求失败:", err);
            mainWindow.webContents.send("home:getImageRes", { success: false, message: err.message, pic_id });
        });

        Client.once("/get_pic_response", (responseData) => {
            if (responseData.data) {
                mainWindow.webContents.send("home:getImageRes", {
                    success: true,
                    pic_id: responseData.pic_id || pic_id,
                    data: responseData.data,
                    content_type: responseData.content_type || 'image/png',
                    size: responseData.size
                });
            } else {
                mainWindow.webContents.send("home:getImageRes", {
                    success: false,
                    message: responseData.message || '图片不存在',
                    pic_id
                });
            }
        });
    });

    // 群组通知接收（服务端推送）
    Client.on("/group/notification", (data) => {
        console.log("/group/notification", data);
        mainWindow.webContents.send("home:groupNotification", data);
    });

    // 群组邀请接收（服务端推送）
    Client.on("/group/invitation_received", (data) => {
        console.log("/group/invitation_received", data);
        mainWindow.webContents.send("home:groupInvitation", data);
    });

    // ===== 好友申请与通知 =====

    // 发送好友申请
    ipcMain.on("home:sendFriendRequest", (event, data) => {
        console.log("home:sendFriendRequest", data);
        delete Client.onceHandlers["/friend_request_response"];
        Client.sendMessage("/friend_request", {
            id: Number(data.id),
            reason: data.reason || ''
        }).then(() => {
            console.log("好友申请请求已发送");
        }).catch(err => {
            console.error("好友申请请求失败:", err);
            mainWindow.webContents.send("home:sendFriendRequestRes", { success: false, message: err.message });
        });
        Client.once("/friend_request_response", (responseData) => {
            console.log("好友申请响应:", responseData);
            mainWindow.webContents.send("home:sendFriendRequestRes", responseData);
        });
    });

    // 响应好友申请（同意/拒绝）
    ipcMain.on("home:respondFriendRequest", (event, data) => {
        console.log("home:respondFriendRequest", data);
        delete Client.onceHandlers["/friend_request_resp_response"];
        Client.sendMessage("/friend_request_resp", {
            invitation_id: data.invitationId,
            accept: data.accept,
            reason: data.reason || ''
        }).then(() => {
            console.log("好友申请响应请求已发送");
        }).catch(err => {
            console.error("好友申请响应请求失败:", err);
            mainWindow.webContents.send("home:respondFriendRequestRes", { success: false, message: err.message });
        });
        Client.once("/friend_request_resp_response", (responseData) => {
            console.log("好友申请响应结果:", responseData);
            mainWindow.webContents.send("home:respondFriendRequestRes", responseData);
        });
    });

    // 接收好友申请通知（服务端推送给目标用户）
    Client.on("/friend_request/receive", (data) => {
        console.log("/friend_request/receive", data);
        mainWindow.webContents.send("home:friendRequestReceive", data);
    });

    // 接收好友申请拒绝通知（服务端推送给申请者）
    Client.on("/friend_request_reject", (data) => {
        console.log("/friend_request_reject", data);
        mainWindow.webContents.send("home:friendRequestReject", data);
    });

    // ===== 消息撤回 =====

    // 撤回消息请求
    ipcMain.on("home:recallMessage", (event, data) => {
        console.log("home:recallMessage", data);
        delete Client.onceHandlers["/recall_msg_response"];
        Client.sendMessage("/recall_msg", {
            msg_id: data.msgId,
            type: data.msgType,       // "group" | "private"
            session_id: data.sessionId
        }).then(() => {
            console.log("撤回请求已发送");
        }).catch(err => {
            console.error("撤回请求失败:", err);
            mainWindow.webContents.send("home:recallMessageRes", { success: false, message: err.message });
        });
        Client.once("/recall_msg_response", (responseData) => {
            console.log("撤回响应:", responseData);
            mainWindow.webContents.send("home:recallMessageRes", responseData);
        });
    });

    // 撤回事件推送（服务端推送给相关在线用户）
    Client.on("/recall_msg_event", (data) => {
        console.log("/recall_msg_event", data);
        mainWindow.webContents.send("home:recallMsgEvent", data);
    });

    // ===== 头像上传 =====

    /**
     * 通用 multipart/form-data 上传函数
     * @param {string} url - 上传地址
     * @param {string} filePath - 本地文件路径
     * @param {string} token - 认证 token
     * @param {string} fieldName - 表单字段名（默认 "avatar"）
     * @returns {Promise<object>}
     */
    function uploadFile(url, filePath, token, fieldName = "avatar") {
        return new Promise((resolve, reject) => {
            const boundary = '----FormBoundary' + Date.now().toString(36);
            const fileName = path.basename(filePath);
            const fileData = fs.readFileSync(filePath);

            const ext = path.extname(fileName).toLowerCase();
            const mimeMap = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.webp': 'image/webp',
                '.gif': 'image/gif'
            };
            const mimeType = mimeMap[ext] || 'image/jpeg';

            const header = Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
                `Content-Type: ${mimeType}\r\n\r\n`
            );
            const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
            const body = Buffer.concat([header, fileData, footer]);

            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                    'Authorization': `Bearer ${token}`
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(result);
                        } else {
                            reject(new Error(result.error || `上传失败 (${res.statusCode})`));
                        }
                    } catch (e) {
                        reject(new Error('解析上传响应失败'));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.write(body);
            req.end();
        });
    }

    // 用户头像上传
    ipcMain.on("home:uploadAvatar", async (event) => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: '选择头像图片',
                filters: [
                    {name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif']}
                ],
                properties: ['openFile']
            });

            if (result.canceled || result.filePaths.length === 0) {
                mainWindow.webContents.send("home:uploadAvatarRes", {success: false, message: '已取消'});
                return;
            }

            const filePath = result.filePaths[0];

            // 检查文件大小（2MB）
            const stats = fs.statSync(filePath);
            if (stats.size > 2 * 1024 * 1024) {
                mainWindow.webContents.send("home:uploadAvatarRes", {
                    success: false,
                    message: '文件大小超过 2MB 限制'
                });
                return;
            }

            const response = await uploadFile(
                'http://127.0.0.1:8080/avatar/upload',
                filePath,
                Client.token
            );

            mainWindow.webContents.send("home:uploadAvatarRes", response);
        } catch (err) {
            console.error("头像上传失败:", err);
            mainWindow.webContents.send("home:uploadAvatarRes", {success: false, message: err.message});
        }
    });

    // 群头像上传
    ipcMain.on("home:uploadGroupAvatar", async (event, data) => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: '选择群头像图片',
                filters: [
                    {name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif']}
                ],
                properties: ['openFile']
            });

            if (result.canceled || result.filePaths.length === 0) {
                mainWindow.webContents.send("home:uploadGroupAvatarRes", {success: false, message: '已取消'});
                return;
            }

            const filePath = result.filePaths[0];
            const stats = fs.statSync(filePath);
            if (stats.size > 2 * 1024 * 1024) {
                mainWindow.webContents.send("home:uploadGroupAvatarRes", {
                    success: false,
                    message: '文件大小超过 2MB 限制'
                });
                return;
            }

            const response = await uploadFile(
                `http://127.0.0.1:8080/group/${data.groupId}/upload`,
                filePath,
                Client.token
            );

            mainWindow.webContents.send("home:uploadGroupAvatarRes", response);
        } catch (err) {
            console.error("群头像上传失败:", err);
            mainWindow.webContents.send("home:uploadGroupAvatarRes", {success: false, message: err.message});
        }
    });

    // ===== 头像本地缓存 =====

    // 缓存目录：{项目根}/data/avatars/friend/ 和 data/avatars/group/
    const avatarBaseDir = path.join(__dirname, 'data', 'avatars');
    const friendAvatarDir = path.join(avatarBaseDir, 'friend');
    const groupAvatarDir = path.join(avatarBaseDir, 'group');
    [friendAvatarDir, groupAvatarDir].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    // MIME → 扩展名映射
    const mimeToExt = {
        'image/jpeg': '.jpg', 'image/jpg': '.jpg',
        'image/png': '.png', 'image/webp': '.webp',
        'image/gif': '.gif', 'image/bmp': '.bmp'
    };
    const allExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

    /**
     * 获取头像（带本地文件缓存）
     * 请求: { id: string|number, type: 'user' | 'group' }
     * 响应: { success: true, data: 'data:image/png;base64,...', id, type }
     *       { success: false, id, type }
     */
    ipcMain.on("home:getAvatar", async (event, data) => {
        const { id, type } = data;
        if (!id) {
            mainWindow.webContents.send("home:getAvatarRes", { success: false, id, type });
            return;
        }

        const cacheDir = type === 'group' ? groupAvatarDir : friendAvatarDir;
        const baseName = String(id);

        // 1. 磁盘缓存命中（尝试多种扩展名）
        for (const ext of allExts) {
            const filePath = path.join(cacheDir, `${baseName}${ext}`);
            if (fs.existsSync(filePath)) {
                try {
                    const buffer = fs.readFileSync(filePath);
                    const base64 = buffer.toString('base64');
                    const mime = ext === '.png' ? 'image/png'
                        : ext === '.webp' ? 'image/webp'
                        : ext === '.gif' ? 'image/gif'
                        : 'image/jpeg';
                    mainWindow.webContents.send("home:getAvatarRes", {
                        success: true,
                        data: `data:${mime};base64,${base64}`,
                        id, type
                    });
                    return;
                } catch (err) {
                    console.error("读取头像缓存失败:", err);
                }
            }
        }

        // 2. 从服务器下载
        const url = type === 'group'
            ? `http://127.0.0.1:8080/group/${id}`
            : `http://127.0.0.1:8080/avatar/${id}`;

        try {
            const result = await new Promise((resolve, reject) => {
                http.get(url, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        res.resume();
                        return;
                    }
                    const contentType = res.headers['content-type'] || 'image/jpeg';
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => resolve({
                        buffer: Buffer.concat(chunks),
                        contentType
                    }));
                    res.on('error', reject);
                }).on('error', reject);
            });

            // 确定扩展名并写入磁盘缓存
            const ext = mimeToExt[result.contentType] || '.jpg';
            const cachePath = path.join(cacheDir, `${baseName}${ext}`);
            fs.writeFileSync(cachePath, result.buffer);
            console.log(`头像已缓存: ${cachePath}`);

            const base64 = result.buffer.toString('base64');
            mainWindow.webContents.send("home:getAvatarRes", {
                success: true,
                data: `data:${result.contentType};base64,${base64}`,
                id, type
            });
        } catch (err) {
            console.error(`获取头像失败 (${type}:${id}):`, err.message);
            mainWindow.webContents.send("home:getAvatarRes", { success: false, id, type });
        }
    });
}

app.whenReady().then(() => {
    ipcMain.on('login', login)
    createWindow()
})
