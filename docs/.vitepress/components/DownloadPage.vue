<template>
  <div class="download-page">
    <div v-if="loading" class="state-container loading">
      <div class="spinner"></div>
      <p>正在同步 GitHub 版本数据...</p>
    </div>

    <div v-else-if="error" class="state-container error">
      <p>无法连接至 GitHub API: {{ error }}</p>
      <a :href="githubReleasesUrl" target="_blank" class="link-btn">前往 GitHub 下载页 →</a>
    </div>

    <div v-else-if="latestRelease" class="content-animate">
      <!-- Hero: 版本概览 -->
      <header class="version-hero">
        <div class="version-badges">
          <a class="v-tag" :href="getReleaseTagUrl(latestRelease.tag_name)" target="_blank">
            {{ latestRelease.tag_name }}
          </a>
          <span class="v-date">{{ formatDate(latestRelease.published_at) }}</span>
        </div>
        <div class="mirror-selector">
          <label for="mirror-select">下载太慢？切换线路：</label>
          <select id="mirror-select" v-model="selectedMirror" class="mirror-select">
            <option v-for="mirror in mirrors" :key="mirror.id" :value="mirror.id">
              {{ mirror.name }}
            </option>
          </select>
        </div>
      </header>

      <!-- 智能推荐 -->
      <section class="recommend-card" v-if="recommendedAssets.length > 0">
        <div class="card-header">
          <span class="magic-icon">✨</span>
          <div class="header-text">
            您的设备应该是
            <span class="spacer"></span>
            <strong>{{ userPlatform }}</strong>
            <span class="spacer"></span>
            <span v-if="userArch !== ArchType.Unknown" class="tag tag-theme">
              {{ userArch }}
            </span>
          </div>
          <div class="header-right">
            <button class="recheck-btn" @click="scrollToPlatforms">不是您的系统？</button>
          </div>
        </div>

        <div class="action-list">
          <a
            v-for="(asset, index) in recommendedAssets"
            :key="asset.name + index"
            :href="getMirrorUrl(asset.url)"
            class="action-btn"
          >
            <div class="btn-main">
              <div class="btn-title-row">
                <span class="btn-title">下载 SPlayer</span>
                <span class="tag tag-theme">{{ getAssetTagName(asset) }}</span>
              </div>
              <span class="btn-desc">{{ getAssetRecommendDesc(asset) }}</span>
            </div>
            <div class="btn-side">
              <span class="size-badge">预估 {{ formatFileSize(asset.size) }}</span>
            </div>
          </a>
        </div>

        <!-- 更新日志 -->
        <div class="changelog-section" v-if="latestRelease.body">
          <details>
            <summary>查看版本更新详情</summary>
            <div class="markdown-body" v-html="renderMarkdown(latestRelease.body)"></div>
          </details>
        </div>
      </section>

      <!-- 全平台下载列表 -->
      <section class="platforms-section" id="platforms-list">
        <div class="section-divider">
          <h2>多平台安装包</h2>

          <!-- 架构说明指南 -->
          <div class="arch-guide">
            <span class="guide-item">
              <strong>x64 / amd64</strong>: 适用于大多数 Intel/AMD 电脑
            </span>
            <span class="guide-item">
              <strong>ARM64</strong>: 适用于 M1/M2/M3 Mac 或 ARM 架构设备
            </span>
          </div>
        </div>

        <!-- 平台列表 -->
        <div v-for="platform in classifiedAssets" :key="platform.id" class="platform-block">
          <div class="block-title">
            <span class="platform-icon">{{ platform.icon }}</span>
            <h3>{{ platform.name }}</h3>
          </div>

          <!-- 子分类循环 -->
          <div class="sub-groups-container">
            <div v-for="sub in platform.groups" :key="sub.title" class="sub-group-item">
              <div class="sub-header">
                <span class="sub-title">{{ sub.title }}</span>
                <span class="sub-desc">{{ sub.desc }}</span>
              </div>

              <div class="files-grid">
                <a
                  v-for="file in sub.assets"
                  :key="file.name"
                  :href="getMirrorUrl(file.url)"
                  class="file-card"
                >
                  <div class="file-content">
                    <div class="file-name" :title="file.name">
                      {{ getSimpleFileName(file.name) }}
                    </div>
                    <div class="file-tags">
                      <span class="tag tag-theme">
                        {{ file.arch }}
                      </span>
                      <span class="tag tag-theme">{{ getExtensionName(file.name) }}</span>
                    </div>
                  </div>
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="page-footer">
        <p>
          需要查找历史版本？<a :href="githubReleasesUrl" target="_blank">
            访问 GitHub Release 归档
          </a>
        </p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { marked } from "marked";

