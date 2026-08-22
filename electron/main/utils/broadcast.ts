import { BrowserWindow } from "electron";

/**
 * 向所有窗口广播事件
 * @param channel 通道名称
 * @param data 发送的数据
 * @param visibleOnly 仅发给可见窗口
 */
export const broadcast = (channel: string, data: unknown, visibleOnly = false): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    if (visibleOnly && !win.isVisible()) continue;
    win.webContents.send(channel, data);
  }
};
