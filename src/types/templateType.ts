/**
 * 模板类型定义。
 *
 * 数据库 template_uploads.template_type 存英文 code，页面展示中文名。
 * 新增类型只改这一处：加一条记录即可，列表页的类型列、颜色和编辑页路由
 * 都会自动跟上，不需要再去各个组件里加 v-if。
 */

/** 编辑时进入哪个页面 */
export type TemplateEditor = 'workbench' | 'worklog'

export interface TemplateTypeMeta {
  /** 存进数据库的值 */
  code: string
  /** 列表页展示的中文名 */
  label: string
  /** 标签配色，对应 TemplateList.vue 里的 .type-tag--x */
  tone: 'blue' | 'green' | 'amber' | 'violet'
  /** 点「编辑」时进入的页面 */
  editor: TemplateEditor
  /** 鼠标悬停说明 */
  hint?: string
}

export const TEMPLATE_TYPES: TemplateTypeMeta[] = [
  {
    code: 'WORK_LOG',
    label: '工作记录表',
    tone: 'blue',
    editor: 'worklog',
    hint: '表单型模板，编辑时还原 Word 版式',
  },
  {
    code: 'PRE_ASSESS',
    label: '事前评估',
    tone: 'green',
    editor: 'workbench',
    hint: '事前绩效评估报告',
  },
  {
    code: 'MID_MONITOR',
    label: '事中监控',
    tone: 'amber',
    editor: 'workbench',
    hint: '绩效运行监控报告',
  },
  {
    code: 'POST_REVIEW',
    label: '事后评价',
    tone: 'violet',
    editor: 'workbench',
    hint: '绩效评价报告',
  },
]

const BY_CODE = new Map(TEMPLATE_TYPES.map(item => [item.code, item]))

/** 按 code 取类型元信息；未知或为空时返回 null（列表页留空即可） */
export function templateTypeMeta(code?: string | null): TemplateTypeMeta | null {
  const key = (code || '').trim()
  if (!key) return null
  return BY_CODE.get(key) ?? BY_CODE.get(key.toUpperCase()) ?? null
}

/** 展示名。未知类型直接回显原始 code，便于发现数据里的脏值 */
export function templateTypeLabel(code?: string | null): string {
  const meta = templateTypeMeta(code)
  if (meta) return meta.label
  return (code || '').trim()
}

/** 编辑时该进哪个页面。未知类型按通用工作台处理 */
export function templateEditorFor(code?: string | null): TemplateEditor {
  return templateTypeMeta(code)?.editor ?? 'workbench'
}
