<!-- 视频 -->
<template>
  <div class="video">
    <!-- 视频信息 -->
    <Transition name="fade" mode="out-in">
      <div v-if="videoData" class="info">
        <n-h2 class="name">
          <n-ellipsis :line-clamp="1" :tooltip="{ placement: 'bottom' }">
            {{ videoData.name || "未知视频" }}
          </n-ellipsis>
        </n-h2>
        <n-flex class="meta" align="center">
          <div class="item">
            <SvgIcon name="Video" :depth="3" />
            <n-text>{{ formatNumber(videoData.playCount || 0) }}</n-text>
          </div>
          <div class="item">
            <SvgIcon name="Chat" :depth="3" />
            <n-text>{{ formatNumber(videoData.commentCount || 0) }}</n-text>
          </div>
          <div class="item">
            <SvgIcon name="Time" :depth="3" />
            <n-text>{{ formatTimestamp(videoData.updateTime || videoData.createTime) }}</n-text>
          </div>
        </n-flex>
      </div>
      <div v-else class="info">
        <n-skeleton :repeat="2" text round />
      </div>
    </Transition>
    <!-- 视频播放器 -->
    <div class="player" v-visible>
      <media-i18n lang="zh-CN">
        <video-player :poster="videoData?.cover">
          <video-neutral-skin class="skin">
            <video ref="videoRef" autoplay playsinline @playing="player.pause()" />
          </video-neutral-skin>
        </video-player>
      </media-i18n>
      <n-select
        v-if="qualityOptions.length > 1"
        v-model:value="selectedQuality"
        class="quality-selector"
        size="small"
        :options="qualityOptions"
        @update:value="changeQuality"
      />
    </div>
    <!-- 菜单 -->
    <Transition name="fade" mode="out-in">
      <n-flex :key="videoData?.id" class="menu" justify="space-between" align="center">
        <div
          class="artist"
          @click="
            router.push({
              name: 'artist',
              query: { id: artistData?.id },
            })
          "
        >
          <n-avatar
            v-if="!settingStore.hiddenCovers.videoDetail"
            :src="artistData?.cover || '/images/artist.jpg?asset'"
            class="cover"
            round
          />
          <n-text class="name">{{ artistData?.name || "未知歌手" }}</n-text>
        </div>
        <n-flex class="control">
          <!-- 点赞 -->
          <n-button :focusable="false" quaternary>
            <template #icon>
              <SvgIcon :name="videoData?.liked ? 'ThumbUp' : 'ThumbUpOff'" />
            </template>
            {{ formatNumber(videoData?.likedCount || 0) }}
          </n-button>
          <!-- 收藏 -->
          <n-button :focusable="false" quaternary>
            <template #icon>
              <SvgIcon name="Favorite" />
              <!-- FavoriteBorder -->
            </template>
            {{ formatNumber(videoData?.subCount || 0) }}
          </n-button>
          <!-- 分享 -->
          <n-button :focusable="false" quaternary>
            <template #icon>
              <SvgIcon name="Share" />
              <!-- FavoriteBorder -->
            </template>
            {{ formatNumber(videoData?.shareCount || 0) }}
          </n-button>
        </n-flex>
      </n-flex>
    </Transition>
    <!-- 简介及标签 -->
    <Transition name="fade" mode="out-in">
      <div v-if="videoData" class="desc">
        <n-divider />
        <n-ellipsis :line-clamp="3" :tooltip="{ placement: 'bottom', width: 'trigger' }">
          {{ videoData?.description || "该视频暂无简介" }}
        </n-ellipsis>
        <n-flex v-if="videoData?.tags" class="tags">
          <n-tag v-for="(item, index) in videoData.tags" :key="index" :bordered="false" round>
            {{ item }}
          </n-tag>
        </n-flex>
        <n-divider />
      </div>
      <div v-else class="desc">
        <n-skeleton :repeat="3" text round />
      </div>
    </Transition>
    <!-- 评论 -->
    <div class="comment">
      <n-flex class="title" justify="space-between">
        <n-h3 prefix="bar">
          评论
          <n-text class="num" depth="3">{{ videoData?.commentCount || 0 }}</n-text>
        </n-h3>
        <n-flex class="tag">
          <n-tag
            v-for="(item, key, index) in commentText"
            :key="index"
            :bordered="false"
            :type="key === commentType ? 'primary' : 'default'"
            round
          >
            {{ item }}
          </n-tag>
        </n-flex>
      </n-flex>
      <CommentList
        :data="commentData"
        :loading="commentLoading"
        :type="videoType === 'mv' ? 1 : 5"
        :loadMore="commentHasMore"
        :res-id="videoId"
        :hiddenCover="settingStore.hiddenCovers.videoDetail"
        @loadMore="loadMoreComment"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CoverType, CommentType } from "@/types/main";