// --- 配置常量 ---
const GITHUB_REPO = "SPlayer-Dev/SPlayer";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

const githubReleasesUrl = `https://github.com/${GITHUB_REPO}/releases`;

// --- 类型定义 ---
interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}
interface GitHubRelease {
  tag_name: string;
  body: string;
  published_at: string;
  assets: GitHubAsset[];
}

interface SubGroup {
  title: string;
  desc: string;
  assets: AssetInfo[];
}
interface PlatformGroup {
  id: string;
  name: string;
  icon: string;
  groups: SubGroup[];
}

enum PlatformType {
  Windows = "Windows",
  MacOS = "macOS",
  Linux = "Linux",
  Unknown = "未知系统",
}
enum ArchType {
  X64 = "x64",
  ARM64 = "ARM64",
  Universal = "通用架构",
  Unknown = "未知架构",
}

interface AssetFormat {
  id: string;
  regex: RegExp;
  platform: PlatformType;
}
interface AssetInfo {
  name: string;
  url: string;
  size: number;

  format: AssetFormat;
  arch: ArchType;
}

// --- 镜像站配置 ---
interface Mirror {
  id: string;
  name: string;
  url: string;
}

const mirrors: Mirror[] = [
  { id: "official", name: "GitHub", url: "" },
  { id: "cloudflare", name: "Cloudflare", url: "https://gh-proxy.org/" },
  { id: "hk", name: "Sharon CDN", url: "https://hk.gh-proxy.org/" },
  { id: "fastly", name: "Fastly", url: "https://cdn.gh-proxy.org/" },
  { id: "edgeone", name: "EdgeOne", url: "https://edgeone.gh-proxy.org/" },
];

const selectedMirror = ref("official");

// --- 格式配置 ---
const formats: AssetFormat[] = [
  // Windows
  { id: "nsis", regex: /-setup\.exe$/i, platform: PlatformType.Windows },
  { id: "portable", regex: /-portable\.exe$/i, platform: PlatformType.Windows },
  // macOS
  { id: "dmg", regex: /\.dmg$/i, platform: PlatformType.MacOS },
  { id: "zip", regex: /\.zip$/i, platform: PlatformType.MacOS }, // 为什么这个 zip 是 mac 的啊？？
  // Linux
  { id: "appimage", regex: /\.AppImage$/i, platform: PlatformType.Linux },
  { id: "deb", regex: /\.deb$/i, platform: PlatformType.Linux },
  { id: "rpm", regex: /\.rpm$/i, platform: PlatformType.Linux },
  { id: "pacman", regex: /\.pacman$/i, platform: PlatformType.Linux },
  { id: "targz", regex: /\.tar\.gz$/i, platform: PlatformType.Linux },
];

// --- 响应式状态 ---
const loading = ref(true);
const error = ref<string | null>(null);
const latestRelease = ref<GitHubRelease | null>(null);
const assets = ref<AssetInfo[]>([]);
const userPlatform = ref(PlatformType.Unknown);
const userArch = ref(ArchType.Unknown);
const isDetecting = ref(true);

