<template>
  <div class="message-list" ref="listRef" @click="hideContextMenu">
    <div
        v-for="(msg, idx) in chat.currentMessages"
        :key="msg.message_id || idx"
        :class="['message-item', String(msg.sender_id) === String(auth.userId) ? 'sent' : 'received']"
        :data-message-id="msg.message_id || ''"
        :data-sender-id="msg.sender_id || ''"
        :data-timestamp="msg.timestamp || ''"
        @contextmenu.prevent="onContextMenu($event, msg)"
    >
      <!-- 撤回消息 -->
      <div v-if="msg.recalled" class="recall-notice">
        {{ getRecallText(msg) }}
      </div>

      <!-- 普通消息 -->
      <template v-else>
        <!-- 群聊：带发送者头像和昵称 -->
        <div v-if="isGroupChat" class="message-wrapper" :class="String(msg.sender_id) === String(auth.userId) ? 'sent-group' : 'received-group'">
          <div v-if="shouldShowSenderInfo(msg, idx)" class="sender-area" :class="String(msg.sender_id) === String(auth.userId) ? 'sender-right' : 'sender-left'">
            <Avatar
              :id="msg.sender_id"
              type="user"
              :size="36"
              :name="getSenderNickname(msg.sender_id)"
            />
          </div>
          <div v-else class="sender-spacer"></div>
          <div class="message-content">
            <div v-if="shouldShowSenderInfo(msg, idx)" class="sender-nickname">
              {{ getSenderNickname(msg.sender_id) }}
            </div>
            <div class="message-bubble">
              <div v-if="msg.type === 'image'" class="message-image">
                <div class="msg-img-wrapper">
                  <img
                    v-if="hasImageSrc(msg)"
                    :src="getImageSrc(msg)"
                    class="msg-img"
                    :class="{ 'msg-img-sending': msg.sendStatus === 'sending' }"
                    @click="msg.sendStatus !== 'sending' && previewImage(getImageSrc(msg))"
                  />
                  <div v-else class="msg-img-placeholder">
                    <span>图片加载中...</span>
                  </div>
                  <div v-if="msg.sendStatus === 'sending'" class="msg-status-overlay">
                    <div class="msg-status-spinner"></div>
                    <span>发送中</span>
                  </div>
                  <div v-if="msg.sendStatus === 'failed'" class="msg-status-overlay msg-status-failed">
                    <span>发送失败</span>
                  </div>
                </div>
              </div>
              <div v-else class="message-text">{{ getContentText(msg.content) }}</div>
              <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
            </div>
          </div>
        </div>

        <!-- 私聊：保持原有布局 -->
        <div v-else class="message-bubble">
          <div v-if="msg.type === 'image'" class="message-image">
            <div class="msg-img-wrapper">
              <img
                v-if="hasImageSrc(msg)"
                :src="getImageSrc(msg)"
                class="msg-img"
                :class="{ 'msg-img-sending': msg.sendStatus === 'sending' }"
                @click="msg.sendStatus !== 'sending' && previewImage(getImageSrc(msg))"
              />
              <div v-else class="msg-img-placeholder">
                <span>图片加载中...</span>
              </div>
              <!-- 发送中覆盖层 -->
              <div v-if="msg.sendStatus === 'sending'" class="msg-status-overlay">
                <div class="msg-status-spinner"></div>
                <span>发送中</span>
              </div>
              <!-- 发送失败覆盖层 -->
              <div v-if="msg.sendStatus === 'failed'" class="msg-status-overlay msg-status-failed">
                <span>发送失败</span>
              </div>
            </div>
          </div>
          <div v-else class="message-text">{{ getContentText(msg.content) }}</div>
          <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
        </div>
      </template>
    </div>

    <!-- 右键上下文菜单 -->
    <Teleport to="body">
      <div
          v-if="contextMenu.visible"
          class="context-menu"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-menu-item" @click="recallMessage">撤回消息</div>
      </div>
    </Teleport>

    <!-- 图片预览弹窗 -->
    <Teleport to="body">
      <div v-if="previewSrc" class="image-preview-overlay" @click="previewSrc = null">
        <img :src="previewSrc" class="image-preview-img" />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import {ref, computed, watch, nextTick, reactive, onMounted, onUnmounted} from 'vue'
