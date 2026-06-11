<template>
  <div class="friend-list">
    <!-- 搜索用户区域 -->
    <div class="search-user-section">
      <div class="search-bar">
        <input
            v-model="searchUserId"
            type="text"
            class="search-input"
            placeholder="输入用户 ID 搜索"
            @keydown.enter="searchUser"
        />
        <button class="search-btn" @click="searchUser" :disabled="searching">
          {{ searching ? '搜索中' : '搜索' }}
        </button>
      </div>

      <!-- 搜索结果：用户卡片 -->
      <div v-if="searchResult" class="user-card">
        <div class="user-card-header">
          <Avatar
              :id="searchedUserId"
              :name="searchResult.nickname || searchResult.name || ''"
              :size="48"
          />
          <div class="user-card-info">
            <span class="user-card-name">{{ searchResult.nickname || searchResult.name || '未知用户' }}</span>
            <span class="user-card-id">ID: {{ searchedUserId }}</span>
            <span v-if="searchResult.department" class="user-card-dept">{{ searchResult.department }}</span>
          </div>
          <span v-if="searchResult.status" :class="['status-dot', searchResult.status]"></span>
        </div>
        <!-- 已是好友提示 -->
        <div v-if="isAlreadyFriend" class="user-card-status">已是好友</div>
        <!-- 已发送申请提示 -->
        <div v-else-if="requestSent" class="user-card-status sent">申请已发送</div>
        <!-- 添加好友表单 -->
        <div v-else class="user-card-actions">
          <input
              v-model="friendReason"
              type="text"
              class="reason-input"
              placeholder="验证信息（可选）"
              @keydown.enter="sendFriendRequest"
          />
          <button class="add-btn" @click="sendFriendRequest" :disabled="sendingRequest">
            {{ sendingRequest ? '发送中...' : '添加好友' }}
          </button>
        </div>
      </div>

      <!-- 搜索状态提示 -->
      <div v-if="searchError" class="search-hint error">{{ searchError }}</div>
      <div v-if="searching" class="search-hint">正在搜索...</div>
    </div>

    <!-- 好友列表 -->
    <div class="friend-list-section">
      <div class="section-title">好友列表</div>
      <div
          v-for="friend in filteredFriends"
          :key="friend.id"
          :class="['friend-item', { active: isActive(friend) }]"
          @click="chat.selectChat(friend.id, 'friend')"
      >
        <Avatar :id="friend.id" :name="friend.nickname || friend.name" :size="36"/>
        <div class="friend-info">
          <span class="friend-name">{{ friend.nickname || friend.name }}</span>
        </div>
        <span :class="['status-dot', friend.status]"></span>
      </div>
      <div v-if="filteredFriends.length === 0" class="empty-hint">
        {{ chat.searchKeyword ? '无匹配结果' : '暂无好友' }}
      </div>
    </div>

    <!-- Toast 提示 -->
    <Teleport to="body">
      <div v-if="toastMsg" class="friend-toast">{{ toastMsg }}</div>
    </Teleport>
  </div>
</template>

<script setup>
import {ref, computed, onUnmounted} from 'vue'
import {useChatStore} from '@/stores/chat'
import {useAuthStore} from '@/stores/auth'
import Avatar from './Avatar.vue'

const {ipcRenderer} = window.require('electron')
const chat = useChatStore()
const auth = useAuthStore()

// ===== 搜索用户 =====
const searchUserId = ref('')
const searching = ref(false)
const searchResult = ref(null)
const searchError = ref('')
const searchedUserId = ref(null)

// ===== 添加好友 =====
const friendReason = ref('')
const sendingRequest = ref(false)
const requestSent = ref(false)

// ===== Toast =====
const toastMsg = ref('')
let toastTimer = null

function showToast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, 3000)
}

// 判断搜索结果是否已是好友
const isAlreadyFriend = computed(() => {
  if (!searchResult.value || !searchedUserId.value) return false
  return chat.friends.some(f => String(f.id) === String(searchedUserId.value))
})

// 好友列表过滤
const filteredFriends = computed(() => {
  const kw = chat.searchKeyword.trim().toLowerCase()
  if (!kw) return chat.friends
  return chat.friends.filter(f =>
      (f.nickname || f.name || '').toLowerCase().includes(kw) ||
      String(f.id).includes(kw)
  )
})

