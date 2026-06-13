/**
 * useIpc — 封装 Electron IPC 请求-响应模式
 *
 * 替代旧的 removeAllListeners + once 模式，提供 Promise-based API。
 * 每个请求附带一个 _requestId，响应通过 requestId 分发，互不干扰。
 */
import { onUnmounted, getCurrentInstance } from 'vue'

const { ipcRenderer } = window.require('electron')

// 全局待处理请求映射  requestId → { resolve, reject, timer }
const pendingRequests = new Map()

// 已注册的响应通道集合（避免重复注册）
const registeredChannels = new Set()

/**
 * 注册一个响应通道的全局监听器
 * @param {string} responseChannel  如 'home:loadChatHistoryRes'
 */
function ensureResponseListener(responseChannel) {
  if (registeredChannels.has(responseChannel)) return
  registeredChannels.add(responseChannel)

  ipcRenderer.on(responseChannel, (_event, data) => {
    const requestId = data?._requestId
    if (!requestId || !pendingRequests.has(requestId)) return

    const { resolve, reject, timer } = pendingRequests.get(requestId)
    clearTimeout(timer)
    pendingRequests.delete(requestId)

    if (data?.success === false) {
      reject(new Error(data.message || 'IPC request failed'))
    } else {
      resolve(data)
    }
  })
}

/**
 * 发起一次 IPC 请求，返回 Promise
 *
 * @param {string} requestChannel   发送通道，如 'home:loadChatHistory'
 * @param {string} responseChannel  监听响应通道，如 'home:loadChatHistoryRes'
 * @param {object} payload          请求数据
 * @param {number} timeout          超时毫秒数，默认 30s
 * @returns {Promise<object>}
 */
export function ipcRequest(requestChannel, responseChannel, payload = {}, timeout = 30000) {
  ensureResponseListener(responseChannel)

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      reject(new Error(`IPC timeout: ${requestChannel} (${timeout}ms)`))
    }, timeout)

    pendingRequests.set(requestId, { resolve, reject, timer })
    ipcRenderer.send(requestChannel, { ...payload, _requestId: requestId })
  })
}

/**
 * 监听推送事件（持久），组件卸载时自动清理
 *
 * @param {string} channel  如 'home:MessageReceive'
 * @param {Function} handler
 */
export function ipcOn(channel, handler) {
  ipcRenderer.on(channel, handler)

  // 在 Vue 组件中使用时，自动在 unmount 时移除监听
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      ipcRenderer.removeListener(channel, handler)
    })
  }
}

/**
 * 组合式函数：在 setup 中使用
 *
 * 用法:
 *   const ipc = useIpc()
 *   const data = await ipc.request('home:loadChatHistory', 'home:loadChatHistoryRes', { targetId: 1 })
 *   ipc.on('home:MessageReceive', (event, msg) => { ... })
 */
export function useIpc() {
  return { request: ipcRequest, on: ipcOn }
}
