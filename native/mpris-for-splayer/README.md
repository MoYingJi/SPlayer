# mpris-for-splayer

SPlayer Linux (MPV) 的原生 MPRIS 支持插件，基于 Rust + napi-rs。

## 功能
- 提供 MPRIS 控制接口（播放/暂停/上一首/下一首/进度/元数据等）
- 通过 napi-rs 导出，供 Electron 主进程调用
- 仅在 Linux 下启用，覆盖 Web Audio 的 mpris 方案

## 构建

```bash
cd native/mpris-for-splayer
pnpm i # 或 npm i
pnpm run build # 或 npm run build
```

## 用法

主进程加载后：
```js
const { SPlayerMpris } = require('mpris-for-splayer');
const mpris = new SPlayerMpris();
mpris.set_playback_status('Playing');
mpris.set_metadata({ title: 'xxx', artist: 'xxx' });
// ...
```

## 事件监听

如需监听 MPRIS 控制事件（如 play/pause/next/prev），可在 napi-rs 线程中实现回调。

---
MIT License
