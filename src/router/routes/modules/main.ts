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
  },
  {
    /*
      预览与设计**平行**，而不是设计页里的一个弹窗 —— 理由见 views/preview/index.vue 的文件头。
      `:id` 与设计页同形（同一个模板标识），于是「返回设计」就是一次 params 转发。
    */
    path: "/preview/:id",
    name: "Preview",
    component: () => import("@/views/preview/index.vue"),
    meta: { title: "预览" }
  }
];

export default routes;