// --- 工具逻辑 ---
const getAssetInfo = (asset: GitHubAsset): AssetInfo | null => {
  const name = asset.name;

  // 过滤掉其余内容
  const n = name.toLowerCase();
  if (n.endsWith(".blockmap") || n.endsWith(".yml") || n.includes("debug")) {
    return null;
  }

  // 识别格式
  let format: AssetFormat | null = null;
  for (const candidateFormat of formats) {
    if (candidateFormat.regex.test(name)) {
      format = candidateFormat;
      break;
    }
  }
  if (!format) {
    console.error(`Unknown asset format: ${name}`);
    return null;
  }

  // 识别架构
  let arch: ArchType;
  if (n.includes("arm64") || n.includes("aarch64")) arch = ArchType.ARM64;
  else if (n.includes("x64") || n.includes("amd64") || n.includes("x86_64")) arch = ArchType.X64;
  else arch = ArchType.Universal;

  // 返回
  return { name, url: asset.browser_download_url, size: asset.size, format, arch };
};

const getExtensionName = (name: string) => {
  if (name.endsWith(".tar.gz")) return "TAR.GZ";
  return name.split(".").pop()?.toUpperCase() || "FILE";
};

const getSimpleFileName = (name: string) => {
  if (!latestRelease.value) return name;
  const version = latestRelease.value.tag_name.replace(/^v/, "");
  // 移除版本号前缀，让文件名更简洁
  return name.replace(new RegExp(`^SPlayer[_-]?v?${version}[_-]?`, "i"), "") || name;
};

// 对同一组内的资源进行排序
const sortAssets = (assets: AssetInfo[]) => {
  return assets.sort((a, b) => {
    // 架构优先级
    const getArchScore = (arch: ArchType) => {
      if (arch === ArchType.X64) return 3;
      if (arch === ArchType.ARM64) return 2;
      if (arch === ArchType.Universal) return 1;
      return 0;
    };

    const archScoreA = getArchScore(a.arch);
    const archScoreB = getArchScore(b.arch);

    if (archScoreA !== archScoreB) {
      return archScoreB - archScoreA;
    }

    return a.name.localeCompare(b.name);
  });
};

// 检测架构兼容性
const isArchCompatible = (asset: AssetInfo, targetArch: ArchType) => {
  if (asset.arch === ArchType.Universal) return true;
  return asset.arch === targetArch;
};

// --- 环境检测 ---
const detectEnvironment = async () => {
  if (typeof window === "undefined") return;

  const ua = navigator.userAgent.toLowerCase();

  // 1. 基础 UA 检测
  if (ua.includes("win")) userPlatform.value = PlatformType.Windows;
  else if (ua.includes("mac")) userPlatform.value = PlatformType.MacOS;
  else if (ua.includes("linux") || ua.includes("x11")) userPlatform.value = PlatformType.Linux;
  else if (ua.includes("android")) userPlatform.value = PlatformType.Linux;

  // 基础架构检测
  if (ua.includes("arm64") || ua.includes("aarch64")) {
    userArch.value = ArchType.ARM64;
  } else {
    userArch.value = ArchType.X64;
  }

  // 2. 使用 NavigatorUAData (Client Hints) 进行更精确的检测
  // @ts-ignore
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      // @ts-ignore
      const uaData = await navigator.userAgentData.getHighEntropyValues([
        "platform",
        "architecture",
        "bitness",
      ]);

      if (uaData.platform === "macOS") userPlatform.value = PlatformType.MacOS;
      else if (uaData.platform === "Windows") userPlatform.value = PlatformType.Windows;
      else if (uaData.platform === "Linux") userPlatform.value = PlatformType.Linux;

      if (uaData.architecture === "arm") userArch.value = ArchType.ARM64;
      else if (uaData.architecture === "x86") userArch.value = ArchType.X64;
    } catch (e) {
      console.debug("UAData detection failed", e);
    }
  }

  isDetecting.value = false;
};

