<template>
  <div class="chat-window">
    <!-- 无聊天选中时的欢迎页 -->
    <div v-if="!chat.currentChat" class="welcome">
      <h2>欢迎使用 LightMessage</h2>
      <p>从左侧选择一个会话开始聊天</p>
    </div>

    <!-- 聊天区域 -->
    <template v-else>
      <div
        :class="['chat-header', { clickable: chat.currentChat.type === 'group' }]"
        @click="onHeaderClick"
      >
        <Avatar
          :id="chat.currentChat.id"
          :type="chat.currentChat.type === 'group' ? 'group' : 'user'"
          :name="chatTitle"
          :size="32"
        />
        <span class="chat-title">{{ chatTitle }}</span>
        <span v-if="chat.currentChat.type === 'group'" class="header-info-icon" title="群聊信息">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </span>
      </div>

      <div class="chat-body">
        <MessageList
          class="chat-messages"
          :user-is-admin-or-owner="userIsAdminOrOwner"
        />
        <GroupInfoPanel
          v-if="showGroupInfo && chat.currentChat?.type === 'group'"
          :group-info="currentGroupInfo"
          :members="groupMembers"
          :loading="groupInfoLoading"
          :user-is-admin-or-owner="userIsAdminOrOwner"
          @close="closeGroupInfo"
        />
      </div>

      <div class="chat-input-area">
        <button class="img-btn" @click="selectImage" title="发送图片">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
        <textarea
          v-model="inputText"
          class="chat-input"
          placeholder="输入消息..."
          @keydown.enter.exact.prevent="sendMessage"
        />
        <button class="send-btn" @click="sendMessage">发送</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useIpc } from '@/composables/useIpc'
import MessageList from './MessageList.vue'
import Avatar from './Avatar.vue'
import GroupInfoPanel from './GroupInfoPanel.vue'

const { ipcRenderer } = window.require('electron')
const chat = useChatStore()
const auth = useAuthStore()
const ipc = useIpc()
const inputText = ref('')

// ===== 群信息面板 =====
const showGroupInfo = ref(false)
const groupMembers = ref([])
const groupInfoLoading = ref(false)

const currentGroupInfo = computed(() => {
  if (!chat.currentChat || chat.currentChat.type !== 'group') return {}
  return chat.groupsMap[chat.currentChat.id] || { id: chat.currentChat.id, name: `群组${chat.currentChat.id}` }
})

/** 当前用户是否为当前群的群主或管理员 */
const userIsAdminOrOwner = computed(() => {
  if (!chat.currentChat || chat.currentChat.type !== 'group') return false
  const groupId = chat.currentChat.id
  const userId = auth.userId

  // 检查是否为群主（来自群组列表缓存）
  const group = chat.groupsMap[groupId]
  if (group?.ownerId && String(group.ownerId) === String(userId)) return true

  // 检查群成员详情中是否有管理员角色
  const memberInfo = groupMembers.value.find(m => String(m.id) === String(userId))
  if (memberInfo && (memberInfo.role === 'admin' || memberInfo.role === 'moderator')) return true

  return false
})

function onHeaderClick() {
  if (chat.currentChat?.type !== 'group') return
  showGroupInfo.value = !showGroupInfo.value
  if (showGroupInfo.value) {
    loadGroupInfo(chat.currentChat.id)
  }
}

function closeGroupInfo() {
  showGroupInfo.value = false
}

function loadGroupInfo(groupId) {
  groupInfoLoading.value = true
  groupMembers.value = []
  ipcRenderer.send('home:getGroupInfo', { groupId })
}

// 群信息响应
function onGetGroupInfoRes(_event, data) {
  groupInfoLoading.value = false
  console.log('[ChatWindow] 群信息:', data)

  if (data.success === false) {
    console.warn('[ChatWindow] 获取群信息失败:', data.message)
    return
  }

  // 解析成员列表（兼容不同服务端字段名）
  const rawMembers = data.members || data.member_list || []
  const ownerId = data.owner_id || currentGroupInfo.value.ownerId

  groupMembers.value = rawMembers.map(m => {
    const id = m.user_id || m.id || m.uid
    const nickname = m.nickname || m.name || m.username || `用户${id}`
    const role = m.role || m.role_name || null
    return { id, nickname, role }
  })

  // 如果没有 owner 角色标记，手动给群主标记
  if (ownerId) {
    const ownerMember = groupMembers.value.find(m => String(m.id) === String(ownerId))
    if (ownerMember && !ownerMember.role) {
      ownerMember.role = null // getMemberRole 在 panel 中通过 ownerId 判断
    }
  }
}

