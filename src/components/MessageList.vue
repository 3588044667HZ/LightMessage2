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
        {{ String(msg.sender_id) === String(auth.userId) ? '你撤回了一条消息' : '对方撤回了一条消息' }}
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
  </div>
</template>

<script setup>
import {ref, watch, nextTick, reactive, onMounted, onUnmounted} from 'vue'
import {useChatStore} from '@/stores/chat'
import {useAuthStore} from '@/stores/auth'

const {ipcRenderer} = window.require('electron')
const chat = useChatStore()
const auth = useAuthStore()
const listRef = ref(null)

// ---- 右键上下文菜单 ----
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  msg: null
})

function onContextMenu(event, msg) {
  // 只能撤回自己发送的、且有 message_id 的消息
  if (String(msg.sender_id) !== String(auth.userId)) return
  if (!msg.message_id || msg.recalled) return

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
  if (!isWithinRecallWindow(msg)) {
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

<!-- Teleport 到 body 的菜单需要非 scoped 样式 -->
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
</style>
