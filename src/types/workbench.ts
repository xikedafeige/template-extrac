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
  }
  message?: string
}

export type WorkbenchApiResponse<T> = AxiosResponse<T>
