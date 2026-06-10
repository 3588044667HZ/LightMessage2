<template>
  <div class="home-layout">
    <aside class="sidebar">
      <ChatSidebar />
    </aside>
    <main class="main-area">
      <ChatWindow />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useIpc } from '@/composables/useIpc'
import ChatSidebar from '@/components/ChatSidebar.vue'
import ChatWindow from '@/components/ChatWindow.vue'

const chat = useChatStore()
const ipc = useIpc()

onMounted(() => {
  // 登录成功后加载用户数据（好友列表、群组列表等）
  ipc.on('home:LoadFriendsRes', (_event, data) => {
    chat.setFriends(data)
  })

  ipc.on('home:LoadGroupsRes', (_event, data) => {
    chat.setGroups(data)
  })
})
</script>

<style scoped>
.home-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  min-width: 320px;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
}
</style>
