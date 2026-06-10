<template>
  <div class="home-layout">
    <aside class="sidebar">
      <ChatSidebar/>
    </aside>
    <main class="main-area">
      <ChatWindow/>
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useIpc } from '@/composables/useIpc'
import ChatSidebar from '@/components/ChatSidebar.vue'
import ChatWindow from '@/components/ChatWindow.vue'

const { ipcRenderer } = window.require('electron')
const chat = useChatStore()
const ipc = useIpc()

onMounted(() => {
  // 监听好友列表推送
  ipc.on('home:LoadFriendsRes', (_event, data) => {
    console.log('[HomeView] 收到好友列表:', data?.length, '条')
    chat.setFriends(data)
  })

  // 监听群组列表推送
  ipc.on('home:LoadGroupsRes', (_event, data) => {
    console.log('[HomeView] 收到群组列表:', data?.length, '条')
    chat.setGroups(data)
  })

  // 通知主进程加载好友和群组数据
  console.log('[HomeView] 请求加载用户数据')
  ipcRenderer.send('home:LoadUserData')
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