import { useStatusStore, useSettingStore } from "@/stores";
import { videoDetail, videoUrl, videoDetailInfo } from "@/api/video";
import { formatCommentList, formatCoverList } from "@/utils/format";
import { isArray, isEmpty } from "lodash-es";
import { formatNumber } from "@/utils/helper";
import { getComment } from "@/api/comment";
import { usePlayerController } from "@/core/player/PlayerController";
import "@videojs/html/i18n";
import "@videojs/html/video/player";
import "@videojs/html/video/neutral-skin";
import { formatTimestamp } from "@/utils/time";

const router = useRouter();
const player = usePlayerController();
const statusStore = useStatusStore();
const settingStore = useSettingStore();

// 是否激活
const isActivated = ref<boolean>(false);

// 视频参数
const videoId = computed<number>(() => Number(router.currentRoute.value.query.id as string));
const videoType = computed<"video" | "mv">(
  () => (router.currentRoute.value.query.type as "video" | "mv") || "mv",
);

// 视频数据
const videoRef = ref<HTMLVideoElement | null>(null);
const videoData = ref<CoverType | null>(null);
const videoSources = ref<VideoSource[]>([]);
const selectedQuality = ref<number | null>(null);

// 评论数据
const commentLoading = ref<boolean>(true);
const commentData = ref<CommentType[]>([]);
const commentType = ref<"hot" | "new">("hot");
const commentPage = ref<number>(1);
const commentHasMore = ref<boolean>(true);
const commentText = { hot: "最热", new: "最新" };

// 歌手数据
const artistData = computed(
  () => (isArray(videoData.value?.artists) && videoData.value?.artists?.[0]) || null,
);

type VideoSource = {
  quality: number;
  src: string;
};

const qualityOptions = computed(() =>
  videoSources.value.map(({ quality }) => ({
    label: `${quality}P`,
    value: quality,
  })),
);

const setVideoSource = (source: VideoSource, currentTime = 0, shouldPlay = true) => {
  const media = videoRef.value;
  if (!media) return;

  media.src = source.src;
  media.load();
  media.addEventListener(
    "loadedmetadata",
    () => {
      if (Number.isFinite(currentTime) && currentTime > 0) {
        media.currentTime = Math.min(currentTime, media.duration || currentTime);
      }
      if (shouldPlay) {
        void media.play().catch((error: unknown) => {
          console.error("视频自动播放失败：", error);
        });
      }
    },
    { once: true },
  );
};

const changeQuality = (quality: number) => {
  const source = videoSources.value.find((item) => item.quality === quality);
  const media = videoRef.value;
  if (!source || !media) return;

  selectedQuality.value = quality;
  setVideoSource(source, media.currentTime, !media.paused);
};

// 获取视频数据
const getVideoData = async (id: number, type: "mv" | "video") => {
  try {
    if (!id) return;
    // 获取视频详情
    const detail = await videoDetail(id, type);
    const detailInfo = await videoDetailInfo(id, type);
    // 处理数据
    videoData.value = formatCoverList({ ...detail.data, ...detailInfo })[0];
    // 获取视频地址
    const brs = detail.data?.brs;
    if (isEmpty(brs)) {
      window.$message.error("播放地址获取失败");
      return;
    }
    const requests = brs.map(async ({ br }: { br: number }): Promise<VideoSource | null> => {
      try {
        const result = await videoUrl(id, type, br);
        const quality = Number(result.data.r);
        if (!result.data.url || !Number.isFinite(quality) || quality <= 0) return null;
        return {
          src: result.data.url.replace(/^http:/, "https:"),
          quality,
        };
      } catch (error) {
        console.error("视频地址加载失败：", error);
        return null;
      }
    });
    videoSources.value = (await Promise.all(requests))
      .filter((source): source is VideoSource => source !== null)
      .sort((first, second) => second.quality - first.quality);
    if (videoSources.value.length === 0) {
      window.$message.error("播放地址获取失败");
      return;
    }
    const defaultSource =
      videoSources.value.find((source) => source.quality === 1080) || videoSources.value[0];
    selectedQuality.value = defaultSource.quality;
    setVideoSource(defaultSource);
    // 获取评论
    getCommentData(id);
  } catch (error) {
    console.error("Error getting video data:", error);
    window.$message.error("获取视频数据失败");
  }
};

