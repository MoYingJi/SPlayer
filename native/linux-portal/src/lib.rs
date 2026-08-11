//! Linux 平台 XDG Desktop Portal 原生模块
//!
//! 目前实现了 GlobalShortcuts（全局快捷键），通过 portal 在 Wayland / X11 下
//! 替代 Electron 的 `globalShortcut`

mod shortcuts;
