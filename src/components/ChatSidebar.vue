<template>
  <div class="chat-sidebar">
    <!-- 用户信息区 -->
    <div class="sidebar-header">
      <div class="user-info">
        <div class="avatar-wrapper" title="点击更换头像" @click="triggerAvatarUpload">
          <Avatar
            v-if="auth.userId"
            :key="avatarKey"
            :id="auth.userId"
            type="user"
            :name="auth.user?.username || ''"
            :size="36"
          />
          <div class="avatar-overlay">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        </div>
        <span class="user-name">{{ auth.user?.username || '未登录' }}</span>
        <button class="logout-btn" @click="handleLogout" title="退出登录">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
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
        <span v-if="tab.badge" class="tab-badge">{{ tab.badge > 99 ? '99+' : tab.badge }}</span>
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
import { computed, ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import Avatar from './Avatar.vue'
import ConversationList from './ConversationList.vue'
import FriendList from './FriendList.vue'
import GroupList from './GroupList.vue'
import NotificationPanel from './NotificationPanel.vue'

const { ipcRenderer } = window.require('electron')
const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()
const avatarKey = ref(0)  // 用于强制 Avatar 组件重新挂载

// ===== 头像上传 =====
function triggerAvatarUpload() {
  ipcRenderer.send('home:uploadAvatar')
}

function onAvatarUploadRes(_event, data) {
  console.log('[ChatSidebar] 头像上传响应:', data)
  if (data.message === '已取消') return
  if (data.success !== false) {
    // 上传成功 → 清除旧缓存并强制 Avatar 重新挂载
    const key = `user_${auth.userId}`
    if (window.__avatarCache) delete window.__avatarCache[key]
    avatarKey.value++
  } else {
    console.warn('[ChatSidebar] 头像上传失败:', data.message)
  }
}

ipcRenderer.on('home:uploadAvatarRes', onAvatarUploadRes)
onUnmounted(() => {
  ipcRenderer.removeListener('home:uploadAvatarRes', onAvatarUploadRes)
})

const tabs = computed(() => [
  { key: 'conversations', label: '会话' },
  { key: 'friends', label: '好友' },
  { key: 'groups', label: '群组' },
  { key: 'notifications', label: '通知', badge: chat.unreadNotificationCount || 0 }
])

function handleLogout() {
  console.log('[ChatSidebar] 用户登出')

  // 1. 通知主进程执行登出（停止心跳、清理 Client 状态、清理 DB）
  ipcRenderer.send('home:logout')

  // 2. 清除内存缓存
  if (window.__avatarCache) window.__avatarCache = {}
  if (window.__avatarPending) window.__avatarPending.clear()
  if (window.__imageDataCache) window.__imageDataCache = {}

  // 3. 重置 Pinia stores
  chat.reset()
  auth.logout()

  // 4. 导航到登录页
  router.push('/login')
}
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
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.avatar-wrapper {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 50%;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-wrapper:hover .avatar-overlay {
  opacity: 1;
}

.user-name {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  color: #909399;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.logout-btn:hover {
  background: #fef0f0;
  color: #f56c6c;
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

.tab-badge {
  display: inline-block;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  margin-left: 4px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  vertical-align: middle;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}
</style>
