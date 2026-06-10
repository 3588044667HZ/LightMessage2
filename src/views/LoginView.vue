<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1>内网即时通讯系统</h1>
        <p>安全 · 高效 · 便捷</p>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <div class="input-with-icon">
            <span class="icon">👤</span>
            <input
                v-model="form.userid"
                type="text"
                class="form-control"
                placeholder="请输入用户ID"
                required
            />
          </div>
        </div>

        <div class="form-group">
          <div class="input-with-icon">
            <span class="icon">🔒</span>
            <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="form-control"
                placeholder="请输入密码"
                required
            />
          </div>
        </div>

        <div class="form-group">
          <div class="input-with-icon">
            <span class="icon">🌐</span>
            <input
                v-model="form.server"
                type="text"
                class="form-control"
                placeholder="ws://localhost:8765"
                required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="form.rememberMe" type="checkbox"/>
            记住我
          </label>
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import {ref, reactive} from 'vue'
import {useRouter} from 'vue-router'
import {useAuthStore} from '@/stores/auth'
import {ipcOn} from '@/composables/useIpc'

const {ipcRenderer} = window.require('electron')
const router = useRouter()
const auth = useAuthStore()

const form = reactive({
  userid: '',
  password: '',
  server: 'ws://localhost:8765',
  rememberMe: false
})

const showPassword = ref(false)
const loading = ref(false)
const errorMsg = ref('')

// 监听登录结果
ipcOn('login:success', (_event, data) => {
  console.log('[LoginView] login:success received:', data)
  auth.setUser({
    id: data.user_id,
    username: data.username,
    avatar: data.user_info?.avatar,
    status: data.user_info?.status
  })
  auth.setToken(data.token)
  loading.value = false
  router.push('/home')
})

ipcOn('login:error', (_event, data) => {
  errorMsg.value = data.message || '登录失败'
  loading.value = false
})

function handleLogin() {
  errorMsg.value = ''
  loading.value = true

  ipcRenderer.send(
      'login',
      Number(form.userid),
      form.password,
      form.rememberMe,
      form.server
  );

  // 15 秒超时保护
  setTimeout(() => {
    if (loading.value) {
      errorMsg.value = '登录超时，请检查服务器连接'
      loading.value = false
    }
  }, 15000)
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-header h1 {
  color: #2c3e50;
  font-size: 26px;
  font-weight: 600;
}

.login-header p {
  color: #7f8c8d;
  font-size: 14px;
  margin-top: 6px;
}

.form-group {
  margin-bottom: 20px;
}

.input-with-icon {
  position: relative;
}

.input-with-icon .icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.form-control {
  width: 100%;
  height: 42px;
  padding: 8px 12px 8px 40px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
}

.login-btn {
  width: 100%;
  height: 46px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.login-btn:hover {
  opacity: 0.9;
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  color: #f5222d;
  font-size: 13px;
  text-align: center;
  margin-top: 12px;
}
</style>
