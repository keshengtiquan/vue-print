<template>
  <Dialog v-model:open="open">
    <!--
      容器改了三处官方默认值，都是为了"表头/表尾固定、只有中间滚动"：
        flex flex-col + gap-0 + p-0  —— 官方是 grid + gap-4 + p-6，内部没法自己排布
        max-h-[85vh]                —— 官方没有高度上限，内容一长就顶出视口、连滚动都没有
        宽度用 `sm:` 前缀覆盖官方自带的 `sm:max-w-lg`：不同变体在 twMerge 里是两个组，
        只写 `max-w-3xl` 会被 `sm:max-w-lg`（变体在样式表里更靠后）压掉。
    -->
    <DialogContent class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(48rem,92vw)]">
      <DialogHeader class="shrink-0 pt-5 pr-12 pl-6">
        <DialogTitle>数据集</DialogTitle>
        <DialogDescription>
          声明"去哪儿取数、怎么取"。设计态与打印态用的是同一份声明。
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList class="mx-6 mt-3 w-fit shrink-0">
          <TabsTrigger value="http" class="cursor-pointer">接口</TabsTrigger>
          <TabsTrigger value="sql" class="cursor-pointer">SQL</TabsTrigger>
        </TabsList>

        <!-- ============ 接口 ============ -->
        <TabsContent value="http" class="min-h-0 flex-1 overflow-y-auto px-6 py-3">
          <div v-if="dataset" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <Label for="ds-label">名称</Label>
                <Input
                  id="ds-label"
                  :model-value="dataset.label ?? ''"
                  placeholder="例如：订单明细"
                  @update:model-value="dataset.label = String($event)"
                />
              </div>
              <div class="space-y-1.5">
                <Label for="ds-name">标识符（占位符前缀）</Label>
                <Input
                  id="ds-name"
                  :model-value="dataset.name"
                  placeholder="订单明细"
                  @update:model-value="onNameInput(String($event))"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <Label for="ds-url">请求地址</Label>
              <div class="flex gap-2">
                <Select :model-value="method" @update:model-value="setMethod($event)">
                  <SelectTrigger class="w-24 shrink-0 cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="m in METHODS" :key="m" :value="m">{{ m }}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  id="ds-url"
                  class="flex-1 font-mono text-xs"
                  :model-value="url"
                  placeholder="https://api.example.com/orders/${orderId}"
                  @update:model-value="onUrlInput(String($event))"
                />
              </div>
              <p v-if="urlError" class="text-destructive text-[11px]">{{ urlError }}</p>
              <p v-else class="text-muted-foreground text-[11px]">
                地址里可以写 <code class="bg-muted rounded px-0.5">${参数}</code>，取数时由执行侧替换。
              </p>
            </div>

            <div class="space-y-1.5">
              <Label for="ds-path">取值路径</Label>
              <Input
                id="ds-path"
                class="font-mono text-xs"
                :model-value="resultPath"
                placeholder="data.list（留空表示响应本身就是数组）"
                @update:model-value="setResultPath(String($event))"
              />
              <p class="text-muted-foreground text-[11px] leading-4">
                从响应里定位记录数组，支持点路径与下标：<code class="bg-muted rounded px-0.5"
                  >data.rows[0].items</code
                >。
              </p>
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <Label>请求头</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-6 cursor-pointer text-[11px]"
                  @click="addHeader"
                >
                  <Plus class="size-3" />添加
                </Button>
              </div>
              <div v-if="headerEntries.length" class="space-y-1.5">
                <div v-for="entry in headerEntries" :key="entry.name" class="flex gap-2">
                  <Input
                    class="w-40 shrink-0 font-mono text-xs"
                    :model-value="entry.name"
                    placeholder="Authorization"
                    @update:model-value="renameHeader(entry.name, String($event))"
                  />
                  <Input
                    class="flex-1 font-mono text-xs"
                    :model-value="entry.value"
                    placeholder="Bearer ${token}"
                    @update:model-value="setHeader(entry.name, String($event))"
                  />
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer px-1"
                    title="删除"
                    @click="removeHeader(entry.name)"
                  >
                    <X class="size-3.5" />
                  </button>
                </div>
              </div>
              <p v-else class="text-muted-foreground text-[11px]">无</p>
            </div>

            <div v-if="hasBody" class="space-y-1.5">
              <Label for="ds-body">请求体（JSON）</Label>
              <Textarea
                id="ds-body"
                class="min-h-24 font-mono text-xs"
                :model-value="body"
                placeholder='{ "orderId": "${orderId}" }'
                @update:model-value="setBody(String($event))"
              />
              <p v-if="bodyError" class="text-destructive text-[11px]">JSON 不合法：{{ bodyError }}</p>
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <Label>参数</Label>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground cursor-pointer text-[11px] underline-offset-2 hover:underline"
                  @click="binding.syncParams(dataset.id)"
                >
                  从地址 / 请求体重新解析
                </button>
              </div>
              <div v-if="dataset.params?.length" class="space-y-1.5">
                <div
                  v-for="param in dataset.params"
                  :key="param.name"
                  class="flex items-center gap-2"
                >
                  <span class="w-24 shrink-0 truncate font-mono text-[11px]">{{ param.name }}</span>
                  <Select
                    :model-value="param.source ?? 'fixed'"
                    @update:model-value="setParamSource(param, String($event))"
                  >
                    <SelectTrigger class="h-7 w-24 shrink-0 cursor-pointer text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="context">打印入参</SelectItem>
                      <SelectItem value="sys">系统变量</SelectItem>
                      <SelectItem value="fixed">固定值</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    v-if="param.source === 'sys'"
                    :model-value="param.sysVar ?? 'date'"
                    @update:model-value="setParamSysVar(param, String($event))"
                  >
                    <SelectTrigger class="h-7 w-28 shrink-0 cursor-pointer text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="v in SYS_VARS" :key="v.value" :value="v.value">
                        {{ v.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    v-else
                    class="h-7 flex-1 text-xs"
                    :model-value="testValueOf(param.name)"
                    :placeholder="param.source === 'context' ? '测试值（打印时由宿主传入）' : '值'"
                    @update:model-value="binding.setParamValue(dataset.id, param.name, $event)"
                  />
                </div>
                <p class="text-muted-foreground text-[11px] leading-4">
                  没给值的参数会原样留在地址里，一眼能看出缺哪个。
                </p>
              </div>
              <p v-else class="text-muted-foreground text-[11px]">
                地址与请求体里没有 <code class="bg-muted rounded px-0.5">${参数}</code>。
              </p>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="advanced">
                <AccordionTrigger class="text-xs">高级</AccordionTrigger>
                <AccordionContent>
                  <div class="grid grid-cols-2 gap-3 pt-1">
                    <div class="space-y-1.5">
                      <Label for="ds-timeout">超时（ms）</Label>
                      <Input
                        id="ds-timeout"
                        type="number"
                        class="h-7 text-xs"
                        :model-value="timeout"
                        @update:model-value="setOption('timeout', Number($event))"
                      />
                    </div>
                    <div class="space-y-1.5">
                      <Label for="ds-limit">行数上限</Label>
                      <Input
                        id="ds-limit"
                        type="number"
                        class="h-7 text-xs"
                        :model-value="limit"
                        @update:model-value="setOption('limit', Number($event))"
                      />
                    </div>
                    <div class="col-span-2 space-y-1.5">
                      <Label>取不到数据时</Label>
                      <Select :model-value="onEmpty" @update:model-value="setOnEmpty(String($event))">
                        <SelectTrigger class="h-7 w-full cursor-pointer text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keepTemplate">保留设计内容（推荐）</SelectItem>
                          <SelectItem value="blank">渲染空白</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div v-if="state.status !== 'idle'" class="space-y-2 pt-1">
              <p
                v-if="state.status === 'error'"
                class="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-2.5 py-2 text-[11px] leading-4"
              >
                {{ state.message }}
              </p>
              <template v-else-if="state.status === 'ok'">
                <p class="text-muted-foreground text-[11px]">
                  解析到 {{ dataset.fields?.length ?? 0 }} 个字段，样本 {{ rows.length }} 行{{
                    state.took ? `，耗时 ${state.took}ms` : ""
                  }}
                </p>
                <div class="border-border max-h-56 overflow-auto rounded-md border">
                  <table class="w-full border-collapse text-[11px]">
                    <thead class="sticky top-0">
                      <tr class="bg-muted">
                        <th
                          v-for="f in dataset.fields"
                          :key="f.name"
                          class="border-border border-b px-2 py-1 text-left font-medium whitespace-nowrap"
                        >
                          {{ f.name }}
                          <span class="text-muted-foreground font-normal">{{ f.type }}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, i) in rows.slice(0, 10)" :key="i">
                        <td
                          v-for="f in dataset.fields"
                          :key="f.name"
                          class="border-border max-w-40 truncate border-b px-2 py-1"
                        >
                          {{ cellText(row[f.name]) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
            </div>
          </div>
        </TabsContent>

        <!-- ============ SQL ============ -->
        <TabsContent value="sql" class="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div
            class="border-border mx-auto max-w-md rounded-lg border border-dashed px-5 py-6 text-center"
          >
            <Database class="text-muted-foreground/60 mx-auto size-7" />
            <p class="mt-2 text-sm font-medium">SQL 数据集下一期开放</p>
            <p class="text-muted-foreground mt-1.5 text-[11px] leading-5">
              浏览器不能也不应该直连数据库（凭据会泄露、无法跨域、无法限权），所以 SQL
              只能"声明在模板里、执行在宿主侧"。<br />
              接口这条链路打通后，它会复用这里的参数、字段解析与绑定。
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter class="border-border shrink-0 border-t px-6 py-4">
        <span class="text-muted-foreground mr-auto text-[11px]">
          {{ binding.modeLabel() }} · 编辑即时生效
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="cursor-pointer"
          :disabled="state.status === 'running'"
          @click="onTest"
        >
          <LoaderCircle v-if="state.status === 'running'" class="size-3.5 animate-spin" />
          <Play v-else class="size-3.5" />
          {{ state.status === "running" ? "取数中…" : "测试并解析字段" }}
        </Button>
        <Button type="button" size="sm" class="cursor-pointer" @click="open = false">
          <Check class="size-3.5" />完成
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Database, LoaderCircle, Play, Plus, X } from "@lucide/vue";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDataBindingStore } from "@/store/modules/dataBinding";
import { isSafeRequestUrl, isValidDataSetName, validateJsonBody } from "./model";
import type {
  DataSetParam,
  DataSetParamSource,
  HttpMethod,
  SysVarName,
  TemplateDataSet
} from "./types";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ dataSetId: string | null }>();

