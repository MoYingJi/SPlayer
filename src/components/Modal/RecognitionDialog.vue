<script setup lang="ts">
import type { SongType } from "@/types/main";
import type { RecognitionCandidate } from "@/types/shared/recognition";
import { songDetail } from "@/api/song";
import { usePlayerController } from "@/core/player/PlayerController";
import { formatSongsList } from "@/utils/format";
import { useRecognitionSession } from "@/composables/useRecognitionSession";

const router = useRouter();
const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ "update:show": [value: boolean] }>();
const session = useRecognitionSession();
const { phase, level, candidates, error, supported, source } = session;

const isBusy = computed(() => ["capturing", "fingerprinting", "matching"].includes(phase.value));
const trackCache = shallowRef(new Map<string, SongType>());
const playingId = ref<string | null>(null);

watch(candidates, () => {
  trackCache.value = new Map();
  playingId.value = null;
});

watch(phase, (value) => {
  if (value === "error") {
    const errMsgMap: Record<string, string> = {
      unsupported: "当前设备不支持听歌识曲",
      "no-device": "未找到可用的音频采集设备",
      "permission-denied": "采集权限被拒绝",
      "capture-failed": "音频采集失败",
      "silent-input": "没有采集到声音，请检查音频输出",
      network: "网络连接或匹配服务异常",
      "afp-unavailable": "指纹库缺失",
      unknown: "识别发生未知错误",
    };
    const msg = errMsgMap[error.value?.code || "unknown"];
    window.$message.error(msg || "识别失败");
    session.reset();
    return;
  }
  if (value === "done" && candidates.value.length === 0) {
    window.$message.info("未识别到歌曲");
    session.reset();
    return;
  }
});

watch(
  () => props.show,
  (value) => {
    if (value) session.reset();
    else session.stop(false);
  },
);

const bars = computed(() => {
  const count = 14;
  // 保证弱信号也有明显波动
  const boosted = Math.min(1, Math.pow(level.value, 0.35) * 1.6);
  return Array.from({ length: count }, (_, index) => {
    const distance = Math.abs(index - (count - 1) / 2) / (count / 2);
    return Math.max(0.14, Math.min(1, boosted * (1 - distance * 0.55)));
  });
});

/** 获取标准歌曲对象并立即播放 */
const playCandidate = async (candidate: RecognitionCandidate): Promise<void> => {
  if (playingId.value === candidate.songId) return;
  let track = trackCache.value.get(candidate.songId);
  if (!track) {
    try {
      const result = await songDetail(Number(candidate.songId));
      if (!result?.songs?.[0]) return;
      track = formatSongsList(result.songs)[0];
      const next = new Map(trackCache.value);
      next.set(candidate.songId, track);
      trackCache.value = next;
    } catch (err) {
      window.$message.error("歌曲信息获取失败");
      return;
    }
  }
  playingId.value = candidate.songId;
  try {
    await usePlayerController().playSong({ autoPlay: true, song: track });
  } finally {
    playingId.value = null;
  }
};

/** 关闭弹窗并跳转到歌曲搜索 */
const searchCandidate = (candidate: RecognitionCandidate): void => {
  onShowUpdate(false);
  void router.push({
    name: "search",
    query: { keyword: [candidate.title, ...candidate.artists].join(" ") },
  });
};

const onShowUpdate = (value: boolean): void => {
  emit("update:show", value);
};

const start = (): void => {
  void session.start(source.value);
};

/** 网易云图片裁切 */
const withPicSize = (url: string | undefined, size: number) => {
  if (!url) return "";
  return url.replace(/\?param=\d+y\d+$/, "") + `?param=${size}y${size}`;
};
</script>

