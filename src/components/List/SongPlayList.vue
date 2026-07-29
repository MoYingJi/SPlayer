<!-- 播放列表 -->
<template>
  <n-drawer
    v-model:show="statusStore.playListShow"
    :class="{ 'full-player': statusStore.showFullPlayer }"
    :auto-focus="false"
    id="main-playlist"
    style="width: min(400px, 100vw)"
  >
    <n-drawer-content :native-scrollbar="false" closable>
      <template #header>
        <div class="playlist-header">
          <n-text class="name">播放队列</n-text>
          <n-text class="count" depth="3">
            {{ dataStore.playList.length }} 首歌曲 · {{ dataStore.nextPlayQueue.length }} 首待播
          </n-text>
        </div>
      </template>
      <Transition name="fade" mode="out-in">
        <div v-if="hasQueueContent" class="playlist-body">
          <!-- FIFO 临时待播区不参与普通列表排序 -->
          <section class="next-queue-section">
            <div class="section-header">
              <div class="section-heading">
                <SvgIcon :size="20" name="PlayNext" />
                <n-text class="section-name">接下来播放</n-text>
                <n-text class="section-count" depth="3">
                  {{ dataStore.nextPlayQueue.length }} 首
                </n-text>
              </div>
              <n-button
                :disabled="!dataStore.nextPlayQueue.length"
                :focusable="false"
                class="clear-next"
                size="tiny"
                text
                @click="clearNextPlayQueue"
              >
                清空接下来播放
              </n-button>
            </div>
            <n-scrollbar
              v-if="hasPriorityCurrentSong || dataStore.nextPlayQueue.length"
              ref="nextQueueListRef"
              class="next-queue-list"
            >
              <div class="next-queue-content">
                <div v-if="hasPriorityCurrentSong" class="song-node">
                  <div class="song-item queue-item priority-current-item on">
                    <div class="index">
                      <SvgIcon :size="20" name="Music" />
                    </div>
                    <div class="data">
                      <n-text class="name text-hidden">
                        {{ musicStore.playSong.name || "未知曲目" }}
                      </n-text>
                      <div v-if="Array.isArray(musicStore.playSong?.artists)" class="artists">
                        <n-text
                          v-for="ar in musicStore.playSong.artists"
                          :key="ar.id"
                          depth="3"
                          class="ar"
                        >
                          {{
                            settingStore.hideBracketedContent ? removeBrackets(ar.name) : ar.name
                          }}
                        </n-text>
                      </div>
                      <div v-else-if="musicStore.playSong.type === 'radio'" class="artists">
                        <n-text class="ar" depth="3">播客电台</n-text>
                      </div>
                      <div v-else class="artists">
                        <n-text class="ar" depth="3">
                          {{
                            settingStore.hideBracketedContent
                              ? removeBrackets(musicStore.playSong?.artists)
                              : musicStore.playSong?.artists || "未知艺术家"
                          }}
                        </n-text>
                      </div>
                    </div>
                    <n-text class="current-label">当前播放</n-text>
                  </div>
                </div>
                <div
                  v-for="queueEntry in dataStore.nextPlayQueue"
                  :key="queueEntry.queueId"
                  class="song-node"
                >
                  <div
                    class="song-item queue-item"
                    v-debounce="() => playNextQueueEntry(queueEntry.queueId)"
                  >
                    <div class="index">
                      <SvgIcon :size="20" name="PlayNext" />
                    </div>
                    <div class="data">
                      <n-text class="name text-hidden">
                        {{ queueEntry.song.name || "未知曲目" }}
                      </n-text>
                      <div v-if="Array.isArray(queueEntry.song?.artists)" class="artists">
                        <n-text
                          v-for="ar in queueEntry.song.artists"
                          :key="ar.id"
                          depth="3"
                          class="ar"
                        >
                          {{
                            settingStore.hideBracketedContent ? removeBrackets(ar.name) : ar.name
                          }}
                        </n-text>
                      </div>
                      <div v-else-if="queueEntry.song.type === 'radio'" class="artists">
                        <n-text class="ar" depth="3">播客电台</n-text>
                      </div>
                      <div v-else class="artists">
                        <n-text class="ar" depth="3">
                          {{
                            settingStore.hideBracketedContent
                              ? removeBrackets(queueEntry.song?.artists)
                              : queueEntry.song?.artists || "未知艺术家"
                          }}
                        </n-text>
                      </div>
                    </div>
                    <div class="remove" @click.stop="removeNextQueueEntry(queueEntry.queueId)">
                      <SvgIcon :size="20" name="Delete" />
                    </div>
                  </div>
                </div>
              </div>
            </n-scrollbar>
            <n-text v-else class="queue-empty" depth="3">暂无待播歌曲</n-text>
          </section>

          <section class="current-playlist-section">
            <div class="section-header">
              <div class="section-heading">
                <SvgIcon :size="20" name="MusicList" />
                <n-text class="section-name">当前播放列表</n-text>
                <n-text class="section-count" depth="3">
                  {{ dataStore.playList.length }} 首
                </n-text>
              </div>
            </div>
            <!-- 普通列表继续使用虚拟滚动和独立索引 -->
            <VirtualScroll
              v-if="dataStore.playList.length"
              ref="playListRef"
              :item-height="80"
              :item-fixed="true"
              :items="playListData"
              :default-scroll-index="isPlaylistSource ? statusStore.playIndex : 0"
              class="playlist-list"
              :class="{ 'is-dragging-global': isDragging }"
              height="100%"
            >
              <template #default="{ item: songData, index }">
                <div class="song-node">
                  <div
                    v-if="
                      isDragging &&
                      dropIndicator.index === index &&
                      dropIndicator.position === 'top'
                    "
                    class="drop-line line-top"
                  ></div>
                  <div
                    v-if="
                      isDragging &&
                      dropIndicator.index === index &&
                      dropIndicator.position === 'bottom'
                    "
                    class="drop-line line-bottom"
                  ></div>

                  <div
                    :key="songData.key"
                    :class="[
                      'song-item',
                      { on: isPlaylistSource && statusStore.playIndex === index },
                      { 'is-dragging': isDragging && draggedIndex === index },
                    ]"
                    v-debounce="
                      () => {
                        player.togglePlayIndex(index, true);
                        statusStore.playListShow = false;
                      }
                    "
                  >
                    <!-- 拖拽手柄 -->
                    <div
                      class="drag-handle"
                      @mousedown="handlePointerDown($event, index, songData.name || '未知曲目')"
                      @touchstart.passive="
                        handlePointerDown($event, index, songData.name || '未知曲目')
                      "
                      @click.stop
                    >
                      <SvgIcon :size="20" name="Menu" />
                    </div>

                    <!-- 序号 -->
                    <div class="index">
                      <n-text
                        v-if="!isPlaylistSource || statusStore.playIndex !== index"
                        :class="['num', { big: index + 1 > 9999 }]"
                        depth="3"
                      >
                        {{ index + 1 }}
                      </n-text>
                      <SvgIcon v-else :size="20" name="Music" />
                    </div>
                    <!-- 信息 -->
                    <div class="data">
                      <n-text class="name text-hidden">{{ songData.name || "未知曲目" }}</n-text>
                      <div v-if="Array.isArray(songData?.artists)" class="artists">
                        <n-text v-for="ar in songData.artists" :key="ar.id" depth="3" class="ar">
                          {{
                            settingStore.hideBracketedContent ? removeBrackets(ar.name) : ar.name
                          }}
                        </n-text>
                      </div>
                      <div v-else-if="songData.type === 'radio'" class="artists">
                        <n-text class="ar" depth="3">播客电台</n-text>
                      </div>
                      <div v-else class="artists">
                        <n-text class="ar" depth="3">
                          {{
                            settingStore.hideBracketedContent
                              ? removeBrackets(songData?.artists)
                              : songData?.artists || "未知艺术家"
                          }}
                        </n-text>
                      </div>
                    </div>
                    <!-- 移除 -->
                    <div class="remove" @click.stop="player.removeSongIndex(index)">
                      <SvgIcon :size="20" name="Delete" />
                    </div>
                  </div>
                </div>
              </template>
            </VirtualScroll>
            <n-empty v-else description="当前播放列表暂无歌曲" class="section-empty" size="small" />
          </section>
        </div>
        <n-empty
          v-else
          description="播放队列暂无歌曲，快去添加吧"
          class="tip"
          size="large"
          style="margin-top: 60px"
        />
      </Transition>
      <template #footer>
        <n-grid :cols="2" x-gap="16" class="playlist-menu">
          <n-gi>
            <n-button
              :disabled="!dataStore.nextPlayQueue.length && !dataStore.playList.length"
              :focusable="false"
              size="large"
              strong
              secondary
              @click="cleanPlayList"
            >
              <template #icon>
                <SvgIcon name="DeleteSweep" />
              </template>
              清空列表
            </n-button>
          </n-gi>
          <n-gi>
            <n-button
              :disabled="!canLocateCurrentSong"
              :focusable="false"
              size="large"
              strong
              secondary
              @click="scrollToCurrentSong"
            >
              <template #icon>
                <SvgIcon name="Location" />
              </template>
              当前播放
            </n-button>
          </n-gi>
        </n-grid>
      </template>

      <Teleport to="body">
        <Transition name="fade">
          <div
            v-if="isDragging && dragLabelData"
            class="drag-label"
            :class="{
              'full-player-drag-label': statusStore.showFullPlayer,
            }"
            :style="{
              top: `${dragLabelPosition.top}px`,
              left: `${dragLabelPosition.left}px`,
            }"
          >
            <n-text class="drag-label-name">{{ dragLabelData.name || "未知曲目" }}</n-text>
          </div>
        </Transition>
      </Teleport>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import VirtualScroll from "@/components/UI/VirtualScroll.vue";