const binding = useDataBindingStore();
const activeTab = ref("http");

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE"];
const SYS_VARS: { value: SysVarName; label: string }[] = [
  { value: "date", label: "当前日期" },
  { value: "time", label: "当前时间" },
  { value: "datetime", label: "当前日期时间" },
  { value: "userName", label: "用户名" },
  { value: "userId", label: "用户 ID" },
  { value: "docTitle", label: "单据标题" },
  { value: "pageIndex", label: "页码" },
  { value: "pageCount", label: "总页数" }
];

/**
 * 直接编辑 store 里的数据集对象。
 *
 * 刻意**不做**"本地副本 + 保存 / 取消"：设计器里所有面板都是即改即生效，
 * 单独让数据集走确认制，用户会以为"改了没保存"，而其实别处早就生效了。
 * 关掉弹窗 = 结束这次编辑，不是撤销。
 */
const dataset = computed(() => binding.dataSetById(props.dataSetId ?? undefined));

/** 打开时补齐必需结构 —— request 缺失时表单里的 `request.url` 会直接崩 */
watch(
  () => [open.value, props.dataSetId] as const,
  ([isOpen, id]) => {
    if (!isOpen || !id) return;
    const ds = binding.dataSetById(id);
    if (!ds) return;
    if (!ds.request) ds.request = { url: "", method: "GET" };
    activeTab.value = ds.type === "sql" ? "sql" : "http";
  },
  { immediate: true }
);

