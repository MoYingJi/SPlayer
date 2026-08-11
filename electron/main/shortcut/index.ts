import { globalShortcut } from "electron";
import { shortcutLog } from "../logger";
import { useStore } from "../store";
import { loadNativeModule } from "../utils/native-loader";

export type GlobalShortcutMode = "portal" | "electron";

/** portal 模式使用的默认全局快捷键（与渲染进程 shortcut store 默认值一致） */
const PORTAL_DEFAULT_SHORTCUTS: Record<string, { name: string; shortcut?: string }> = {
  playOrPause: { name: "播放 / 暂停", shortcut: "CmdOrCtrl+Shift+Space" },
  playPrev: { name: "上一曲", shortcut: "CmdOrCtrl+Shift+Left" },
  playNext: { name: "下一曲", shortcut: "CmdOrCtrl+Shift+Right" },
  seekForward: { name: "快进 5 秒" },
  seekBackward: { name: "快退 5 秒" },
  volumeUp: { name: "音量加", shortcut: "CmdOrCtrl+Shift+Up" },
  volumeDown: { name: "音量减", shortcut: "CmdOrCtrl+Shift+Down" },
  "toggle-desktop-lyric": { name: "桌面歌词", shortcut: "CmdOrCtrl+Shift+D" },
};

/** 全部全局快捷键的固定顺序 */
const GLOBAL_SHORTCUT_ORDER: string[] = [
  "playOrPause",
  "playPrev",
  "playNext",
  "seekForward",
  "seekBackward",
  "volumeUp",
  "volumeDown",
  "toggle-desktop-lyric",
];

/** linux-portal 原生模块的类型 */
type PortalModule = typeof import("@native/linux-portal");

/** 快捷键后端接口 */
interface ShortcutBackend {
  readonly mode: GlobalShortcutMode;
  registerAll(
    shortcuts: { key: string; shortcut: string }[],
    onTrigger: (key: string) => void,
  ): Promise<string[]>;
  unregisterAll(): Promise<void>;
  isRegistered(shortcut: string): boolean;
  dispose(): void;
}

/** 基于 electron.globalShortcut 的后端 */
class ElectronBackend implements ShortcutBackend {
  readonly mode: GlobalShortcutMode = "electron";

  async registerAll(
    shortcuts: { key: string; shortcut: string }[],
    onTrigger: (key: string) => void,
  ): Promise<string[]> {
    // 先卸载旧的，再重新注册，避免重复
    globalShortcut.unregisterAll();
    const failedShortcuts: string[] = [];
    for (const { key, shortcut } of shortcuts) {
      try {
        const success = globalShortcut.register(shortcut, () => onTrigger(key));
        if (!success) {
          shortcutLog.error(`❌ Failed to register shortcut: ${shortcut}`);
          failedShortcuts.push(shortcut);
        } else {
          shortcutLog.info(`✅ Shortcut registered: ${shortcut}`);
        }
      } catch (error) {
        shortcutLog.error(`ℹ️ Error registering shortcut ${shortcut}:`, error);
        failedShortcuts.push(shortcut);
      }
    }
    return failedShortcuts;
  }

  async unregisterAll(): Promise<void> {
    globalShortcut.unregisterAll();
    shortcutLog.info("🚫 All shortcuts unregistered.");
  }

  isRegistered(shortcut: string): boolean {
    return globalShortcut.isRegistered(shortcut);
  }

  dispose(): void {
    globalShortcut.unregisterAll();
  }
}

/** 基于 XDG Desktop Portal 的后端 */
class PortalBackend implements ShortcutBackend {
  readonly mode: GlobalShortcutMode = "portal";
  private portal: PortalModule;
  private manager: InstanceType<PortalModule["GlobalShortcuts"]> | null = null;
  private onTrigger: ((key: string) => void) | null = null;

  constructor(portal: PortalModule) {
    this.portal = portal;
  }

  /**
   * 回调路由：portal 模式下 JS 回调的 shortcutId 就是 IPC trigger key
   */
  private handleActivated = (event: any): void => {
    this.onTrigger?.(event.shortcutId);
  };

  private ensureManager(): InstanceType<PortalModule["GlobalShortcuts"]> {
    if (!this.manager) {
      this.manager = new this.portal.GlobalShortcuts(this.handleActivated);
    }
    return this.manager;
  }

  /** 公开获取管理器实例，供外部调用 configure() 等 */
  getManager(): InstanceType<PortalModule["GlobalShortcuts"]> {
    return this.ensureManager();
  }

  /**
   * 异步探测 portal 可用性，失败时 reject 以便调用方回退 electron
   */
  async createAsync(): Promise<PortalBackend> {
    const manager = this.ensureManager();
    const supported = await manager.isSupported();
    if (!supported) {
      manager.dispose();
      this.manager = null;
      throw new Error("portal 接口不可用");
    }
    return this;
  }

