<template>
  <div class="conversation-list">
    <div
      v-for="conv in conversations"
      :key="`${conv.type}_${conv.targetId}`"
      :class="['conv-item', { active: isActive(conv) }]"
      @click="chat.selectChat(conv.targetId, conv.type)"
    >
      <span class="conv-name">{{ conv.name }}</span>
      <span class="conv-preview">{{ conv.lastMessage }}</span>
    </div>
    <div v-if="conversations.length === 0" class="empty-hint">暂无会话</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()

const conversations = computed(() => chat.conversations)

function isActive(conv) {
  return (
    chat.currentChat?.type === conv.type &&
    String(chat.currentChat?.id) === String(conv.targetId)
  )
}
</script>

<style scoped>
.conversation-list {
  padding: 8px 0;
}

.conv-item {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.conv-item:hover {
  background: #ecf5ff;
}

.conv-item.active {
  background: #d9ecff;
}

.conv-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.conv-preview {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  color: #c0c4cc;
  font-size: 13px;
}
</style>