const state = computed(() => binding.testStateOf(props.dataSetId ?? undefined));
const rows = computed(() => binding.sampleOf(props.dataSetId ?? undefined));

/*
  下面这一组取值全部走 computed + 显式 setter，而**不是**在模板里直接写
  `dataset.request.url`：Vue 的模板表达式不支持 TypeScript 语法，
  `!`（非空断言）与 `as` 会直接在编译期报错。统一收在这里，模板只剩取值与调用。
*/
const url = computed(() => dataset.value?.request?.url ?? "");
const body = computed(() => dataset.value?.request?.body ?? "");
const method = computed(() => dataset.value?.request?.method ?? "GET");
const resultPath = computed(() => dataset.value?.request?.resultPath ?? "");
const timeout = computed(() => dataset.value?.options?.timeout ?? 10000);
const limit = computed(() => dataset.value?.options?.limit ?? 5000);
const onEmpty = computed(() => dataset.value?.options?.onEmpty ?? "keepTemplate");

const isPost = computed(() => method.value === "POST" || method.value === "PUT");
/** 请求体只在"是 POST/PUT"或"已经有内容"时露出，GET 下多一个输入框纯属噪音 */
const hasBody = computed(() => isPost.value || !!body.value);

const urlError = computed(() => {
  if (!url.value.trim()) return "";
  return isSafeRequestUrl(url.value) ? "" : "只允许 http(s) 地址";
});

