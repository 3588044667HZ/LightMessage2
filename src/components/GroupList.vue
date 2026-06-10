<template>
  <div class="group-list">
    <div
      v-for="group in chat.groups"
      :key="group.id"
      :class="['group-item', { active: isActive(group) }]"
      @click="chat.selectChat(group.id, 'group')"
    >
      <span class="group-name">{{ group.name }}</span>
      <span class="member-count">{{ group.members || 0 }} 人</span>
    </div>
    <div v-if="chat.groups.length === 0" class="empty-hint">暂无群组</div>
  </div>
</template>

<script setup>
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()

function isActive(group) {
  return (
    chat.currentChat?.type === 'group' &&
    String(chat.currentChat?.id) === String(group.id)
  )
}
</script>

<style scoped>
.group-list {
  padding: 8px 0;
}

.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.group-item:hover {
  background: #ecf5ff;
}

.group-item.active {
  background: #d9ecff;
}

.group-name {
  font-size: 14px;
  color: #303133;
}

.member-count {
  font-size: 12px;
  color: #909399;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  color: #c0c4cc;
  font-size: 13px;
}
</style>
