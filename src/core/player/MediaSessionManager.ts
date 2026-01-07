import axios from "axios";
import { useMusicStore, useSettingStore } from "@/stores";
import { getPlaySongData } from "@/utils/format";
import { isElectron, isWin, isLinux } from "@/utils/env";
import { msToS } from "@/utils/time";
import { type SmtcEvent } from "@native";
import { usePlayerController } from "./PlayerController";
import { SmtcEventType, PlaybackStatus } from "@/types/smtc";
import {
  sendSmtcMetadata,
  sendSmtcTimeline,
  sendSmtcPlayState,
  sendDiscordMetadata,
  sendDiscordTimeline,
  sendDiscordPlayState,
  enableDiscordRpc,
  updateDiscordConfig,
  sendMprisMetadata,
  sendMprisTimeline,
  sendMprisPlayState,
} from "./PlayerIpc";
import { throttle } from "lodash-es";

/**
 * 媒体会话管理器，负责控制媒体控件相关功能
 *
 * 在 Windows 上，会使用原生插件来直接与 SMTC 交互以提供更多功能，在其他平台会使用 `navigator.mediaSession`
 * 在 Linux 上使用 MPV 引擎时，使用原生 MPRIS 插件提供更好的系统集成
 */
class MediaSessionManager {
  /**
   * 用来管理封面请求
   */
  private metadataAbortController: AbortController | null = null;

  /**
   * 检查是否应该使用原生 MPRIS (Linux + MPV 引擎)
   */
  private shouldUseNativeMpris(): boolean {
    if (!isElectron || !isLinux) return false;
    const settingStore = useSettingStore();
    return settingStore.playbackEngine === "mpv";
  }

  /**
   * 初始化 MediaSession
   */
  public init() {
    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen) return;

    const player = usePlayerController();

    if (isElectron) {
      if (isWin) {
        window.electron.ipcRenderer.removeAllListeners("smtc-event");

        window.electron.ipcRenderer.on("smtc-event", (_, event: SmtcEvent) => {
          switch (event.type) {
            case SmtcEventType.Play:
              player.play();
              break;
            case SmtcEventType.Pause:
              // 乐观更新以避免淡出延迟
              sendSmtcPlayState(PlaybackStatus.Paused);
              if (settingStore.discordRpc.enabled) {
                sendDiscordPlayState(PlaybackStatus.Paused);
              }
              player.pause();
              break;
            case SmtcEventType.NextSong:
              player.nextOrPrev("next");
              break;
            case SmtcEventType.PreviousSong:
              player.nextOrPrev("prev");
              break;
            case SmtcEventType.Stop:
              player.pause();
              break;
            case SmtcEventType.Seek:
              if (event.positionMs !== undefined) {
                player.setSeek(event.positionMs);
              }
              break;
            case SmtcEventType.ToggleShuffle:
              player.handleSmtcShuffle();
              break;
            case SmtcEventType.ToggleRepeat:
              player.handleSmtcRepeat();
              break;
          }
        });
        player.syncSmtcPlayMode();
      }

      // 在 Linux 上处理 MPRIS 事件
      if (!isWin && isLinux) {
        window.electron.ipcRenderer.removeAllListeners("mpris-event");

        window.electron.ipcRenderer.on("mpris-event", (_, event: any) => {
          console.log("[MPRIS] 收到系统事件:", event.eventType, event.value);
          switch (event.eventType) {
            case "play":
              player.play();
              break;
            case "pause":
              player.pause();
              break;
            case "play_pause":
              player.playOrPause();
              break;
            case "stop":
              player.pause();
              break;
            case "next":
              player.nextOrPrev("next");
              break;
            case "previous":
              player.nextOrPrev("prev");
              break;
            case "seek":
              if (event.value !== undefined) {
                // value 是相对偏移量（毫秒）
                const currentTime = player.getSeek();
                player.setSeek(currentTime + event.value);
              }
              break;
            case "set_position":
              if (event.value !== undefined) {
                // value 是绝对位置（毫秒）
                player.setSeek(event.value);
              }
              break;
          }
        });
      }

      // 初始化 Discord RPC
      if (settingStore.discordRpc.enabled) {
        enableDiscordRpc();
        updateDiscordConfig({
          showWhenPaused: settingStore.discordRpc.showWhenPaused,
          displayMode: settingStore.discordRpc.displayMode,
        });
      }

      if (isWin && settingStore.enableNativeSmtc) return;
    }

    // 在 Linux + MPV 下使用原生 MPRIS，不需要 navigator.mediaSession
    if (this.shouldUseNativeMpris()) {
      return;
    }