function isActive(friend) {
  return (
      chat.currentChat?.type === 'friend' &&
      String(chat.currentChat?.id) === String(friend.id)
  )
}

// ===== 搜索用户 =====
function searchUser() {
  const id = searchUserId.value.trim()
  if (!id) return
  if (!/^\d+$/.test(id)) {
    searchError.value = '请输入数字用户 ID'
    searchResult.value = null
    return
  }

  // 不能搜索自己
  if (String(id) === String(auth.userId)) {
    searchError.value = '不能搜索自己'
    searchResult.value = null
    return
  }

  searching.value = true
  searchError.value = ''
  searchResult.value = null
  searchedUserId.value = Number(id)
  requestSent.value = false
  friendReason.value = ''

  ipcRenderer.send('home:searchUser', {userId: Number(id)})
}

function onSearchUserRes(_event, data) {
  searching.value = false

  // 错误判断：非 200 响应、success 为 false、或包含 error message 但无用户信息
  const code = data.code
  if ((code && code !== 200 && code !== 0) || data.success === false) {
    searchError.value = data.message || '未找到该用户'
    searchResult.value = null
    return
  }
  // 兜底：响应中没有任何用户标识信息，视为未找到
  if (!data.nickname && !data.name && !data.user_id && !data.id) {
    searchError.value = data.message || '未找到该用户'
    searchResult.value = null
    return
  }

  // 成功找到用户
  searchResult.value = data
  searchError.value = ''
}

// ===== 发送好友申请 =====
function sendFriendRequest() {
  if (!searchResult.value || !searchedUserId.value || sendingRequest.value) return

  sendingRequest.value = true
  ipcRenderer.send('home:sendFriendRequest', {
    id: Number(searchedUserId.value),
    reason: friendReason.value.trim()
  })
}

function onSendFriendRequestRes(_event, data) {
  sendingRequest.value = false
  if (data.success !== false && data.code !== 400) {
    requestSent.value = true
    showToast('好友申请已发送')
    friendReason.value = ''
  } else {
    showToast('申请失败: ' + (data.message || '未知错误'))
  }
}

// ===== 注册 IPC 监听 =====
ipcRenderer.on('home:searchUserRes', onSearchUserRes)
ipcRenderer.on('home:sendFriendRequestRes', onSendFriendRequestRes)

onUnmounted(() => {
  ipcRenderer.removeListener('home:searchUserRes', onSearchUserRes)
  ipcRenderer.removeListener('home:sendFriendRequestRes', onSendFriendRequestRes)
  clearTimeout(toastTimer)
})
</script>

<style scoped>
.friend-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ===== 搜索区域 ===== */
.search-user-section {
  border-bottom: 1px solid #e4e7ed;
  padding: 10px 12px;
}

.search-bar {
  display: flex;
  gap: 6px;
}

.search-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #409eff;
}

.search-btn {
  padding: 0 14px;
  height: 32px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}

.search-btn:hover {
  background: #66b1ff;
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 用户卡片 ===== */
.user-card {
  margin-top: 10px;
  padding: 12px;
  background: #f8f9fb;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.user-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-card-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-card-id {
  font-size: 12px;
  color: #909399;
}

.user-card-dept {
  font-size: 11px;
  color: #a0a4ab;
}

.user-card-status {
  margin-top: 8px;
  text-align: center;
  font-size: 13px;
  color: #909399;
  padding: 6px 0;
  background: #f0f2f5;
  border-radius: 4px;
}

.user-card-status.sent {
  color: #67c23a;
  background: #f0f9eb;
}

.user-card-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.reason-input {
  flex: 1;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
}

.reason-input:focus {
  border-color: #409eff;
}

.add-btn {
  padding: 0 14px;
  height: 30px;
  background: #67c23a;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}

.add-btn:hover {
  background: #85ce61;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 搜索提示 ===== */
.search-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}

.search-hint.error {
  color: #f56c6c;
}

/* ===== 好友列表区域 ===== */
.friend-list-section {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.section-title {
  padding: 8px 16px 4px;
  font-size: 11px;
  color: #a0a4ab;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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

<style>
.friend-toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 9999;
  pointer-events: none;
}
</style>
