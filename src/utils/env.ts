/** 是否为开发环境 */
export const isDev = import.meta.env.MODE === "development" || import.meta.env.DEV;

/** 系统判断 */
export const userAgent = window.navigator.userAgent;

/** 是否为 Windows 系统 */
export const isWin = userAgent.includes("Windows");
/** 是否为 macOS 系统 */
export const isMac = userAgent.includes("Macintosh");
/** 是否为 Linux 系统 */
export const isLinux = userAgent.includes("Linux");
/** 是否为 Electron 环境 */
export const isElectron = userAgent.includes("Electron") || typeof window?.electron !== "undefined";

/** 是否为移动端 */
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  userAgent,
);

/** 是否为 DEV 构建 */
export const isDevBuild = import.meta.env.VITE_BUILD_TYPE === "dev";

/**
 * 检查环境是否支持 FFmpeg WASM 引擎所需的共享内存能力
 *
 * 真正需要的只是：能在主线程和 Worker 之间共享 SharedArrayBuffer。
 *
 * 历史上这要求 crossOriginIsolated===true（COOP/COEP 隔离），
 * 但 Electron 43 (Chromium 134) 起，当 webPreferences.webSecurity=false 时，
 * crossOriginIsolated 永远是 false，即使设置了 COOP/COEP 头也不会生效。
 * 主进程已通过 --enable-features=SharedArrayBuffer 命令行开关放开该限制，
 * 所以这里改为实际尝试构造 SharedArrayBuffer，构造成功即视为可用。
 *
 * 仍要求 isSecureContext，因为构造 SAB 在不安全上下文中本身就被禁止。
 */
export const checkIsolationSupport = (): boolean => {
  const scope =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof self !== "undefined"
        ? self
        : typeof window !== "undefined"
          ? window
          : undefined;

  if (!scope) {
    return false;
  }

  if (!scope.isSecureContext) {
    return false;
  }

  if (typeof SharedArrayBuffer === "undefined") {
    return false;
  }

  // 实际构造一次，确保运行时确实可用（某些环境会定义但构造时抛错）
  try {
    const sab = new SharedArrayBuffer(8);
    // Atomics 也必须可用，FFmpeg 引擎的环形缓冲区依赖它
    if (typeof Atomics === "undefined") return false;
    Atomics.store(new Int32Array(sab), 0, 1);
    return true;
  } catch {
    return false;
  }
};
