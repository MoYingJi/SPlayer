import { app } from "electron";
import path from "path";
import { createRequire } from "module";
import { processLog } from "../logger";

const requireNative = createRequire(import.meta.url);

/**
 * 加载一个原生插件
 * @param fileName 编译后的文件名 (例如: "smtc-for-splayer.node")
 * @param devDirName 开发环境下的目录名 (例如: "smtc-for-splayer")，必须位于项目根目录的 native/ 下
 */
export function loadNativeModule(fileName: string, devDirName: string) {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, "native")
    : path.join(process.cwd(), "native", devDirName);

  const candidates: string[] = [path.join(baseDir, fileName)];

  // 平台后缀的备用文件名（@napi-rs/cli 默认行为）
  if (process.platform === "linux") {
    const alt = fileName.replace(/\.node$/, ".linux-x64-gnu.node");
    candidates.push(path.join(baseDir, alt));
  }

  for (const p of candidates) {
    try {
      return requireNative(p);
    } catch (error) {
      processLog.warn(`[NativeLoader] 尝试加载失败: ${p}`, error);
      continue;
    }
  }

  processLog.error(`[NativeLoader] 加载 ${fileName} 失败，已尝试候选:`, candidates);
  return null;
}
