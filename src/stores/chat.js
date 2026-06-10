import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useChatStore = defineStore('chat', () => {
  // --- state ---
  const conversations = ref([])
  const friends = ref([])
  const groups = ref([])
  const notifications = ref([])
  const currentChat = ref(null)      // { id, type: 'friend' | 'group' }
  const activeTab = ref('conversations')
  const searchKeyword = ref('')

  // 字典缓存（与数组保持同步）
  const friendsMap = ref({})          // { [userId]: friendObj }
  const groupsMap = ref({})           // { [groupId]: groupObj }
  const chatHistory = ref({})         // { "type_id": { messages: [], lastMessageId } }

  // --- getters ---
  const unreadNotificationCount = computed(() =>
    notifications.value.filter(n => !n.read).length
  )

  const currentMessages = computed(() => {
    if (!currentChat.value) return []
    const key = `${currentChat.value.type}_${currentChat.value.id}`
    return chatHistory.value[key]?.messages ?? []
  })

  // --- actions ---
  function selectChat(targetId, type) {
    currentChat.value = { id: targetId, type }
  }

  function setFriends(list) {
    friends.value = list
    friendsMap.value = Object.fromEntries(list.map(f => [f.id, f]))
  }

  function setGroups(list) {
    groups.value = list
    groupsMap.value = Object.fromEntries(list.map(g => [g.id, g]))
  }

  function appendMessage(type, targetId, msg) {
    const key = `${type}_${targetId}`
    if (!chatHistory.value[key]) {
      chatHistory.value[key] = { messages: [], lastMessageId: null }
    }
    chatHistory.value[key].messages.push(msg)
    if (msg.message_id) {
      chatHistory.value[key].lastMessageId = String(msg.message_id)
    }
  }

  function addNotification(notification) {
    notifications.value.unshift({
      id: Date.now(),
      read: false,
      ...notification
    })
  }

  function clearUnreadNotifications() {
    notifications.value.forEach(n => (n.read = true))
  }

  return {
    conversations, friends, groups, notifications,
    currentChat, activeTab, searchKeyword,
    friendsMap, groupsMap, chatHistory,
    unreadNotificationCount, currentMessages,
    selectChat, setFriends, setGroups,
    appendMessage, addNotification, clearUnreadNotifications
  }
})
