const {contextBridge} = require('electron')


const {ipcRenderer} = require('electron')

// contextBridge.exposeInMainWorld('versions', {
//     node: () => process.versions.node,
//     chrome: () => process.versions.chrome,
//     electron: () => process.versions.electron,
//     ping: () => ipcRenderer.invoke('ping')
//     // 除函数之外，我们也可以暴露变量
// })
// contextBridge.exposeInMainWorld("IMClient", {
//     login: (userid, password) => ,
// })
// contextBridge.exposeInMainWorld("ipcRenderer", {
//     on: (channel, listener) => ipcRenderer.on(channel, listener),
//     removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
// })
// ipcRenderer.
// ipcRenderer.on("login:error",(data) => {
//     showError(data.message)
// })