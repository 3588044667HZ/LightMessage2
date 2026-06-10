<template>
  <div class="avatar" :style="{ width: size + 'px', height: size + 'px' }">
    <img v-if="src" :src="src" class="avatar-img" :style="{ width: size + 'px', height: size + 'px' }" />
    <div v-else class="avatar-fallback" :style="{ width: size + 'px', height: size + 'px', fontSize: (size * 0.4) + 'px' }">
      {{ initial }}
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

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

// ===== 全局内存缓存（进程生命周期内不重复请求） =====
if (!window.__avatarCache) window.__avatarCache = {}
// 正在请求中的 ID 集合（防止重复发起）
if (!window.__avatarPending) window.__avatarPending = new Set()
// 等待某个头像结果的回调队列
if (!window.__avatarWaiters) window.__avatarWaiters = {}

const src = ref(window.__avatarCache[`${props.type}_${props.id}`] || '')

const initial = ref(
  props.name ? props.name.charAt(0).toUpperCase() : (props.type === 'group' ? '群' : '?')
)

// 全局监听（只注册一次）
if (!window.__avatarListenerRegistered) {
  window.__avatarListenerRegistered = true
  ipcRenderer.on('home:getAvatarRes', (_event, data) => {
    const key = `${data.type}_${data.id}`
    window.__avatarPending.delete(key)

    if (data.success && data.data) {
      window.__avatarCache[key] = data.data
    }

    // 通知所有等待中的回调
    if (window.__avatarWaiters[key]) {
      window.__avatarWaiters[key].forEach(cb => cb(data))
      delete window.__avatarWaiters[key]
    }
  })
}

function requestAvatar() {
  const key = `${props.type}_${props.id}`

  // 内存缓存命中
  if (window.__avatarCache[key]) {
    src.value = window.__avatarCache[key]
    return
  }

  // 已有相同请求在进行中，排队等待
  if (window.__avatarPending.has(key)) {
    if (!window.__avatarWaiters[key]) window.__avatarWaiters[key] = []
    window.__avatarWaiters[key].push((data) => {
      if (data.success && data.data) src.value = data.data
    })
    return
  }

  // 发起新请求
  window.__avatarPending.add(key)
  ipcRenderer.send('home:getAvatar', { id: props.id, type: props.type })
}

onMounted(requestAvatar)

watch(() => [props.id, props.type], () => {
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
