import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Placeholder, Section, SubmitSection, TemplateDetail } from '../types/template'

const STORAGE_KEY = 'template_store_data'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('[store] loadFromStorage failed:', e)
  }
  return null
}

function saveToStorage(data: {
  templateMarkdown: string
  placeholders: Placeholder[]
  sections: Section[]
  templateName: string
  templateDescription: string
  templateId: string
  customId: string
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[store] saveToStorage failed:', e)
  }
}

const KEY_PATTERN = /^key_(\d+)_(\d+)_(md|json)$/
const KEY_SUFFIX_ORDER: Record<string, number> = {
  md: 0,
  json: 1,
}

function normalizePlaceholderKey(key: string): string {
  return key.trim().replace(/＿/g, '_').toLowerCase()
}

function parseSectionNumFromKey(key: string): number | null {
  const matched = normalizePlaceholderKey(key).match(KEY_PATTERN)
  if (!matched) return null
  return Number.parseInt(matched[1], 10)
}

function parseKeyParts(key: string): { section: number; index: number; suffix: string } | null {
  const matched = normalizePlaceholderKey(key).match(KEY_PATTERN)
  if (!matched) return null
  return {
    section: Number.parseInt(matched[1], 10),
    index: Number.parseInt(matched[2], 10),
    suffix: matched[3],
  }
}

function comparePlaceholderKey(a: string, b: string): number {
  const left = parseKeyParts(a)
  const right = parseKeyParts(b)
  const normalizedA = normalizePlaceholderKey(a)
  const normalizedB = normalizePlaceholderKey(b)

  if (left && right) {
    return (
      left.section - right.section ||
      left.index - right.index ||
      (KEY_SUFFIX_ORDER[left.suffix] ?? 99) - (KEY_SUFFIX_ORDER[right.suffix] ?? 99) ||
      normalizedA.localeCompare(normalizedB)
    )
  }

  if (left) return -1
  if (right) return 1
  return normalizedA.localeCompare(normalizedB)
}

function sortPlaceholders(phs: Placeholder[]): Placeholder[] {
  return [...phs].sort((a, b) => comparePlaceholderKey(a.key, b.key))
}

