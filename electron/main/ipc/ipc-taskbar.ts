import {
  DEFAULT_TASKBAR_LYRIC_SETTINGS,
  TASKBAR_IPC_CHANNELS,
  type SyncStatePayload,
  type TaskbarLyricSettings,
} from "@shared";
import { ipcMain } from "electron";
import { useStore } from "../store";
import mainWindow from "../windows/main-window";
import {
  applyTaskbarLyricLayout,
  createTaskbarLyricWindow,
  sendToTaskbarLyric,
  setTaskbarLyricVisible,
} from "../windows/taskbar-lyric-window";

/** 读取完整任务栏歌词配置 */
const getTaskbarConfig = (): TaskbarLyricSettings => {
  return useStore().get("taskbarLyric");
};

const initTaskbarIpc = () => {
  const store = useStore();

  // 启动时若上次为开启状态则恢复任务栏歌词窗口
  if (store.get("windowStates.taskbarLyric.visible")) {
    createTaskbarLyricWindow();
  }

  // 获取完整配置
  ipcMain.handle(TASKBAR_IPC_CHANNELS.GET_OPTION, () => getTaskbarConfig());

  // 设置配置（增量合并）
  ipcMain.on(
    TASKBAR_IPC_CHANNELS.SET_OPTION,
    (_event, option: Partial<TaskbarLyricSettings>, pushToWindow = true) => {
      if (!option) return;

      // 安全过滤：仅允许写入 DEFAULT_TASKBAR_LYRIC_SETTINGS 中定义的合法键
      const allowedKeys = Object.keys(DEFAULT_TASKBAR_LYRIC_SETTINGS);
      let layoutAffected = false;

      Object.entries(option).forEach(([key, value]) => {
        if (allowedKeys.includes(key)) {
          store.set(`taskbarLyric.${key}`, value);
          if (key === "position" || key === "autoMaxWidth" || key === "maxWidth") {
            layoutAffected = true;
          }
        }
      });

      // 推送配置变更到任务栏窗口
      if (pushToWindow) {
        sendToTaskbarLyric(TASKBAR_IPC_CHANNELS.CONFIG_CHANGE, getTaskbarConfig());
      }

      // 影响定位的配置变更后重算布局
      if (layoutAffected) applyTaskbarLyricLayout();
    },
  );

  // 设置窗口显隐
  ipcMain.on(TASKBAR_IPC_CHANNELS.SET_VISIBLE, (_event, visible: boolean) => {
    setTaskbarLyricVisible(visible);
  });

  // 转发播放状态到任务栏窗口
  ipcMain.on(TASKBAR_IPC_CHANNELS.SYNC_STATE, (_event, payload: SyncStatePayload) => {
    sendToTaskbarLyric(TASKBAR_IPC_CHANNELS.SYNC_STATE, payload);
  });

  // 转发播放进度到任务栏窗口
  ipcMain.on(TASKBAR_IPC_CHANNELS.SYNC_TICK, (_event, payload) => {
    sendToTaskbarLyric(TASKBAR_IPC_CHANNELS.SYNC_TICK, payload);
  });

  // 任务栏窗口请求初始数据：转发给主窗口，由其回推 full-hydration
  ipcMain.on(TASKBAR_IPC_CHANNELS.REQUEST_DATA, () => {
    const mainWin = mainWindow.getWin();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send(TASKBAR_IPC_CHANNELS.REQUEST_DATA);
    }
    applyTaskbarLyricLayout();
  });
};

export default initTaskbarIpc;