// --- 数据获取 ---
const fetchRelease = async () => {
  try {
    const res = await fetch(GITHUB_API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    latestRelease.value = data as GitHubRelease;
    assets.value = latestRelease.value.assets.map(getAssetInfo).filter(Boolean) as AssetInfo[];
  } catch (e) {
    const err = e as Error;
    console.error("Fetch release failed:", err);
    error.value = err.message || "请求失败";
  } finally {
    loading.value = false;
  }
};

const recommendedAssets = computed(() => {
  if (assets.value.length === 0) return [];
  const p = userPlatform.value;
  const arch = userArch.value;

  let result: AssetInfo[] = [];

  if (p === PlatformType.Windows) {
    const installable = assets.value.filter((f) => f.format.id === "nsis");
    const portable = assets.value.filter((f) => f.format.id === "portable");

    // 查找最佳匹配
    let setupAsset = installable.find((f) => isArchCompatible(f, arch));
    let portableAsset = portable.find((f) => isArchCompatible(f, arch));

    if (setupAsset) result.push(setupAsset);
    if (portableAsset) result.push(portableAsset);
  } else if (p === PlatformType.MacOS) {
    // macOS 策略:
    // 优先 DMG
    const dmg = assets.value.find((f) => f.format.id === "dmg" && isArchCompatible(f, arch));

    // 如果没有找到精确匹配 arm64 的 dmg (例如只有 universal 或 x64)，尝试找任意 dmg
    const fallbackDmg = assets.value.find((f) => f.format.id === "dmg");

    if (dmg) result.push(dmg);
    else if (fallbackDmg) result.push(fallbackDmg);
  } else if (p === PlatformType.Linux) {
    // Linux 策略:
    // 优先 AppImage, 其次 Deb
    const appImage = assets.value.find(
      (f) => f.format.id === "appimage" && isArchCompatible(f, arch),
    );
    const deb = assets.value.find((f) => f.format.id === "deb" && isArchCompatible(f, arch));
    const rpm = assets.value.find((f) => f.format.id === "rpm" && isArchCompatible(f, arch));

    if (appImage) result.push(appImage);
    else if (deb) result.push(deb);
    else if (rpm) result.push(rpm);
  }

  // 兜底：如果完全没找到推荐，且是 Windows，给一个最通用的
  if (result.length === 0 && p === PlatformType.Windows) {
    const fallback = assets.value.find((f) => f.format.id === "nsis" && f.arch !== ArchType.ARM64);
    if (fallback) result.push(fallback);
  }

  return result;
});

const classifiedAssets = computed<PlatformGroup[]>(() => {
  if (assets.value.length === 0) return [];

  const groups: PlatformGroup[] = [
    {
      id: "windows",
      name: "Windows",
      icon: "🪟",
      groups: [
        {
          title: "安装程序",
          desc: "推荐 · 自动更新",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "nsis")),
        },
        {
          title: "单文件便携版",
          desc: "双击即用 · 数据随身",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "portable")),
        },
      ],
    },
    {
      id: "macos",
      name: "macOS",
      icon: "🍎",
      groups: [
        {
          title: "磁盘镜像",
          desc: "推荐 · 拖拽安装",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "dmg")),
        },
        {
          title: "应用压缩包",
          desc: "手动安装",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "zip")),
        },
      ],
    },
    {
      id: "linux",
      name: "Linux",
      icon: "🐧",
      groups: [
        {
          title: "AppImage",
          desc: "通用运行包",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "appimage")),
        },
        {
          title: "Debian 包",
          desc: "Debian / Ubuntu / Linux Mint...",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "deb")),
        },
        {
          title: "RPM 包",
          desc: "Fedora / RHEL / AlmaLinux...",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "rpm")),
        },
        {
          title: "Pacman 包",
          desc: "Arch Linux / CachyOS / Manjaro...",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "pacman")),
        },
        {
          title: "程序压缩包",
          desc: "其它",
          assets: sortAssets(assets.value.filter((f) => f.format.id === "targz")),
        },
      ],
    },
  ];

  return groups
    .map((p) => ({
      ...p,
      groups: p.groups.filter((g) => g.assets.length > 0),
    }))
    .filter((p) => p.groups.length > 0);
});

