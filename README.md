# Cola Switch

`Cola Switch` 是一个给 `Cola` 用的本地 API 切换工具。

它解决的就是一件事：不去手改 `~/.cola/settings.json`，而是通过一个简单的界面，直接把 Cola 当前使用的模型服务商和 API Key 切过去。

## 这个项目能做什么

- 读取并解析本机 `~/.cola/settings.json`
- 展示 Cola 当前正在使用的服务商、模型、Base URL
- 在界面里选择服务商并填写 API Key
- 一键把 Cola 切换到新的 provider / model / base URL
- 支持常见服务商预设
- 支持 macOS 原生桌面 app 形式启动
- 支持构建自包含的 macOS app，不依赖目标机器预装 Homebrew `node`

## 当前支持的服务商

- OpenAI
- Anthropic
- OpenRouter
- Kimi
- 智谱
- Grok / xAI
- Groq
- Cerebras
- Mistral
- Hugging Face Router
- Vercel AI Gateway
- MiniMax
- 自定义接入

## 项目结构

```text
cola-switch/
├── app-src/           # macOS 原生桌面壳
├── index.html         # 前端页面
├── styles.css         # 页面样式
├── script.js          # 前端交互逻辑
├── server.js          # 本地配置读写服务
├── build_app.sh       # 构建 macOS app
├── release_macos.sh   # 打正式发布包
└── APP.md             # app 相关说明
```

## 本地开发

要求：

- macOS
- Node.js

启动本地页面版：

```bash
cd cola-switch
node server.js
```

浏览器打开：

```bash
http://127.0.0.1:8765
```

## 构建桌面 App

构建：

```bash
cd cola-switch
./build_app.sh
```

输出：

```bash
build/Cola Switch.app
```

这份 app 现在是自包含的：

- 内置 `node`
- 内置运行所需动态库
- 不依赖目标机器安装 Homebrew `node`

## 怎么部署 / 发布

### 1. 本地测试版

直接打包：

```bash
cd cola-switch
./release_macos.sh
```

输出：

```bash
dist/Cola Switch-macos-arm64.zip
dist/Cola Switch-macos-arm64.dmg
```

说明：

- 当前默认产物是 Apple Silicon `arm64`
- 如果没有 Apple Developer 证书，这一步产出的只是“可分发测试版”
- 测试版可以发给熟人试用，但第一次打开可能会被 Gatekeeper 拦截

### 2. 正式发布版

要做成真正适合正式分发的 macOS 包，需要：

- `Developer ID Application` 签名证书
- `notarytool` 可用的 keychain profile

然后执行：

```bash
CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
NOTARY_KEYCHAIN_PROFILE="your-notary-profile" \
./release_macos.sh
```

脚本会自动完成：

- 构建 app
- 对 app 和内置运行时签名
- 生成 `zip`
- 生成 `dmg`
- 提交 notarization
- staple 公证结果

## 使用方式

打开后，默认只需要三步：

1. 选择服务商
2. 填 API Key
3. 点击 `保存并切换 Cola`

高级设置默认折叠，只有需要改入口、模型或自定义 Base URL 时才展开。

## 注意事项

- 这个工具会直接修改 `~/.cola/settings.json`
- 请只在你明确知道自己在切换 Cola 模型配置时使用
- 自定义接入需要你自己确认 provider id、base URL、模型名是正确的
- 当前构建和发布流程以 macOS 为主

## 状态

当前仓库适合做两类用途：

- 自己本地切换 Cola API
- 继续演进成正式分发的 macOS 工具
