<template>
  <div class="avatar" :style="{ width: size + 'px', height: size + 'px' }">
    <img v-if="src" :src="src" class="avatar-img" :style="{ width: size + 'px', height: size + 'px' }" />
    <div v-else class="avatar-fallback" :style="{ width: size + 'px', height: size + 'px', fontSize: (size * 0.4) + 'px' }">
      {{ initial }}
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const { ipcRenderer } = window.require('electron')

const props = defineProps({
  /** 用户ID 或 群组ID */
  id: { type: [String, Number], required: true },
  /** 'user' | 'group' */
  type: { type: String, default: 'user' },
  /** 头像尺寸 (px) */
  size: { type: Number, default: 40 },
  /** 名称（用于 fallback 首字） */
  name: { type: String, default: '' }
})

// ===== 全局内存缓存（进程生命周期内共享，命中后不再发 IPC） =====
if (!window.__avatarCache) window.__avatarCache = {}
// 正在请求中的 key 集合（防止同 key 重复发 IPC）
if (!window.__avatarPending) window.__avatarPending = new Set()

const key = () => `${props.type}_${props.id}`
const src = ref(window.__avatarCache[key()] || '')

const initial = ref(
  props.name ? props.name.charAt(0).toUpperCase() : (props.type === 'group' ? '群' : '?')
)

// ===== 每个 Avatar 实例独立监听响应 =====
let listening = false

function onResponse(_event, data) {
  const k = key()
  const dataKey = `${data.type}_${data.id}`

  // 其他组件的响应到达，检查缓存是否已被写入（由首个到达的响应写入）
  if (dataKey !== k) {
    if (window.__avatarCache[k] && !src.value) {
      src.value = window.__avatarCache[k]
      stopListen()
    }
    return
  }

  // 自己的响应到达
  if (data.success && data.data) {
    window.__avatarCache[k] = data.data
    src.value = data.data
  }
  window.__avatarPending.delete(k)
  stopListen()
}

function startListen() {
  if (listening) return
  listening = true
  ipcRenderer.on('home:getAvatarRes', onResponse)
}

function stopListen() {
  if (!listening) return
  listening = false
  ipcRenderer.removeListener('home:getAvatarRes', onResponse)
}

function requestAvatar() {
  const k = key()

  // 1. 内存缓存命中 → 直接显示，不发任何请求
  if (window.__avatarCache[k]) {
    src.value = window.__avatarCache[k]
    return
  }

  // 2. 缓存未命中 → 注册监听器等待响应
  startListen()

  // 3. 二次检查：可能在注册监听器的瞬间，另一个组件的响应到达并写入了缓存
  if (window.__avatarCache[k]) {
    src.value = window.__avatarCache[k]
    stopListen()
    return
  }

  // 4. 如果已有同 key 请求在进行中，不发重复 IPC，只挂监听等缓存写入
  if (window.__avatarPending.has(k)) return

  // 5. 发起 IPC 请求
  window.__avatarPending.add(k)
  ipcRenderer.send('home:getAvatar', { id: props.id, type: props.type })
}

onMounted(requestAvatar)

onUnmounted(stopListen)

watch(() => [props.id, props.type], () => {
  stopListen()
  requestAvatar()
})
</script>

<style scoped>
.avatar {
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img {
  object-fit: cover;
  display: block;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-weight: 600;
  user-select: none;
}
</style>
