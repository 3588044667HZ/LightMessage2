<template>
  <div class="notification-panel">
    <div
      v-for="notif in chat.notifications"
      :key="notif.id"
      :class="['notif-item', { unread: !notif.read }]"
    >
      <div class="notif-title">{{ notif.title }}</div>
      <div class="notif-subtitle">{{ notif.subtitle }}</div>
    </div>
    <div v-if="chat.notifications.length === 0" class="empty-hint">暂无通知</div>
  </div>
</template>

<script setup>
import { useChatStore } from '@/stores/chat'

const chat = useChatStore()
</script>

<style scoped>
.notification-panel {
  padding: 8px 0;
}

.notif-item {
  padding: 10px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.notif-item.unread {
  background: #ecf5ff;
}

.notif-title {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.notif-subtitle {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  color: #c0c4cc;
  font-size: 13px;
}
</style>