const getAssetTagName = (asset: AssetInfo) => {
  const format = asset.format.id;
  if (format === "portable") return "便携版";
  if (format === "appimage") return "AppImage";
  return "安装版";
};
const getAssetRecommendDesc = (asset: AssetInfo) => {
  const format = asset.format.id;
  if (format === "portable") return "适合随身携带，数据隔离";
  if (format === "appimage") return "这是 AppImage，由于无法检测发行版，软件包需下方下载";
  return "包含自动更新，推荐使用";
};

const formatFileSize = (bytes: number) =>
  bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "未知";
const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });

// 注意：marked 在前端使用时建议配合 dompurify 防止 XSS
const renderMarkdown = (t: string) => marked.parse(t);

const getMirrorUrl = (originalUrl: string): string => {
  if (selectedMirror.value === "official" || !originalUrl) {
    return originalUrl;
  }
  const mirror = mirrors.find((m) => m.id === selectedMirror.value);
  if (!mirror || !mirror.url) {
    return originalUrl;
  }
  return mirror.url + originalUrl;
};

const getReleaseTagUrl = (tag: string) => `${githubReleasesUrl}/tag/${tag}`;

onMounted(() => {
  detectEnvironment();
  fetchRelease();
});

const scrollToPlatforms = () => {
  const el = document.getElementById("platforms-list");
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
};
</script>

<style scoped lang="scss">
/* --- 全局变量与基础设定 --- */
.download-page {
  --card-bg: var(--vp-c-bg-soft);
  --card-border: var(--vp-c-divider);
  --card-radius: 12px;
  --primary: var(--vp-c-brand-1);
  --primary-bg: var(--vp-c-brand-soft);
  --text-main: var(--vp-c-text-1);
  --text-sub: var(--vp-c-text-2);
  --text-mute: var(--vp-c-text-3);

  margin: 30px auto 0;
  color: var(--text-main);
}

/* --- 状态容器 --- */
.state-container {
  padding: 80px 0;
  text-align: center;

  &.error {
    color: var(--vp-c-danger-1);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--card-border);
    border-top-color: var(--primary);
    border-radius: 50%;
    margin: 0 auto 16px;
    animation: spin 0.8s linear infinite;
  }
}

.link-btn {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
}

.content-animate {
  animation: fadeUp 0.5s ease-out forwards;
}

/* --- 1. Hero 区域 --- */
.version-hero {
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.mirror-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--text-sub);

  label {
    font-weight: 500;
  }

  .mirror-select {
    padding: 6px 12px;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    background: var(--vp-c-bg);
    color: var(--text-main);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: var(--primary);
    }

    &:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-bg);
    }
  }
}

.version-badges {
  display: flex;
  align-items: center;
  gap: 12px;
}

.v-tag {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--primary);
  background: var(--primary-bg);
  padding: 4px 16px;
  border-radius: 99px;
  text-decoration: none;
}

.v-date {
  color: var(--text-sub);
  font-size: 0.95rem;
}

/* --- 2. 推荐卡片 --- */
.recommend-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  padding: 2rem;
  margin-bottom: 4rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 1.5rem;
    font-size: 1.05rem;
    justify-content: space-between;
  }

  .header-right {
    margin-left: auto;
  }

  .recheck-btn {
    font-size: 0.85rem;
    color: var(--text-sub);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-bottom: 1px dashed var(--text-mute);
    transition: all 0.2s;

    &:hover {
      color: var(--primary);
      border-color: var(--primary);
    }
  }

  .header-text {
    display: inline-flex;
    align-items: center;

    strong {
      color: var(--primary);
    }

    .spacer {
      width: 6px;
      display: inline-block;
    }
  }

  .action-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    margin-bottom: 1.5rem;
  }

  .action-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--vp-c-bg);
    border: 1.5px solid var(--primary);
    border-radius: 10px;
    text-decoration: none;
    transition: all 0.25s ease;

    &:hover {
      background: var(--primary-bg);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(var(--vp-c-brand-rgb), 0.1);
    }
  }

  .btn-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .btn-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-title {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--primary);
  }

  .btn-desc {
    font-size: 0.85rem;
    color: var(--text-sub);
  }

  .size-badge {
    font-size: 0.8rem;
    background: var(--vp-c-bg-soft);
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--text-sub);
  }

  .changelog-section {
    display: flex;

    summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--text-sub);
      margin-bottom: 1rem;

      &:hover {
        color: var(--primary);
      }
    }
  }
}

