import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import os from "os";

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    // Expose store API via preload
    contextBridge.exposeInMainWorld("api", {
      store: {
        get: (key: string) => ipcRenderer.invoke("store-get", key),
        set: (key: string, value: unknown) => ipcRenderer.invoke("store-set", key, value),
        has: (key: string) => ipcRenderer.invoke("store-has", key),
        delete: (key: string) => ipcRenderer.invoke("store-delete", key),
        reset: (keys?: string[]) => ipcRenderer.invoke("store-reset", keys),
        export: (data: any) => ipcRenderer.invoke("store-export", data),
        import: () => ipcRenderer.invoke("store-import"),
      },
      system: {
        osInfo: {
          type: os.type(),
          arch: os.arch(),
          release: os.release(),
        },
      },
      recognition: {
        isSupported: () => ipcRenderer.invoke("recognition:isSupported"),
        start: (config: { source: "system" | "microphone"; durationMs: number }) =>
          ipcRenderer.invoke("recognition:start", config),
        cancel: () => ipcRenderer.invoke("recognition:cancel"),
        submitPcm: (pcm: Float32Array) => ipcRenderer.invoke("recognition:submitPcm", pcm),
        onEvent: (callback: (event: unknown) => void) => {
          const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
          ipcRenderer.on("recognition:event", handler);
          return () => {
            ipcRenderer.removeListener("recognition:event", handler);
          };
        },
      },
    });
    // Expose logger API via preload
    contextBridge.exposeInMainWorld("logger", {
      info: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "info", message, args),
      warn: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "warn", message, args),
      error: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "error", message, args),
      debug: (message: string, ...args: unknown[]) =>
        ipcRenderer.send("renderer-log", "debug", message, args),
    });
  } catch (error) {
    console.error(error);
  }
}
