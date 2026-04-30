<template>
  <div
    class="full-player-mobile"
    @touchstart.capture="onTouchStart"
    @touchmove.capture="onTouchMove"
    @touchend.capture="onTouchEnd"
  >
    <!-- 顶部功能栏 -->
    <div class="top-bar">
      <!-- 收起按钮 -->
      <div class="btn" @click.stop="statusStore.showFullPlayer = false">
        <SvgIcon name="Down" :size="26" />
      </div>
    </div>

    <!-- 主内容 -->
    <div
      :class="['mobile-content', { swiping: isSwipingX }]"
      :style="{ transform: contentTransform }"
      @click.stop
    >
      <!-- 歌曲信息页 -->
      <div class="page info-page">
        <!-- 封面 -->
        <div class="cover-section">
          <PlayerCover :no-lyric="true" />
        </div>

        <!-- 歌曲信息区域 -->
        <div class="info-group">
          <!-- 歌曲信息与操作 -->
          <div class="song-info-bar">
            <div class="info-section">
              <PlayerData :center="false" :light="false" class="mobile-data" />
            </div>
            <div class="info-actions">
              <!-- 喜欢 -->
              <div
                v-if="musicStore.playSong.type !== 'radio'"
                class="action-btn"
                @click="
                  toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id))
                "
              >
                <SvgIcon
                  :name="
                    dataStore.isLikeSong(musicStore.playSong.id) ? 'Favorite' : 'FavoriteBorder'
                  "
                  :size="26"
                  :class="{ liked: dataStore.isLikeSong(musicStore.playSong.id) }"
                />
              </div>
              <!-- 添加到歌单 -->
              <div
                class="action-btn"
                @click.stop="openPlaylistAdd([musicStore.playSong], !!musicStore.playSong.path)"
              >
                <SvgIcon name="AddList" :size="26" />
              </div>
            </div>
          </div>

          <!-- 进度条 -->
          <div class="progress-section">
            <span class="time" @click="toggleTimeFormat">{{ timeDisplay[0] }}</span>
            <PlayerSlider class="player" :show-tooltip="false" />
            <span class="time" @click="toggleTimeFormat">{{ timeDisplay[1] }}</span>
          </div>

          <!-- 主控制按钮 -->
          <div class="control-section">
            <!-- 随机模式 -->
            <template v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode">
              <div class="mode-btn" @click.stop="player.toggleShuffle()">
                <SvgIcon
                  :name="statusStore.shuffleIcon"
                  :size="24"
                  :depth="statusStore.shuffleMode === 'off' ? 3 : 1"
                />
              </div>
            </template>
            <div v-else class="placeholder"></div>

            <!-- 上一曲 -->
            <div class="ctrl-btn" @click.stop="player.nextOrPrev('prev')">
              <SvgIcon name="SkipPrev" :size="36" />
            </div>

            <!-- 播放/暂停 -->
            <n-button
              :loading="statusStore.playLoading"
              class="play-btn"
              type="primary"
              strong
              secondary
              circle
              @click.stop="player.playOrPause()"
            >
              <template #icon>
                <Transition name="fade" mode="out-in">
                  <SvgIcon
                    :key="statusStore.playStatus ? 'Pause' : 'Play'"
                    :name="statusStore.playStatus ? 'Pause' : 'Play'"
                    :size="40"
                  />
                </Transition>
              </template>
            </n-button>

            <!-- 下一曲 -->
            <div class="ctrl-btn" @click.stop="player.nextOrPrev('next')">
              <SvgIcon name="SkipNext" :size="36" />
            </div>

            <!-- 循环模式 -->
            <template v-if="musicStore.playSong.type !== 'radio' && !statusStore.personalFmMode">
              <div class="mode-btn" @click.stop="player.toggleRepeat()">
                <SvgIcon
                  :name="statusStore.repeatIcon"
                  :size="24"
                  :depth="statusStore.repeatMode === 'off' ? 3 : 1"
                />
              </div>
            </template>
            <div v-else class="placeholder"></div>
          </div>
        </div>
      </div>

      <!-- 歌词页 -->
      <div class="page lyric-page">
        <div class="lyric-header" ref="lyricHeaderRef">
          <s-image :src="musicStore.getSongCover('s')" class="lyric-cover" />
          <div class="lyric-info">
            <div class="name text-hidden">
              {{
                settingStore.hideBracketedContent
                  ? removeBrackets(musicStore.playSong.name)
                  : musicStore.playSong.name
              }}
            </div>
            <div class="artist text-hidden">{{ artistName }}</div>
          </div>
          <!-- 喜欢按钮 -->
          <div
            v-if="musicStore.playSong.type !== 'radio'"
            class="action-btn"
            @click.stop="
              toLikeSong(musicStore.playSong, !dataStore.isLikeSong(musicStore.playSong.id))
            "
          >
            <SvgIcon
              :name="dataStore.isLikeSong(musicStore.playSong.id) ? 'Favorite' : 'FavoriteBorder'"
              :size="24"
              :class="{ liked: dataStore.isLikeSong(musicStore.playSong.id) }"
            />
          </div>
        </div>
        <div class="lyric-main" />
      </div>
    </div>

    <!-- 独立歌词覆盖层（提取到 mobile-content 之外以避免 transform stacking context 阻断 mix-blend-mode） -->
    <div
      v-if="hasLyric"
      class="lyric-overlay"
      :class="{ swiping: isSwipingX }"
      :style="{ transform: lyricPageTransform, paddingTop: lyricOverlayPaddingTop }"
    >
      <PlayerLyric />
    </div>

    <!-- 页面指示器 -->
    <div class="pagination" v-if="hasLyric">
      <div
        v-for="i in 2"
        :key="i"
        :class="['dot', { active: pageIndex === i - 1 }]"
        @click="pageIndex = i - 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useElementSize } from "@vueuse/core";
