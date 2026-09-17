<template>
  <div class="space-y-2">
    <div v-if="hasImage" class="border-border overflow-hidden rounded-md border">
      <div class="bg-muted flex h-24 items-center justify-center p-1">
        <img :src="src" class="max-h-full max-w-full object-contain" alt="" />
      </div>
      <div class="border-border flex items-center gap-1 border-t px-2 py-1.5">
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs leading-tight">{{ displayName }}</p>
          <p v-if="displayMeta" class="text-muted-foreground truncate text-[10px] leading-tight">
            {{ displayMeta }}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="cursor-pointer"
          title="替换图片"
          :disabled="disabled || busy"
          @click="openPicker"
        >
          <Loader2 v-if="busy" class="animate-spin" />
          <Upload v-else />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="cursor-pointer"
          title="移除图片"
          :disabled="disabled || busy"
          @click="clear"
        >
          <X />
        </Button>
      </div>
    </div>

    <button
      v-else
      type="button"
      class="border-border text-muted-foreground hover:border-primary/45 hover:text-primary flex h-20 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed text-xs transition-[border-color,color] duration-120 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="disabled || busy"
      @click="openPicker"
    >
      <Loader2 v-if="busy" class="size-4 animate-spin" />
      <ImagePlus v-else class="size-4" />
      <span>{{ busy ? "正在读取…" : "选择本地图片" }}</span>
    </button>

    <div class="border-border rounded-md border">
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs"
        @click="showUrl = !showUrl"
      >
        <Link2 class="size-3" />
        <span class="flex-1 text-left">使用图片地址</span>
      </button>
      <div v-show="showUrl" class="px-2 pb-2">
        <Input
          placeholder="https:// 或相对路径"
          :model-value="urlValue"
          :disabled="disabled"
          @change="onUrlChange"
        />
      </div>
    </div>

    <p v-if="error" class="text-destructive text-[10px] leading-normal">{{ error }}</p>
    <p v-else class="text-muted-foreground text-[10px] leading-normal">
      支持 JPG / PNG / WebP / GIF / SVG，单张不超过 {{ formatSize(maxSize) }}、最长边不超过
      {{ maxDimension }}px
    </p>

    <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="onFileChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref } from "vue";
import { ImagePlus, Link2, Loader2, Upload, X } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 图片源选择器：本地文件转 base64 / 直接填地址，两个入口写的是同一个 element.src。
 *
 * 为什么 base64 是"必须"而不是"妥协"：外链图片用于 canvas 导出或打印时会让画布
 * 被跨域污染（toDataURL 直接抛错），dataURL 同源不受限。所以这不是临时方案。
 *
 * 组件刻意不碰 store：只 emit 值 + 原始像素尺寸，由属性面板决定怎么写回元素。
 */
const props = withDefaults(
  defineProps<{
    /** 当前图片源：dataURL 或 URL */
    modelValue?: string;
    disabled?: boolean;
    /** 文件体积上限（字节） */
    maxSize?: number;
    /** 单边像素上限 */
    maxDimension?: number;
  }>(),
  { modelValue: "", disabled: false, maxSize: 5 * 1024 * 1024, maxDimension: 4096 }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  /** 图片解析成功，携带原始像素尺寸，供调用方按比例适配元素框 */
  loaded: [payload: { width: number; height: number }];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const showUrl = ref(false);
const busy = ref(false);
const error = ref("");
/** 本次会话内上传的文件信息，仅用于展示，不落进元素模型 */
const uploaded = ref<{ name: string; size: number; width: number; height: number } | null>(null);

/**
 * 连续选择文件时的作废令牌：只有最后一次选择的异步结果允许落库。
 * 没有它就会出现"先选的大图后读完，把后选的小图盖掉"。
 */
let runToken = 0;
let disposed = false;
onScopeDispose(() => {
  disposed = true;
});

const src = computed(() => props.modelValue ?? "");
const hasImage = computed(() => src.value.trim() !== "");
const isDataUrl = computed(() => src.value.startsWith("data:"));

/** base64 明文绝不能灌进 input —— 几十万字符会让面板直接卡死 */
const urlValue = computed(() => (isDataUrl.value ? "" : src.value));

const displayName = computed(() => {
  if (uploaded.value) return uploaded.value.name;
  if (isDataUrl.value) return "内嵌图片（base64）";
  return src.value;
});

const displayMeta = computed(() => {
  const info = uploaded.value;
  if (!info) return "";
  return `${info.width} × ${info.height} px · ${formatSize(info.size)}`;
});

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

function openPicker() {
  if (props.disabled || busy.value) return;
  error.value = "";
  fileInputRef.value?.click();
}

function clear() {
  error.value = "";
  uploaded.value = null;
  emit("update:modelValue", "");
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 立刻清空，否则同一个文件连选两次不会再触发 change
  input.value = "";
  if (file) void handleFile(file);
}

async function handleFile(file: File) {
  const token = ++runToken;
  error.value = "";

  if (!file.type.startsWith("image/")) {
    error.value = `不是图片文件（${file.type || "未知类型"}）`;
    return;
  }
  if (file.size > props.maxSize) {
    error.value = `图片 ${formatSize(file.size)}，超过 ${formatSize(props.maxSize)} 上限`;
    return;
  }

  busy.value = true;
  let objectUrl = "";
  try {
    // 先用 objectURL 探尺寸：超限就不必读 base64 了（大文件读一遍要几百毫秒）
    objectUrl = URL.createObjectURL(file);
    const size = await probeImage(objectUrl);
    if (token !== runToken) return;

    if (size.width > props.maxDimension || size.height > props.maxDimension) {
      error.value = `图片 ${size.width}×${size.height}px，超过最长边 ${props.maxDimension}px 上限`;
      return;
    }

    const dataUrl = await readAsDataUrl(file);
    if (disposed || token !== runToken) return;

    uploaded.value = { name: file.name, size: file.size, width: size.width, height: size.height };
    emit("update:modelValue", dataUrl);
    emit("loaded", size);
  } catch {
    if (token === runToken) error.value = "图片读取失败，文件可能已损坏";
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    // 被更新的上传接管时，busy 归它管，这里不能清
    if (token === runToken) busy.value = false;
  }
}

function onUrlChange(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim();
  // 清空不等于删除，删除请走移除按钮，避免误触把图弄丢
  if (!value) return;
  error.value = "";
  uploaded.value = null;
  emit("update:modelValue", value);
}

/** 解码探测原始像素。用 window.Image 避免与图标组件 ImagePlus 的命名空间纠缠 */
function probeImage(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const probe = new window.Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => reject(new Error("decode failed"));
    probe.src = url;
  });
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
</script>