ipcRenderer.on('home:getGroupInfoRes', onGetGroupInfoRes)

const chatTitle = computed(() => {
  if (!chat.currentChat) return ''
  const { id, type } = chat.currentChat
  if (type === 'friend') return chat.friendsMap[id]?.nickname || `用户${id}`
  return chat.groupsMap[id]?.name || `群组${id}`
})

// ===== 聊天历史加载（本地 DB + 服务器回退） =====
const loadingKeys = new Set()

// 服务器历史消息响应（仅在本地 DB 无数据时触发）
ipc.on('home:LoadChatHistoryRes', (_event, arg) => {
  const messages = Array.isArray(arg) ? arg : (arg?.messages || [])
  const c = chat.currentChat
  if (!c) return
  const key = `${c.type}_${c.id}`
  loadingKeys.delete(key)
  console.log('[ChatWindow] 服务器历史消息:', messages.length, '条')
  chat.chatHistory[key] = { messages: [], lastMessageId: null }
  for (const msg of messages) {
    chat.appendMessage(c.type, c.id, {
      message_id: msg.message_id,
      sender_id: msg.sender_id,
      content: msg.content,
      timestamp: msg.timestamp,
      type: msg.type || 'text'
    })
  }
})

// 本地数据库历史消息响应（第一优先级）
ipc.on('home:LoadLocalChatHistoryRes', (_event, data) => {
  const c = chat.currentChat
  if (!c) return
  const key = `${c.type}_${c.id}`
  const loadingKey = `loading_${key}`
  if (!loadingKeys.has(loadingKey)) return

  if (data.messages && data.messages.length > 0) {
    console.log('[ChatWindow] 命中本地 DB:', data.messages.length, '条')
    loadingKeys.delete(loadingKey)
    chat.chatHistory[key] = { messages: [], lastMessageId: null }
    for (const msg of data.messages) {
      chat.appendMessage(c.type, c.id, {
        message_id: msg.message_id,
        sender_id: msg.sender_id,
        content: msg.content,
        timestamp: msg.timestamp,
        type: msg.type || 'text'
      })
    }
  } else {
    // 本地 DB 无数据，回退到服务器
    console.log('[ChatWindow] 本地 DB 无数据，请求服务器历史:', key)
    loadingKeys.delete(loadingKey)
    loadingKeys.add(key)
    ipcRenderer.send('home:loadChatHistory', {
      type: c.type === 'group' ? 'group' : 'private',
      targetId: c.id,
      limit: 200
    })
  }
})

// 监听实时消息推送（对方发来的消息 / 群消息）
ipc.on('home:MessageReceive', (_event, data) => {
  console.log('[ChatWindow] 收到实时消息:', data)
  let chatType, chatId

  if (data.target_type === 'group') {
    chatType = 'group'
    chatId = data.group_id || data.target_id
  } else {
    chatType = 'friend'
    chatId = data.sender_id
  }

  // 忽略自己发出的回显（已在 sendMessage 中本地追加）
  if (String(data.sender_id) === String(auth.userId)) return

  chat.appendMessage(chatType, chatId, {
    message_id: data.message_id,
    sender_id: data.sender_id,
    content: data.content,
    timestamp: data.timestamp,
    type: data.type || 'text'
  })

  // 更新会话列表（收到消息的对话置顶）
  const name = chatType === 'group'
    ? (chat.groupsMap[chatId]?.name || `群组${chatId}`)
    : (chat.friendsMap[chatId]?.nickname || chat.friendsMap[chatId]?.name || `用户${chatId}`)
  const preview = (data.type === 'image')
    ? '[图片]'
    : (typeof data.content === 'string' ? data.content : (data.content?.text || '[图片]'))
  chat.upsertConversation(chatType, chatId, name, preview)
})

// ===== 消息撤回 =====

// 辅助函数：在指定会话中标记消息为已撤回
function markMessageRecalled(type, targetId, msgId) {
  const key = `${type}_${targetId}`
  const history = chat.chatHistory[key]
  if (!history) return false
  const msg = history.messages.find(m => String(m.message_id) === String(msgId))
  if (msg) {
    msg.recalled = true
    console.log(`[ChatWindow] 消息 ${msgId} 已标记为撤回`)
    return true
  }
  return false
}

// 撤回响应（自己发起撤回后服务端的应答）
ipc.on('home:recallMessageRes', (_event, data) => {
  console.log('[ChatWindow] 撤回响应:', data)
  if (data.success === false) {
    console.warn('[ChatWindow] 撤回失败:', data.message)
    return
  }
  const c = chat.currentChat
  if (!c) return
  // 响应中可能包含 msg_id / message_id
  const msgId = data.msg_id || data.message_id
  if (msgId) {
    markMessageRecalled(c.type, c.id, msgId)
  }
})