import { useMusicStore, useStatusStore, useDataStore, useSettingStore } from "@/stores";
import { usePlayerController } from "@/core/player/PlayerController";
import { useTimeFormat } from "@/composables/useTimeFormat";
import { toLikeSong } from "@/utils/auth";
import { openPlaylistAdd } from "@/utils/modal";
import { removeBrackets } from "@/utils/format";

const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const dataStore = useDataStore();
const player = usePlayerController();
const { timeDisplay, toggleTimeFormat } = useTimeFormat();

const pageIndex = ref(0);

const hasLyric = computed(() => {
  return musicStore.isHasLrc && musicStore.playSong.type !== "radio";
});

const artistName = computed(() => {
  const artists = musicStore.playSong.artists;
  if (Array.isArray(artists)) {
    return artists.map((ar) => ar.name).join(" / ");
  }
  return (artists as string) || "未知艺术家";
});

// 没有歌词强制回到第一页
watch(hasLyric, (val) => {
  if (!val) pageIndex.value = 0;
});

// 动态计算歌词覆盖层高度以对齐
const lyricHeaderRef = ref<HTMLElement | null>(null);
const { height: lyricHeaderHeight } = useElementSize(lyricHeaderRef);
const lyricOverlayPaddingTop = computed(() => {
  // 60px (lyric-page padding-top) + header height + 20px (margin-bottom)
  return lyricHeaderHeight.value ? `${60 + lyricHeaderHeight.value + 20}px` : "140px";
});

// 轴锁定：null=未确定, 'x'=水平翻页, 'y'=纵向滚动
const axisLock = ref<"x" | "y" | null>(null);
const isSwiping = ref(false);
const lengthX = ref(0);

let startX = 0;
let startY = 0;

const onTouchStart = (e: TouchEvent) => {
  if (!hasLyric.value) return;
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  axisLock.value = null;
  isSwiping.value = true;
  lengthX.value = 0;
};