// 获取评论数据
const getCommentData = async (id: number, clean: boolean = true) => {
  try {
    if (!id) return;
    commentLoading.value = true;
    if (clean) commentData.value = [];
    // 分页参数
    const cursor =
      commentPage.value > 1 && commentData.value?.length > 0
        ? commentData.value[commentData.value.length - 1]?.time
        : undefined;
    // 获取评论
    const result = await getComment(
      id,
      videoType.value === "mv" ? 1 : 5,
      commentPage.value,
      20,
      commentType.value === "hot" ? 2 : 3,
      cursor,
    );
    if (isEmpty(result.data?.comments)) {
      commentHasMore.value = false;
      commentLoading.value = false;
      return;
    }
    // 处理数据
    const formatData = formatCommentList(result.data.comments);
    commentData.value = commentData.value.concat(formatData);
    // 是否还有
    commentHasMore.value = result.data.hasMore;
    commentLoading.value = false;
  } catch (error) {
    console.error("Error getting comment data:", error);
    window.$message.error("获取评论数据失败");
  }
};

// 加载更多评论
const loadMoreComment = () => {
  commentPage.value++;
  if (commentHasMore.value) getCommentData(videoId.value, false);
};

// 关闭音乐播放
const closeMusic = (close: boolean = true) => {
  statusStore.showPlayBar = !close;
  if (close) player.pause();
};

onActivated(() => {
  if (!isActivated.value) {
    isActivated.value = true;
  } else {
    closeMusic();
    if (videoId.value !== videoData.value?.id) {
      // initPlayer();
      getVideoData(videoId.value, videoType.value);
    }
  }
});

onDeactivated(() => {
  closeMusic(false);
});

onMounted(() => {
  closeMusic();
  // 获取视频数据
  getVideoData(videoId.value, videoType.value);
});

onUnmounted(() => {
  closeMusic(false);
  videoRef.value?.pause();
});
</script>

<style lang="scss" scoped>
.video {
  .info {
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    height: 60px;
    margin: 20px 0;
    .name {
      font-size: 28px;
      font-weight: bold;
      line-height: 30px;
      margin-bottom: 8px;
    }
    .meta {
      width: 100%;
      .item {
        display: flex;
        align-items: center;
        .n-icon {
          font-size: 18px;
          margin-right: 6px;
        }
      }
    }
  }
  .player {
    position: relative;
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    .skin {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      max-height: 520px;
      --media-accent-color: var(--primary-hex);
      --media-border-radius: 12px;
    }
    .quality-selector {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 100px;
      z-index: 1;
    }
  }
  .menu {
    height: 40px;
    margin: 20px 0;
    .artist {
      display: flex;
      align-items: center;
      margin-left: 8px;
      cursor: pointer;
      .cover {
        margin-right: 12px;
        width: 40px;
        height: 40px;
      }
      .name {
        display: inline-flex;
        flex-direction: column;
        font-size: 16px;
        font-weight: bold;
        &::after {
          content: "查看详情";
          font-size: 12px;
          font-weight: normal;
          opacity: 0.6;
        }
      }
    }
    .n-button {
      border-radius: 8px;
    }
  }
  .desc {
    padding: 0 6px;
    margin-bottom: 20px;
    .n-divider {
      margin: 12px 0;
    }
    :deep(.n-ellipsis) {
      cursor: pointer;
    }
    .tags {
      margin-top: 4px;
    }
  }
  .comment {
    .title {
      margin-bottom: 20px;
      .n-h {
        display: inline-flex;
        align-items: center;
        margin-bottom: 0;
        .num {
          margin-left: 6px;
          font-size: 14px;
          line-height: 18px;
        }
      }
    }
  }
}
</style>