import { useDragSort } from "@/composables/List/useDragSort";
import { usePlayerController } from "@/core/player/PlayerController";
import { useDataStore, useMusicStore, useSettingStore, useStatusStore } from "@/stores";
import { removeBrackets } from "@/utils/format";
import type { NScrollbar } from "naive-ui";

const dataStore = useDataStore();
const musicStore = useMusicStore();
const statusStore = useStatusStore();
const settingStore = useSettingStore();
const player = usePlayerController();

const playListRef = ref<InstanceType<typeof VirtualScroll> | null>(null);
const nextQueueListRef = ref<InstanceType<typeof NScrollbar> | null>(null);
const playListItemKeys = new WeakMap<object, number>();
let nextPlayListItemKey = 0;

const isPlaylistSource = computed(() => musicStore.playbackSource === "playlist");
const hasPriorityCurrentSong = computed(
  () => musicStore.playbackSource === "priority" && musicStore.isHasPlayer,
);
const hasQueueContent = computed(
  () =>
    hasPriorityCurrentSong.value ||
    dataStore.nextPlayQueue.length > 0 ||
    dataStore.playList.length > 0,
);
const canLocateCurrentSong = computed(
  () =>
    hasPriorityCurrentSong.value ||
    (isPlaylistSource.value &&
      statusStore.playIndex >= 0 &&
      statusStore.playIndex < dataStore.playList.length),
);