const onTouchMove = (e: TouchEvent) => {
  if (!hasLyric.value || !isSwiping.value) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const deltaX = startX - currentX; // 左滑为正，符合 lengthX 语义
  const deltaY = startY - currentY;

  if (axisLock.value === null) {
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      axisLock.value = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
      // 确认是水平滑动时，在捕获阶段下发 touchcancel 终止子组件(如AMLL)内部的滑动状态
      if (axisLock.value === "x" && e.target instanceof EventTarget) {
        const touchList = e.touches;
        e.target.dispatchEvent(
          new TouchEvent("touchcancel", {
            bubbles: true,
            cancelable: true,
            touches: Array.from(touchList),
            targetTouches: Array.from(e.targetTouches),
            changedTouches: Array.from(e.changedTouches),
          }),
        );
      }
    }
  }

  if (axisLock.value === "x") {
    // 拦截后续的 touchmove 事件，避免歌词收到滑动导致滚动
    e.preventDefault();
    e.stopPropagation();
    lengthX.value = deltaX;
  }
};

const onTouchEnd = (e: TouchEvent) => {
  if (!hasLyric.value || !isSwiping.value) return;
  isSwiping.value = false;

  if (axisLock.value === "x") {
    // 防止拦截事件造成点击误触
    e.preventDefault();
    const finalLengthX = startX - e.changedTouches[0].clientX;
    const direction = finalLengthX > 0 ? "left" : "right";

    // 超过阈值则切换页面
    if (direction === "left" && finalLengthX > 100) {
      pageIndex.value = 1;
    } else if (direction === "right" && finalLengthX < -100) {
      pageIndex.value = 0;
    }
  }

  axisLock.value = null;
  lengthX.value = 0;
};

// 仅水平轴锁定时才视为正在水平滑动
const isSwipingX = computed(() => isSwiping.value && axisLock.value === "x");

// 计算歌词覆盖层的位移（与 mobile-content 内歌词页视觉同步，但在 stacking context 之外）
const lyricPageTransform = computed(() => {
  // pageIndex=0 时覆盖层在屏幕右侧，pageIndex=1 时回到屏幕内
  const baseOffset = (1 - pageIndex.value) * 100;
  if (!isSwipingX.value || !hasLyric.value) {
    return `translateX(${baseOffset}%)`;
  }
  let pixelOffset = lengthX.value;
  if (pageIndex.value === 0 && pixelOffset < 0) {
    pixelOffset = pixelOffset * 0.3;
  }
  if (pageIndex.value === 1 && pixelOffset > 0) {
    pixelOffset = pixelOffset * 0.3;
  }
  return `translateX(calc(${baseOffset}% - ${pixelOffset}px))`;
});

// 计算实时的变换位置
const contentTransform = computed(() => {
  const baseOffset = pageIndex.value * 50; // 百分比
  if (!isSwipingX.value || !hasLyric.value) {
    return `translateX(-${baseOffset}%)`;
  }
  let pixelOffset = lengthX.value;
  // 限制滑动范围
  if (pageIndex.value === 0 && pixelOffset < 0) {
    pixelOffset = pixelOffset * 0.3;
  }
  if (pageIndex.value === 1 && pixelOffset > 0) {
    pixelOffset = pixelOffset * 0.3;
  }
  return `translateX(calc(-${baseOffset}% - ${pixelOffset}px))`;
});
</script>

