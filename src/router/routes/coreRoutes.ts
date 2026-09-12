import type { RouteRecordRaw } from "vue-router";

export const coreRoute: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Root",
    redirect: "/dashboard",
    meta: { title: "根目录", isHide: true, isHideTab: true }
  },

  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("@/views/error/404.vue"),
    meta: { title: "404", isHide: true, isHideTab: true }
  }
];
