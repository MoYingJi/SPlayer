import { useShortcutStore } from "@/stores";
import { SettingItem, SettingConfig } from "@/types/settings";
import { computed, markRaw } from "vue";
import ShortcutRecorder from "../components/ShortcutRecorder.vue";

export const useKeyboardSettings = (): SettingConfig => {
  const shortcutStore = useShortcutStore();

  // 获取全局快捷键后端模式（portal / electron）
  void shortcutStore.initGlobalShortcutMode();

  // portal 模式下无法自定义全局快捷键，禁用录制并提示
  const isPortalMode = computed(() => shortcutStore.globalShortcutMode === "portal");

  // 关闭 portal 后强制回退 electron，仅 Linux 下可见
  const isPortalAvailable = computed(() => shortcutStore.shortcutBackendPreference === "auto");
  const showBackendChoice = computed(() => isPortalMode.value || isPortalAvailable.value);

  const updateGlobalOpen = async (val: boolean) => {
    if (val) {
      await shortcutStore.registerAllShortcuts();
    } else {
      window.electron.ipcRenderer.send("unregister-all-shortcut");
      // 清除状态
      for (const key in shortcutStore.shortcutList) {
        shortcutStore.shortcutList[key as keyof typeof shortcutStore.shortcutList].isRegistered =
          false;
      }
    }
    shortcutStore.globalOpen = val;
  };

  const createShortcutItems = (filterKeys: string[], allowGlobal: boolean): SettingItem[] => {
    return Object.entries(shortcutStore.shortcutList)
      .filter(([key]) => filterKeys.includes(key))
      .map(([key, item]) => ({
        key,
        label: item.name,
        type: "custom",
        component: markRaw(ShortcutRecorder),
        componentProps: { shortcutKey: key, allowGlobal },
      }));
  };

  // 页面快捷键的 Key
  const pageShortcutKeys = ["openPlayer", "openPlayList", "closePlayer"];
  // 全局快捷键的 Key
  const globalShortcutKeys = Object.keys(shortcutStore.shortcutList).filter(
    (key) => !pageShortcutKeys.includes(key),
  );

  return {
    groups: [
      {
        title: "全局快捷键",
        items: [
          {
            key: "globalOpen",
            label: "开启全局快捷键",
            type: "switch",
            description: computed(() =>
              isPortalMode.value
                ? "当前使用 XDG Desktop Portal 管理系统全局快捷键，无法在应用内自定义，请通过系统确认弹窗设置"
                : "可能会导致与其他软件相互冲突，请谨慎开启",
            ),
            value: computed({
              get: () => shortcutStore.globalOpen,
              set: (v) => updateGlobalOpen(v),
            }),
          },
        ],
      },
      {
        title: "全局快捷键更改",
        items: createShortcutItems(globalShortcutKeys, true),
      },
{
        title: "系统快捷键设置",
        show: isPortalMode,
        items: [
          {
            key: "openPortalShortcutSettings",
            label: "打开系统快捷键设置",
            type: "button",
            buttonLabel: "打开",
            description: "SPlayer 的全局快捷键由桌面环境管理，请在此修改",
            action: () => {
              window.electron.ipcRenderer.send("open-portal-shortcut-settings");
            },
          },
        ],
      },
      {
        title: "快捷键后端",
        show: showBackendChoice,
        items: [
          {
            key: "shortcutBackendPreference",
            label: "使用 Portal 管理全局快捷键",
            type: "switch",
            value: computed({
              get: () => shortcutStore.shortcutBackendPreference === "auto",
              set: (v) => {
                shortcutStore.setShortcutBackendPreference(v ? "auto" : "electron");
              },
            }),
            description: computed(() =>
              isPortalMode.value
                ? "关闭后使用 Electron 原生快捷键注册（需要重启应用）"
                : "Portal 可用时通过桌面环境管理全局快捷键（需要重启应用）",
            ),
          },
        ],
      },
      {
        title: "恢复全局默认",
        items: [
          {
            key: "resetShortcut",
            label: "恢复默认全局快捷键",
            type: "button",
            buttonLabel: "恢复默认",
            action: () => {
              window.$dialog.warning({
                title: "重置快捷键",
                content: "确定重置当前快捷键配置？",
                positiveText: "重置",
                negativeText: "取消",
                onPositiveClick: () => {
                  shortcutStore.$reset();
                  window.$message.success("快捷键重置成功");
                },
              });
            },
          },
        ],
      },
      {
        title: "页面内快捷键",
        items: createShortcutItems(pageShortcutKeys, false),
      },
    ],
  };
};