const bodyError = computed(() => validateJsonBody(body.value));

/* ---------- 名称 ---------- */

function onNameInput(value: string) {
  const ds = dataset.value;
  if (!ds || !isValidDataSetName(value)) return;
  // 标识符改名要防重名：占位符 `{ds.f}` 靠它寻址，重名会让取值指向不明
  ds.name = binding.uniqueDataSetName(value, ds.id);
}

/* ---------- 请求声明 ---------- */

function setMethod(value: unknown) {
  const req = dataset.value?.request;
  if (req) req.method = value as HttpMethod;
}

function setResultPath(value: string) {
  const req = dataset.value?.request;
  if (req) req.resultPath = value || undefined;
}

function setBody(value: string) {
  const req = dataset.value?.request;
  if (req) req.body = value;
}

/** 地址一变就把新出现的 `${参数}` 补进参数列表，省掉手工维护 */
function onUrlInput(value: string) {
  const ds = dataset.value;
  if (!ds?.request) return;
  ds.request.url = value;
  binding.syncParams(ds.id);
}

/* ---------- 请求头 ---------- */

const headerEntries = computed(() =>
  Object.entries(dataset.value?.request?.headers ?? {}).map(([name, value]) => ({ name, value }))
);

function addHeader() {
  const req = dataset.value?.request;
  if (!req) return;
  req.headers ??= {};
  let name = "Header";
  let i = 1;
  while (name in req.headers) name = `Header${++i}`;
  req.headers[name] = "";
}

function renameHeader(oldName: string, newName: string) {
  const req = dataset.value?.request;
  if (!req?.headers || !newName || newName === oldName || newName in req.headers) return;
  // 重建而不是"删旧插新"：后者会把这一条挪到末尾，用户正在编辑时行会跳走
  const entries = Object.entries(req.headers).map(([k, v]) => (k === oldName ? [newName, v] : [k, v]));
  req.headers = Object.fromEntries(entries);
}

function setHeader(name: string, value: string) {
  const headers = dataset.value?.request?.headers;
  if (headers) headers[name] = value;
}

function removeHeader(name: string) {
  const headers = dataset.value?.request?.headers;
  if (headers) delete headers[name];
}

/* ---------- 参数 ---------- */

function setParamSource(param: DataSetParam, value: string) {
  param.source = value as DataSetParamSource;
  if (param.source === "sys" && !param.sysVar) param.sysVar = "date";
}

function setParamSysVar(param: DataSetParam, value: string) {
  param.sysVar = value as SysVarName;
}

function testValueOf(name: string): string {
  const id = props.dataSetId;
  if (!id) return "";
  const v = binding.paramValues[id]?.[name];
  return v === undefined || v === null ? "" : String(v);
}

/* ---------- 高级选项 ---------- */

function setOption<K extends keyof NonNullable<TemplateDataSet["options"]>>(
  key: K,
  value: NonNullable<TemplateDataSet["options"]>[K]
) {
  const ds = dataset.value;
  if (!ds) return;
  if (typeof value === "number" && !Number.isFinite(value)) return;
  ds.options ??= {};
  ds.options[key] = value;
}

function setOnEmpty(value: string) {
  setOption("onEmpty", value === "blank" ? "blank" : "keepTemplate");
}

/* ---------- 其他 ---------- */

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function onTest() {
  const id = props.dataSetId;
  if (!id) return;
  // 先把地址 / 参数同步进 store，保证"测的就是面板上看到的"
  binding.syncParams(id);
  await binding.runTest(id);
}
</script>
