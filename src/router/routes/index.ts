import type { RouteRecordRaw } from "vue-router";
import { coreRoute } from "./coreRoutes";

// 注意：必须在 import.meta.glob 之前定义，避免子模块 import { Layout } 时命中 TDZ

interface RouteModuleType {
  default: RouteRecordRaw[];
}

const dynamicRouteFiles = import.meta.glob("./modules/**/*.ts", {
  eager: true
});

const mergeRouteMoudles = (routerModules: Record<string, unknown>): RouteRecordRaw[] => {
  const mergedRoutes: RouteRecordRaw[] = [];

  for (const routeModule of Object.values(routerModules)) {
    const module = (routeModule as RouteModuleType)?.default ?? [];
    mergedRoutes.push(...module);
  }
  return mergedRoutes;
};

export const dynamicRoute: RouteRecordRaw[] = mergeRouteMoudles(dynamicRouteFiles);
export const routes = [...coreRoute, ...dynamicRoute];
export const HOME_PAGE_PATH = "";
