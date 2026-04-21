# Cola Switch App

这里放的是 `Cola switch` 的 macOS 桌面壳。

## 构建

```bash
cd /Users/linyi/Documents/Playground/cola-switch
./build_app.sh
```

构建产物：

```bash
/Users/linyi/Documents/Playground/cola-switch/build/Cola Switch.app
```

## 说明

- 这是原生 macOS `WKWebView` 壳，不依赖 Electron
- 双击 app 时会自动启动内置的本地 `server.js`
- `node` 路径会在构建时写进 app 资源里，避免 Finder 打开时找不到 `node`
