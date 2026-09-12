export interface SystemBasicConfig {
  // 系统名称
  name: string;
  // 系统描述
  description?: string;
  // 系统logo
  logo?: string;
  // 系统favicon
  favicon?: string;
}

export interface SystemConfig {
  // 系统基础信息
  systemInfo: SystemBasicConfig;
}
