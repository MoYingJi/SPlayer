import { spawnSync } from "node:child_process";
import process from "node:process";

interface NativeModule {
  name: string;
  enabled?: boolean;
}

const modules: NativeModule[] = [
  {
    name: "external-media-integration",
  },
  {
    name: "tools",
  },
  {
    name: "taskbar-lyric",
    enabled: process.platform === "win32",
  },
  // 有人抱怨编译 wasm 总是有问题，暂时注释掉
  // {
  //   name: "ferrous-opencc-wasm",
  // },
];

const isRustAvailable = () => {
  const result = spawnSync("cargo", ["--version"], {
    stdio: "ignore",
  });

  return !result.error && !result.signal && result.status === 0;
};

if (process.env.SKIP_NATIVE_BUILD === "true" || process.env.SKIP_NATIVE_BUILD === "1") {
  console.log("[BuildNative] SKIP_NATIVE_BUILD 已设置，跳过原生模块构建");
  process.exit(0);
}

if (!isRustAvailable()) {
  console.error("[BuildNative] 错误：检测不到 Rust 工具链");
  console.error("[BuildNative] 未设置 SKIP_NATIVE_BUILD，因此必须包含 Rust 环境才能继续");
  console.error(
    "[BuildNative] 安装 Rust (https://rust-lang.org/tools/install/) 或者设置环境变量 SKIP_NATIVE_BUILD=true",
  );
  process.exit(1);
}

const parseArgs = () => {
  const options: {
    isDev: boolean;
    passing?: string[];
  } = {
    isDev: false,
  };

  const argv = process.argv;
  let index = 2;

  while (index < argv.length) {
    switch (argv[index]) {
      case "--dev": {
        options.isDev = true;
        index += 1;
        break;
      }
      case "--": {
        options.passing = argv.slice(index + 1);
        index = argv.length;
        break;
      }
      default: {
        console.error(`[BuildNative] 错误：未知参数 ${argv[index]}`);
        process.exit(1);
      }
    }
  }

  return options;
};

const buildArgs: string[] = [];
const options = parseArgs();

if (options.passing) buildArgs.push(...options.passing);

for (const mod of modules) {
  if (mod.enabled === false) {
    continue;
  }

  const buildType = options.isDev ? "debug" : "release";
  console.log(`[BuildNative] 构建 ${mod.name} (${buildType})`);

  const buildCmd = options.isDev ? "build:debug" : "build";
  const result = spawnSync("pnpm", ["--filter", mod.name, buildCmd, ...buildArgs], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error("[BuildNative] 模块构建失败，进程启动失败", result.error);
    process.exit(1);
  }
  if (result.signal) {
    console.error("[BuildNative] 模块构建失败，进程被信号终止", result.signal);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("[BuildNative] 模块构建失败，进程异常退出", result.status);
    process.exit(result.status ?? 1);
  }
}
