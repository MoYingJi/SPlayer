<template>
  <div class="edit-lyrics">
    <n-alert v-if="!settingStore.editLyricSavePath" type="warning" class="save-path-alert">
      请先在设置 → 本地配置中设置「优化歌词保存目录」
    </n-alert>
    <n-input
      v-model:value="lyricsJson"
      type="textarea"
      :autosize="{ minRows: 15, maxRows: 30 }"
      placeholder="歌词 JSON 数据"
      spellcheck="false"
    />
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
import { useMusicStore, useSettingStore } from "@/stores";
import { useLyricManager } from "@/core/player/LyricManager";
import { lyricLinesToTTML } from "@/utils/lyric/lyricParser";

const props = defineProps<{
  songId: number;
  lyrics: LyricLine[];
  onClose: () => void;
}>();

const settingStore = useSettingStore();
const musicStore = useMusicStore();
const lyricManager = useLyricManager();

const lyricsJson = ref(JSON.stringify(props.lyrics, null, 2));
const hasOverride = ref(false);

// 检查本地覆盖文件是否存在
onMounted(async () => {
  if (settingStore.editLyricSavePath) {
    const filePath = `${settingStore.editLyricSavePath}/${props.songId}.ttml`;
    hasOverride.value = await window.electron.ipcRenderer.invoke("file-exists", filePath);
  }
});

const handleSave = async () => {
  try {
    const lyrics = JSON.parse(lyricsJson.value) as LyricLine[];
    const ttml = lyricLinesToTTML(lyrics);
    const success = await window.electron.ipcRenderer.invoke(
      "write-local-lyric",
      settingStore.editLyricSavePath,
      props.songId,
      ttml,
    );
    if (success) {
      // 刷新歌词
      lyricManager.handleLyric(musicStore.playSong);
      window.$message.success("歌词已保存");
      props.onClose();
    } else {
      window.$message.error("歌词保存失败");
    }
  } catch (e) {
    window.$message.error("JSON 格式错误或保存失败");
  }
};

const handleDelete = () => {
  window.$dialog.warning({
    title: "恢复原歌词",
    content: "将删除本地覆盖的歌词文件，此操作不可撤销，确定要继续吗？",
    positiveText: "确定删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      const filePath = `${settingStore.editLyricSavePath}/${props.songId}.ttml`;
      // 文件不存在也视为成功
      await window.electron.ipcRenderer.invoke("delete-file", filePath);
      lyricManager.handleLyric(musicStore.playSong);
      window.$message.success("已恢复原歌词");
      props.onClose();
    },
  });
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

.footer-actions {
  margin-top: 8px;
}
</style>
