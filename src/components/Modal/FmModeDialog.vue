<template>
  <n-flex class="fm-mode-dialog" vertical :size="20">
    <!-- 推荐模式 -->
    <div class="mode-section">
      <span class="section-label">推荐模式</span>
      <n-grid :cols="2" :x-gap="10" :y-gap="10">
        <n-gi v-for="item in MODES" :key="item.key">
          <n-card
            :bordered="true"
            :border-color="activeMode === item.key ? 'var(--primary-color)' : undefined"
            size="small"
            hoverable
            class="mode-card"
            :class="{ selected: activeMode === item.key }"
            @click="selectMode(item.key)"
          >
            <div class="mode-title" :class="{ active: activeMode === item.key }">
              {{ item.title }}
            </div>
            <div class="mode-desc">{{ item.desc }}</div>
          </n-card>
        </n-gi>
      </n-grid>
    </div>

    <!-- 场景分类与标签 -->
    <div class="scene-section">
      <span class="section-label">场景与风格</span>
      <n-scrollbar style="max-height: 300px">
        <n-flex vertical :size="16" class="scene-list">
          <div v-for="cat in SUBMODE_CATEGORIES" :key="cat.category" class="category-group">
            <span class="category-label">{{ cat.category }}</span>
            <n-flex :size="8" wrap>
              <n-tag
                v-for="sub in cat.items"
                :key="sub.key"
                round
                :type="
                  activeMode === 'SCENE_RCMD' && activeSubMode === sub.key ? 'primary' : 'default'
                "
                :bordered="activeMode === 'SCENE_RCMD' && activeSubMode === sub.key"
                :disabled="switching"
                class="scene-tag"
                @click="selectSubMode(sub.key, sub.label)"
              >
                {{ sub.label }}
              </n-tag>
            </n-flex>
          </div>
        </n-flex>
      </n-scrollbar>
    </div>
  </n-flex>
</template>

<script setup lang="ts">
/**
 * 私人 FM 模式与场景选择对话框
 */
import type { PersonalFmMode, PersonalFmSubMode } from "@/types/shared/play-mode";
import { useStatusStore } from "@/stores";
import { usePlayerController } from "@/core/player/PlayerController";
import { useSongManager } from "@/core/player/SongManager";

const statusStore = useStatusStore();
const player = usePlayerController();
const songManager = useSongManager();

/** 主模式定义 */
interface ModeItem {
  key: PersonalFmMode;
  title: string;
  desc: string;
}

const MODES: ModeItem[] = [
  {
    key: "DEFAULT",
    title: "默认模式",
    desc: "沿着目前喜好继续聆听",
  },
  {
    key: "FAMILIAR",
    title: "熟悉模式",
    desc: "喜欢过的歌曲与相似推荐",
  },
  {
    key: "EXPLORE",
    title: "探索模式",
    desc: "偏好曲风与潜力好歌",
  },
  {
    key: "SCENE_RCMD",
    title: "场景模式",
    desc: "根据特定场景与氛围推荐",
  },
];

/** 场景子模式分类与标签 */
interface SubModeCategory {
  category: string;
  items: Array<{ key: PersonalFmSubMode; label: string }>;
}

const SUBMODE_CATEGORIES: SubModeCategory[] = [
  {
    category: "生活场景",
    items: [
      { key: "EXERCISE", label: "运动" },
      { key: "FOCUS", label: "专注" },
      { key: "SLEEP_HELP", label: "助眠" },
      { key: "COMMUTE", label: "出行" },
      { key: "COFFEE_SHOP", label: "咖啡馆" },
      { key: "TAKE_SHOWER", label: "洗澡" },
      { key: "GAMES", label: "游戏" },
    ],
  },
  {
    category: "心情氛围",
    items: [
      { key: "RELAX", label: "放松" },
      { key: "CHEERFUL", label: "欢快" },
      { key: "NIGHT_EMO", label: "伤感" },
      { key: "CURE", label: "治愈" },
      { key: "LYRICAL", label: "抒情" },
      { key: "SWEET", label: "情歌" },
      { key: "INSPIRATIONAL", label: "励志" },
      { key: "RAINY", label: "雨天" },
    ],
  },
  {
    category: "曲风流派",
    items: [
      { key: "GUOFENG", label: "国风" },
      { key: "CHINESE", label: "华语" },
      { key: "ENGLISH", label: "欧美" },
      { key: "YUEYU", label: "粤语" },
      { key: "JAPANESE", label: "日语" },
      { key: "K_POP", label: "K-Pop" },
      { key: "FRANCH", label: "法语" },
      { key: "GLOBAL", label: "全球" },
      { key: "ELECTRONIC", label: "电音" },
      { key: "RAP", label: "说唱" },
      { key: "ROCK", label: "摇滚" },
      { key: "FOLK", label: "民谣" },
      { key: "ACG", label: "二次元" },
      { key: "LIGHT", label: "轻音乐" },
      { key: "JAZZ", label: "爵士" },
      { key: "GUDIAN", label: "古典" },
      { key: "RHYTHM_BLUES", label: "R&B" },
      { key: "BLUE", label: "蓝调" },
      { key: "PUNK", label: "放克" },
      { key: "DANCE", label: "舞蹈" },
      { key: "LATIN", label: "拉丁" },
      { key: "COUNTRY", label: "乡村乐" },
      { key: "MANYAO", label: "慢摇DJ" },
      { key: "JINGDIAN", label: "经典" },
      { key: "ORIGINAL_MUSICIAL", label: "宝藏原创" },
      { key: "MUSICAL", label: "音乐剧" },
      { key: "YINGSHI", label: "影视" },
    ],
  },
];

