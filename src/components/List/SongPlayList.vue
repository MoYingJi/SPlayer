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
        <div v-if="hasQueueContent" ref="playlistBodyRef" class="playlist-body">
          <!-- 固定吸附区：顶栏 + 吸顶卡，不随列表滚动，毛玻璃直接采样底层背景 -->
          <section ref="stickyZoneRef" class="sticky-zone">
            <div
              ref="nextQueueHeaderRef"
              class="section-header"
              :class="{ 'is-collapsed': nextQueueCollapsed }"
            >
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
            <!-- 下一首吸顶常驻，粘滞范围延伸至整个滚动内容 -->
            <div
              v-if="dataStore.nextPlayQueue.length"
              ref="stickyTrackRef"
              class="song-node is-sticky-track next-queue-item"
              :class="{ 'is-sticky-active': isTrackStuck }"
            >
              <div
                class="song-item queue-item"
                v-debounce="() => playNextQueueEntry(dataStore.nextPlayQueue[0].queueId)"
              >
                <div class="index">
                  <SvgIcon :size="20" name="PlayNext" />
                </div>
                <div class="data">
                  <n-text class="name text-hidden">
                    {{ dataStore.nextPlayQueue[0].song.name || "未知曲目" }}
                  </n-text>
                  <div
                    v-if="Array.isArray(dataStore.nextPlayQueue[0].song?.artists)"
                    class="artists"
                  >
                    <n-text
                      v-for="ar in dataStore.nextPlayQueue[0].song.artists"
                      :key="ar.id"
                      depth="3"
                      class="ar"
                    >
                      {{ settingStore.hideBracketedContent ? removeBrackets(ar.name) : ar.name }}
                    </n-text>
                  </div>
                  <div v-else-if="dataStore.nextPlayQueue[0].song.type === 'radio'" class="artists">
                    <n-text class="ar" depth="3">播客电台</n-text>
                  </div>
                  <div v-else class="artists">
                    <n-text class="ar" depth="3">
                      {{
                        settingStore.hideBracketedContent
                          ? removeBrackets(dataStore.nextPlayQueue[0].song?.artists)
                          : dataStore.nextPlayQueue[0].song?.artists || "未知艺术家"
                      }}
                    </n-text>
                  </div>
                </div>
                <div
                  class="remove"
                  @click.stop="removeNextQueueEntry(dataStore.nextPlayQueue[0].queueId)"
                >
                  <SvgIcon :size="20" name="Delete" />
                </div>
                <div class="next-artist">
                  <n-text
                    v-if="Array.isArray(dataStore.nextPlayQueue[0].song?.artists)"
                    class="text-hidden"
                    depth="3"
                  >
                    {{
                      dataStore.nextPlayQueue[0].song.artists
                        .map((ar) =>
                          settingStore.hideBracketedContent ? removeBrackets(ar.name) : ar.name,
                        )
                        .join(" / ")
                    }}
                  </n-text>
                  <n-text v-else-if="dataStore.nextPlayQueue[0].song.type === 'radio'" depth="3">
                    播客电台
                  </n-text>
                  <n-text v-else class="text-hidden" depth="3">
                    {{
                      settingStore.hideBracketedContent
                        ? removeBrackets(dataStore.nextPlayQueue[0].song?.artists)
                        : dataStore.nextPlayQueue[0].song?.artists || "未知艺术家"
                    }}
                  </n-text>
                </div>
              </div>
            </div>
          </section>
          <!-- 独立滚动区：优先级 / 待播队列 / 播放列表，内容不会滚入上方吸附区 -->
          <div class="playlist-scroll">
            <n-scrollbar
              ref="bodyScrollerRef"
              class="playlist-body-scroller"
              @scroll="handleBodyScroll"
            >
              <div
                v-if="hasPriorityCurrentSong"
                ref="nextQueuePriorityRef"
                class="song-node next-queue-item"
              >
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
                        {{ settingStore.hideBracketedContent ? removeBrackets(ar.name) : ar.name }}
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
              <div v-if="restPlayQueue.length" ref="restQueueListRef" class="next-queue-list">
                <div
                  v-for="queueEntry in restPlayQueue"
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
              <div
                v-if="!hasPriorityCurrentSong && !dataStore.nextPlayQueue.length"
                ref="queueEmptyRef"
                class="queue-empty"
              >
                <n-text depth="3">暂无待播歌曲</n-text>
              </div>

              <section class="current-playlist-section">
                <div ref="playlistHeaderRef" class="section-header playlist-header">
                  <div class="section-heading">
                    <SvgIcon :size="20" name="MusicList" />
                    <n-text class="section-name">当前播放列表</n-text>
                  </div>
                  <n-text class="section-count">{{ dataStore.playList.length }} 首</n-text>
                </div>
                <!-- 普通列表继续使用虚拟滚动和独立索引 -->
                <VirtualScroll
                  v-if="dataStore.playList.length"
                  ref="playListRef"
                  :item-height="80"
                  :item-fixed="true"
                  :items="playListData"
                  :default-scroll-index="isPlaylistSource ? statusStore.playIndex : 0"
                  :height="playlistViewportHeight"
                  :padding-bottom="16"
                  :external-scroll="true"
                  :get-external-scroll-top="getVirtualScrollTop"
                  :scroll-external-to="scrollVirtualTo"
                  :get-external-scroll-rect="getVirtualScrollRect"
                  class="playlist-list"
                  :class="{ 'is-dragging-global': isDragging }"
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
                          <n-text class="name text-hidden">{{
                            songData.name || "未知曲目"
                          }}</n-text>
                          <div v-if="Array.isArray(songData?.artists)" class="artists">
                            <n-text
                              v-for="ar in songData.artists"
                              :key="ar.id"
                              depth="3"
                              class="ar"
                            >
                              {{
                                settingStore.hideBracketedContent
                                  ? removeBrackets(ar.name)
                                  : ar.name
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
                <n-empty
                  v-else
                  description="当前播放列表暂无歌曲"
                  class="section-empty"
                  size="small"
                />
              </section>
            </n-scrollbar>
          </div>
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
const bodyScrollerRef = ref<InstanceType<typeof NScrollbar> | null>(null);
const playlistBodyRef = ref<HTMLElement | null>(null);
const playlistHeaderRef = ref<HTMLElement | null>(null);
const stickyZoneRef = ref<HTMLElement | null>(null);
const playListItemKeys = new WeakMap<object, number>();
let nextPlayListItemKey = 0;

// 播放列表虚拟视口高度：与抽屉内容可视高度保持一致
const { height: bodyHeight } = useElementSize(playlistBodyRef);
// 「接下来播放」滚动区（优先级/待播队列/空提示）总高度，用于虚拟列表起始偏移
const queueSectionHeight = computed(
  () =>
    (nextQueuePriorityHeight.value || 0) +
    (restQueueListHeight.value || 0) +
    (queueEmptyHeight.value || 0),
);
// 播放列表标题区域高度
const { height: playlistHeaderHeight } = useElementSize(playlistHeaderRef);
// 固定吸附区高度（顶栏 + 吸顶卡），卡片压缩时随之收缩
const { height: stickyZoneHeight } = useElementSize(stickyZoneRef);
const nextQueuePriorityRef = ref<HTMLElement | null>(null);
const restQueueListRef = ref<HTMLElement | null>(null);
const queueEmptyRef = ref<HTMLElement | null>(null);
const { height: nextQueuePriorityHeight } = useElementSize(nextQueuePriorityRef);
const { height: restQueueListHeight } = useElementSize(restQueueListRef);
const { height: queueEmptyHeight } = useElementSize(queueEmptyRef);
const nextQueueCollapsed = ref(false);
// 「下一首」是否压缩（吸附区卡片形态切换），滚动超过阈值触发、回顶恢复
const isTrackStuck = ref(false);
// 待播队列跳过吸顶的首项
const restPlayQueue = computed(() => dataStore.nextPlayQueue.slice(1));

// 虚拟列表可视高度：吸附区下方滚动区高度
const playlistViewportHeight = computed(() =>
  Math.max(0, (bodyHeight.value || 0) - (stickyZoneHeight.value || 0)),
);

// 虚拟列表相对滚动容器的起始偏移（滚动区内队列区域总高度）
const virtualOffset = computed(() => queueSectionHeight.value + playlistHeaderHeight.value);

// 外层滚动容器底层可滚动元素（naive 自定义滚动条）
const getBodyScrollElement = () =>
  document.querySelector(
    "#main-playlist .playlist-body-scroller .n-scrollbar-container",
  ) as HTMLElement | null;

// 外层滚动事件 -> 驱动虚拟列表视口
const handleBodyScroll = (event: Event) => {
  const top = (event.target as HTMLElement)?.scrollTop || 0;
  // 顶栏折叠（仅隐藏清空按钮）滞回，避免阈值附近抖动
  if (!nextQueueCollapsed.value && top > 80) nextQueueCollapsed.value = true;
  else if (nextQueueCollapsed.value && top < 40) nextQueueCollapsed.value = false;
  // 吸顶卡压缩：滚动超过阈值即压缩，明显回顶才恢复
  if (!isTrackStuck.value && top > 40) isTrackStuck.value = true;
  else if (isTrackStuck.value && top < 2) isTrackStuck.value = false;
  playListRef.value?.setExternalScrollTop(Math.max(0, top - virtualOffset.value));
};

// 虚拟列表内部滚动位置（外层滚动位置减去上方偏移）
const getVirtualScrollTop = () =>
  Math.max(0, (getBodyScrollElement()?.scrollTop || 0) - virtualOffset.value);

// 虚拟列表滚动到内部位置 -> 联动外层容器
const scrollVirtualTo = (top: number, behavior: ScrollBehavior = "auto") => {
  bodyScrollerRef.value?.scrollTo({ top: top + virtualOffset.value, behavior });
};

// 拖拽定位所需的外层可视区矩形
const getVirtualScrollRect = () => getBodyScrollElement()?.getBoundingClientRect() ?? null;

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
    bodyScrollerRef.value?.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (!canLocateCurrentSong.value) return;
  playListRef.value?.scrollToIndex(statusStore.playIndex, "smooth");
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

.playlist-body-scroller {
  height: 100%;
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

.sticky-zone {
  flex: none;
  position: relative;
  z-index: 2;
  //background-color: var(--n-color);

  // 顶栏：随吸附区固定，折叠仅隐藏清空按钮
  > .section-header {
    margin: 8px 16px 0;
    padding: 8px 0;

    &.is-collapsed {
      .clear-next {
        display: none;
      }
    }
  }

  .clear-next {
    flex-shrink: 0;
    font-size: 12px;
  }

  // 吸顶卡：固定于吸附区，滚动触发压缩形态
  .song-node.is-sticky-track {
    margin: 0 16px;
    padding: 8px 0;

    .next-artist {
      display: none;
    }

    // 压缩/展开过渡
    .song-item {
      transition:
        min-height 0.25s,
        height 0.25s,
        border-color 0.3s,
        background-color 0.3s,
        opacity 0.2s;
    }

    // 压缩单行：歌名撑满优先完整显示，歌手居右顶替删除按钮
    &.is-sticky-active {
      .song-item {
        min-height: 36px;
        height: 36px;
        padding: 0 12px;

        .data {
          padding: 0;

          .artists {
            display: none;
          }
        }

        .remove,
        .drag-handle {
          display: none;
        }

        .next-artist {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          max-width: 55%;
          margin-left: 8px;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }
  }
}

// 独立滚动区：吸附区下方，内容不会滚入吸附区
.playlist-scroll {
  flex: 1;
  min-height: 0;

  // 滚动区内的优先级 / 待播队列使用左右边距
  > .n-scrollbar {
    height: 100%;
  }

  .next-queue-item,
  .next-queue-list .song-node {
    padding: 8px 16px;
  }

  .queue-empty {
    display: block;
    padding: 8px 16px 10px;
    font-size: 12px;
  }

  // 当前播放列表标题吸顶于滚动区顶部（吸附区下沿）
  .playlist-header {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: 0 16px;
    padding: 8px 0;
    //background-color: var(--n-color);
    flex-direction: row;
  }

  .current-playlist-section {
    min-height: 0;

    .section-empty {
      margin-top: 40px;
    }
  }
}

.playlist-list,
.next-queue-list,
.next-queue-item {
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
  padding: 0 16px;

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
  .playlist-body-scroller {
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
    // 固定吸附区：列表已分离到下方，毛玻璃只采样封面背景，遮挡且不发白
    .sticky-zone {
      //background: linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.15)),
      //  rgba(var(--main-cover-color), 0.6);
      //backdrop-filter: blur(14px) saturate(1.3);
    }
    // 列表标题：不透明深色封面底遮挡滚过的队列。不用 blur——其背面正是列表
    // 内容，backdrop-filter 会采样它们导致泛白
    .playlist-scroll .playlist-header {
      //background: linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.35)),
      //  rgb(var(--main-cover-color));
    }
    .playlist-list,
    .next-queue-list,
    .next-queue-item {
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
