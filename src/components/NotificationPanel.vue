<template>
  <div class="notification-panel">
    <!-- 全部已读按钮 -->
    <div v-if="chat.notifications.length > 0" class="notif-toolbar">
      <button class="mark-all-btn" @click="chat.clearUnreadNotifications()">全部已读</button>
    </div>

    <div
      v-for="notif in chat.notifications"
      :key="notif.id"
      :class="['notif-item', { unread: !notif.read }]"
    >
      <!-- 好友请求（收到的） -->
      <template v-if="notif.type === 'friend_request'">
        <div class="notif-header">
          <span class="notif-icon">👤</span>
          <span class="notif-title">好友申请</span>
        </div>
        <div class="notif-body">
          <span class="notif-name">{{ notif.senderName || ('用户 ' + notif.senderId) }}</span>
          <span v-if="notif.reason" class="notif-reason">: {{ notif.reason }}</span>
        </div>
        <div v-if="!notif.responded" class="notif-actions">
          <button class="action-btn accept" @click="respondFriend(notif, true)">接受</button>
          <button class="action-btn reject" @click="respondFriend(notif, false)">拒绝</button>
        </div>
        <div v-else class="notif-responded">
          {{ notif.accepted ? '已接受' : '已拒绝' }}
        </div>
      </template>

      <!-- 好友申请被接受 -->
      <template v-else-if="notif.type === 'friend_request_accepted'">
        <div class="notif-header">
          <span class="notif-icon">✅</span>
          <span class="notif-title">好友申请已通过</span>
        </div>
        <div class="notif-body">
          <span class="notif-name">{{ notif.senderName || ('用户 ' + notif.senderId) }}</span>
          <span> 已接受你的好友申请</span>
        </div>
      </template>

      <!-- 好友申请被拒绝 -->
      <template v-else-if="notif.type === 'friend_request_rejected'">
        <div class="notif-header">
          <span class="notif-icon">❌</span>
          <span class="notif-title">好友申请被拒绝</span>
        </div>
        <div class="notif-body">
          <span class="notif-name">{{ notif.senderName || ('用户 ' + notif.senderId) }}</span>
          <span v-if="notif.reason">: {{ notif.reason }}</span>
        </div>
      </template>

      <!-- 群组邀请 -->
      <template v-else-if="notif.type === 'group_invitation'">
        <div class="notif-header">
          <span class="notif-icon">👥</span>
          <span class="notif-title">群组邀请</span>
        </div>
        <div class="notif-body">
          <span>{{ notif.message || ('邀请加入群组 ' + (notif.groupId || '')) }}</span>
        </div>
      </template>

      <!-- 群组通知 -->
      <template v-else-if="notif.type === 'group_notification'">
        <div class="notif-header">
          <span class="notif-icon">📢</span>
          <span class="notif-title">群组通知</span>
        </div>
        <div class="notif-body">
          <span>{{ notif.message || notif.title || '新通知' }}</span>
        </div>
      </template>

      <!-- 通用通知 -->
      <template v-else>
        <div class="notif-header">
          <span class="notif-icon">🔔</span>
          <span class="notif-title">{{ notif.title || '通知' }}</span>
        </div>
        <div class="notif-body">
          <span>{{ notif.subtitle || notif.message || '' }}</span>
        </div>
      </template>
    </div>

    <div v-if="chat.notifications.length === 0" class="empty-hint">暂无通知</div>

    <!-- 操作反馈 toast -->
    <Teleport to="body">
      <div v-if="toastMsg" class="notif-toast">{{ toastMsg }}</div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'

const { ipcRenderer } = window.require('electron')
const chat = useChatStore()
const toastMsg = ref('')
let toastTimer = null

function showToast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 3000)
}

// 响应好友申请
function respondFriend(notif, accept) {
  notif.responded = true
  notif.accepted = accept
  notif.read = true

  ipcRenderer.send('home:respondFriendRequest', {
    invitationId: notif.invitationId,
    accept: accept,
    reason: ''
  })
}

// 监听响应结果
function onRespondFriendRequestRes(_event, data) {
  if (data.success !== false) {
    showToast(data.accept ? '已接受好友申请' : '已拒绝好友申请')
    // 刷新好友列表
    if (data.accept) {
      ipcRenderer.send('home:LoadUserData')
    }
  } else {
    showToast('操作失败: ' + (data.message || '未知错误'))
  }
}

ipcRenderer.on('home:respondFriendRequestRes', onRespondFriendRequestRes)
onUnmounted(() => {
  ipcRenderer.removeListener('home:respondFriendRequestRes', onRespondFriendRequestRes)
  clearTimeout(toastTimer)
})
</script>

<style scoped>
.notification-panel {
  padding: 8px 0;
}

.notif-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 6px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.mark-all-btn {
  padding: 4px 10px;
  background: none;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
  color: #909399;
  cursor: pointer;
}

.mark-all-btn:hover {
  color: #409eff;
  border-color: #409eff;
}

.notif-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
}

.notif-item.unread {
  background: #ecf5ff;
}

.notif-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.notif-icon {
  font-size: 14px;
}

.notif-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.notif-body {
  font-size: 12px;
  color: #606266;
  padding-left: 20px;
}

.notif-name {
  font-weight: 500;
  color: #303133;
}

.notif-reason {
  color: #909399;
}

.notif-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-left: 20px;
}

.action-btn {
  padding: 4px 14px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.action-btn.accept {
  background: #67c23a;
  color: #fff;
}

.action-btn.accept:hover {
  background: #85ce61;
}

.action-btn.reject {
  background: #f4f4f5;
  color: #606266;
}

.action-btn.reject:hover {
  background: #e4e7ed;
}

.notif-responded {
  font-size: 11px;
  color: #909399;
  margin-top: 6px;
  padding-left: 20px;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  color: #c0c4cc;
  font-size: 13px;
}
</style>

<style>
.notif-toast {
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
