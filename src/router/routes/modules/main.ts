import type { RouteRecordRaw } from "vue-router";
const routes: RouteRecordRaw[] = [
  {
    path: "/dashboard",
    name: "home",
    component: () => import("@/views/dashboard/index.vue"),
    meta: {
      title: "首页"
    }
  },
  {
    path: "/design/:id",
    name: "Design",
    component: () => import("@/views/design/index.vue"),
    meta: { title: "设计页面" }
  }
];

export default routes;