// 播放列表数据
const playListData = computed(() => {
  const keyOccurrences = new Map<number, number>();

  return dataStore.playList.map((item) => {
    let identityKey = playListItemKeys.get(item);
    if (identityKey === undefined) {
      identityKey = nextPlayListItemKey++;
      playListItemKeys.set(item, identityKey);
    }
    const occurrence = keyOccurrences.get(identityKey) ?? 0;
    keyOccurrences.set(identityKey, occurrence + 1);

    return {
      ...item,
      key: `${item.id}-${identityKey}-${occurrence}`,
    };
  });
});

// 定位待播当前项或普通播放列表中的当前歌曲
const scrollToCurrentSong = () => {
  if (hasPriorityCurrentSong.value) {
    nextQueueListRef.value?.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (!canLocateCurrentSong.value) return;
  playListRef.value?.scrollToIndex(statusStore.playIndex);
};

// 播放指定临时待播项
const playNextQueueEntry = (queueId: (typeof dataStore.nextPlayQueue)[number]["queueId"]) => {
  void player.playNextQueueEntry(queueId);
  statusStore.playListShow = false;
};

// 移除指定临时待播项
const removeNextQueueEntry = (queueId: (typeof dataStore.nextPlayQueue)[number]["queueId"]) => {
  void player.removeNextQueueEntry(queueId);
};

// 清空临时待播区
const clearNextPlayQueue = () => {
  if (!dataStore.nextPlayQueue.length) return;
  window.$dialog.warning({
    title: "清空接下来播放",
    content: "确认清空全部待播歌曲吗？",
    positiveText: "确认",
    negativeText: "取消",
    onPositiveClick: async () => {
      await player.clearNextPlayQueue();
      window.$message.success("接下来播放已清空");
    },
  });
};

// 清空播放列表
const cleanPlayList = () => {
  window.$dialog.warning({
    title: "清空播放列表",
    content: "确认清空全部播放列表吗？",
    positiveText: "确认",
    negativeText: "取消",
    onPositiveClick: async () => {
      await player.cleanPlayList();
      window.$message.success("播放列表已清空");
    },
  });
};

const {
  isDragging,
  draggedIndex,
  dropIndicator,
  dragLabelData,
  dragLabelPosition,
  handlePointerDown,
} = useDragSort({
  virtualScrollRef: playListRef,
  itemCount: computed(() => dataStore.playList.length),
  onReorder: (from, to) => player.moveSong(from, to),
  triggerMode: "handle",
});
</script>

<style lang="scss" scoped>
.playlist-header {
  display: flex;
  flex-direction: column;

  .count {
    margin-top: 8px;
    font-size: 12px;
  }
}

.playlist-body {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 142px);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  gap: 12px;
}

