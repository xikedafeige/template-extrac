export interface WorklogVariable {
  key: string
  title: string
  type: string
  value: string
  prompt: string
  chapter_index?: number | null
  section_title?: string
  section_index?: number | null
}

export interface WorklogSection {
  index: number | null
  section_title: string
  content: string
  display_content: string
  variables: WorklogVariable[]
}

export interface WorklogExtraSection {
  index: number | null
  section_title: string
  keys: string[]
}

export interface WorklogView {
  template_id: string
  template_name: string
  template_description: string
  template_type: string
  template_word_url: string
  template_markdown: string
  /** docx 还原出的版式 HTML；为空时前端退回按章节渲染 */
  layout_html: string
  layout_error: string
  /** 版式源里是否含 {{key}}；为 false 时无法点选联动 */
  layout_has_keys?: boolean
  /** 版式 HTML 中是否含表格；为 false 时退回按章节渲染 */
  layout_has_table?: boolean
  /** 是否使用了专用版式源（而非 Markdown 反向生成的 Word） */
  layout_is_dedicated?: boolean
  layout_word_url?: string
  /** 只存在于模板数据、原始 Word 版式里还没有对应占位符的章节 */
  layout_extra_sections?: WorklogExtraSection[]
  /** 骨架里有、数据库里没有的 key（通常是命名不一致） */
  unmatched_layout_keys?: string[]
  /** 数据库里有、骨架里没有的 key */
  unmatched_db_keys?: string[]
  /** 写法不同但已自动对上的 key，建议统一命名 */
  aliased_keys?: string[]
  sections: WorklogSection[]
  variables: WorklogVariable[]
}

export interface WorklogResponse {
  code: number
  message: string
  data: WorklogView | null
}
