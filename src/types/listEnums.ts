/**
 * 列表页枚举 → 中文映射。
 *
 * 与 templateType.ts 一致的范式：集中定义、按值查、未知回显原值，
 * 方便发现后端返回的脏数据。
 */

/** 委托任务类型 review_stage */
const REVIEW_STAGE_MAP: Record<string, string> = {
  post: '事后',
  mid: '事中',
  pre: '事前',
  goal: '绩效目标',
}

export function reviewStageLabel(v?: string | null): string {
  const key = (v || '').trim()
  return REVIEW_STAGE_MAP[key] ?? key
}

/** 模板类型 type */
const TEMPLATE_KIND_MAP: Record<string, string> = {
  '1': '报告',
  '2': '工作记录表',
  '3': '质控智能采集表',
}

export function templateKindLabel(v?: number | string | null): string {
  const key = String(v ?? '').trim()
  return TEMPLATE_KIND_MAP[key] ?? key
}

/**
 * 上传页的类型候选项。
 *
 * 仅在 URL 没带 type 时用于让用户手选，顺序即展示顺序。
 * 复用同一张映射表，避免两处维护出现偏差。
 */
export const TEMPLATE_KIND_OPTIONS: { value: string; label: string }[] =
  Object.entries(TEMPLATE_KIND_MAP).map(([value, label]) => ({ value, label }))
