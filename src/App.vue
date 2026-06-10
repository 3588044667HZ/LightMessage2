<template>
  <router-view />
</template>

<script setup>
// App shell — 所有页面切换由 Vue Router 驱动
</script>

<style>
/* 全局重置 */
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}
</style>
