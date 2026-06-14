import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  // --- state ---
  const user = ref(null)        // { id, username, nickname, avatar, status }
  const token = ref('')
  const serverUrl = ref('ws://localhost:8765')

  // --- getters ---
  const isAuthenticated = computed(() => !!token.value)
  const userId = computed(() => user.value?.id ?? null)

  // --- actions ---
  function setUser(userData) {
    user.value = userData
  }

  function setToken(t) {
    token.value = t
  }

  function logout() {
    user.value = null
    token.value = ''
  }

  return { user, token, serverUrl, isAuthenticated, userId, setUser, setToken, logout }
})