.section-heading {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;

  .section-name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  .section-count {
    font-size: 12px;
    white-space: nowrap;
  }
}

.next-queue-section {
  flex: 0 0 auto;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(var(--text-color), 0.08);

  .clear-next {
    flex-shrink: 0;
    font-size: 12px;
  }

  .next-queue-list {
    max-height: min(240px, 32vh);
  }

  .queue-empty {
    display: block;
    padding: 8px 4px 10px;
    font-size: 12px;
  }
}

.current-playlist-section {
  display: grid;
  flex: 1;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;

  > .section-header {
    padding: 4px 16px 0;
  }

  .section-empty {
    align-self: center;
  }
}

.playlist-list,
.next-queue-list {
  .song-node {
    position: relative;
    padding: 8px 0;
  }

  .song-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-direction: row;
    min-height: 64px;
    overflow: hidden;
    border-radius: 8px;
    margin-bottom: 0;
    padding: 0 12px;
    border: 1px solid transparent;
    background-color: rgba(var(--primary), 0.08);
    cursor: pointer;
    transition:
      transform 0.3s,
      border-color 0.3s,
      background-color 0.3s,
      opacity 0.2s;

    &.is-dragging {
      opacity: 0.3;
      transform: scale(0.95);
      border-color: rgba(var(--primary), 0.5);
    }

    .drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 100%;
      cursor: grab;
      color: rgba(var(--text-color), 0.3);
      transition: color 0.3s;
      margin-right: 4px;

      &:hover {
        color: rgba(var(--text-color), 0.8);
      }

      &:active {
        cursor: grabbing;
      }
    }

    .index {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      min-width: 36px;
      margin-right: 8px;

      .num {
        &.big {
          font-size: 12px;
        }
      }
    }

    .data {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      width: 100%;
      min-width: 0;
      height: 100%;
      padding: 8px 0;

      .artists {
        display: -webkit-box;
        line-clamp: 1;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 1;
        overflow: hidden;
        word-break: break-all;

        .ar {
          font-size: 12px;
          display: inline-flex;

          &::after {
            content: "/";
            margin: 0 4px;
          }

          &:last-child {
            &::after {
              display: none;
            }
          }
        }
      }
    }

    .remove {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 8px;
      border-radius: 8px;
      transition: background-color 0.3s;
      cursor: pointer;

      &:hover {
        background-color: rgba(var(--primary), 0.29);
      }
    }

    &.priority-current-item {
      cursor: default;

      .current-label {
        flex-shrink: 0;
        margin-left: 8px;
        font-size: 12px;
        white-space: nowrap;
        color: var(--primary-hex);
      }
    }

    &.on {
      border-color: var(--primary-hex);
      background-color: rgba(var(--primary), 0.29);
    }

    &:hover {
      border-color: var(--primary-hex);
    }
  }
}

