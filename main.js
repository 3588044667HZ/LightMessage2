const {app, BrowserWindow, ipcMain, ipcRenderer, dialog} = require('electron')
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const IMClient = require("./protocol")
let Client = new IMClient();
Client.connect().catch(err => {
    console.error("初始连接失败，将在登录时重试:", err.message);
})
let DataBase = require('./database');
let db = new DataBase.Database();
db.initialize().then(r => {
})
db.createCollections()
db.initializeDefaultSettings()

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
        const loginWin = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (loginWin) {
            loginWin.webContents.send("login:error", {message: "无法连接服务器: " + error.message});
        }
    }
}


const createWindow = () => {
    const win = new BrowserWindow({
        width: 800, height: 600, webPreferences: {
            preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: true
        }
    })
    Client.on("/auth/login_response", (data) => {
        // console.log(data);
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
            win.webContents.send("login:success")
            // db.setSetting('serverUrl',);
            setTimeout(() => {
                // win.hide()
                win.close()

            }, 100)
            const main = new BrowserWindow({
                webPreferences: {contextIsolation: false, nodeIntegration: true, webSecurity: false}
            })
            main.loadFile(path.join(__dirname, '/home/Home.html')).then(r => {
                console.log("home.html加载完毕", r);
                win.close();

            })
            ipcMain.on("home:LoadUserData", (event) => {
                console.log("home:LoadUserData");
                // let user_data = db.getUser(Number(data.user_id))
                main.webContents.send("home:LoadUserDataRes", {
                    id: Client.userId,
                    username: data.username,
                    avatar: data.user_info.avatar,
                    status: data.user_info.status
                });
                let friend_data = db.getContacts(data.user_id);
                if (friend_data.length === 0) {
                    //     没有好友数据
                    Client.sendMessage("/contacts/list", {"category": "all/friends/colleagues"}).then(r => {
                        console.log("好友列表请求已发送。")
                    })
                    Client.on("/contacts/list_response", (data) => {
                        if (data.code === 200) {
                            // main.webContents.send("home:LoadFriendsRes", {});
                            console.log(data.contacts)
                            let friend_list = []
                            for (const i in data.contacts) {
                                // console.l
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
                            main.webContents.send("home:LoadFriendsRes", friend_list);


                        } else {
                            //     好友数据获取错误
                        }
                    })

                }

                // 每次登录都刷新群组列表
                Client.sendMessage("/group/list", {}).then(r => {
                    console.log("群列表请求已发送")
                })
                Client.on("/group/list_response", (data) => {
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
                    main.webContents.send("home:LoadGroupsRes", group_list);
                })

                // main.webContents.send("home:LoadGroupsRes", {});


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
                        main.webContents.send("home:LoadChatHistoryRes", []);
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
                        main.webContents.send("home:LoadChatHistoryRes", responseData.messages || []);
                    })

                } else {
                    // 加载私聊历史 - 优先从服务器获取
                    Client.sendMessage("/history/get", {
                        target_type: "user", target_id: Number(data.targetId), limit: 50
                    }).then(r => {
                        console.log("发送私聊消息记录请求")
                    }).catch(err => {
                        console.error("私聊历史请求失败:", err);
                        main.webContents.send("home:LoadChatHistoryRes", []);
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
                        main.webContents.send("home:LoadChatHistoryRes", responseData.messages || []);
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
                        main.webContents.send("home:SyncChatHistoryRes", []);
                    });
                } else {
                    Client.sendMessage("/history/get", {
                        target_type: "user", target_id: Number(data.targetId), limit: limit
                    }).catch(err => {
                        console.error("同步私聊历史失败:", err);
                        main.webContents.send("home:SyncChatHistoryRes", []);
                    });
                }

                Client.once("/history/get_response", (responseData) => {
                    main.webContents.send("home:SyncChatHistoryRes", responseData.messages || []);
                });
            });

            ipcMain.on("home:sendMessage", (event, data) => {
                if (data.type === "group") {
                    Client.sendMessage("/group/message/send", {
                        group_id: data.targetId, content: {"text": data.content}, client_msg_id: data.id
                    }).then(r => {
                        console.log("发送群消息：", data)
                    })


                } else {
                    Client.sendTextMessage(data.targetId, data.content, data.id);
                }
            })
            Client.on("/message/receive", (data) => {
                main.webContents.send("home:MessageReceive", data)
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
                        type: 'text'
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
                //     todo 实现消息接收
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
                main.webContents.send("home:MessageReceive", data)
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
                    main.webContents.send("home:createGroupRes", {success: false, message: err.message});
                });
                Client.once("/group/create_response", (responseData) => {
                    console.log("创建群组响应:", responseData);
                    main.webContents.send("home:createGroupRes", responseData);
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
                    main.webContents.send("home:joinGroupRes", {success: false, message: err.message});
                });
                Client.once("/group/join_response", (responseData) => {
                    console.log("加入群组响应:", responseData);
                    main.webContents.send("home:joinGroupRes", responseData);
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
                    main.webContents.send("home:inviteMemberRes", {success: false, message: err.message});
                });
                Client.once("/group/invite_response", (responseData) => {
                    console.log("邀请成员响应:", responseData);
                    main.webContents.send("home:inviteMemberRes", responseData);
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
                    main.webContents.send("home:getGroupInfoRes", {success: false, message: err.message});
                });
                Client.once("/group/info_response", (responseData) => {
                    console.log("群组信息响应:", responseData);
                    main.webContents.send("home:getGroupInfoRes", responseData);
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
                    main.webContents.send("home:kickMemberRes", { success: false, message: err.message });
                });
                Client.once("/group/kick_response", (responseData) => {
                    console.log("踢出成员响应:", responseData);
                    main.webContents.send("home:kickMemberRes", responseData);
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
                    main.webContents.send("home:banMemberRes", { success: false, message: err.message });
                });
                Client.once("/group/ban_response", (responseData) => {
                    console.log("禁言成员响应:", responseData);
                    main.webContents.send("home:banMemberRes", responseData);
                });
            });

            // 群组通知接收（服务端推送）
            Client.on("/group/notification", (data) => {
                console.log("/group/notification", data);
                main.webContents.send("home:groupNotification", data);
            });

            // 群组邀请接收（服务端推送）
            Client.on("/group/invitation_received", (data) => {
                console.log("/group/invitation_received", data);
                main.webContents.send("home:groupInvitation", data);
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
                    const result = await dialog.showOpenDialog(main, {
                        title: '选择头像图片',
                        filters: [
                            {name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif']}
                        ],
                        properties: ['openFile']
                    });

                    if (result.canceled || result.filePaths.length === 0) {
                        main.webContents.send("home:uploadAvatarRes", {success: false, message: '已取消'});
                        return;
                    }

                    const filePath = result.filePaths[0];

                    // 检查文件大小（2MB）
                    const stats = fs.statSync(filePath);
                    if (stats.size > 2 * 1024 * 1024) {
                        main.webContents.send("home:uploadAvatarRes", {
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

                    main.webContents.send("home:uploadAvatarRes", response);
                } catch (err) {
                    console.error("头像上传失败:", err);
                    main.webContents.send("home:uploadAvatarRes", {success: false, message: err.message});
                }
            });

            // 群头像上传
            ipcMain.on("home:uploadGroupAvatar", async (event, data) => {
                try {
                    const result = await dialog.showOpenDialog(main, {
                        title: '选择群头像图片',
                        filters: [
                            {name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif']}
                        ],
                        properties: ['openFile']
                    });

                    if (result.canceled || result.filePaths.length === 0) {
                        main.webContents.send("home:uploadGroupAvatarRes", {success: false, message: '已取消'});
                        return;
                    }

                    const filePath = result.filePaths[0];
                    const stats = fs.statSync(filePath);
                    if (stats.size > 2 * 1024 * 1024) {
                        main.webContents.send("home:uploadGroupAvatarRes", {
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

                    main.webContents.send("home:uploadGroupAvatarRes", response);
                } catch (err) {
                    console.error("群头像上传失败:", err);
                    main.webContents.send("home:uploadGroupAvatarRes", {success: false, message: err.message});
                }
            });

        } else {
            console.log("登录失败 msg:", data.message);
            win.webContents.send("login:error", {message: data.message || '登录失败'});
        }
    })

    win.loadFile('Login.html').then(r => {
    })

}

app.whenReady().then(() => {

    ipcMain.on('login', login)
    createWindow()
})

