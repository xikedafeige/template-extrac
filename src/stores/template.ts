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
type RestoreField = 'title' | 'template_content'
type DeletedPlaceholder = Placeholder & {
  restoreSectionIndex?: number
  restoreField?: RestoreField
  restoreOffset?: number
  restoreMarkdownOffset?: number
}
let restoreKeyShiftUid = 0

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

function createFallbackPlaceholder(key: string): Placeholder {
  return {
    key,
    original: key,
    type: 'TYPE_DESCRIPTION',
    fill_mode: 'newline',
    field: null,
    prompt: null,
  }
}

function extractPlaceholderKeysFromText(value?: string | null): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  const text = value || ''
  for (const match of text.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) {
    const key = normalizePlaceholderKey(match[1] || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

function getSectionPlaceholderKeys(sec: Pick<Section, 'title' | 'template_content'>): string[] {
  return extractPlaceholderKeysFromText(`${sec.title || ''}\n${sec.template_content || ''}`)
}

function normalizePlaceholder(ph: Placeholder): Placeholder {
  return { ...ph, key: normalizePlaceholderKey(ph.key) }
}

function mergePlaceholdersWithSectionKeys(phs: Placeholder[], secs: Section[]): Placeholder[] {
  const phMap = new Map<string, Placeholder>()
  for (const ph of phs) {
    const normalized = normalizePlaceholder(ph)
    if (normalized.key && !phMap.has(normalized.key)) {
      phMap.set(normalized.key, normalized)
    }
  }
  for (const sec of secs) {
    for (const key of getSectionPlaceholderKeys(sec)) {
      if (!phMap.has(key)) {
        phMap.set(key, createFallbackPlaceholder(key))
      }
    }
  }
  return sortPlaceholders([...phMap.values()])
}

function syncSectionPlaceholders(secs: Section[], phs: Placeholder[]): Section[] {
  const phMap = new Map(phs.map(ph => [normalizePlaceholderKey(ph.key), ph]))
  return secs.map(sec => ({
    ...sec,
    placeholders: getSectionPlaceholderKeys(sec).map(key => phMap.get(key) || createFallbackPlaceholder(key)),
  }))
}

function replaceFirst(source: string, search: string, replacement: string): string {
  if (!search) return source
  const index = source.indexOf(search)
  if (index === -1) return source
  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

function replaceAtOrInsert(source: string, offset: number, search: string, replacement: string): string {
  const safeOffset = Math.max(0, Math.min(offset, source.length))
  if (search && source.slice(safeOffset, safeOffset + search.length) === search) {
    return source.slice(0, safeOffset) + replacement + source.slice(safeOffset + search.length)
  }
  return source.slice(0, safeOffset) + replacement + source.slice(safeOffset)
}

export const useTemplateStore = defineStore('template', () => {
  const saved = loadFromStorage()

  const templateMarkdown = ref(saved?.templateMarkdown || '')
  const placeholders = ref<Placeholder[]>(sortPlaceholders(saved?.placeholders || []))
  const sections = ref<Section[]>(saved?.sections || [])
  const deletedStack = ref<DeletedPlaceholder[]>([])
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
    const nextSections = secs || []
    const nextPlaceholders = mergePlaceholdersWithSectionKeys(
      [...(phs || []), ...nextSections.flatMap(sec => sec.placeholders || [])],
      nextSections
    )
    templateMarkdown.value = md
    placeholders.value = nextPlaceholders
    sections.value = syncSectionPlaceholders(nextSections, nextPlaceholders)
    deletedStack.value = []
    selectedChipKey.value = null
    pendingRemoveKey.value = null
    suppressEditorSync.value = false
  }

  function loadFromDetail(data: TemplateDetail) {
    templateId.value = data.template_id
    templateName.value = data.template_name || ''
    templateDescription.value = data.template_description || ''
    customId.value = data.custom_id || ''
    templateMarkdown.value = data.template_markdown || ''
    const nextSections = data.sections || []
    const nextPlaceholders = mergePlaceholdersWithSectionKeys(
      nextSections.flatMap(sec => sec.placeholders || []),
      nextSections
    )
    sections.value = syncSectionPlaceholders(nextSections, nextPlaceholders)
    placeholders.value = nextPlaceholders
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

  function pushDeleted(ph: DeletedPlaceholder) {
    deletedStack.value.push(ph)
    if (deletedStack.value.length > 50) {
      deletedStack.value.shift()
    }
  }

  function popDeleted(): DeletedPlaceholder | undefined {
    return deletedStack.value.pop()
  }

  function isPlaceholderKeyInUse(key: string): boolean {
    const normalizedKey = normalizePlaceholderKey(key)
    if (!normalizedKey) return false
    const token = `{{${normalizedKey}}}`
    return (
      placeholders.value.some(ph => normalizePlaceholderKey(ph.key) === normalizedKey) ||
      sections.value.some(sec =>
        String(sec.title || '').includes(token) ||
        String(sec.template_content || '').includes(token)
      ) ||
      templateMarkdown.value.includes(token)
    )
  }

  function createDeletedPlaceholder(ph: Placeholder): DeletedPlaceholder {
    const normalizedKey = normalizePlaceholderKey(ph.key)
    const token = `{{${normalizedKey}}}`
    const deletedPh: DeletedPlaceholder = { ...ph, key: normalizedKey }
    const markdownOffset = templateMarkdown.value.indexOf(token)
    if (markdownOffset >= 0) {
      deletedPh.restoreMarkdownOffset = markdownOffset
    }

    for (let index = 0; index < sections.value.length; index++) {
      const sec = sections.value[index]
      const titleOffset = typeof sec.title === 'string' ? sec.title.indexOf(token) : -1
      if (titleOffset >= 0) {
        deletedPh.restoreSectionIndex = index
        deletedPh.restoreField = 'title'
        deletedPh.restoreOffset = titleOffset
        return deletedPh
      }

      const contentOffset = (sec.template_content || '').indexOf(token)
      if (contentOffset >= 0) {
        deletedPh.restoreSectionIndex = index
        deletedPh.restoreField = 'template_content'
        deletedPh.restoreOffset = contentOffset
        return deletedPh
      }
    }

    return deletedPh
  }

  // 根据章节号获取该章节内已有 key 的最大 index
  function getNextKeyIndex(sectionNum: number): number {
    const keys = new Set(placeholders.value.map(ph => normalizePlaceholderKey(ph.key)))
    const section = sections.value[sectionNum]
    if (section) {
      getSectionPlaceholderKeys(section).forEach(key => keys.add(key))
    }
    let maxIdx = 0
    for (const key of keys) {
      const parts = parseKeyParts(key)
      if (parts?.section === sectionNum && parts.suffix === 'md') {
        maxIdx = Math.max(maxIdx, parts.index)
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

  // 同步替换指定 section 的 template_content 中的 key
  function replaceSectionKey(sectionNum: number, oldKey: string, newKey: string) {
    const re = new RegExp(`\\{\\{${oldKey}\\}\\}`, 'g')
    sections.value = sections.value.map((sec, idx) => {
      if (idx !== sectionNum) return sec
      return {
        ...sec,
        title: typeof sec.title === 'string' ? sec.title.replace(re, `{{${newKey}}}`) : sec.title,
        template_content: (sec.template_content || '').replace(re, `{{${newKey}}}`),
      }
    })
  }

  // 同步替换所有 section 的 template_content 中的 key（用于 rename）
  function replaceSectionsKey(oldKey: string, newKey: string) {
    const re = new RegExp(`\\{\\{${oldKey}\\}\\}`, 'g')
    sections.value = sections.value.map(sec => ({
      ...sec,
      title: typeof sec.title === 'string' ? sec.title.replace(re, `{{${newKey}}}`) : sec.title,
      template_content: (sec.template_content || '').replace(re, `{{${newKey}}}`),
    }))
  }

  // 同步从所有 section 的 template_content 中移除 key（还原为原文）
  function shiftSectionKeysFromIndex(sectionNum: number, startIndex: number, suffix: string) {
    const section = sections.value[sectionNum]
    const referenceText = section
      ? `${section.title || ''}\n${section.template_content || ''}`
      : templateMarkdown.value

    const keysToShift = new Map<string, { key: string; index: number; pos: number }>()
    const addKey = (key: string) => {
      const normalizedKey = normalizePlaceholderKey(key)
      const parts = parseKeyParts(normalizedKey)
      if (!parts || parts.section !== sectionNum || parts.suffix !== suffix || parts.index < startIndex) {
        return
      }
      if (keysToShift.has(normalizedKey)) return
      const pos = referenceText.indexOf(`{{${normalizedKey}}}`)
      keysToShift.set(normalizedKey, { key: normalizedKey, index: parts.index, pos })
    }

    placeholders.value.forEach(ph => addKey(ph.key))
    if (section) {
      getSectionPlaceholderKeys(section).forEach(addKey)
    }

    const orderedKeys = [...keysToShift.values()]
      .filter(item => item.pos >= 0)
      .sort((a, b) => b.index - a.index)

    if (!orderedKeys.length) return

    const tmpPairs = orderedKeys.map(({ key, index }) => ({
      key,
      index,
      tmpKey: `__tmp_restore_shift_${restoreKeyShiftUid++}_${index}__`,
    }))

    tmpPairs.forEach(({ key, tmpKey }) => {
      const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      templateMarkdown.value = templateMarkdown.value.replace(re, `{{${tmpKey}}}`)
      replaceSectionKey(sectionNum, key, tmpKey)
      placeholders.value = placeholders.value.map(ph =>
        normalizePlaceholderKey(ph.key) === key ? { ...ph, key: tmpKey } : ph
      )
    })

    tmpPairs.forEach(({ tmpKey, index }) => {
      const nextKey = `key_${sectionNum}_${index + 1}_${suffix}`
      const re = new RegExp(`\\{\\{${tmpKey}\\}\\}`, 'g')
      templateMarkdown.value = templateMarkdown.value.replace(re, `{{${nextKey}}}`)
      replaceSectionKey(sectionNum, tmpKey, nextKey)
      placeholders.value = placeholders.value.map(ph =>
        ph.key === tmpKey ? { ...ph, key: nextKey } : ph
      )
    })

    placeholders.value = sortPlaceholders(placeholders.value)
  }

  function restoreByRecordedPosition(ph: DeletedPlaceholder, token: string): boolean {
    const canRestoreByPosition =
      typeof ph.restoreSectionIndex === 'number' &&
      ph.restoreSectionIndex >= 0 &&
      ph.restoreSectionIndex < sections.value.length &&
      (ph.restoreField === 'title' || ph.restoreField === 'template_content') &&
      typeof ph.restoreOffset === 'number'

    if (!canRestoreByPosition) return false

    sections.value = sections.value.map((sec, index) => {
      if (index !== ph.restoreSectionIndex) return sec

      if (ph.restoreField === 'title') {
        return {
          ...sec,
          title: replaceAtOrInsert(typeof sec.title === 'string' ? sec.title : '', ph.restoreOffset || 0, ph.original, token),
        }
      }

      return {
        ...sec,
        template_content: replaceAtOrInsert(sec.template_content || '', ph.restoreOffset || 0, ph.original, token),
      }
    })
    return true
  }

  // 删除后重排该章节内所有 key 的序号
  function removePlaceholder(key: string) {
    console.log('[removePlaceholder] called with key=', key)
    const ph = placeholders.value.find(p => p.key === key)
    console.log('[removePlaceholder] found ph=', ph)
    if (!ph) return

    pushDeleted(createDeletedPlaceholder(ph))
    console.log('[removePlaceholder] after pushDeleted, deletedStack length=', deletedStack.value.length)
    pendingRemoveKey.value = key
    console.log('[removePlaceholder] set pendingRemoveKey to', key)
    // 注意：pendingRemoveKey 由 TemplateEditor.vue 的 pendingRemoveKey watcher 处理。
    // 该 watcher 会：
    // 1. 精确替换 DOM 中的 chip 节点为原文
    // 2. 同步更新 store.templateMarkdown 和 sections.template_content
    // 3. 执行 reindexSection 核心逻辑（同步，不触发 structural watcher）
    // 4. 更新 DOM 中被 reindex 重命名的 key 属性
    // 5. 设置 suppressNextStructuralRebuild = true
    // 因此这里只需要保存 deleted stack + 设置 pendingRemoveKey
    if (selectedChipKey.value === key) {
      selectChip(null)
    }
  }

  // 对指定章节内的 key 按在对应 section 的 template_content 中出现的顺序重新编号
  // 使用两阶段重命名（先临时key，再最终key），避免碰撞导致错误替换
  function reindexSection(sectionNum: number) {
    const prefix = `key_${sectionNum}_`
    const section = sections.value[sectionNum]
    const referenceText = section
      ? `${section.title || ''}\n${section.template_content || ''}`
      : templateMarkdown.value

    const sectionPhs = placeholders.value
      .filter(p => p.key.startsWith(prefix) && p.key.endsWith('_md'))
      .map(p => ({ ph: p, pos: referenceText.indexOf(`{{${p.key}}}`) }))
      .filter(item => item.pos >= 0)
      .sort((a, b) => a.pos - b.pos)

    // Phase 1: 全部重命名为临时 key，避免碰撞
    const tmpKeys: string[] = []
    for (let i = 0; i < sectionPhs.length; i++) {
      const { ph } = sectionPhs[i]
      const tmpKey = `__tmp_reindex_${sectionNum}_${i}__`
      tmpKeys.push(tmpKey)
      const tmpRe = new RegExp(`\\{\\{${ph.key}\\}\\}`, 'g')
      templateMarkdown.value = templateMarkdown.value.replace(tmpRe, `{{${tmpKey}}}`)
      replaceSectionKey(sectionNum, ph.key, tmpKey)
    }

    // Phase 2: 临时 key → 最终 key
    for (let i = 0; i < sectionPhs.length; i++) {
      const { ph } = sectionPhs[i]
      const newKey = `key_${sectionNum}_${i + 1}_md`
      const tmpKey = tmpKeys[i]
      const tmpRe = new RegExp(`\\{\\{${tmpKey}\\}\\}`, 'g')
      templateMarkdown.value = templateMarkdown.value.replace(tmpRe, `{{${newKey}}}`)
      replaceSectionKey(sectionNum, tmpKey, newKey)
      ph.key = newKey
    }

    placeholders.value = sortPlaceholders(placeholders.value)
  }

  function addPlaceholder(ph: Placeholder) {
    placeholders.value = sortPlaceholders([...placeholders.value, { ...ph, key: normalizePlaceholderKey(ph.key) }])
  }

  function restorePlaceholder(ph: DeletedPlaceholder) {
    const normalizedKey = normalizePlaceholderKey(ph.key)
    const parts = parseKeyParts(normalizedKey)
    const sectionNum = parts?.section ?? parseSectionNumFromKey(normalizedKey)
    let restoreKey = normalizedKey

    if (isPlaceholderKeyInUse(normalizedKey)) {
      if (parts) {
        shiftSectionKeysFromIndex(parts.section, parts.index, parts.suffix)
      } else {
        restoreKey = generateKey(sectionNum !== null ? sectionNum : 0)
      }
    }

    const {
      restoreSectionIndex,
      restoreField,
      restoreOffset,
      restoreMarkdownOffset,
      ...placeholderData
    } = ph
    const normalizedPh: Placeholder = { ...placeholderData, key: restoreKey }
    const token = `{{${normalizedPh.key}}}`

    // 优先在 sections.template_content 中查找并替换第一个匹配项
    const preferredIndex = sectionNum !== null ? sectionNum : -1
    const preferredSection = sections.value[preferredIndex]
    const canUsePreferred = Boolean(preferredSection?.template_content?.includes(normalizedPh.original))
    let replaced = restoreByRecordedPosition(ph, token)

    if (!replaced) {
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
    }

    // 如果 sections 中没有找到匹配的原文（已被删除或文本有变化），尝试在 templateMarkdown 中替换
    if (typeof ph.restoreMarkdownOffset === 'number') {
      templateMarkdown.value = replaceAtOrInsert(templateMarkdown.value, ph.restoreMarkdownOffset, ph.original, token)
    } else if (!replaced) {
      templateMarkdown.value = replaceFirst(templateMarkdown.value, normalizedPh.original, token)
    }

    addPlaceholder(normalizedPh)
    placeholders.value = mergePlaceholdersWithSectionKeys(placeholders.value, sections.value)
    sections.value = syncSectionPlaceholders(sections.value, placeholders.value)
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
    const phMap = new Map(placeholders.value.map(p => [normalizePlaceholderKey(p.key), p]))

    // 用后端返回的 sections 作为基础结构，通过 title 和 template_content 中实际出现的 {{key}} 来匹配
    return sections.value.map((sec) => {
      const matchedKeys = getSectionPlaceholderKeys(sec)
      const secPhs = matchedKeys.map(key => phMap.get(key) || createFallbackPlaceholder(key))

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
    normalizePlaceholderKey, comparePlaceholderKey, sortPlaceholders, reindexSection,
  }
})