<style lang="scss" scoped>
.full-player-mobile {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  .top-bar {
    position: absolute;
    width: 100%;
    height: 60px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 24px;
    z-index: 10;
    .btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.2s;
      flex-shrink: 0;
      &:active {
        background-color: rgba(255, 255, 255, 0.1);
      }
      .n-icon {
        color: rgb(var(--main-cover-color));
        opacity: 0.8;
      }
    }
  }
  .mobile-content {
    flex: 1;
    display: flex;
    width: 200%;
    height: 100%;
    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
    &.swiping {
      transition: none;
    }
    .page {
      width: 50%;
      height: 100%;
      flex-shrink: 0;
      position: relative;
    }
    .info-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 24px 40px 24px;
      overflow-y: auto;
      .cover-section {
        flex: 1;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 60px;
        margin-bottom: 20px;
        :deep(.player-cover) {
          width: min(100%, 45vh);
          // height: min(85vw, 45vh);
          &.record {
            width: 40vh;
            .cover-img {
              width: 40vh;
              height: 40vh;
              min-width: 40vh;
            }
            .pointer {
              width: 10vh;
              top: -9.5vh;
            }
            @media (max-width: 512px) {
              width: 36vh;
              .cover-img {
                width: 36vh;
                height: 36vh;
                min-width: 36vh;
              }
            }
          }
        }
      }
      .info-group {
        width: 100%;
        display: flex;
        flex-direction: column;
        .song-info-bar {
          width: 100%;
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
          .info-section {
            flex: 1;
            min-width: 0;
            margin-right: 16px;
            :deep(.mobile-data) {
              width: 100%;
              max-width: 100%;
              .name {
                margin-left: 0;
              }
            }
          }
          .info-actions {
            display: flex;
            padding-top: 24px;
            gap: 16px;
            flex-shrink: 0;
            .action-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              cursor: pointer;
              transition: background-color 0.2s;
              &:active {
                background-color: rgba(255, 255, 255, 0.1);
              }
              .n-icon {
                color: rgb(var(--main-cover-color));
                opacity: 0.6;
                transition:
                  opacity 0.2s,
                  transform 0.2s;
                &.liked {
                  fill: rgb(var(--main-cover-color));
                  opacity: 1;
                }
              }
            }
          }
        }
        .progress-section {
          display: flex;
          align-items: center;
          margin: 0 4px 30px;
          .time {
            font-size: 12px;
            opacity: 0.6;
            width: 40px;
            text-align: center;
            color: rgb(var(--main-cover-color));
            font-variant-numeric: tabular-nums;
          }
          .n-slider {
            margin: 0 12px;
          }
        }
        .control-section {
          width: 100%;
          max-width: 400px;
          margin: 0 auto 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
          .placeholder {
            width: 24px;
          }
          .mode-btn {
            opacity: 0.8;
            cursor: pointer;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            .n-icon {
              color: rgb(var(--main-cover-color));
            }
          }
          .ctrl-btn {
            cursor: pointer;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            .n-icon {
              color: rgb(var(--main-cover-color));
            }
          }
          .play-btn {
            width: 60px;
            height: 60px;
            font-size: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s;
            background-color: rgba(var(--main-cover-color), 0.2);
            color: rgb(var(--main-cover-color));
            &.n-button--primary-type {
              --n-color: rgba(var(--main-cover-color), 0.14);
              --n-color-hover: rgba(var(--main-cover-color), 0.2);
              --n-color-focus: rgba(var(--main-cover-color), 0.2);
              --n-color-pressed: rgba(var(--main-cover-color), 0.12);
            }
            &:active {
              transform: scale(0.95);
            }
          }
        }
      }
    }
    .lyric-page {
      padding: 0 24px;
      padding-top: 60px;
      display: flex;
      flex-direction: column;
      .lyric-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
        flex-shrink: 0;
        padding: 10px 20px 0;
        .lyric-cover {
          width: 50px;
          height: 50px;
          flex-shrink: 0;
          :deep(img) {
            border-radius: 6px;
            width: 100%;
            height: 100%;
          }
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .lyric-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          .name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 2px;
          }
          .artist {
            font-size: 13px;
            opacity: 0.6;
          }
        }
        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          transition: background-color 0.2s;
          margin-left: 4px;
          &:active {
            background-color: rgba(255, 255, 255, 0.1);
          }
          .n-icon {
            color: rgb(var(--main-cover-color));
            opacity: 0.6;
            transition: all 0.2s;
            &.liked {
              fill: rgb(var(--main-cover-color));
              opacity: 1;
            }
          }
        }
      }
      .lyric-main {
        flex: 1;
        min-height: 0;
        position: relative;
      }
    }
  }
  // 歌词覆盖层：提取到 mobile-content 之外，使 mix-blend-mode 能与实际模糊背景混合
  .lyric-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    padding: 0 24px;
    box-sizing: border-box;
    mix-blend-mode: var(--lyric-blend-mode);
    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
    &.swiping {
      transition: none;
    }
  }
  .pagination {
    position: absolute;
    bottom: 24px;
    left: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 8px;
    pointer-events: none;
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.2);
      transition: all 0.3s;
      &.active {
        background-color: rgb(var(--main-cover-color));
        width: 16px;
        border-radius: 4px;
        opacity: 0.8;
      }
    }
  }
}
</style>
