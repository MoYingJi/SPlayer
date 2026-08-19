import type { SongType } from "@/types/main";
import { isMetaData, isMetaDataArray } from "@/types/main";
import { msToTime } from "@/utils/time";

/** 转义 CSV 单元格中的特殊字符 */
const escapeCsv = (value: string | number): string => {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * 导出歌曲列表为 CSV 文件
 * @param songs 歌曲列表
 * @param filename 文件名（不含扩展名）
 */
export const exportSongsToCsv = (songs: SongType[], filename: string = "splayer-songs") => {
  if (!songs.length) return;
  // 表头
  const header = ["标题", "歌手", "专辑", "时长"];
  // 数据行
  const rows = songs.map((song) => [
    song.name || "未知曲目",
    isMetaDataArray(song.artists)
      ? song.artists.map((ar) => ar.name).join(" / ")
      : song.artists || "未知歌手",
    isMetaData(song.album) ? song.album.name : song.album || "未知专辑",
    msToTime(song.duration || 0),
  ]);
  // 拼接 CSV 内容，添加 BOM 以支持 Excel 中文显示
  const csvContent =
    "\uFEFF" + [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
