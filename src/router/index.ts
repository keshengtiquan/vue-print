import { createRouter, createWebHashHistory } from "vue-router";
import { routes } from "./routes";
import type { App } from "vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes // 静态路由
});

// 初始化路由
export function initRouter(app: App<Element>): void {
  app.use(router);
}
