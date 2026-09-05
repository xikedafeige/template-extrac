export interface Chip {
  key: string
  original: string
  type: 'TYPE_FILL' | 'TYPE_DESCRIPTION'
  fill_mode: 'inline' | 'newline'
  field: string | null
  prompt: string | null
}

export interface Placeholder {
  key: string
  original: string
  originalHtml?: string
  type: string
  fill_mode: string
  field?: string | null
  prompt?: string | null
  note?: string
}

export interface Section {
  title: string | null
  content: string
  template_content: string
  placeholders: Placeholder[]
}

export interface UploadResponse {
  success: boolean
  template_markdown: string
  placeholders: Placeholder[]
  sections: Section[]
}

export interface SubmitSection {
  title: string | null
  content: string
  template_content: string
  placeholders: Placeholder[]
}

export interface SubmitRequest {
  template_markdown: string
  sections: SubmitSection[]
  template_name: string
  template_description?: string
  custom_id?: string
}

export interface EditSubmitRequest {
  template_id: string
  template_markdown: string
  sections: SubmitSection[]
  template_name: string
  template_description?: string
  custom_id?: string
}

export interface SubmitResponse {
  success: boolean
  template_id: string
  template_word_url: string
}

export interface TemplateListItem {
  template_id: string
  template_name: string
  template_description?: string
  template_word_url?: string
  /**
   * 模板类型 code。取值与展示名统一定义在 src/types/templateType.ts：
   * WORK_LOG 工作记录表 / PRE_ASSESS 事前评估 /
   * MID_MONITOR 事中监控 / POST_REVIEW 事后评价。
   * 为空表示未分类，列表页类型列留空。
   */
  template_type?: string
  /** 派生自哪个底版；空表示本身就是底版 */
  base_template_id?: string
  /** 底版名称，用于展示“派生自 XX” */
  base_template_name?: string
  created_at?: string
  updated_at?: string
}

export interface TemplateDetail {
  template_id: string
  template_name: string
  template_description?: string
  template_word_url?: string
  template_markdown: string
  sections: Section[]
  custom_id?: string
  created_at?: string
  updated_at?: string
}

export interface ListResponse {
  code: number
  message: string
  data: {
    total: number
    items: TemplateListItem[]
  }
}

export interface DetailResponse {
  code: number
  message: string
  data: TemplateDetail
}

export interface DeleteResponse {
  code: number
  message: string
}

export interface GeneratePromptRequest {
  placeholder_key: string
  text_fragment: string
  template_content: string
  extra_prompt?: string
}

export interface GeneratePromptResponse {
  success: boolean
  generated_prompt: string
}
