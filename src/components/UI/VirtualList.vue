<!-- 自定义虚拟列表组件 -->
<template>
  <div
    ref="containerRef"
    class="custom-virtual-list"
    :style="{ height: `${height}px`, overflow: 'auto' }"
    @scroll="handleScroll"
  >
    <!-- 占位空间 -->
    <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
      <!-- 可见项目容器 -->
      <div
        :style="{
          position: 'absolute',
          top: `${offsetY}px`,
          left: 0,
          right: 0,
        }"
      >
        <div
          v-for="(item, index) in visibleItems"
          :key="getItemKey(item, actualStartIndex + index)"
          ref="itemRefs"
          class="virtual-item"
          :data-index="actualStartIndex + index"
        >
          <slot :item="item" :index="actualStartIndex + index" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUpdated, nextTick } from 'vue';

interface Props {
  /** 列表项数据 */
  items: any[];
  /** 默认每项高度（用于估算） */
  defaultItemSize: number;
  /** 容器高度 */
  height: number;
  /** 缓冲区大小（上下额外渲染的项数） */
  bufferSize?: number;
  /** 获取唯一键的函数 */
  getItemKey?: (item: any, index: number) => string | number;
}

interface Emits {
  (e: 'scroll', event: Event);
}

const props = withDefaults(defineProps<Props>(), {
  bufferSize: 5,
  getItemKey: (_: any, index: number) => index,
});

const emit = defineEmits<Emits>();

// 容器引用
const containerRef = ref<HTMLElement | null>(null);
// 项目元素引用
const itemRefs = ref<HTMLElement[]>([]);

// 滚动位置
const scrollTop = ref(0);

// 存储每个项目的实际高度
const itemHeights = ref<number[]>([]);
// 存储每个项目的累积高度（用于定位）
const itemTops = ref<number[]>([]);

// 当前可见的起始索引
const actualStartIndex = ref(0);
// 当前可见的结束索引
const actualEndIndex = ref(0);

// 初始化高度数组
const initializeHeights = () => {
  const length = props.items.length;
  itemHeights.value = Array.from({ length }, () => props.defaultItemSize);
  updateTops();
};

// 更新累积高度
const updateTops = () => {
  itemTops.value = [];
  let top = 0;
  for (let i = 0; i < itemHeights.value.length; i++) {
    itemTops.value[i] = top;
    top += itemHeights.value[i];
  }
};

// 列表总高度
const totalHeight = computed(() => {
  if (itemTops.value.length === 0) return 0;
  const lastIndex = itemTops.value.length - 1;
  return itemTops.value[lastIndex] + itemHeights.value[lastIndex];
});

// 计算可见区域
const calculateVisibleRange = (scrollTop: number) => {
  if (props.items.length === 0) {
    actualStartIndex.value = 0;
    actualEndIndex.value = -1;
    return;
  }

  // 查找开始索引 - 简单线性搜索（对于大多数情况足够快）
  let startIndex = 0;
  for (let i = 0; i < itemTops.value.length; i++) {
    if (itemTops.value[i] > scrollTop) {
      startIndex = Math.max(0, i - 1);
      break;
    }
    startIndex = i;
  }

  // 查找结束索引
  const viewportBottom = scrollTop + props.height;
  let endIndex = startIndex;
  for (let i = startIndex; i < itemTops.value.length; i++) {
    if (itemTops.value[i] > viewportBottom) {
      endIndex = Math.max(startIndex, i - 1);
      break;
    }
    endIndex = i;
  }

  // 应用缓冲区
  actualStartIndex.value = Math.max(0, startIndex - props.bufferSize);
  actualEndIndex.value = Math.min(props.items.length - 1, endIndex + props.bufferSize);
};

// 可见项
const visibleItems = computed(() => {
  if (actualStartIndex.value > actualEndIndex.value) return [];
  return props.items.slice(actualStartIndex.value, actualEndIndex.value + 1);
});

// Y轴偏移量
const offsetY = computed(() => {
  if (actualStartIndex.value === 0 || itemTops.value.length === 0) return 0;
  return itemTops.value[actualStartIndex.value];
});

// 测量项目高度
const measureItemHeights = () => {
  if (!itemRefs.value.length || props.items.length === 0) return;

  // let hasChanges = false;

  itemRefs.value.forEach((el, index) => {
    if (!el) return;

    const actualIndex = actualStartIndex.value + index;
    if (actualIndex < 0 || actualIndex >= props.items.length) return;

    try {
      const rect = el.getBoundingClientRect();
      const height = rect.height;

      // 确保高度是合理的正数
      if (height > 0 && Math.abs(height - itemHeights.value[actualIndex]) > 1) {
        itemHeights.value[actualIndex] = height;
        // hasChanges = true;
      }
    } catch (error) {
      console.warn('测量项目高度时出错:', error);
    }
  });

  // if (hasChanges) {
  //   updateTops();
  // }
};

// 处理滚动事件
const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement;
  if (target) {
    scrollTop.value = target.scrollTop;
    calculateVisibleRange(target.scrollTop);
    emit('scroll', event);
  }
};

// 滚动到指定索引
const scrollTo = (options: { index: number; behavior?: ScrollBehavior }) => {
  if (!containerRef.value || props.items.length === 0) return;

  const { index } = options;
  // 确保索引在有效范围内
  if (index < 0 || index >= props.items.length) return;

  // 确保有高度数据
  if (itemTops.value.length <= index) {
    initializeHeights();
  }

  const targetScrollTop = itemTops.value[index] || 0;
  containerRef.value.scrollTo({
    top: targetScrollTop,
    behavior: options.behavior || 'auto',
  });
};

// 滚动到指定位置
const scrollToPosition = (options: { position: number; behavior?: ScrollBehavior }) => {
  if (!containerRef.value) return;

  containerRef.value.scrollTo({
    top: options.position,
    behavior: options.behavior || 'auto',
  });
};

// 获取当前滚动位置
const getScrollTop = () => {
  return containerRef.value?.scrollTop || 0;
};

// 暴露方法给父组件
defineExpose({
  scrollTo,
  scrollToPosition,
  getScrollTop,
});

// 监听数据变化
watch(() => props.items.length, () => {
  initializeHeights();
  calculateVisibleRange(scrollTop.value);
});

// 监听容器大小变化
watch(
  () => props.height,
  () => {
    nextTick(() => {
      if (containerRef.value) {
        scrollTop.value = containerRef.value.scrollTop;
        calculateVisibleRange(scrollTop.value);
      }
    });
  }
);

// 组件挂载后初始化
onMounted(() => {
  initializeHeights();
  calculateVisibleRange(0);

  if (containerRef.value) {
    containerRef.value.style.scrollBehavior = 'smooth';
  }
});

// 组件更新后测量高度
onUpdated(() => {
  nextTick(() => {
    measureItemHeights();
  });
});
</script>

<style lang="scss" scoped>
.custom-virtual-list {
  // 启用平滑滚动
  scroll-behavior: smooth;

  // 触控板惯性滚动支持
  -webkit-overflow-scrolling: touch;

  // 确保滚动条样式一致
  scrollbar-width: thin;
  scrollbar-color: rgba(128, 128, 128, 0.4) transparent;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(128, 128, 128, 0.4);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;

    &:hover {
      background-color: rgba(128, 128, 128, 0.6);
    }
  }

  // 优化滚动性能
  will-change: scroll-position;
  contain: layout style paint;
}

.virtual-item {
  // 防止项目间的间隙
  box-sizing: border-box;

  // 优化渲染性能
  contain: layout style paint;
}
</style>
