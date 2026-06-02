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

export interface SubmitResponse {
  success: boolean
  template_id: string
  template_word_url: string
}
