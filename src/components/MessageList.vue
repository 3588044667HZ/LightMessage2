<template>
  <div class="message-list" ref="listRef">
    <div
      v-for="(msg, idx) in chat.currentMessages"
      :key="msg.message_id || idx"
      :class="['message-item', msg.sender_id === 'me' ? 'sent' : 'received']"
      :data-message-id="msg.message_id || ''"
      :data-sender-id="msg.sender_id || ''"
      :data-timestamp="msg.timestamp || ''"
    >
      <!-- 撤回消息 -->
      <div v-if="msg.recalled" class="recall-notice">
        {{ msg.sender_id === 'me' ? '你撤回了一条消息' : '对方撤回了一条消息' }}
      </div>

      <!-- 普通消息 -->
      <template v-else>
        <div class="message-bubble">
          <div v-if="msg.type === 'image'" class="message-image">
            <span>[图片]</span>
          </div>
          <div v-else class="message-text">{{ getContentText(msg.content) }}</div>
          <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()
const listRef = ref(null)

// 消息列表变化时自动滚动到底部
watch(
  () => chat.currentMessages.length,
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight
      }
    })
  }
)

function getContentText(content) {
  if (typeof content === 'string') return content
  return content?.text || ''
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.message-list {
  height: 100%;
  overflow-y: auto;
}

.message-item {
  margin-bottom: 12px;
  display: flex;
}

.message-item.sent {
  justify-content: flex-end;
}

.message-item.received {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 60%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.sent .message-bubble {
  background: #409eff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.received .message-bubble {
  background: #f4f4f5;
  color: #303133;
  border-bottom-left-radius: 4px;
}

.message-time {
  font-size: 11px;
  margin-top: 4px;
  opacity: 0.6;
}

.recall-notice {
  font-size: 12px;
  color: #909399;
  padding: 4px 12px;
  background: #f4f4f5;
  border-radius: 10px;
}

.message-image {
  font-size: 13px;
  color: #909399;
}
</style>
