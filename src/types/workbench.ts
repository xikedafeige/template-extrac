import type { AxiosResponse } from 'axios'

export type VariableType = 'markdown' | 'json' | 'summary' | 'section_summary' | 'chapter_summary' | 'reference_summary' | string

export interface VariableDraft {
  id?: string
  key: string
  type: VariableType
  value: string
  prompt: string
  title: string
  chapter_index?: number | null
  reference_key?: string | null
  parent_id?: string
  template_id?: string
}

export interface SplitDraft {
  id: string
  index: number
  section_title: string
  content: string
  display_content?: string
  serp_prompt?: string
  variables: VariableDraft[]
}

export interface TemplateDraft {
  id: string
  name: string
  description: string
  content: string
  is_replace?: boolean
  file_url?: string
  splits: SplitDraft[]
}

export interface TemplateValidation {
  errors: string[]
  warnings: string[]
  stats?: Record<string, unknown>
}

export interface TemplatePatchOperation {
  op: string
  target?: Record<string, unknown>
  changes?: Record<string, unknown>
  section?: Record<string, unknown>
  variable?: Record<string, unknown>
  variables?: Record<string, unknown>[]
  position?: number | string | null
}

export interface TemplatePatch {
  schema_version?: string
  summary?: string
  operations: TemplatePatchOperation[]
  warnings?: string[]
  questions?: string[]
}

export interface WorkbenchPayload {
  template: TemplateDraft
  validation: TemplateValidation
  draft_version: number
}

export interface WorkbenchResponse {
  data: WorkbenchPayload
  message?: string
  code?: number
}

export interface AssistantRequest {
  template_id: string
  message: string
  draft: TemplateDraft
  selected: Record<string, unknown>
  conversation_id?: string
}

export interface AssistantResult {
  message?: string
  patch: TemplatePatch
  conversation_id?: string
}

export interface AssistantResponse {
  data: AssistantResult
  message?: string
}

export interface ApplyResponse {
  data: {
    draft: TemplateDraft
    validation: TemplateValidation
    draft_version: number
  }
  message?: string
}

export interface SaveResponse {
  data: {
    saved: boolean
    validation: TemplateValidation
    // 每次保存都会派生出一个新模板，这里返回新 id 与根底版 id。
    template_id?: string
    base_template_id?: string
    template_name?: string
  }
  message?: string
}

export type WorkbenchApiResponse<T> = AxiosResponse<T>

/**
 * 把草稿序列化成接口入参形状：splits[].variables 改名为
 * variable_mapping_list，与数据库字段名、deep-research 远端接口保持一致。
 *
 * 前端内部状态继续用 variables（组件里有 20+ 处引用），只在发请求
 * 这一层做转换，因此不影响页面逻辑；后端响应仍是 variables，也不需要
 * 额外反向转换。后端 SplitDraft 已配 alias 且 populate_by_name，
 * 两种写法都能解析，因此这个改动是向后兼容的。
 */
export function toDraftPayload(draft: TemplateDraft): Record<string, unknown> {
  return {
    ...draft,
    splits: (draft.splits || []).map((split) => {
      const { variables, ...rest } = split
      return { ...rest, variable_mapping_list: variables || [] }
    }),
  }
}