function replaceFirst(source: string, search: string, replacement: string): string {
  if (!search) return source
  const index = source.indexOf(search)
  if (index === -1) return source
  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

export const useTemplateStore = defineStore('template', () => {
  const saved = loadFromStorage()

  const templateMarkdown = ref(saved?.templateMarkdown || '')
  const placeholders = ref<Placeholder[]>(sortPlaceholders(saved?.placeholders || []))
  const sections = ref<Section[]>(saved?.sections || [])
  const deletedStack = ref<Placeholder[]>([])
  const selectedChipKey = ref<string | null>(null)
  const selectedChipVersion = ref(0)
  const pendingRemoveKey = ref<string | null>(null)
  const suppressEditorSync = ref(false)
  const templateName = ref(saved?.templateName || '')
  const templateDescription = ref(saved?.templateDescription || '')
  const templateId = ref(saved?.templateId || '')
  const isEditMode = ref(Boolean(saved?.templateId))
  const customId = ref(saved?.customId || '')

  const availableFields = ref<string[]>([
    'reportNo', 'reportDate', 'projectName', 'projectCode',
    'amount', 'rate', 'createDate', 'riskNote',
    'orgName', 'evalYear', 'projectCount', 'totalAmount',
  ])

  function setUploadResult(md: string, phs: Placeholder[], secs: Section[]) {
    templateMarkdown.value = md
    placeholders.value = sortPlaceholders(phs)
    sections.value = secs
    deletedStack.value = []
    selectedChipKey.value = null
  }

  function loadFromDetail(data: TemplateDetail) {
    templateId.value = data.template_id
    templateName.value = data.template_name || ''
    templateDescription.value = data.template_description || ''
    customId.value = data.custom_id || ''
    templateMarkdown.value = data.template_markdown || ''
    sections.value = data.sections || []
    placeholders.value = sortPlaceholders(
      sections.value.flatMap(sec => sec.placeholders || [])
    )
    isEditMode.value = true
    deletedStack.value = []
    selectedChipKey.value = null
    pendingRemoveKey.value = null
  }

  function resetForCreate() {
    templateId.value = ''
    templateName.value = ''
    templateDescription.value = ''
    customId.value = ''
    templateMarkdown.value = ''
    placeholders.value = []
    sections.value = []
    isEditMode.value = false
    deletedStack.value = []
    selectedChipKey.value = null
    pendingRemoveKey.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function pushDeleted(ph: Placeholder) {
    deletedStack.value.push(ph)
    if (deletedStack.value.length > 50) {
      deletedStack.value.shift()
    }
  }

  function popDeleted(): Placeholder | undefined {
    return deletedStack.value.pop()
  }

  // 根据章节号获取该章节内已有 key 的最大 index
  function getNextKeyIndex(sectionNum: number): number {
    const prefix = `key_${sectionNum}_`
    let maxIdx = 0
    for (const ph of placeholders.value) {
      if (ph.key.startsWith(prefix)) {
        const m = ph.key.match(/^key_\d+_(\d+)_md$/)
        if (m) maxIdx = Math.max(maxIdx, parseInt(m[1]))
      }
    }
    return maxIdx + 1
  }

  // 根据光标在 templateMarkdown 中的位置，判断所在章节号
  function getSectionNum(textBefore: string): number {
    // 匹配中文数字章节标题：一、二、三、...
    const sectionHeaders = ['一、', '二、', '三、', '四、', '五、', '六、', '七、', '八、', '九、', '十、']
    let sectionNum = 0
    for (let i = sectionHeaders.length - 1; i >= 0; i--) {
      if (textBefore.includes(sectionHeaders[i])) {
        sectionNum = i + 1
        break
      }
    }
    return sectionNum
  }

  // 生成新 key
  function generateKey(sectionNum: number): string {
    const idx = getNextKeyIndex(sectionNum)
    return `key_${sectionNum}_${idx}_md`
  }

  function findSectionNumByOriginal(original: string): number {
    const sectionIndex = sections.value.findIndex(sec =>
      (sec.template_content || sec.content || '').includes(original)
    )
    return sectionIndex === -1 ? 0 : sectionIndex + 1
  }

  // 同步替换所有 section 的 template_content 中的 key
  function replaceSectionsKey(oldKey: string, newKey: string) {
    const re = new RegExp(`\\{\\{${oldKey}\\}\\}`, 'g')
    sections.value = sections.value.map(sec => ({
      ...sec,
      template_content: (sec.template_content || '').replace(re, `{{${newKey}}}`),
    }))
  }

  // 同步从所有 section 的 template_content 中移除 key（还原为原文）
  function removeSectionsKey(key: string, restoreContent: string) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    sections.value = sections.value.map(sec => ({
      ...sec,
      template_content: (sec.template_content || '').replace(re, restoreContent),
    }))
  }

  function unwrapPlaceholderRestoreContent(content: string): string {
    if (!content || !/(data-chip|data-html-block)/i.test(content)) return content
    if (typeof document === 'undefined') return content

    const wrapper = document.createElement('div')
    wrapper.innerHTML = content

    wrapper.querySelectorAll('[data-html-block]').forEach((el) => {
      const encoded = el.getAttribute('data-html-encoded') || ''
      if (!encoded) return

      try {
        const html = decodeURIComponent(atob(encoded))
        const replacement = document.createElement('div')
        replacement.innerHTML = html
        const fragment = document.createDocumentFragment()
        Array.from(replacement.childNodes).forEach(node => fragment.appendChild(node))
        el.replaceWith(fragment)
      } catch {
        el.replaceWith(document.createTextNode(el.textContent || ''))
      }
    })

    wrapper.querySelectorAll('span[data-chip]').forEach((el) => {
      const original = el.getAttribute('data-original') || el.textContent || ''
      el.replaceWith(document.createTextNode(original))
    })

    return wrapper.innerHTML.trim() || wrapper.textContent || content
  }

  function getPlaceholderRestoreContent(ph: Placeholder): string {
    const restoreContent = ph.originalHtml?.trim() || ph.original || ''
    return unwrapPlaceholderRestoreContent(restoreContent)
  }

  // 删除后重排该章节内所有 key 的序号
  function removePlaceholder(key: string) {
    const ph = placeholders.value.find(p => p.key === key)
    if (!ph) return

    pushDeleted({ ...ph })
    pendingRemoveKey.value = key

    // 把 {{key}} 替换为添加占位符前的内容，优先保留原 HTML 格式。
    const restoreContent = getPlaceholderRestoreContent(ph)
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    templateMarkdown.value = templateMarkdown.value.replace(re, restoreContent)
    removeSectionsKey(key, restoreContent)
    placeholders.value = placeholders.value.filter(p => p.key !== key)

    // 提取章节号
    const m = key.match(/^key_(\d+)_\d+_md$/)
    if (m) {
      reindexSection(parseInt(m[1]))
    }

    placeholders.value = sortPlaceholders(placeholders.value)
    if (selectedChipKey.value === key) {
      selectChip(null)
    }
  }

  // 对指定章节内的 key 按在对应 section 的 template_content 中出现的顺序重新编号
  function reindexSection(sectionNum: number) {
    const prefix = `key_${sectionNum}_`
    // sectionNum 直接对应 sections 数组索引
    const section = sections.value[sectionNum]
    const referenceText = section?.template_content || templateMarkdown.value

    // 找出该章节所有 key，按在 referenceText 中出现的位置排序
    const sectionPhs = placeholders.value
      .filter(p => p.key.startsWith(prefix) && p.key.endsWith('_md'))
      .map(p => ({ ph: p, pos: referenceText.indexOf(`{{${p.key}}}`) }))
      .sort((a, b) => a.pos - b.pos)

    let idx = 1
    for (const { ph } of sectionPhs) {
      const newKey = `key_${sectionNum}_${idx}_md`
      if (ph.key !== newKey) {
        templateMarkdown.value = templateMarkdown.value.replace(
          new RegExp(`\\{\\{${ph.key}\\}\\}`, 'g'),
          `{{${newKey}}}`
        )
        replaceSectionsKey(ph.key, newKey)
        ph.key = newKey
      }
      idx++
    }

    placeholders.value = sortPlaceholders(placeholders.value)
  }

  function addPlaceholder(ph: Placeholder) {
    placeholders.value = sortPlaceholders([...placeholders.value, { ...ph, key: normalizePlaceholderKey(ph.key) }])
  }

  function restorePlaceholder(ph: Placeholder) {
    const normalizedPh = { ...ph, key: normalizePlaceholderKey(ph.key) }
    const token = `{{${normalizedPh.key}}}`
    templateMarkdown.value = replaceFirst(templateMarkdown.value, normalizedPh.original, token)

    const sectionNum = parseSectionNumFromKey(normalizedPh.key)
    const preferredIndex = sectionNum !== null ? sectionNum : -1
    const preferredSection = sections.value[preferredIndex]
    const canUsePreferred = Boolean(preferredSection?.template_content?.includes(normalizedPh.original))
    let replaced = false

    sections.value = sections.value.map((sec, index) => {
      const templateContent = sec.template_content || ''
      const shouldTryPreferred = canUsePreferred && preferredIndex === index
      const shouldTryFallback = !canUsePreferred && !replaced && templateContent.includes(normalizedPh.original)

      if (!shouldTryPreferred && !shouldTryFallback) {
        return sec
      }

      replaced = true
      return {
        ...sec,
        template_content: replaceFirst(templateContent, normalizedPh.original, token),
      }
    })

    addPlaceholder(normalizedPh)
    selectChip(normalizedPh.key)
  }

  function addPlaceholderFromOriginal(ph: Placeholder) {
    const normalizedPh = { ...ph, key: normalizePlaceholderKey(ph.key) }
    const token = `{{${normalizedPh.key}}}`
    templateMarkdown.value = replaceFirst(templateMarkdown.value, normalizedPh.original, token)

    const sectionNum = parseSectionNumFromKey(normalizedPh.key)
    const preferredIndex = sectionNum !== null ? sectionNum : -1
    const preferredSection = sections.value[preferredIndex]
    const canUsePreferred = Boolean(preferredSection?.template_content?.includes(normalizedPh.original))
    let replaced = false

    sections.value = sections.value.map((sec, index) => {
      const templateContent = sec.template_content || ''
      const shouldTryPreferred = canUsePreferred && preferredIndex === index
      const shouldTryFallback = !canUsePreferred && !replaced && templateContent.includes(normalizedPh.original)

      if (!shouldTryPreferred && !shouldTryFallback) {
        return sec
      }

      replaced = true
      return {
        ...sec,
        template_content: replaceFirst(templateContent, normalizedPh.original, token),
      }
    })

    addPlaceholder(normalizedPh)
  }

  // 构造 submit 用的 sections 数组
  function buildSubmitSections(): SubmitSection[] {
    const phMap = new Map(placeholders.value.map(p => [p.key, p]))

    // 用后端返回的 sections 作为基础结构，通过 title 和 template_content 中实际出现的 {{key}} 来匹配
    return sections.value.map((sec) => {
      const titleText = sec.title || ''
      const templateContent = sec.template_content || ''
      const combinedText = titleText + '\n' + templateContent
      const matchedKeys = [...combinedText.matchAll(/\{\{([\w]+)\}\}/g)].map(m => m[1])
      const secPhs = matchedKeys
        .map(key => phMap.get(key))
        .filter((ph): ph is Placeholder => ph !== undefined)

      return {
        title: sec.title,
        content: sec.content,
        template_content: sec.template_content,
        placeholders: secPhs.map(ph => ({
          key: ph.key,
          original: ph.original,
          type: ph.type,
          fill_mode: ph.fill_mode,
          field: ph.field,
          prompt: ph.prompt,
        })),
      }
    })
  }

  function updatePlaceholder(key: string, updates: Partial<Placeholder>) {
    const idx = placeholders.value.findIndex(p => p.key === key)
    if (idx !== -1) {
      const newPlaceholders = placeholders.value.map((p, i) =>
        i === idx ? { ...p, ...updates } : p
      )
      placeholders.value = sortPlaceholders(newPlaceholders)
    }
  }

  function renamePlaceholder(oldKey: string, newKey: string) {
    const normalizedNewKey = normalizePlaceholderKey(newKey)
    if (oldKey === normalizedNewKey || !normalizedNewKey) return
    const idx = placeholders.value.findIndex(p => p.key === oldKey)
    if (idx === -1) return
    templateMarkdown.value = templateMarkdown.value.replace(
      new RegExp(`\\{\\{${oldKey}\\}\\}`, 'g'),
      `{{${normalizedNewKey}}}`
    )
    replaceSectionsKey(oldKey, normalizedNewKey)
    placeholders.value = sortPlaceholders(placeholders.value.map((p, i) =>
      i === idx ? { ...p, key: normalizedNewKey } : p
    ))
    if (selectedChipKey.value === oldKey) {
      selectChip(normalizedNewKey)
    }
  }

  function selectChip(key: string | null) {
    selectedChipKey.value = key
    selectedChipVersion.value += 1
  }

  // 自动持久化到 sessionStorage
  watch(
    [templateMarkdown, placeholders, sections, templateName, templateDescription, templateId, customId],
    () => {
      saveToStorage({
        templateMarkdown: templateMarkdown.value,
        placeholders: placeholders.value,
        sections: sections.value,
        templateName: templateName.value,
        templateDescription: templateDescription.value,
        templateId: templateId.value,
        customId: customId.value,
      })
    },
    { deep: true }
  )

  return {
    templateMarkdown, placeholders, sections, deletedStack,
    selectedChipKey, selectedChipVersion, pendingRemoveKey, suppressEditorSync,
    templateName, templateDescription, templateId, isEditMode, customId, availableFields,
    setUploadResult, loadFromDetail, resetForCreate, pushDeleted, popDeleted,
    removePlaceholder, addPlaceholder, restorePlaceholder, updatePlaceholder, renamePlaceholder, selectChip,
    addPlaceholderFromOriginal, generateKey, getSectionNum, findSectionNumByOriginal, buildSubmitSections,
    normalizePlaceholderKey, comparePlaceholderKey, sortPlaceholders,
  }
})
