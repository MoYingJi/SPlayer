<template>
  <div class="edit-lyrics">
    <n-alert v-if="!settingStore.editLyricSavePath" type="warning" class="save-path-alert">
      请先在设置 → 本地配置中设置「优化歌词保存目录」
    </n-alert>
    <n-tabs :value="activeMode" type="line" @update:value="handleModeChange" animated>
      <n-tab-pane v-for="mode in modes" :key="mode.key" :name="mode.key" :tab="mode.label">
        <n-input
          v-model:value="editorContent"
          type="textarea"
          rows="30"
          placeholder="歌词数据"
          class="mono-editor"
          spellcheck="false"
        />
      </n-tab-pane>
    </n-tabs>
    <n-flex justify="space-between" class="footer-actions">
      <n-button :disabled="!settingStore.editLyricSavePath || !hasOverride" @click="handleDelete">
        恢复原歌词
      </n-button>
      <n-flex>
        <n-button @click="onClose">取消</n-button>
        <n-button type="primary" :disabled="!settingStore.editLyricSavePath" @click="handleSave">
          保存
        </n-button>
      </n-flex>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import type { LyricLine } from "@applemusic-like-lyrics/lyric";
import { parseTTML } from "@applemusic-like-lyrics/lyric";
import { useMusicStore, useSettingStore } from "@/stores";
import { useLyricManager } from "@/core/player/LyricManager";
import { compressXml, formatXml } from "@/utils/format";
import {
  lyricLinesToEnhancedLrc,
  lyricLinesToLrc,
  lyricLinesToTTML,
  parseSmartLrc,
} from "@/utils/lyric/lyricParser";

/** 编辑模式 */
interface EditMode {
  key: string;
  label: string;
  toEditor: (lines: LyricLine[]) => string;
  fromEditor: (content: string) => LyricLine[];
  /** 切换到此模式时的警告信息，null 表示无警告 */
  warning: string | null;
}

const props = defineProps<{
  songId: number;
  lyrics: LyricLine[];
  onClose: () => void;
}>();

const settingStore = useSettingStore();
const musicStore = useMusicStore();
const lyricManager = useLyricManager();

// 检测歌词是否包含逐字信息
const hasWordLevel = (lines: LyricLine[]): boolean => {
  return lines.some((line) => {
    if (line.words.length > 1) return true;
    if (line.words.length === 1) {
      const word = line.words[0];
      return word.startTime !== line.startTime || word.endTime !== line.endTime;
    }
    return false;
  });
};

// 编辑模式配置
const modes: EditMode[] = [
  {
    key: "json",
    label: "JSON",
    toEditor: (lines) => JSON.stringify(lines, null, 4),
    fromEditor: (content) => JSON.parse(content) as LyricLine[],
    warning: null,
  },
  {
    key: "ttml",
    label: "美观 TTML",
    toEditor: (lines) => {
      const ttml = lyricLinesToTTML(lines);
      return formatXml(ttml, "    ");
    },
    fromEditor: (content) => {
      return parseTTML(compressXml(content)).lines;
    },
    warning: null,
  },
  {
    key: "lrc",
    label: "LRC",
    toEditor: (lines) => {
      if (hasWordLevel(lines)) {
        return lyricLinesToEnhancedLrc(lines);
      } else {
        return lyricLinesToLrc(lines);
      }
    },
    fromEditor: (content) => {
      return parseSmartLrc(content).lines;
    },
    warning: "LRC 格式不支持对唱等高级特性，切换后这些信息将丢失。",
  },
];

const activeMode = ref(modes[0].key);
const editorContent = ref(modes[0].toEditor(props.lyrics));
const lastSavedContent = ref(editorContent.value);
const hasOverride = ref(false);

// 检查本地覆盖文件是否存在
onMounted(async () => {
  if (settingStore.editLyricSavePath) {
    const filePath = `${settingStore.editLyricSavePath}/${props.songId}.ttml`;
    hasOverride.value = await window.electron.ipcRenderer.invoke("file-exists", filePath);
  }
});

// 检查内容是否有变动
const hasChanges = computed(() => editorContent.value !== lastSavedContent.value);

// 获取当前模式
const currentMode = computed(() => modes.find((m) => m.key === activeMode.value)!);

// 切换编辑模式
const handleModeChange = (targetKey: string) => {
  if (targetKey === activeMode.value) return;

  const targetMode = modes.find((m) => m.key === targetKey);
  if (!targetMode) return;

  const doSwitch = (keepContent: boolean) => {
    if (targetMode.warning) {
      window.$dialog.warning({
        title: "切换到 LRC 格式",
        content: targetMode.warning,
        positiveText: "继续",
        negativeText: "取消",
        onPositiveClick: () => switchMode(targetKey, keepContent),
      });
    } else {
      switchMode(targetKey, keepContent);
    }
  };

  if (hasChanges.value) {
    window.$dialog.warning({
      title: "切换编辑格式",
      content: "当前内容有变动，是否暂存？",
      positiveText: "暂存",
      negativeText: "不暂存",
      onPositiveClick: () => doSwitch(true),
      onNegativeClick: () => doSwitch(false),
    });
  } else {
    doSwitch(true);
  }
};

// 切换模式逻辑
const switchMode = (targetKey: string, keepContent: boolean) => {
  const targetMode = modes.find((m) => m.key === targetKey);
  if (!targetMode) return;

  try {
    if (keepContent) {
      // 解析当前内容，再转换为目标格式
      const lines = currentMode.value.fromEditor(editorContent.value);
      editorContent.value = targetMode.toEditor(lines);
    } else {
      // 重置为默认内容
      editorContent.value = targetMode.toEditor(props.lyrics);
    }
    lastSavedContent.value = editorContent.value;
    activeMode.value = targetKey;
  } catch (e) {
    window.$message.error("内容格式错误，无法切换");
  }
};

// 保存
const handleSave = async () => {
  try {
    const lines = currentMode.value.fromEditor(editorContent.value);
    const ttml = lyricLinesToTTML(lines);
    const success = await window.electron.ipcRenderer.invoke(
      "write-local-lyric",
      settingStore.editLyricSavePath,
      props.songId,
      ttml,
    );
    if (success) {
      lastSavedContent.value = editorContent.value;
      refreshLyric();
      window.$message.success("歌词已保存");
      props.onClose();
    } else {
      window.$message.error("歌词保存失败");
    }
  } catch (e) {
    window.$message.error("内容格式错误或保存失败");
  }
};

// 恢复原歌词
const handleDelete = () => {
  window.$dialog.warning({
    title: "恢复原歌词",
    content: "将删除本地覆盖的歌词文件，此操作不可撤销，确定要继续吗？",
    positiveText: "确定删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      const filePath = `${settingStore.editLyricSavePath}/${props.songId}.ttml`;
      await window.electron.ipcRenderer.invoke("delete-file", filePath);
      refreshLyric();
      window.$message.success("已恢复原歌词");
      props.onClose();
    },
  });
};

// 刷新歌词
const refreshLyric = () => {
  if (props.songId === musicStore.playSong.id) {
    lyricManager.handleLyric(musicStore.playSong);
  }
};
</script>

<style lang="scss" scoped>
.edit-lyrics {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.save-path-alert {
  margin-bottom: 4px;
}

.mono-editor {
  :deep(.n-input__textarea-el) {
    font-family: monospace;
    white-space: pre;
    overflow-x: auto;
  }
}

.footer-actions {
  margin-top: 8px;
}
</style>
