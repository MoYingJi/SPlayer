import { ipcMain } from "electron";
import { MpvService } from "../services/MpvService";
import { processLog } from "../logger";

const initMpvIpc = (): void => {
    const mpvService = MpvService.getInstance();

    ipcMain.handle("mpv-start", async () => {
        try {
            await mpvService.start();
            return { success: true };
        } catch (e) {
            processLog.error("MPV 启动失败:", e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.on("mpv-stop", () => {
        mpvService.stop();
    });

    ipcMain.handle("mpv-play", async (_, url: string, title?: string, autoPlay: boolean = true) => {
        try {
            await mpvService.play(url, title, autoPlay);
            return { success: true };
        } catch (e) {
            processLog.error("MPV 播放失败:", e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.on("mpv-pause", () => {
        mpvService.pause();
    });

    ipcMain.on("mpv-resume", () => {
        mpvService.resume();
    });

    ipcMain.on("mpv-seek", (_, seconds: number) => {
        mpvService.seek(seconds);
    });

    ipcMain.on("mpv-set-volume", (_, volume: number) => {
        mpvService.setVolume(volume);
    });
};

export default initMpvIpc;
