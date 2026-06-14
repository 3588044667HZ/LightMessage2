const { packager } = require('@electron/packager')
const path = require('path')

const ignorePatterns = [
  /^\/src\//,                             // 源码目录
  /^\/data\//,                            // 运行时数据目录（注意不要匹配 database.js）
  /^\/home\//,                            // 旧版文件
  /^\/release\//,                         // 旧打包输出
  /^\/build\//,                           // 打包输出目录
  /^\/node_modules\/@electron-forge/,     // 不需要的 dev 依赖
  /^\/node_modules\/electron-builder/,
  /\/vite\.config/,                       // Vite 配置
  /\/tsconfig/,                           // TS 配置
  /\.md$/,                                // Markdown 文件
  /^\/Login\.html$/,                      // 旧版页面
  /^\/index\.old\.html$/,
  /^\/Login\.js$/,                        // 旧版脚本
  /^\/message\.js$/,
  /^\/database-test\.js$/,                // 测试文件
  /^\/\.idea/,                            // IDE 配置
  /^\/typings\//,                         // 类型定义目录
  /^\/electron-builder\.yml$/,            // builder 配置
  /^\/\.gitignore$/,
  /^\/build-win\.js$/,                    // 打包脚本自身
  /^\/test-ignore\.js$/,
  /^\/refactor-analysis/
]

async function build() {
  console.log('开始打包 LightMessage (win32-x64)...')
  try {
    const appPaths = await packager({
      dir: '.',
      name: 'LightMessage',
      platform: 'win32',
      arch: 'x64',
      out: 'release',
      overwrite: true,
      asar: false,
      noPrune: false,
      ignore: ignorePatterns,
      appCopyright: 'Copyright 2026 LightMessage'
    })
    console.log('打包完成:', appPaths)
  } catch (err) {
    console.error('打包失败:', err)
    process.exit(1)
  }
}

build()