/* --- 3. 全平台列表 --- */
.section-divider {
  margin-bottom: 3rem;
  text-align: center;

  h2 {
    border-top: none;
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 1rem;
  }
}

.arch-guide {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.9rem;
  color: var(--text-sub);

  .guide-item {
    strong {
      color: var(--primary);
    }
  }

  .guide-divider {
    color: var(--vp-c-divider);
    font-size: 0.8rem;
  }
}

.platform-block {
  margin-bottom: 3rem;

  .block-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 1.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--card-border);

    .platform-icon {
      font-size: 1.6rem;
    }

    h3 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 700;
    }
  }

  .sub-groups-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .sub-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
  }

  .sub-title {
    font-weight: 600;
    font-size: 1.05rem;
    position: relative;
    padding-left: 12px;

    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 4px;
      bottom: 4px;
      width: 3px;
      background: var(--primary);
      border-radius: 2px;
    }
  }

  .sub-desc {
    font-size: 0.85rem;
    color: var(--text-sub);
    opacity: 0.8;
  }

  .files-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .file-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--card-bg);
    border: 1px solid transparent;
    border-radius: 8px;
    text-decoration: none;
    transition: all 0.2s;

    &:hover {
      border-color: var(--primary);
      background: var(--vp-c-bg-alt);
    }
  }

  .file-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
    margin-right: 12px;
  }

  .file-name {
    font-weight: 500;
    font-size: 0.95rem;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-tags {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--text-mute);
    white-space: nowrap;
    font-weight: 500;
  }
}

/* --- Tag 样式系统 (统一主题色) --- */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;

  &.tag-theme {
    background: var(--primary-bg);
    color: var(--primary);
  }
}

/* --- Markdown --- */
.markdown-body {
  font-size: 0.9rem;
  line-height: 1.6;
  padding: 10px;

  :deep(h2) {
    margin: 16px 0;
    border-top: none;
    padding-top: 0;
  }
}

/* --- 响应式设计 --- */
@media (max-width: 640px) {
  .version-hero {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    margin-bottom: 24px;
  }

  .v-tag {
    font-size: 1.2rem;
    padding: 4px 12px;
  }

  .v-date {
    font-size: 0.85rem;
  }

  .version-badges {
    width: 100%;
    justify-content: space-between;
  }

  .mirror-selector {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;

    label {
      font-size: 0.85rem;
    }

    .mirror-select {
      width: 100%;
      padding: 8px 12px;
      font-size: 0.9rem;
    }
  }

  .recommend-card {
    padding: 1.25rem;

    .card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .header-right {
      margin-left: 0;
      width: 100%;
      text-align: right;
    }

    .action-list {
      grid-template-columns: 1fr;
    }

    .action-btn {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding: 14px;
    }

    .btn-title {
      font-size: 1rem;
    }

    .btn-side {
      width: 100%;
      display: flex;
      justify-content: flex-end;
    }
  }

  .section-divider h2 {
    font-size: 1.5rem;
  }

  .platform-block {
    .block-title h3 {
      font-size: 1.2rem;
    }

    .files-grid {
      grid-template-columns: 1fr;
    }

    .sub-title::before {
      height: 100%;
      top: 0;
      bottom: 0;
    }
  }

  .arch-guide {
    display: flex;
    flex-direction: column;

    .guide-divider {
      display: none;
    }
  }
}

/* --- 动画定义 --- */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