/** 当前选中的模式 */
const activeMode = ref<PersonalFmMode>(statusStore.personalFmModeType);
/** 当前选中的子场景 */
const activeSubMode = ref<PersonalFmSubMode>(statusStore.personalFmSubMode);
/** 是否处于切换中 */
const switching = ref(false);

/**
 * 切换模式
 * @param mode - 目标模式
 */
const selectMode = async (mode: PersonalFmMode): Promise<void> => {
  if (switching.value) return;
  activeMode.value = mode;

  if (mode !== "SCENE_RCMD") {
    switching.value = true;
    try {
      const modeLabel = MODES.find((m) => m.key === mode)?.title ?? "私人 FM";
      statusStore.personalFmModeType = mode;
      // 清空列表以强制重新获取
      const musicStore = (await import("@/stores")).useMusicStore();
      musicStore.personalFM.list = [];
      statusStore.personalFmMode = true;
      statusStore.shuffleMode = "off";
      await songManager.initPersonalFM(true, { mode });
      await player.playSong();
      window.$message.success(`已切换至 「${modeLabel}」`);
    } catch {
      window.$message.warning("模式切换失败，请稍后重试");
    } finally {
      switching.value = false;
    }
  }
};

/**
 * 选中并切换场景
 * @param submode - 目标场景
 * @param label - 场景中文名
 */
const selectSubMode = async (submode: PersonalFmSubMode, label: string): Promise<void> => {
  if (switching.value) return;
  activeMode.value = "SCENE_RCMD";
  activeSubMode.value = submode;

  switching.value = true;
  try {
    statusStore.personalFmModeType = "SCENE_RCMD";
    statusStore.personalFmSubMode = submode;
    // 清空列表以强制重新获取
    const musicStore = (await import("@/stores")).useMusicStore();
    musicStore.personalFM.list = [];
    statusStore.personalFmMode = true;
    statusStore.shuffleMode = "off";
    await songManager.initPersonalFM(true, { mode: "SCENE_RCMD", submode });
    await player.playSong();
    window.$message.success(`已切换至 「${label}」场景`);
  } catch {
    window.$message.warning("场景切换失败，请稍后重试");
  } finally {
    switching.value = false;
  }
};
</script>

<style lang="scss" scoped>
.fm-mode-dialog {
  padding: 4px 0;

  .section-label {
    font-size: 12px;
    font-weight: 500;
    color: rgb(var(--text-color-3));
  }

  .mode-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mode-card {
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;

    &:hover {
      border-color: rgb(var(--primary-color));
    }

    &.selected {
      border-color: var(--primary-color) !important;
      background-color: rgba(var(--primary-color), 0.05);
    }

    .mode-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color);

      &.active {
        color: var(--primary-color);
      }
    }

    .mode-desc {
      font-size: 12px;
      color: rgb(var(--text-color-3));
      margin-top: 2px;
    }
  }

  .scene-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .scene-list {
    padding-right: 4px;
  }

  .category-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category-label {
    font-size: 11px;
    font-weight: 500;
    color: rgb(var(--text-color-3));
    opacity: 0.6;
    padding-left: 2px;
  }

  .scene-tag {
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      opacity: 0.8;
    }

    &.n-tag--disabled-type-default {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
</style>
