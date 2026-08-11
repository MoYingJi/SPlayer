import { ipcMain } from "electron";
import {
  getGlobalShortcutMode,
  getPortalManager,
  isShortcutRegistered,
  registerShortcuts,
  unregisterShortcuts,
} from "../shortcut";
import { shortcutLog } from "../logger";
import { useStore } from "../store";
import mainWindow from "../windows/main-window";

/**
 * 初始化快捷键 IPC 主进程
 * @returns void
 */
const initShortcutIpc = (): void => {
  // 当前快捷键后端模式（portal / electron）
  ipcMain.handle("get-global-shortcut-mode", async () => getGlobalShortcutMode());

  // 快捷键是否被注册
  ipcMain.handle("is-shortcut-registered", async (_, shortcut: string) =>
    isShortcutRegistered(shortcut),
  );

  // 注册快捷键
  ipcMain.handle(
    "register-all-shortcut",
    async (_, allShortcuts: any): Promise<string[] | false> => {
      const mainWin = mainWindow.getWin();
      if (!mainWin || !allShortcuts) return false;
      // 收集所有已配置的全局快捷键
      const shortcuts: { key: string; shortcut: string }[] = [];
      for (const key in allShortcuts) {
        const shortcut: string = allShortcuts[key]?.globalShortcut;
        if (!shortcut) continue;
        shortcuts.push({ key, shortcut });
      }
      // 快捷键回调
      const failedShortcuts = await registerShortcuts(shortcuts, (key) =>
        mainWin.webContents.send(key),
      );
      return failedShortcuts;
    },
  );

  // 卸载所有快捷键
  ipcMain.on("unregister-all-shortcut", () => {
    void unregisterShortcuts();
  });

  // 打开系统快捷键配置界面（portal 模式）
  ipcMain.on("open-portal-shortcut-settings", async () => {
    const manager = await getPortalManager();
    if (manager) {
      try {
        await manager.configure();
      } catch (error) {
        shortcutLog.error("打开系统快捷键配置界面失败", error);
      }
    }
  });

  // 获取快捷键后端策略
  ipcMain.handle("get-shortcut-backend-preference", () => {
    return useStore().get("shortcutBackend");
  });

  // 设置快捷键后端策略（重启后生效）
  ipcMain.on("set-shortcut-backend-preference", (_, value: "auto" | "electron") => {
    useStore().set("shortcutBackend", value);
    shortcutLog.info(`快捷键后端策略已设为: ${value}（重启后生效）`);
  });
};

export default initShortcutIpc;