// 撤回事件推送（服务端推送，对方撤回消息时触发）
ipc.on('home:recallMsgEvent', (_event, data) => {
  console.log('[ChatWindow] 撤回推送:', data)
  const msgId = data.msg_id || data.message_id
  if (!msgId) return

  // 根据推送中的会话信息定位消息
  if (data.type === 'group' || data.target_type === 'group') {
    const groupId = data.group_id || data.target_id || data.session_id
    if (groupId) markMessageRecalled('group', groupId, msgId)
  } else {
    // 私聊：发送者就是对方
    const senderId = data.sender_id || data.target_id || data.session_id
    if (senderId) markMessageRecalled('friend', senderId, msgId)
  }
})

watch(
  () => chat.currentChat,
  (newChat) => {
    if (!newChat) return

    // 切换会话时关闭群信息面板
    showGroupInfo.value = false
    groupMembers.value = []

    const key = `${newChat.type}_${newChat.id}`

    // 优先级1：Pinia 内存缓存
    const cached = chat.chatHistory[key]
    if (cached && cached.messages.length > 0) {
      console.log('[ChatWindow] 命中内存缓存，跳过加载:', key, cached.messages.length, '条')
      return
    }

    // 防止重复请求（快速切换会话时）
    if (loadingKeys.has(key) || loadingKeys.has(`loading_${key}`)) return

    // 优先级2：本地数据库
    console.log('[ChatWindow] 内存未命中，查询本地 DB:', key)
    loadingKeys.add(`loading_${key}`)
    ipcRenderer.send('home:loadLocalChatHistory', {
      type: newChat.type === 'group' ? 'group' : 'private',
      targetId: newChat.id,
      limit: 200
    })
  },
  { immediate: true }
)

function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !chat.currentChat) return

  const clientMsgId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // 通过 IPC 发送到主进程 → WebSocket 服务器
  ipcRenderer.send('home:sendMessage', {
    type: chat.currentChat.type === 'group' ? 'group' : 'private',
    targetId: chat.currentChat.id,
    content: text,
    id: clientMsgId,
    msgType: 'text'
  })

  // 本地追加到 chatHistory（立即显示）
  chat.appendMessage(chat.currentChat.type, chat.currentChat.id, {
    message_id: null,
    localId: clientMsgId,
    sender_id: auth.userId,
    content: text,
    timestamp: Date.now(),
    type: 'text'
  })

  // 保存到本地数据库（去重将在服务端确认 message_id 后生效）
  ipcRenderer.send('home:saveLocalMessage', {
    type: chat.currentChat.type === 'group' ? 'group' : 'private',
    targetId: chat.currentChat.id,
    message_id: null,
    localId: clientMsgId,
    sender_id: auth.userId,
    content: text,
    timestamp: Date.now(),
    msgType: 'text'
  })

  // 更新会话列表
  chat.upsertConversation(chat.currentChat.type, chat.currentChat.id, chatTitle.value, text)

  inputText.value = ''
}

// ===== 图片发送（本地优先渲染 + 后台上传 + 状态追踪）=====

// 监听服务端消息发送确认 → 更新 sendStatus + 本地 DB
ipc.on('home:MessageSendResponse', (_event, data) => {
  const clientMsgId = data.client_msg_id
  const serverMsgId = data.message_id || data.server_msg_id
  if (!clientMsgId || !serverMsgId) return

  const c = chat.currentChat
  if (!c) return
  const key = `${c.type}_${c.id}`
  const history = chat.chatHistory[key]
  if (!history) return

  const msg = history.messages.find(m => m.localId === clientMsgId)
  if (msg) {
    msg.message_id = serverMsgId
    msg.sendStatus = 'sent'
    console.log('[ChatWindow] 消息发送确认:', clientMsgId, '→', serverMsgId)

    // 更新本地 DB 中该消息的 message_id
    ipcRenderer.send('home:updateLocalMessageId', {
      localId: clientMsgId,
      messageId: serverMsgId,
      type: c.type === 'group' ? 'group' : 'private',
      targetId: c.id,
      timestamp: msg.timestamp
    })
  }
})

function selectImage() {
  if (!chat.currentChat) return
  ipcRenderer.send('home:selectImage')
}

