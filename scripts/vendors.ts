import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

interface Vendor {
  name: string;
  cwd: string;
  install?: string[];
  build: string[];
}

const vendors: Vendor[] = [
  {
    name: "applemusic-like-lyrics",
    cwd: path.join(rootDir, "vendor/applemusic-like-lyrics"),
    install: ["pnpm", "install"],
    build: ["pnpm", "nx", "run-many", "--target=build", "--projects=core,lyric", "--with-deps"],
  },
];

const [action, ...args] = process.argv.slice(2);

function run(command: string[], cwd: string, vendorName: string): void {
  const result = spawnSync(command[0], [...command.slice(1), ...args], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw new Error(`执行 ${vendorName} 命令失败`, { cause: result.error });
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (action === "install") {
  const hasLockfileOption = args.some((arg) =>
    ["--frozen-lockfile", "--no-frozen-lockfile"].includes(arg),
  );

  for (const vendor of vendors) {
    if (!vendor.install) continue;

    const installCommand = [
      ...vendor.install,
      ...(!hasLockfileOption ? ["--frozen-lockfile"] : []),
    ];
    run(installCommand, vendor.cwd, vendor.name);
  }
} else if (action === "build") {
  for (const vendor of vendors) {
    run(vendor.build, vendor.cwd, vendor.name);
  }
} else {
  throw new Error(`未知 vendor 操作：${action ?? "(未指定)"}`);
}