<template>
  <n-modal
    :show="props.show"
    class="recognition-modal"
    preset="card"
    style="width: 420px"
    title="听歌识曲"
    :mask-closable="false"
    @update:show="onShowUpdate"
  >
    <div class="recognition-body">
      <div v-if="phase === 'idle' || isBusy" class="status-box">
        <div class="visual-area">
          <!-- 麦克风/波纹图标 -->
          <div v-show="!isBusy" class="icon-wrap">
            <SvgIcon name="AudioWaveform" :size="40" />
          </div>
          <!-- 律动声波 -->
          <div v-show="isBusy" class="bars-wrap">
            <span
              v-for="(height, index) in bars"
              :key="index"
              class="bar"
              :style="{ transform: `scaleY(${height})` }"
            />
          </div>
        </div>

        <div class="text-area">
          <p class="phase-text">
            <template v-if="isBusy">
              <template v-if="phase === 'capturing'">正在聆听声音...</template>
              <template v-else-if="phase === 'fingerprinting'">正在生成指纹...</template>
              <template v-else-if="phase === 'matching'">正在匹配乐曲...</template>
            </template>
            <template v-else>靠近声源或采集系统声音即可识别</template>
          </p>
          <p class="hint-text">
            <template v-if="isBusy">
              {{ source === "system" ? "系统音频" : "麦克风" }} 采集中，请稍候...
            </template>
            <template v-else> 支持识别其他应用播放的音乐或环境音乐 </template>
          </p>
        </div>

        <div v-if="phase === 'idle' && supported" class="source-select">
          <n-radio-group v-model:value="source" size="small">
            <n-radio value="system">系统声音</n-radio>
            <n-radio value="microphone">麦克风</n-radio>
          </n-radio-group>
        </div>
      </div>

      <div v-else-if="phase === 'done'" class="results-list">
        <n-scrollbar style="max-height: 300px">
          <div v-for="candidate in candidates" :key="candidate.songId" class="candidate-card">
            <n-image
              :src="withPicSize(candidate.cover, 100)"
              :alt="candidate.title"
              class="cover"
              preview-disabled
            />
            <div class="info">
              <p class="title text-hidden">{{ candidate.title }}</p>
              <p class="artists text-hidden">{{ candidate.artists.join(" / ") }}</p>
            </div>
            <div class="actions">
              <n-button
                circle
                size="small"
                secondary
                title="搜索"
                @click="searchCandidate(candidate)"
              >
                <template #icon><SvgIcon name="Search" /></template>
              </n-button>
              <n-button
                type="primary"
                circle
                size="small"
                title="播放"
                :loading="playingId === candidate.songId"
                @click="playCandidate(candidate)"
              >
                <template #icon><SvgIcon name="Play" /></template>
              </n-button>
            </div>
          </div>
        </n-scrollbar>
      </div>
    </div>

    <template #footer>
      <div class="footer-actions">
        <n-button
          v-if="phase === 'idle'"
          type="primary"
          block
          size="large"
          :disabled="supported === null"
          @click="start"
        >
          <template #icon><SvgIcon name="AudioWaveform" /></template>
          开始识别
        </n-button>
        <n-button v-else-if="isBusy" block size="large" @click="session.stop()">
          取消识别
        </n-button>
        <n-button v-else-if="phase === 'done'" block size="large" @click="session.reset()">
          <template #icon><SvgIcon name="ArrowLeft" /></template>
          返回
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style lang="scss" scoped>
.recognition-modal {
  :deep(.n-card__content) {
    padding: 16px 20px;
  }
  .recognition-body {
    display: flex;
    flex-direction: column;
    height: 320px;

    .status-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      height: 100%;

      .visual-area {
        position: relative;
        width: 80px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;

        .icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background-color: var(--n-color-target);
          color: var(--n-color-modal);
        }

        .bars-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
          height: 100%;
          .bar {
            display: inline-block;
            width: 4px;
            height: 40px;
            border-radius: 2px;
            background-color: var(--n-color-target);
            transition: transform 0.15s ease;
            transform-origin: center;
          }
        }
      }

      .text-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 24px;
        flex-shrink: 0;
        height: 50px;

        .phase-text {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
          color: var(--n-text-color);
        }
        .hint-text {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: var(--n-text-color-3);
          max-width: 320px;
        }
      }

      .source-select {
        margin-top: auto;
      }
    }

    .results-list {
      height: 100%;
      .candidate-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        border-radius: 8px;
        background-color: var(--n-action-color);
        margin-bottom: 8px;

        .cover {
          width: 48px;
          height: 48px;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .info {
          flex: 1;
          min-width: 0;
          .title {
            margin: 0;
            font-size: 14px;
            color: var(--n-text-color);
            font-weight: 500;
          }
          .artists {
            margin: 2px 0 0 0;
            font-size: 12px;
            color: var(--n-text-color-3);
          }
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
      }
    }
  }

  .footer-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
  }
}
</style>
