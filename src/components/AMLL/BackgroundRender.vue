<script setup lang="ts">
/**
 * 背景渲染组件 - 基于 @applemusic-like-lyrics/core
 */
import {
  type AbstractBaseRenderer,
  type BaseRenderer,
  type TitaniumRendererOptions,
  BackgroundRender as CoreBackgroundRender,
  IsolationRenderer,
  MeshGradientRenderer,
  PixiRenderer,
  TitaniumRenderer,
} from "@applemusic-like-lyrics/core";
import type { PlayerBackgroundRenderer } from "@/stores/setting";

const RENDERER_MAP: Record<
  PlayerBackgroundRenderer,
  new (canvas: HTMLCanvasElement) => BaseRenderer
> = {
  mesh: MeshGradientRenderer,
  pixi: PixiRenderer,
  isolation: IsolationRenderer,
  titanium: TitaniumRenderer,
};

export interface BackgroundRenderProps {
  /** 设置背景专辑资源 (图片URL、Image对象或Video对象) */
  album?: string | HTMLImageElement | HTMLVideoElement;
  /** 设置专辑资源是否为视频 */
  albumIsVideo?: boolean;
  /** 设置当前背景动画帧率，默认为 30 */
  fps?: number;
  /** 设置当前播放状态，默认为 true */
  playing?: boolean;
  /** 设置当前动画流动速度，默认为 2 */
  flowSpeed?: number;
  /** 设置是否根据“是否有歌词”调整效果，默认为 true */
  hasLyric?: boolean;
  /** 低频音量大小 [0.0-1.0]，默认为 1.0 */
  lowFreqVolume?: number;
  /** 渲染缩放比例，默认为 0.5 */
  renderScale?: number;
  /** 渲染器标识 */
  renderEngine?: PlayerBackgroundRenderer;
  /** Titanium 渲染器参数 */
  titaniumOptions?: Partial<TitaniumRendererOptions>;
  /** 渲染器类，默认为 MeshGradientRenderer */
  renderer?: new (...args: ConstructorParameters<typeof BaseRenderer>) => BaseRenderer;
}

export interface BackgroundRenderRef {
  bgRender?: AbstractBaseRenderer;
  wrapperEl: HTMLDivElement | null;
}

const props = withDefaults(defineProps<BackgroundRenderProps>(), {
  fps: 30,
  playing: true,
  flowSpeed: 2,
  hasLyric: true,
  lowFreqVolume: 1.0,
  renderScale: 0.5,
  renderEngine: "mesh",
  albumIsVideo: false,
});

const wrapperRef = useTemplateRef<HTMLDivElement>("wrapper-ref");

// 外部类实例
const bgRenderRef = shallowRef<CoreBackgroundRender<BaseRenderer>>();

const getRenderer = () =>
  props.renderer ?? RENDERER_MAP[props.renderEngine] ?? MeshGradientRenderer;

const applyTitaniumOptions = () => {
  const renderer = bgRenderRef.value?.getRenderer();
  if (renderer instanceof TitaniumRenderer && props.titaniumOptions) {
    renderer.setOptions(props.titaniumOptions);
  }
};

/**
 * 统一更新状态
 */
const updateRendererState = () => {
  const renderer = bgRenderRef.value;
  if (!renderer) return;

  // 设置专辑封面
  if (props.album) {
    renderer.setAlbum(props.album, props.albumIsVideo);
  }
  // 基础参数
  renderer.setFPS(props.fps);
  renderer.setFlowSpeed(props.flowSpeed);
  renderer.setRenderScale(props.renderScale);
  renderer.setLowFreqVolume(props.lowFreqVolume);
  renderer.setHasLyric(props.hasLyric);
  applyTitaniumOptions();
  // 播放状态
  if (props.playing) {
    renderer.resume();
  } else {
    renderer.pause();
  }
};

onMounted(() => {
  if (wrapperRef.value) {
    // 初始化渲染器核心
    bgRenderRef.value = CoreBackgroundRender.new<BaseRenderer>(getRenderer());
    // 配置 Canvas 样式
    const el = bgRenderRef.value.getElement();
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    wrapperRef.value.appendChild(el);
    updateRendererState();
  }
});

let disposeTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  const renderer = bgRenderRef.value;
  if (renderer) {
    renderer.pause();
    bgRenderRef.value = undefined;
    // 延迟销毁
    disposeTimer = setTimeout(() => {
      renderer.dispose();
      disposeTimer = null;
    }, 500);
  }
});

onUnmounted(() => {
  if (disposeTimer) {
    clearTimeout(disposeTimer);
    disposeTimer = null;
  }
});

watch(
  () => props.album,
  (val) => {
    if (val) {
      bgRenderRef.value?.setAlbum(val, props.albumIsVideo);
    }
  },
);

watch(
  () => props.fps,
  (val) => {
    bgRenderRef.value?.setFPS(val);
  },
);

watch(
  () => props.playing,
  (isPlaying) => {
    if (isPlaying) {
      bgRenderRef.value?.resume();
    } else {
      bgRenderRef.value?.pause();
    }
  },
);

watch(
  () => props.flowSpeed,
  (val) => {
    bgRenderRef.value?.setFlowSpeed(val);
  },
);

watch(
  () => props.renderScale,
  (val) => {
    bgRenderRef.value?.setRenderScale(val);
  },
);

watch(
  () => props.lowFreqVolume,
  (val) => {
    bgRenderRef.value?.setLowFreqVolume(val);
  },
);

watch(
  () => props.hasLyric,
  (val) => {
    bgRenderRef.value?.setHasLyric(val);
  },
);

watch(
  () => props.renderEngine,
  () => {
    const renderer = bgRenderRef.value;
    if (renderer) {
      renderer.dispose();
      bgRenderRef.value = undefined;
    }
    if (wrapperRef.value) {
      bgRenderRef.value = CoreBackgroundRender.new<BaseRenderer>(getRenderer());
      const el = bgRenderRef.value.getElement();
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.display = "block";
      wrapperRef.value.appendChild(el);
      updateRendererState();
    }
  },
);

watch(() => props.titaniumOptions, applyTitaniumOptions, { deep: true });

defineExpose({
  bgRender: bgRenderRef,
  wrapperEl: wrapperRef,
});
</script>

<template>
  <div
    ref="wrapper-ref"
    class="background-render-wrapper"
    style="display: contents"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.background-render-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