import {useChatStore} from '@/stores/chat'
import {useAuthStore} from '@/stores/auth'
import Avatar from './Avatar.vue'

const {ipcRenderer} = window.require('electron')
const chat = useChatStore()
const auth = useAuthStore()
const listRef = ref(null)

const props = defineProps({
  /** 当前用户是否为群主或管理员（用于撤回他人消息） */
  userIsAdminOrOwner: { type: Boolean, default: false }
})

// ---- 群聊发送者信息 ----
const isGroupChat = computed(() => chat.currentChat?.type === 'group')

/**
 * 判断是否显示发送者头像和昵称
 * 规则：当前消息的前一条不是同一发送者、或间隔超过 3 分钟时显示
 */
function shouldShowSenderInfo(msg, idx) {
  if (!isGroupChat.value) return false
  if (idx === 0) return true
  const prev = chat.currentMessages[idx - 1]
  if (String(prev.sender_id) !== String(msg.sender_id)) return true
  if (prev.recalled) return true
  if (!prev.timestamp || !msg.timestamp) return true
  return (msg.timestamp - prev.timestamp) > 3 * 60 * 1000
}

/** 获取发送者昵称，优先从好友列表读取，当前用户从 auth 读取 */
function getSenderNickname(senderId) {
  // 当前登录用户：从 auth store 获取
  if (String(senderId) === String(auth.userId)) {
    const u = auth.user
    if (u) return u.nickname || u.username || `用户${senderId}`
  }
  // 其他用户：从好友列表查找
  const friend = chat.friendsMap[senderId]
  if (friend) return friend.nickname || friend.name || `用户${senderId}`
  return `用户${senderId}`
}

/** 撤回消息提示文本 */
function getRecallText(msg) {
  if (String(msg.sender_id) === String(auth.userId)) return '你撤回了一条消息'
  if (isGroupChat.value) return `${getSenderNickname(msg.sender_id)} 撤回了一条消息`
  return '对方撤回了一条消息'
}

// ---- 图片消息渲染 ----
// 全局图片缓存：组件销毁后数据不丢失，重新挂载时可直接读取
if (!window.__imageDataCache) window.__imageDataCache = {}
const imageDataMap = reactive(window.__imageDataCache)
const imageLoading = new Set()      // 正在加载中的 pic_id
const previewSrc = ref(null)        // 图片预览

function getPicId(content) {
  if (!content) return ''
  if (typeof content === 'string') return String(content)
  return String(content.pic_id || '')
}

// 获取图片显示 ID：优先 localId（发送中的本地图），否则取 content 中的 pic_id
function getImageDisplayId(msg) {
  if (msg.localId && typeof msg.localId === 'string' && msg.localId.startsWith('local_')) {
    return msg.localId
  }
  return getPicId(msg.content)
}

function hasImageSrc(msg) {
  const id = getImageDisplayId(msg)
  return id && !!imageDataMap[id]
}

function getImageSrc(msg) {
  const id = getImageDisplayId(msg)
  return id ? imageDataMap[id] || '' : ''
}

function previewImage(src) {
  previewSrc.value = src
}

// 从 content 中提取所有图片消息的 pic_id 并请求加载
function loadImageMessages(messages) {
  for (const msg of messages) {
    if (msg.type !== 'image') continue
    const displayId = getImageDisplayId(msg)

    // 本地缓存已有的图片不需要从服务器拉取
    if (!displayId || imageDataMap[displayId] || imageLoading.has(displayId)) continue
    if (displayId.startsWith('local_')) continue // 本地发送中的图片已有 base64

    imageLoading.add(displayId)
    ipcRenderer.send('home:getImage', { pic_id: displayId })
  }
}

// 全局图片响应监听器
function onGetImageRes(_event, data) {
  const picId = String(data.pic_id || '')
  if (!picId) return
  imageLoading.delete(picId)

  if (data.success && data.data) {
    const ct = data.content_type || 'image/png'
    imageDataMap[picId] = `data:${ct};base64,${data.data}`
  } else {
    console.warn('[MessageList] 获取图片失败:', picId, data.message)
  }
}

ipcRenderer.on('home:getImageRes', onGetImageRes)
onUnmounted(() => {
  ipcRenderer.removeListener('home:getImageRes', onGetImageRes)
})

