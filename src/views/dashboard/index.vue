<template>
  <div class="flex h-full flex-col">
    <header class="border-border flex h-16 items-center justify-between border-b px-4">
      <div class="flex items-center">
        <Logo />
        <div class="ml-2 text-xl font-bold">{{ appConfig.systemInfo.name }}</div>
      </div>
      <div class="flex gap-2">
        <InputGroup>
          <InputGroupInput
            v-model="searchInput"
            placeholder="搜索报表"
            @keydown.enter="handleSearch"
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <Button variant="outline">新建报表</Button>
      </div>
    </header>
    <main class="flex h-[calc(100vh-64px)]">
      <aside class="h-full w-57.5">
        <ul class="bg-sidebar h-full px-2 py-4">
          <li
            v-for="item in menus"
            :key="item.id"
            class="mb-1 h-10 cursor-pointer rounded-md px-2.5 text-left text-sm leading-10"
            :class="
              activeKey === item.id
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            "
            >{{ item.name }}</li
          >
        </ul>
      </aside>
      <section class="flex flex-1 flex-col">
        <div class="flex items-center justify-between p-4">
          <div class="flex items-center gap-3">
            <h1 class="text-xl">报表库</h1>
            <span class="text-secondary-foreground text-sm">24个模板</span>
          </div>
          <div class="flex gap-2">
            <Select v-model="orderType">
              <SelectTrigger class="w-28">
                <SelectValue placeholder="选择排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="recent-usage"> 最近使用 </SelectItem>
                  <SelectItem value="recently-created"> 最新创建 </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <ToggleGroup v-model="viewType" type="single" variant="outline">
              <ToggleGroupItem class="cursor-pointer" value="grid" aria-label="网格">
                <LayoutGrid class="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem class="cursor-pointer" value="list" aria-label="列表">
                <List class="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div
          class="grid flex-1 content-start items-start gap-4 overflow-auto px-4 pt-0 pb-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
        >
          <Card
            v-for="(item, index) in reportData"
            :key="index"
            class="cursor-pointer gap-2 pt-0 pb-3"
            @click="() => handleClick(item)"
          >
            <CardContent class="px-0">
              <img class="rounded-t-xl" :src="item.thumbnail" />
            </CardContent>
            <CardFooter class="px-3">
              <div class="w-full">
                <div class="flex items-center justify-between">
                  <h4 class="text-base">{{ item.title }}</h4>
                  <div class="bg-muted rounded-sm px-2 py-1 text-sm">{{ item.status }}</div>
                </div>
                <div class="text-muted-foreground my-2 text-sm">{{ item.subTitle }}</div>
                <div class="flex items-center justify-between">
                  <div>
                    <span class="bg-muted text-muted-foreground rounded-sm px-2 py-1 text-sm">{{
                      item.classification
                    }}</span>
                  </div>
                  <div class="flex items-center justify-center gap-2">
                    <div class="text-muted-foreground text-sm">{{
                      formatFromNow(item.updateDate)
                    }}</div>
                    <div class="text-muted-foreground text-sm">{{ item.version }}</div>
                  </div>
                </div>
              </div>
            </CardFooter>
          </Card>
        </div>
        <div class="mb-2">
          <Pagination v-slot="{ page }" :items-per-page="10" :total="30" :default-page="1">
            <PaginationContent v-slot="{ items }">
              <PaginationPrevious />
              <template v-for="(item, index) in items" :key="index">
                <PaginationItem
                  v-if="item.type === 'page'"
                  :value="item.value"
                  :is-active="item.value === page"
                >
                  {{ item.value }}
                </PaginationItem>
              </template>
              <PaginationEllipsis :index="4" />
              <PaginationNext />
            </PaginationContent>
          </Pagination>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import Logo from "@/components/logo/index.vue";
import { appConfig } from "@/config/index";
import { Button } from "@/components/ui/button";
import { Search } from "@lucide/vue";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from "@/components/ui/pagination";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { List, LayoutGrid } from "@lucide/vue";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ref } from "vue";
import TestImg from "@/assets/images/test.png";
import { formatFromNow } from "@/lib/date";
import { useRouter } from "vue-router";

const router = useRouter();
const searchInput = ref("");
const activeKey = ref("1");
const orderType = ref("recent-usage");
const viewType = ref("grid");

const menus = [
  { name: "全部报表", id: "1" },
  { name: "财务类", id: "2" },
  { name: "销售类", id: "3" }
];

const reportData = [
  {
    id: 1,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  },
  {
    id: 2,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  },
  {
    id: 3,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  },
  {
    id: 4,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  },
  {
    id: 5,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  },
  {
    id: 6,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  },
  {
    id: 7,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  },
  {
    id: 8,
    title: "销售明细表",
    subTitle: "客户应收账款分账期统计",
    version: "v3",
    updateDate: "2026-09-11 09:54:54",
    classification: "销售",
    status: "已发布",
    thumbnail: TestImg
  }
];

const handleClick = (row: any) => {
  router.push({ name: "Design", params: { id: row.id } });
};

// 回车触发搜索
function handleSearch() {
  const keyword = searchInput.value.trim();
  if (!keyword) return;
  // TODO: 在这里写实际的搜索逻辑，例如跳转到搜索结果页
  console.log("搜索关键词：", keyword);
}
</script>

<style scoped></style>