function onSelectImageRes(_event, data) {
  if (!data.success) {
    if (data.message !== '已取消') {
      console.warn('[ChatWindow] 选择图片失败:', data.message)
    }
    return
  }

  const c = chat.currentChat
  if (!c) return

  // 生成本地唯一标识
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const dataUrl = `data:${data.contentType};base64,${data.base64}`

  // 立即追加到聊天列表（用户马上看到图片 + 发送中状态）
  chat.appendMessage(c.type, c.id, {
    message_id: null,
    localId: localId,
    sender_id: auth.userId,
    content: { pic_id: localId, type: 'image' },
    timestamp: Date.now(),
    type: 'image',
    sendStatus: 'sending'
  })

  // 将 base64 写入全局图片缓存，MessageList 可直接渲染
  if (!window.__imageDataCache) window.__imageDataCache = {}
  window.__imageDataCache[localId] = dataUrl

  // 更新会话列表
  chat.upsertConversation(c.type, c.id, chatTitle.value, '[图片]')

  // 后台上传
  ipcRenderer.send('home:uploadImage', {
    base64: data.base64,
    contentType: data.contentType,
    localId: localId
  })

  // 2 分钟超时检测
  setTimeout(() => {
    const key = `${c.type}_${c.id}`
    const history = chat.chatHistory[key]
    if (!history) return
    const msg = history.messages.find(m => m.localId === localId)
    if (msg && msg.sendStatus === 'sending') {
      msg.sendStatus = 'failed'
      console.warn('[ChatWindow] 图片发送超时:', localId)
    }
  }, 2 * 60 * 1000)
}

// 监听上传结果 → 上传成功后自动发送消息
function onUploadImageRes(_event, data) {
  const localId = data.localId
  if (!localId) return

  if (!data.success) {
    console.warn('[ChatWindow] 图片上传失败:', data.message)
    // 标记为失败
    for (const key in chat.chatHistory) {
      const msg = chat.chatHistory[key].messages.find(m => m.localId === localId)
      if (msg) { msg.sendStatus = 'failed'; break }
    }
    return
  }

  const c = chat.currentChat
  if (!c) return

  // 上传成功 → 发送消息
  console.log('[ChatWindow] 图片上传成功，发送消息:', data.pic_id)
  ipcRenderer.send('home:sendMessage', {
    type: c.type === 'group' ? 'group' : 'private',
    targetId: c.id,
    content: data.pic_id,
    id: localId,
    msgType: 'image'
  })

  // 保存到本地数据库
  ipcRenderer.send('home:saveLocalMessage', {
    type: c.type === 'group' ? 'group' : 'private',
    targetId: c.id,
    message_id: null,
    localId: localId,
    sender_id: auth.userId,
    content: { pic_id: data.pic_id, type: 'image' },
    timestamp: Date.now(),
    msgType: 'image'
  })

  // 更新消息 content 为真实 pic_id，但保留 localId 用于匹配 send_response
  const key = `${c.type}_${c.id}`
  const history = chat.chatHistory[key]
  if (history) {
    const msg = history.messages.find(m => m.localId === localId)
    if (msg) {
      msg.content = { pic_id: data.pic_id, type: 'image' }
    }
  }
}

ipcRenderer.on('home:selectImageRes', onSelectImageRes)
ipcRenderer.on('home:uploadImageRes', onUploadImageRes)
onUnmounted(() => {
  ipcRenderer.removeListener('home:selectImageRes', onSelectImageRes)
  ipcRenderer.removeListener('home:uploadImageRes', onUploadImageRes)
  ipcRenderer.removeListener('home:getGroupInfoRes', onGetGroupInfoRes)
})
</script>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.welcome {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
}

.welcome h2 {
  font-size: 20px;
  margin-bottom: 8px;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid #e4e7ed;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.chat-header.clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.chat-header.clickable:hover {
  background: #f5f7fa;
}

.header-info-icon {
  margin-left: auto;
  display: flex;
  align-items: center;
  color: #909399;
  transition: color 0.15s;
}

.chat-header.clickable:hover .header-info-icon {
  color: #409eff;
}

.chat-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  min-width: 0;
}

.chat-input-area {
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #e4e7ed;
  align-items: center;
}

.img-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  background: none;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  color: #606266;
  font-size: 13px;
  transition: all 0.2s;
  white-space: nowrap;
}

.img-btn:hover {
  color: #409eff;
  border-color: #409eff;
}

.img-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input {
  flex: 1;
  height: 40px;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  resize: none;
  font-size: 14px;
  outline: none;
}

.chat-input:focus {
  border-color: #409eff;
}

.send-btn {
  padding: 0 20px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.send-btn:hover {
  background: #66b1ff;
}
</style>