.playlist-list {
  min-height: 0;
  padding: 0 16px 16px;

  &.is-dragging-global {
    cursor: grabbing;

    * {
      cursor: grabbing;
    }

    .song-item {
      pointer-events: none;
    }
  }

  .song-node {
    .drop-line {
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background-color: var(--primary-hex);
      border-radius: 2px;
      z-index: 10;
      pointer-events: none;

      &.line-top {
        top: 0;
      }
      &.line-bottom {
        bottom: 0;
      }
    }
  }
}

.playlist-menu {
  height: 40px;

  .n-button {
    width: 100%;
    border-radius: 8px;
  }
}

.drag-label {
  position: fixed;
  z-index: 9999;
  padding: 8px 16px;
  border-radius: 20px;
  background-color: rgba(var(--primary), 0.15);
  backdrop-filter: blur(8px);
  pointer-events: none;
  transform: translate(12px, 12px);

  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: rgba(var(--text-color), 0.3);

  &.full-player-drag-label {
    background-color: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<style lang="scss">
#main-playlist {
  --n-border-radius: 12px;
  .n-drawer-header {
    height: 70px;
  }
  .n-scrollbar-content {
    padding: 0;
    height: 100%;
  }
  .custom-virtual-list {
    .n-scrollbar-content {
      height: auto;
    }
  }
  .n-drawer-footer {
    height: 72px;
    padding: 16px;
  }
  &.full-player {
    --n-color: rgb(var(--main-cover-color));
    --n-close-icon-color: rgba(var(--main-cover-color), 0.58);
    background-color: transparent;
    box-shadow: none;
    .n-drawer-header,
    .n-drawer-footer {
      border: none;
    }
    a,
    span,
    .n-icon {
      color: rgb(var(--main-cover-color));
    }
    .n-button {
      --n-color: rgba(var(--main-cover-color), 0.08);
      --n-color-hover: rgba(var(--main-cover-color), 0.12);
      --n-color-pressed: var(--n-color);
      --n-color-focus: var(--n-color-hover);
    }
    .playlist-list,
    .next-queue-list {
      .song-node {
        .drop-line {
          background-color: rgb(var(--main-cover-color));
          &::before {
            background-color: rgb(var(--main-cover-color));
          }
        }
      }
      .song-item {
        background-color: rgba(var(--main-cover-color), 0.08);
        &.on {
          border-color: rgb(var(--main-cover-color));
        }
        &:hover {
          border-color: rgb(var(--main-cover-color));
        }
        .num {
          color: rgba(var(--main-cover-color), 0.52);
        }
      }
    }
  }
}
</style>
