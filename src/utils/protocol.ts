import { songDetail } from "@/api/song";
import { formatSongsList } from "@/utils/format";
import { usePlayerController } from "@/core/player/PlayerController";
import router from "@/router";
import { openCopySongInfo } from "@/utils/modal";

class ProtocolData {
  constructor(type: string, id: number, cmd: string) {
    this.type = type;
    this.id = id;
    this.cmd = cmd;
  }

  type: string;
  id: number;
  cmd: string;
}

/**
 * 发送 注册/取消注册 协议的 Ipc
 * @param protocol 协议名
 * @param register true 则注册，false 则取消注册
 */
export const sendRegisterProtocol = (protocol: string, register: boolean = true) => {
  if (register) {
    window.electron.ipcRenderer.send("register-protocol", protocol);
  } else {
    window.electron.ipcRenderer.send("unregister-protocol", protocol);
  }
};

export const handleProtocolUrl = (url: string) => {
  switch (true) {
    case url.startsWith("splayer://"):
      handleOpenSplayer(url);
      break;
    case url.startsWith("orpheus://"):
      handleOpenOrpheus(url);
      break;
    default:
      break;
  }
};

export const handleProtocol = async (data: ProtocolData) => {
  if (data.cmd === "play") {
    switch (data.type) {
      case "song": {
        const player = usePlayerController();
        const result = await songDetail(data.id);
        const song = formatSongsList(result.songs)[0];
        player.addNextSong(song, true);
        return;
      }
      // 暂时将 play album 和 playlist 写成打开
      case "album":
      case "playlist":
        data.cmd = "open";
        break;
      default:
        console.error("❌ Unsupported Type for open:", data.type);
        return;
    }
  }

  // 自定义命令 open
  if (data.cmd === "open") {
    switch (data.type) {
      case "album":
        router.push({ name: "album", query: { id: data.id } });
        return;
      case "playlist":
        router.push({ name: "playlist", query: { id: data.id } });
        return;
      default:
        console.error("❌ Unsupported Type for open:", data);
        return;
    }
  }

  // 不支持
  console.error("❌ Unsupported Command or Type:", data);
};

/**
 * 处理 splayer:// 协议
 * 参数为歌曲 ID，跳转到歌曲所属专辑页面，并打开歌曲详情复制弹窗
 * 形如 `splayer://1826361712`
 */
export const handleOpenSplayer = async (url: string) => {
  const songId = parseSplayerId(url);
  if (!songId) {
    const p = parseProtocolData(url, "splayer");
    if (p) await handleProtocol(p);
    return;
  }

  const result = await songDetail(songId);
  const song = formatSongsList(result.songs)[0];
  if (!song) {
    window.$message.error("获取歌曲详情失败");
    return;
  }
  // 跳转到专辑页面
  if (typeof song.album === "object" && song.album.id) {
    router.push({ name: "album", query: { id: song.album.id } });
  }
  // 打开歌曲详情复制弹窗
  openCopySongInfo(songId);
};

const parseSplayerId = (url: string): number | undefined => {
  if (!url.startsWith("splayer://")) return;
  const raw = url.replace("splayer://", "").replace(/\/+$/, "");
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) {
    // console.error("❌ Invalid SPlayer protocol URL:", url);
    return;
  }
  return id;
};

export const handleOpenOrpheus = async (url: string) => {
  const data = parseProtocolData(url, "orpheus");
  if (!data) {
    console.error("❌ Invalid Orpheus protocol URL:", url);
    return;
  }
  console.info("🚀 Open Orpheus:", data);
  await handleProtocol(data);
};

const parseProtocolData = (url: string, scheme: string = "orpheus"): ProtocolData | undefined => {
  const prefix = `${scheme}://`;
  if (!url.startsWith(prefix)) return;
  let path = url.replace(prefix, "");
  // 移除末尾可能存在的斜杠
  if (path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  // 尝试 URL 解码
  try {
    path = decodeURIComponent(path);
  } catch (e) {
    console.warn("URL Decode failed, using original path:", e);
  }

  const base64jsonProtocol = tryParseProtocolBase64Json(path);
  if (base64jsonProtocol) return base64jsonProtocol;

  const resourcePathProtocol = tryParseProtocolResourcePath(path);
  if (resourcePathProtocol) return resourcePathProtocol;

  return;
};

const tryParseProtocolBase64Json = (path: string): ProtocolData | undefined => {
  // 这里的协议是从网页端打开官方客户端的协议
  // 形如 `orpheus://eyJ0eXBlIjoic29uZyIsImlkIjoiMTgyNjM2MTcxMiIsImNtZCI6InBsYXkifQ==`
  // URI 的 Path 部分是 Base64 编码过的，解码后得到 Json
  // 形如 `{"type":"song","id":"1826361712","cmd":"play"}`

  // 处理 URL-safe Base64
  path = path.replace(/-/g, "+").replace(/_/g, "/");
  // 补全 Base64 填充
  const padding = path.length % 4;
  if (padding > 0) {
    path += "=".repeat(4 - padding);
  }

  let jsonString: string;
  try {
    jsonString = atob(path);
  } catch (e) {
    // console.error("❌ Failed to decode base64:", path, e);
    return;
  }

  let json: any;
  try {
    json = JSON.parse(jsonString);
  } catch (e) {
    // console.error("❌ Failed to parse JSON:", e);
    return;
  }

  let data: ProtocolData;
  try {
    data = new ProtocolData(json.type, json.id, json.cmd);
  } catch (e) {
    console.error("❌ Invalid Data:", e);
    return;
  }

  return data;
};

const tryParseProtocolResourcePath = (path: string): ProtocolData | undefined => {
  const segments = path.split("?")[0].split("/");
  switch (segments[0]) {
    case "song": {
      const id = Number(segments[1]);
      if (Number.isNaN(id)) {
        console.error("❌ Invalid Song ID:", segments[1]);
        return;
      }
      return new ProtocolData("song", id, "play");
    }
    case "playlist": {
      const id = Number(segments[1]);
      if (Number.isNaN(id)) {
        console.error("❌ Invalid Playlist ID:", segments[1]);
        return;
      }
      return new ProtocolData("playlist", id, "open");
    }
    case "album": {
      const id = Number(segments[1]);
      if (Number.isNaN(id)) {
        console.error("❌ Invalid Album ID:", segments[1]);
        return;
      }
      return new ProtocolData("album", id, "open");
    }
  }
  return;
};
