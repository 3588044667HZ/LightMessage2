const {app, BrowserWindow, ipcMain, ipcRenderer} = require('electron')
const path = require("node:path");
const IMClient = require("./protocol")
let Client = new IMClient();
Client.connect()
let DataBase = require('./database');
let db = new DataBase.Database();
db.initialize().then(r => {
})
db.createCollections()
db.initializeDefaultSettings()

function login(event, userid, password, autologin) {
    console.log(userid, password);
    db.setSetting('autoLogin', autologin)
    Client.login(userid, password, "web");
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
                db.saveUser(data)
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
                    Client.sendMessage("/group/list", {}).then(r => {
                        console.log("群列表请求已发送")
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

                    Client.on("/group/list_response", (data) => {
                        console.log("/group/list_response:data.groups", data.groups)
                        let group_list = []
                        for (const dataKey in data.groups) {
                            group_list.push({
                                id: data.groups[dataKey].group_id,
                                name: data.groups[dataKey].name,
                                avatar: data.groups[dataKey].avatar,
                                members: data.groups[dataKey].member_count,
                                lastActive: data.groups[dataKey].last_message ? new Date(dataKey.last_message.timestamp) : new Date(),
                                description: data.groups[dataKey].description,
                                unread: data.groups[dataKey].unread_count,
                                ownerId: data.groups[dataKey].owner_id
                            })

                        }
                        main.webContents.send("home:LoadGroupsRes", group_list);
                    })

                }

                // main.webContents.send("home:LoadGroupsRes", {});


            })
            ipcMain.on("home:loadChatHistory", (event, data) => {
                console.log("home:loadChatHistory", data)
                if (data.type === "group") {
                    //     加载群聊历史
                    const group_history = db.getGroupMessages(data.targetId)
                    if (group_history.length > 0) {
                        main.webContents.send("home:LoadChatHistoryRes", group_history);
                    } else {
                        Client.sendMessage("/history/get", {
                            target_type: "group", target_id: String(data.targetId), end_time: Number(Date()), limit: 50
                        }).then(r => {
                            console.log("发送群聊消息记录请求")
                        });
                        //     从线上加载
                        Client.on("/history/get_response", (data) => {
                            console.log("群聊消息请求到达：", data.messages);
                            main.webContents.send("home:LoadChatHistoryRes", data.messages);
                        })

                    }
                } else {
                    // 加载私聊历史
                    const private_history = db.getMessages(Number(data.targetId))
                    if (private_history.length > 0) {
                        main.webContents.send("home:LoadChatHistory", private_history);

                    } else {
                        //     从线上加载
                        Client.sendMessage("/history/get", {
                            target_type: "user", target_id: Number(data.targetId), end_time: Number(Date(),), limit: 50
                        }).then(r => {
                            console.log("发送私聊消息记录请求")
                        });
                        Client.on("/history/get_response", (data) => {
                            console.log("私聊消息记录到达 :", data.messages);
                            main.webContents.send("home:LoadChatHistoryRes", data.messages);
                        })

                    }
                    // win.webContents.send("home:LoadChatHistoryRes", {})
                }
            })
            ipcMain.on("home:sendMessage", (event, data) => {
                if (data.type === "group") {
                    Client.sendMessage("/group/message/send", {
                        group_id: data.targetId, content: {"text": data.content}, client_msg_id: data.id
                    }).then(r => {
                        console.log("发送群消息：", data)
                    })


                } else {
                    Client.sendTextMessage(data.targetId, data.content, data.id);
                    Client.on("/message/send", (data) => {
                        console.log("/message/send", data)
                    })

                }
            })
            Client.on("/message/receive", (data) => {
                data.target_type = "user";
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
                    group_id: data.target_id,
                    sender_id: data.sender_id,
                    content: data.content,
                    timestamp: data.timestamp,
                    type: 'text'
                });
                main.webContents.send("home:MessageReceive", data)
            })

        } else {
            console.log("登录失败 msg:", data.message);
            win.webContents.send("login:error", data);
        }
    })

    win.loadFile('Login.html').then(r => {
    })

}

app.whenReady().then(() => {

    ipcMain.on('login', login)
    createWindow()
})

