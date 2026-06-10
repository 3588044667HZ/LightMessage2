<template>
  <div class="friend-list">
    <div
      v-for="friend in chat.friends"
      :key="friend.id"
      :class="['friend-item', { active: isActive(friend) }]"
      @click="chat.selectChat(friend.id, 'friend')"
    >
      <Avatar :id="friend.id" :name="friend.nickname || friend.name" :size="36" />
      <div class="friend-info">
        <span class="friend-name">{{ friend.nickname || friend.name }}</span>
      </div>
      <span :class="['status-dot', friend.status]"></span>
    </div>
    <div v-if="chat.friends.length === 0" class="empty-hint">暂无好友</div>
  </div>
</template>

<script setup>
import { useChatStore } from '@/stores/chat'
import Avatar from './Avatar.vue'

const chat = useChatStore()

function isActive(friend) {
  return (
    chat.currentChat?.type === 'friend' &&
    String(chat.currentChat?.id) === String(friend.id)
  )
}
</script>

<style scoped>
.friend-list {
  padding: 8px 0;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.friend-item:hover {
  background: #ecf5ff;
}

.friend-item.active {
  background: #d9ecff;
}

.friend-info {
  flex: 1;
  min-width: 0;
}

.friend-name {
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c0c4cc;
  flex-shrink: 0;
}

.status-dot.online {
  background: #67c23a;
}

.status-dot.busy {
  background: #f56c6c;
}

.status-dot.away {
  background: #e6a23c;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  color: #c0c4cc;
  font-size: 13px;
}
</style>
