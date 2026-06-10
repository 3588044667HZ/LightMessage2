<template>
  <div class="chat-sidebar">
    <!-- 用户信息区 -->
    <div class="sidebar-header">
      <div class="user-info">
        <span class="user-name">{{ auth.user?.username || '未登录' }}</span>
      </div>
      <input
        v-model="chat.searchKeyword"
        type="text"
        class="search-input"
        placeholder="搜索..."
      />
    </div>

    <!-- 标签页导航 -->
    <nav class="tab-nav">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab-btn', { active: chat.activeTab === tab.key }]"
        @click="chat.activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- 标签页内容 -->
    <div class="tab-content">
      <FriendList v-if="chat.activeTab === 'friends'" />
      <GroupList v-else-if="chat.activeTab === 'groups'" />
      <NotificationPanel v-else-if="chat.activeTab === 'notifications'" />
      <ConversationList v-else />
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import ConversationList from './ConversationList.vue'
import FriendList from './FriendList.vue'
import GroupList from './GroupList.vue'
import NotificationPanel from './NotificationPanel.vue'

const auth = useAuthStore()
const chat = useChatStore()

const tabs = [
  { key: 'conversations', label: '会话' },
  { key: 'friends', label: '好友' },
  { key: 'groups', label: '群组' },
  { key: 'notifications', label: '通知' }
]
</script>

<style scoped>
.chat-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.user-info {
  margin-bottom: 12px;
}

.user-name {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

.search-input {
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: #409eff;
}

.tab-nav {
  display: flex;
  border-bottom: 1px solid #e4e7ed;
}

.tab-btn {
  flex: 1;
  padding: 10px 0;
  border: none;
  background: none;
  font-size: 13px;
  color: #909399;
  cursor: pointer;
  transition: color 0.2s;
}

.tab-btn.active {
  color: #409eff;
  border-bottom: 2px solid #409eff;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}
</style>
