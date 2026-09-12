import dayjs from "dayjs";

/**
 * 相对时间格式化：刚刚 / X分钟前 / X小时前 / X天前 / X周前 / X个月前 / X年前
 * @param {string|number|Date|dayjs} time 目标时间
 * @returns {string}
 */
export function formatFromNow(time: string) {
  const target = dayjs(time);
  if (!target.isValid()) return "";

  const now = dayjs();
  const seconds = now.diff(target, "second");

  // 未来时间（时钟误差 / 服务器时间偏差）统一按「刚刚」处理
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return Math.floor(seconds / 60) + " 分钟前";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " 小时前";

  const days = now.diff(target, "day");
  if (days < 7) return days + " 天前";
  if (days < 30) return Math.max(1, Math.floor(days / 7)) + " 周前";

  const months = Math.floor(now.diff(target, "month"));
  if (months < 12) return Math.max(1, months) + " 个月前";

  const years = Math.floor(now.diff(target, "year"));
  return Math.max(1, years) + " 年前";
}
