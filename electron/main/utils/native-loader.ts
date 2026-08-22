import { app } from "electron";
import { createRequire } from "module";
import path from "path";
import { processLog } from "../logger";
import { resolveResourcesPath } from "./file-loader";

const requireNative = createRequire(import.meta.url);

export function resolveNativeModulePath(fileName: string, devDirName: string) {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), "native", devDirName, fileName);
  }

  const nativeModulePath = resolveResourcesPath("native", fileName);

  if (!nativeModulePath) {
    throw new Error(`[NativeLoader] 无法找到 ${fileName}，请确保已正确打包原生插件。`);
  }
  return nativeModulePath;
}

/**
 * 加载一个原生插件
 * @param fileName 编译后的文件名 (例如: "external-media-integration.node")
 * @param devDirName 开发环境下的目录名 (例如: "external-media-integration")，必须位于项目根目录的 native/ 下
 */
export function loadNativeModule(fileName: string, devDirName: string) {
  const nativeModulePath = resolveNativeModulePath(fileName, devDirName);

  try {
    return requireNative(nativeModulePath);
  } catch (error) {
    processLog.error(`[NativeLoader] 加载 ${fileName} 失败:`, error);
    return null;
  }
}
