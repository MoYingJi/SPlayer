import { cloneDeep } from "lodash-es";
import { defineStore } from "pinia";

/** 全局快捷键默认值（portal 模式下固定使用，需与主进程 PORTAL_DEFAULT_SHORTCUTS 保持一致） */
export const DEFAULT_GLOBAL_SHORTCUTS: Record<string, string> = {
  playOrPause: "CmdOrCtrl+Shift+Space",
  playPrev: "CmdOrCtrl+Shift+Left",
  playNext: "CmdOrCtrl+Shift+Right",
  seekForward: "",
  seekBackward: "",
  volumeUp: "CmdOrCtrl+Shift+Up",
  volumeDown: "CmdOrCtrl+Shift+Down",
  "toggle-desktop-lyric": "CmdOrCtrl+Shift+D",
};

type ShortcutType = {
  name: string;
  shortcut: string;
  globalShortcut: string;
  // 是否被注册
  isRegistered?: boolean;
};

interface ShortcutStore {
  globalOpen: boolean;
  // 全局快捷键后端模式（portal 模式下无法自定义快捷键）
  globalShortcutMode: "portal" | "electron";
  // 快捷键后端策略（Linux 下可强制关闭 portal 回退 electron）
  shortcutBackendPreference: "auto" | "electron";
  shortcutList: {
    playOrPause: ShortcutType;
    playPrev: ShortcutType;
    playNext: ShortcutType;
    seekForward: ShortcutType;
    seekBackward: ShortcutType;
    volumeUp: ShortcutType;
    volumeDown: ShortcutType;
    "toggle-desktop-lyric": ShortcutType;
    openPlayer: ShortcutType;
    openPlayList: ShortcutType;
    closePlayer: ShortcutType;
  };
}

export const useShortcutStore = defineStore("shortcut", {
  state: (): ShortcutStore => ({
    // 全局快捷键开启
    globalOpen: true,
    // 默认 electron，注册前会从主进程获取真实模式
    globalShortcutMode: "electron",
    // 默认 auto，由主进程决定（portal 可用则用）
    shortcutBackendPreference: "auto",
    // 全部快捷键
    shortcutList: {
      // 播放或暂停
      playOrPause: {
        name: "播放 / 暂停",
        shortcut: "CmdOrCtrl+Space",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS.playOrPause,
      },
      // 上一曲 / 下一曲
      playPrev: {
        name: "上一曲",
        shortcut: "CmdOrCtrl+ArrowLeft",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS.playPrev,
      },
      playNext: {
        name: "下一曲",
        shortcut: "CmdOrCtrl+ArrowRight",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS.playNext,
      },
      // 快进 / 快退
      seekForward: {
        name: "快进 5 秒",
        shortcut: "ArrowRight",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS.seekForward,
      },
      seekBackward: {
        name: "快退 5 秒",
        shortcut: "ArrowLeft",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS.seekBackward,
      },
      // 音量加减
      volumeUp: {
        name: "音量加",
        shortcut: "CmdOrCtrl+ArrowUp",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS.volumeUp,
      },
      volumeDown: {
        name: "音量减",
        shortcut: "CmdOrCtrl+ArrowDown",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS.volumeDown,
      },
      // 桌面歌词
      "toggle-desktop-lyric": {
        name: "桌面歌词",
        shortcut: "CmdOrCtrl+KeyD",
        globalShortcut: DEFAULT_GLOBAL_SHORTCUTS["toggle-desktop-lyric"],
      },
      // 打开播放界面
      openPlayer: {
        name: "打开播放界面",
        shortcut: "KeyP",
        globalShortcut: "",
      },
      // 打开播放列表
      openPlayList: {
        name: "打开播放列表",
        shortcut: "KeyL",
        globalShortcut: "",
      },
      // 关闭播放界面
      closePlayer: {
        name: "关闭播放界面",
        shortcut: "Escape",
        globalShortcut: "",
      },
    },
  }),
  getters: {},
  actions: {
    // 获取全局快捷键后端模式（portal / electron）
    async initGlobalShortcutMode() {
      const mode = await window.electron.ipcRenderer.invoke("get-global-shortcut-mode");
      this.globalShortcutMode = mode;
      this.shortcutBackendPreference = await window.electron.ipcRenderer.invoke(
        "get-shortcut-backend-preference",
      );
    },
    // 设置快捷键后端策略（重启后生效）
    async setShortcutBackendPreference(value: "auto" | "electron") {
      await window.electron.ipcRenderer.send("set-shortcut-backend-preference", value);
      this.shortcutBackendPreference = value;
    },
    // 注册全部全局快捷键
    async registerAllShortcuts() {
      if (!this.globalOpen) return;
      const result = await window.electron.ipcRenderer.invoke(
        "register-all-shortcut",
        cloneDeep(this.shortcutList),
      );
      console.log(result);
      return result;
    },
  },
  // 持久化（模式字段由主进程实时决定，不持久化）
  persist: {
    key: "shortcut-store",
    storage: localStorage,
    omit: ["globalShortcutMode", "shortcutBackendPreference"],
  },
});