  async registerAll(
    _shortcuts: { key: string; shortcut: string }[],
    onTrigger: (key: string) => void,
  ): Promise<string[]> {
    this.onTrigger = onTrigger;
    const manager = this.ensureManager();
    // portal 模式下无法自定义快捷键，必须传入全部快捷键且顺序固定，
    // 忽略调用方传入的 partial 列表，按固定顺序构造完整描述
    const descriptors = GLOBAL_SHORTCUT_ORDER.map((key) => {
      const preset = PORTAL_DEFAULT_SHORTCUTS[key];
      if (!preset) return null;
      // preferShortcut 为可选项：有默认键则转成推荐键，没有则让用户在系统设置里配置
      return {
        id: key,
        description: preset.name,
        preferShortcut: preset.shortcut,
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    const failed = await manager.bind(descriptors);
    shortcutLog.info(
      `🎹 Portal 绑定完成，共 ${GLOBAL_SHORTCUT_ORDER.length} 个，失败 ${failed.length} 个`,
    );
    return failed;
  }

  async unregisterAll(): Promise<void> {
    if (this.manager) {
      try {
        await this.manager.unbind();
        shortcutLog.info("🚫 Portal 快捷键已解绑");
      } catch (error) {
        shortcutLog.error("Portal 解绑失败", error);
      }
    }
  }

  isRegistered(): boolean {
    // portal 无法查询快捷键占用，恒返回 false
    return false;
  }

  dispose(): void {
    this.manager?.dispose();
    this.manager = null;
  }
}

/** 当前快捷键后端（惰性初始化） */
let backend: ShortcutBackend | null = null;
let backendReady = false;
let backendProm: Promise<ShortcutBackend> | null = null;

/**
 * 创建后端：仅 Linux 且 portal 可用时使用 portal，否则回退 electron
 *
 * portal 的可用性探测走异步 IPC（常驻 runtime），失败时自动回退 electron，
 * 不会因 portal 异常导致快捷键功能整体不可用
 */
const createBackend = (): Promise<ShortcutBackend> => {
  // 用户在设置里显式关闭 portal，强制回退 electron
  if (process.platform === "linux" && useStore().get("shortcutBackend") === "electron") {
    shortcutLog.info("🚫 已按设置强制使用 electron.globalShortcut，跳过 portal");
  } else if (process.platform === "linux") {
    try {
      const portal = loadNativeModule("linux-portal.node", "linux-portal") as PortalModule | null;
      if (portal && portal.GlobalShortcuts) {
        shortcutLog.info("🎹 检测到 linux-portal 模块，探测 portal 可用性...");
        return new PortalBackend(portal).createAsync().then(
          (pb) => {
            shortcutLog.info("🎹 已启用 XDG Desktop Portal 全局快捷键");
            return pb;
          },
          (err) => {
            shortcutLog.error("portal 不可用，回退 electron.globalShortcut", err);
            return new ElectronBackend();
          },
        );
      }
      shortcutLog.warn("portal 模块不可用，回退 electron.globalShortcut");
    } catch (error) {
      shortcutLog.error("加载 portal 模块失败，回退 electron.globalShortcut", error);
    }
  }
  return Promise.resolve(new ElectronBackend());
};

/** 获取快捷键后端（异步，内部保证只初始化一次，失败时自动回退 electron） */
const getBackendAsync = async (): Promise<ShortcutBackend> => {
  if (backendReady) return backend!;
  if (!backendProm) {
    backendProm = createBackend().then((b) => {
      backend = b;
      backendReady = true;
      shortcutLog.info(`当前快捷键后端: ${b.mode}`);
      return b;
    });
  }
  return backendProm;
};

/** 当前快捷键后端模式 */
export const getGlobalShortcutMode = async (): Promise<GlobalShortcutMode> =>
  (await getBackendAsync()).mode;

/** 注册全部全局快捷键，返回失败的快捷键列表 */
export const registerShortcuts = async (
  shortcuts: { key: string; shortcut: string }[],
  onTrigger: (key: string) => void,
): Promise<string[]> => {
  const b = await getBackendAsync();
  return b.registerAll(shortcuts, onTrigger);
};

/** 检查快捷键是否被占用 */
export const isShortcutRegistered = async (shortcut: string): Promise<boolean> =>
  (await getBackendAsync()).isRegistered(shortcut);

/** 卸载全部快捷键 */
export const unregisterShortcuts = async (): Promise<void> => {
  const b = await getBackendAsync();
  await b.unregisterAll();
};

/** 释放后端资源（应用退出时调用） */
export const disposeShortcuts = (): void => {
  if (backend) {
    backend.dispose();
    backend = null;
    backendReady = false;
    backendProm = null;
  }
};

/**
 * 获取 portal 管理器实例（portal 模式下有效，electron 模式返回 null）
 *
 * 供 IPC 打开系统快捷键配置界面使用
 */
export const getPortalManager = async (): Promise<
  InstanceType<PortalModule["GlobalShortcuts"]> | null
> => {
  const b = await getBackendAsync();
  if (b instanceof PortalBackend) {
    return b.getManager();
  }
  return null;
};
