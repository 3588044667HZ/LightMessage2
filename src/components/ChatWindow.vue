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
import { ref, computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageList from './MessageList.vue'

const chat = useChatStore()
const inputText = ref('')

const chatTitle = computed(() => {
  if (!chat.currentChat) return ''
  const { id, type } = chat.currentChat
  if (type === 'friend') return chat.friendsMap[id]?.nickname || `用户${id}`
  return chat.groupsMap[id]?.name || `群组${id}`
})

function sendMessage() {
  const text = inputText.value.trim()
  if (!text || !chat.currentChat) return

  // TODO: 通过 IPC 发送消息并追加到 chatHistory
  chat.appendMessage(chat.currentChat.type, chat.currentChat.id, {
    message_id: null,
    sender_id: 'me',
    content: text,
    timestamp: Date.now(),
    type: 'text'
  })

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