// ---- 右键上下文菜单 ----
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  msg: null
})

function onContextMenu(event, msg) {
  if (msg.recalled || !msg.message_id) return

  const isSelf = String(msg.sender_id) === String(auth.userId)

  // 自己的消息始终可以右键
  // 他人的消息仅在群聊且当前用户是群主/管理员时可右键
  if (!isSelf) {
    if (!isGroupChat.value || !props.userIsAdminOrOwner) return
  }

  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.msg = msg
  contextMenu.visible = true
}

function hideContextMenu() {
  contextMenu.visible = false
  contextMenu.msg = null
}

// 点击页面任意位置关闭菜单
function onDocClick() {
  hideContextMenu()
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

// 2 分钟内可撤回限制（可选）
function isWithinRecallWindow(msg) {
  if (!msg.timestamp) return true // 没有时间戳则不限制
  return Date.now() - msg.timestamp < 2 * 60 * 1000
}

function recallMessage() {
  console.log('recallMessage')
  const msg = contextMenu.msg
  if (!msg || !msg.message_id) {
    hideContextMenu()
    return
  }

  const isSelf = String(msg.sender_id) === String(auth.userId)

  // 自己的消息受 2 分钟限制；管理员/群主撤回他人消息不受限制
  if (isSelf && !isWithinRecallWindow(msg)) {
    hideContextMenu()
    console.warn('[MessageList] 超过2分钟，无法撤回')
    return
  }

  const c = chat.currentChat
  if (!c) {
    hideContextMenu();
    return
  }

  ipcRenderer.send('home:recallMessage', {
    msgId: msg.message_id,
    msgType: c.type === 'group' ? 'group' : 'private',
    sessionId: c.id
  })
  console.log('[MessageList] 发送撤回请求:', msg.message_id)
  hideContextMenu()
}

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

// 消息列表变化时自动加载图片消息（同时监听引用和长度，确保可靠触发）
watch(
    () => chat.currentMessages.length,
    () => {
      const messages = chat.currentMessages
      if (messages?.length > 0) loadImageMessages(messages)
    }
)
watch(
    () => chat.currentMessages,
    (messages) => {
      if (messages?.length > 0) loadImageMessages(messages)
    },
    { immediate: true, deep: false }
)

function getContentText(content) {
  if (typeof content === 'string') return content
  return content?.text || ''
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})
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

/* ---- 群聊消息布局 ---- */
.message-wrapper {
  display: flex;
  gap: 8px;
  width: 100%;
}

.message-wrapper.sent-group {
  flex-direction: row-reverse;
}

.message-wrapper.received-group {
  flex-direction: row;
}

.sender-area {
  flex-shrink: 0;
  align-self: flex-start;
}

.sender-spacer {
  width: 36px;
  flex-shrink: 0;
}

.message-content {
  max-width: calc(100% - 52px);
  display: flex;
  flex-direction: column;
}

.sent-group .message-content {
  align-items: flex-end;
}

.received-group .message-content {
  align-items: flex-start;
}

.sender-nickname {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
  padding: 0 4px;
}

/* 群聊模式：wrapper 占满宽度，内部 flex 控制对齐 */
.message-wrapper .message-bubble {
  max-width: 100%;
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

.msg-img {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
  object-fit: cover;
  display: block;
}

.msg-img-sending {
  opacity: 0.6;
}

.msg-img-wrapper {
  position: relative;
  display: inline-block;
}

.msg-img-placeholder {
  width: 120px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  font-size: 12px;
  color: #909399;
}

.msg-status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
}

.msg-status-failed {
  background: rgba(245, 108, 108, 0.5);
}

.msg-status-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<!-- Teleport 到 body 的菜单和预览需要非 scoped 样式 -->
<style>
.context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
  min-width: 100px;
}

.context-menu-item {
  padding: 8px 16px;
  font-size: 13px;
  color: #303133;
  cursor: pointer;
  transition: background 0.15s;
}

.context-menu-item:hover {
  background: #f5f7fa;
  color: #409eff;
}

/* 图片预览弹窗 */
.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.image-preview-img {
  max-width: 80vw;
  max-height: 80vh;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
</style>
