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

  // ===== 好友请求通知 =====

  // 收到好友申请（别人发给我们的）
  ipc.on('home:friendRequestReceive', (_event, data) => {
    console.log('[HomeView] 收到好友申请:', data)
    chat.addNotification({
      type: 'friend_request',
      title: '好友申请',
      senderId: data.sender_id || data.from_id || data.id,
      senderName: data.sender_name || data.from_name || '',
      invitationId: data.invitation_id || data.id,
      reason: data.reason || '',
      responded: false
    })
    // 自动切到通知标签页
    chat.activeTab = 'notifications'
  })

  // 好友申请被拒绝（服务端推送给申请者）
  ipc.on('home:friendRequestReject', (_event, data) => {
    console.log('[HomeView] 好友申请被拒绝:', data)
    chat.addNotification({
      type: 'friend_request_rejected',
      title: '好友申请被拒绝',
      senderId: data.sender_id || data.from_id || data.id,
      senderName: data.sender_name || data.from_name || '',
      reason: data.reason || ''
    })
  })

  // 好友申请被接受（服务端推送给申请者）
  ipc.on('home:friendRequestAccept', (_event, data) => {
    console.log('[HomeView] 好友申请被接受:', data)
    chat.addNotification({
      type: 'friend_request_accepted',
      title: '好友申请已通过',
      senderId: data.sender_id || data.from_id || data.id,
      senderName: data.sender_name || data.from_name || ''
    })
    // 刷新好友列表
    ipcRenderer.send('home:LoadUserData')
  })

  // 好友申请被接受（服务端推送给申请者，通过 MessageSendResponse 或自定义事件）
  // 注意：如果服务端有专用推送事件，需要在此处监听

  // ===== 群组通知 =====

  ipc.on('home:groupNotification', (_event, data) => {
    console.log('[HomeView] 群组通知:', data)
    chat.addNotification({
      type: 'group_notification',
      title: '群组通知',
      message: data.message || data.reason || '',
      groupId: data.group_id
    })
  })

  ipc.on('home:groupInvitation', (_event, data) => {
    console.log('[HomeView] 群组邀请:', data)
    chat.addNotification({
      type: 'group_invitation',
      title: '群组邀请',
      message: data.message || '',
      groupId: data.group_id,
      inviterName: data.inviter_name || ''
    })
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