    if ("mediaSession" in navigator) {
      const nav = navigator.mediaSession;
      nav.setActionHandler("play", () => player.play());
      nav.setActionHandler("pause", () => player.pause());
      nav.setActionHandler("previoustrack", () => player.nextOrPrev("prev"));
      nav.setActionHandler("nexttrack", () => player.nextOrPrev("next"));
      nav.setActionHandler("seekto", (e) => {
        if (e.seekTime) player.setSeek(e.seekTime * 1000);
      });
    }
  }

  /**
   * 更新元数据
   */
  public async updateMetadata() {
    if (!("mediaSession" in navigator)) return;
    const musicStore = useMusicStore();
    const settingStore = useSettingStore();

    // 获取播放数据
    const song = getPlaySongData();
    if (!song) return;

    if (this.metadataAbortController) {
      this.metadataAbortController.abort();
    }
    this.metadataAbortController = new AbortController();
    const { signal } = this.metadataAbortController;

    const isRadio = song.type === "radio";
    const title = song.name;
    const artist = isRadio
      ? "播客电台"
      : Array.isArray(song.artists)
        ? song.artists.map((a) => a.name).join("/")
        : String(song.artists);
    const album = isRadio
      ? "播客电台"
      : typeof song.album === "object"
        ? song.album.name
        : String(song.album);
    const coverUrl = musicStore.getSongCover("xl") || musicStore.playSong.cover || "";

    // 更新元数据
    if (isElectron) {
      // 立即更新 Discord
      if (settingStore.discordRpc.enabled) {
        sendDiscordMetadata({
          songName: title,
          authorName: artist,
          albumName: album,
          originalCoverUrl: coverUrl.startsWith("http") ? coverUrl : undefined,
          duration: song.duration,
          ncmId: typeof song.id === "number" ? song.id : 0,
        });
      }

      // 原生 SMTC 支持 (Windows)，下载封面并更新
      if (isWin && settingStore.enableNativeSmtc) {
        try {
          let coverBuffer: Uint8Array | undefined;

          if (coverUrl && (coverUrl.startsWith("http") || coverUrl.startsWith("blob:"))) {
            const resp = await axios.get(coverUrl, {
              responseType: "arraybuffer",
              signal: signal,
            });
            coverBuffer = new Uint8Array(resp.data);
          }

          sendSmtcMetadata({
            songName: title,
            authorName: artist,
            albumName: album,
            coverData: coverBuffer as Buffer, // Electron 会帮我们处理转换的
            ncmId: typeof song.id === "number" ? song.id : 0, // 上传到 SMTC 的流派字段以便其他应用可以通过 ID 精确检测当前播放的歌曲
          });
        } catch (e) {
          if (!axios.isCancel(e)) {
            console.error("[SMTC] 更新元数据失败", e);
          }
        } finally {
          if (this.metadataAbortController?.signal === signal) {
            this.metadataAbortController = null;
          }
        }
        return; // Windows 且开启了原生 SMTC，则不执行后续的 navigator.mediaSession
      }

      // Linux + MPV 使用原生 MPRIS
      if (this.shouldUseNativeMpris()) {
        sendMprisMetadata({
          title,
          artist,
          album,
          length: song.duration,
          url: coverUrl,
        });
        return;
      }
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title,
        artist,
        album,
        artwork: [
          {
            src: musicStore.getSongCover("s") || musicStore.playSong.cover || "",
            sizes: "100x100",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("m") || musicStore.playSong.cover || "",
            sizes: "300x300",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("cover") || musicStore.playSong.cover || "",
            sizes: "512x512",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("l") || musicStore.playSong.cover || "",
            sizes: "1024x1024",
            type: "image/jpeg",
          },
          {
            src: musicStore.getSongCover("xl") || musicStore.playSong.cover || "",
            sizes: "1920x1920",
            type: "image/jpeg",
          },
        ],
      });
    }
  }

  /**
   * 更新状态
   * @param duration 总时长 (ms)
   * @param position 当前进度 (ms)
   */
  public updateState(duration: number, position: number) {
    const settingStore = useSettingStore();
    if (!settingStore.smtcOpen) return;

    if (isElectron) {
      if (settingStore.discordRpc.enabled) {
        sendDiscordTimeline(position, duration);
      }
      if (isWin && settingStore.enableNativeSmtc) {
        sendSmtcTimeline(position, duration);
        return;
      }
      // Linux + MPV 使用原生 MPRIS
      if (this.shouldUseNativeMpris()) {
        sendMprisTimeline(position, duration);
        return;
      }
    }
    this.throttledUpdatePositionState(duration, position);
  }

  /**
   * 更新播放状态到 MPRIS (仅 Linux + MPV)
   * @param isPlaying 是否正在播放
   */
  public updatePlaybackStatus(isPlaying: boolean) {
    if (this.shouldUseNativeMpris()) {
      sendMprisPlayState(isPlaying ? "Playing" : "Paused");
    }
  }

  /**
   * 媒体会话进度更新限流
   * 频繁的更新会导致 Linux 下的 MPRIS 进度条抽搐，因此限制更新频率
   */
  private throttledUpdatePositionState = throttle((duration: number, position: number) => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setPositionState({
        duration: msToS(duration),
        position: msToS(position),
      });
    }
  }, 1000);
}

/**
 * @see {@link MediaSessionManager}
 */
export const mediaSessionManager = new MediaSessionManager();
