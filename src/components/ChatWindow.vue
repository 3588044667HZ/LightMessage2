<template>
  <div class="chat-window">
    <!-- 无聊天选中时的欢迎页 -->
    <div v-if="!chat.currentChat" class="welcome">
      <h2>欢迎使用 LightMessage</h2>
      <p>从左侧选择一个会话开始聊天</p>
    </div>

    <!-- 聊天区域 -->
    <template v-else>
      <div class="chat-header">
        <span class="chat-title">{{ chatTitle }}</span>
      </div>

      <MessageList class="chat-messages" />

      <div class="chat-input-area">
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
import { ref, computed, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useIpc } from '@/composables/useIpc'
import MessageList from './MessageList.vue'

const { ipcRenderer } = window.require('electron')
const chat = useChatStore()
const auth = useAuthStore()
const ipc = useIpc()
const inputText = ref('')

const chatTitle = computed(() => {
  if (!chat.currentChat) return ''
  const { id, type } = chat.currentChat
  if (type === 'friend') return chat.friendsMap[id]?.nickname || `用户${id}`
  return chat.groupsMap[id]?.name || `群组${id}`
})

// 监听会话切换，自动加载历史消息
ipc.on('home:LoadChatHistoryRes', (_event, messages) => {
  const c = chat.currentChat
  if (!c) return
  console.log('[ChatWindow] 收到历史消息:', messages?.length, '条')
  const key = `${c.type}_${c.id}`
  // 清空该会话旧缓存，写入服务端返回的消息
  chat.chatHistory[key] = { messages: [], lastMessageId: null }
  for (const msg of (messages || [])) {
    chat.appendMessage(c.type, c.id, {
      message_id: msg.message_id,
      sender_id: msg.sender_id,
      content: msg.content,
      timestamp: msg.timestamp,
      type: msg.type || 'text'
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
  const preview = typeof data.content === 'string' ? data.content : (data.content?.text || '[图片]')
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
    console.log('[ChatWindow] 切换会话，请求历史消息:', newChat)
    ipcRenderer.send('home:loadChatHistory', {
      type: newChat.type === 'group' ? 'group' : 'private',
      targetId: newChat.id
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
    sender_id: auth.userId,
    content: text,
    timestamp: Date.now(),
    type: 'text'
  })

  // 更新会话列表
  chat.upsertConversation(chat.currentChat.type, chat.currentChat.id, chatTitle.value, text)

  inputText.value = ''
}
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
  padding: 14px 20px;
  border-bottom: 1px solid #e4e7ed;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.chat-input-area {
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid #e4e7ed;
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
