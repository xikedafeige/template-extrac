<template>
  <div class="workbench-page">
    <header class="topbar">
      <div class="brand"><i />模板智能维护工作台</div>
      <div class="crumb">人工维护模板 · AI 辅助修改</div>
      <div class="grow" />
      <span class="status" :class="statusKind">{{ status }}</span>
      <button class="btn" @click="leaveWorkbench">返回模板列表</button>
      <button class="btn primary" :disabled="!draft || saving" @click="save">{{ saving ? '保存中…' : '保存模板' }}</button>
    </header>

    <main class="workspace" :class="{ 'precise-mode': preciseMode }">
      <section class="pane">
        <div class="pane-head"><h2>模板预览</h2><small>{{ editMode ? '编辑章节模板原文和标题' : '模板预览内容' }}</small><div class="grow" /><button class="precision-btn" :class="{ active: preciseMode }" @click="togglePreciseMode"><span class="precision-icon">✦</span><span>{{ preciseMode ? '返回 AI 助手' : '精准编辑' }}</span></button><button v-if="editMode" class="mini-btn" @click="openSectionForm()">＋新增章节</button></div>
        <div class="scroll template-scroll" @mouseup="captureSelection" @keyup="captureSelection">
          <div v-if="loading" class="empty">读取模板中…</div>
          <div v-else-if="loadError" class="empty error">{{ loadError }}</div>
          <div v-else-if="!draft?.splits.length" class="empty">模板没有章节</div>
          <article v-for="section in draft?.splits || []" :key="section.id" :data-split-id="section.id" class="section" :class="{ 'selected-block': selected.splitId === section.id }" @click="selectSection(section.id)">
            <div class="section-title" @click.stop="selectSection(section.id)"><input v-if="canEditSection(section)" :data-section-title-input="section.id" v-model="section.section_title" class="inline-input section-input" @input="markDirty" @click.stop="" /><template v-else>{{ section.section_title || '未命名章节' }}</template> <span v-if="preciseMode" class="badge">第 {{ sectionDisplayNumber(section) }} 章</span><span v-if="preciseMode" class="section-actions"><button v-if="!canEditSection(section)" class="mini-btn" @click.stop="startSectionEdit(section)">编辑</button><template v-else><button class="mini-btn danger" @click.stop="removeSection(section)">删除</button><button class="mini-btn" @click.stop="openSectionForm(undefined, section)">下方新增</button><button v-if="!editMode" class="mini-btn" @click.stop="finishSectionEdit">完成</button></template></span></div>
            <div class="template-block"><span class="block-label">{{ canEditSection(section) ? '章节草稿内容（已展开变量）' : '模板原文 · 已展开变量内容' }}</span><textarea v-if="canEditSection(section)" :data-section-editor="section.id" :value="sectionEditText(section)" class="section-editor" @input="updateSectionContent(section, $event)" @click.stop="" /><div v-else class="block-text" v-html="renderText(humanText(section))" @click.stop="onTemplateClick($event, section.id)" /></div>
          </article>
        </div>
      </section>

      <section v-if="preciseMode" class="pane variable-pane">
        <div class="pane-head"><h2>变量内容</h2><small>{{ editMode ? '直接编辑变量字段' : '按章节查看 value / prompt' }}</small><div class="grow" /><span class="badge blue">{{ variableCount }} 个变量</span></div>
        <div class="scroll variable-scroll">
          <div v-if="!draft" class="empty">加载模板后，这里会显示变量</div>
          <div v-for="section in draft?.splits || []" :key="section.id" class="split-card" :data-section-id="section.id" :class="{ selected: selected.splitId === section.id }">
            <div class="split-head" @click="selectSection(section.id)"><span class="split-index">{{ sectionDisplayNumber(section) }}</span><span class="split-name">{{ section.section_title || '未命名章节' }}</span><div class="grow" /><button v-if="editMode || editingSectionId === section.id" class="mini-btn" @click.stop="openVariableForm(section)">＋变量</button><span class="badge">{{ section.variables.length }} 个 key</span><span>▾</span></div>
            <div class="split-body">
              <div v-if="!section.variables.length" class="notice">本章节暂无变量</div>
              <div v-for="(variable, variableIndex) in section.variables" :key="variable.key" class="variable-card" :class="{ selected: selected.key === variable.key }" @click.stop="selectVariable(variable.key, section.id)">
                <div class="var-top"><select v-if="canEditVariable(variable)" v-model="variable.type" class="type-select" @change="markDirty" @click.stop=""><option v-for="type in variableTypes" :key="type" :value="type">{{ type }}</option></select><span v-else class="badge" :class="typeClass(variable.type)">{{ variable.type }}</span><input v-if="canEditVariable(variable)" :data-variable-title-input="variable.key" v-model="variable.title" class="inline-input var-title-input" placeholder="变量标题" @input="markDirty" @click.stop="" /><span v-else class="var-title">{{ variable.title || '未命名变量' }}</span><div class="grow" /><button v-if="!canEditVariable(variable)" class="mini-btn" @click.stop="startVariableEdit(section, variable)">编辑</button><button v-else-if="!editMode" class="mini-btn" @click.stop="finishVariableEdit">完成</button><span class="var-index">#{{ variableDisplayNumber(section, variableIndex) }}</span></div>
                <div class="key">{{ variable.key || '(无 key)' }}</div>
                <div class="var-label">value · 要生成的内容</div><textarea v-if="canEditVariable(variable)" v-model="variable.value" class="variable-editor" @input="markDirty" @click.stop="" /><div v-else class="var-value">{{ variable.value || '（空）' }}</div>
                <div class="var-label">prompt · 生成约束</div><textarea v-if="canEditVariable(variable)" v-model="variable.prompt" class="variable-editor prompt-editor" @input="markDirty" @click.stop="" /><div v-else class="var-prompt">{{ variable.prompt || '（空）' }}</div>
                <div v-if="canEditVariable(variable)" class="variable-actions"><input v-model="variable.reference_key" class="inline-input reference-input" placeholder="reference_key（可选）" @input="markDirty" @click.stop="" /><button class="mini-btn" @click.stop="openVariableForm(section, variable, 'after')">后面新增</button><button class="mini-btn" @click.stop="openVariableForm(section, variable, 'before')">前面新增</button><button class="mini-btn danger" @click.stop="removeVariable(variable)">删除</button></div>
              </div>
              <div v-for="(item, pendingIndex) in pendingVariables[section.id] || []" :key="`pending-${pendingIndex}`" class="variable-card pending">
                <div class="var-top"><span class="badge orange">待新增</span><span class="var-title">{{ item.title || '未命名变量' }}</span><div class="grow" /><span class="var-index">#{{ variableDisplayNumber(section, section.variables.length + pendingIndex) }}</span></div>
                <div class="key">保存后由系统生成 key</div>
                <div class="var-label">value · 要生成的内容</div><div class="var-value">{{ item.value || '（空）' }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="pane assistant-pane">
        <div class="pane-head"><h2>模板 AI 助手</h2></div>
        <div ref="chatPane" class="scroll chat-scroll">
          <div class="bubble system welcome">
            <div class="welcome-title">我可以帮你改这份模板，直接用中文说要求就行。</div>
            <div class="welcome-group">
              <div class="welcome-label">怎么告诉我改哪里</div>
              <ul>
                <li><b>划选</b>：在左侧用鼠标选中一段文字，我只改这一段，其他内容不动</li>
                <li><b>点选</b>：点一下章节或变量，再说“这个章节”“当前变量”</li>
                <li><b>直接说</b>：也可以直接写名字，比如“（二）工作开展的步骤方法”</li>
              </ul>
            </div>
            <div class="welcome-group">
              <div class="welcome-label">能改什么</div>
              <ul>
                <li>改写正文措辞，统一年份、单位、金额口径</li>
                <li>把文字整理成表格，或给表格加减行列</li>
                <li>调整变量的 prompt，约束 AI 写报告时的取数和口径</li>
                <li>增删章节和变量，指定插在谁的前面或后面</li>
                <li>改章节和变量的标题，序号会自动顺延</li>
              </ul>
            </div>
            <div class="welcome-group">
              <div class="welcome-label">照着说就行</div>
              <ul class="welcome-examples">
                <li>把这段改成表格，表头是项目名称、总预算、执行金额、执行率</li>
                <li>在（二）工作开展的步骤方法后面加一节（三）监控重点，写监控范围和责任分工</li>
                <li>这个变量的 prompt 加一条：数据必须来自知识库，缺失就写“暂无数据”，不许编造</li>
                <li>把“（五）预算执行总结2”改名为“项目预算总结”</li>
                <li>删掉“一、部门（单位）总体情况”整章</li>
              </ul>
            </div>
            <div class="welcome-foot">改动不会直接生效：我先给出预览，你确认后点“应用到草稿”，最后点“保存模板”才写入数据库。</div>
          </div>
          <template v-for="message in messages" :key="message.id">
            <div class="bubble" :class="message.kind">{{ message.text }}</div>
            <div v-if="pendingPatch && pendingPatchMessageId === message.id" class="patch"><h3>修改预览{{ pendingPatch.summary ? ` · ${pendingPatch.summary}` : '' }}</h3><div v-if="pendingPatch.operations.length"><div v-for="(operation, index) in pendingPatch.operations" :key="index" class="op"><b>{{ operation.op }}</b> {{ operation.target?.key || operation.target?.section_title || operation.target?.title || '' }}</div></div><div v-else class="notice">AI 没有生成可执行修改</div><div v-if="pendingPatch.questions?.length" class="notice">需要补充：{{ pendingPatch.questions.join('；') }}</div><details><summary>查看完整 Patch JSON</summary><pre>{{ JSON.stringify(pendingPatch, null, 2) }}</pre></details><div v-if="pendingPatch.operations.length" class="patch-actions"><button class="btn primary" :disabled="applying" @click="applyPatch">{{ applying ? '应用中…' : '应用到草稿' }}</button><button class="btn" @click="rejectPatch">拒绝</button></div></div>
          </template>
        </div>
        <div class="chat-input"><div v-if="selectionText" class="selection-chip" :title="selectionText"><span class="chip-label">已选原文</span><span class="chip-count">{{ selectionText.length }} 字</span><span class="chip-tip">左侧蓝色选中处将被改写</span><button class="chip-clear" title="取消选择" @click="clearSelection">×</button></div><div class="selection-hint">{{ selectionHint }}</div><textarea v-model="message" :disabled="asking" :placeholder="asking ? 'AI 正在处理，请稍候…' : '输入修改要求，按 Enter 发送；Shift+Enter 换行'" @keydown="onMessageKeydown" /></div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onMounted, ref } from 'vue'
import { applyWorkbenchPatch, askWorkbenchAssistant, getWorkbenchTemplate, saveWorkbenchTemplate } from '../api/workbench'
import type { SplitDraft, TemplateDraft, TemplatePatch, TemplatePatchOperation, VariableDraft } from '../types/workbench'

type Message = { id: number; kind: 'user' | 'assistant' | 'system'; text: string }
// 记住 Patch 卡片属于哪条消息：卡片原本固定渲染在消息列表末尾，
// 导致卡片出现后新发的消息反而插在它上方。
const pendingPatchMessageId = ref(0)
const props = defineProps<{ templateId: string }>()
const emit = defineEmits<{ back: [] }>()
const draft = ref<TemplateDraft | null>(null)
const draftVersion = ref(1)
const selected = ref<{ key: string; splitId: string }>({ key: '', splitId: '' })
const pendingPatch = ref<TemplatePatch | null>(null)
const messages = ref<Message[]>([])
const message = ref('')
const loading = ref(false)
const asking = ref(false)
const saving = ref(false)
const applying = ref(false)
const editMode = ref(false)
const preciseMode = ref(false)
const editingSectionId = ref('')
const editingVariableKey = ref('')
const dirty = ref(false)
const status = ref('未加载模板')
const statusKind = ref('')
const loadError = ref('')
const chatPane = ref<HTMLElement | null>(null)
let messageId = 0
const sectionEditSnapshots = new Map<string, { text: string; template: string; values: Map<string, string>; ranges: Array<{ variable: VariableDraft; start: number; end: number }> }>()
const sectionEditTexts = new Map<string, string>()
const selectionText = ref('')
const pendingVariables = ref<Record<string, Array<{ title: string; value: string }>>>({})

const variableCount = computed(() => draft.value?.splits.reduce((sum, section) => sum + section.variables.length, 0) || 0)
const markdown = new MarkdownIt({ html: true, breaks: true, linkify: false })
const variableTypes = ['markdown', 'json', 'summary', 'section_summary', 'chapter_summary', 'reference_summary']
const selectedVariable = computed(() => findVariable(selected.value.key))
const selectionHint = computed(() => selectionText.value ? '已选中模板原文，AI 只会改写这一段' : selectedVariable.value ? `当前：${selectedVariable.value.variable.title || selectedVariable.value.variable.key} · ${selectedVariable.value.section.section_title}` : selected.value.splitId ? `当前章节：${draft.value?.splits.find(item => item.id === selected.value.splitId)?.section_title || '已选章节'}` : '未选择变量，AI 将参考整个模板结构')

function sectionDisplayNumber(section: SplitDraft) { return (draft.value?.splits.findIndex(item => item.id === section.id) ?? -1) + 1 }
function variableDisplayNumber(section: SplitDraft, variableIndex: number) { return `${sectionDisplayNumber(section)}.${variableIndex + 1}` }
function leaveWorkbench() { if (dirty.value && !window.confirm('当前有未保存修改，确定返回模板列表并放弃修改吗？')) return; emit('back') }
function markDirty() { dirty.value = true; setStatus('有未保存修改') }
function togglePreciseMode() { preciseMode.value = !preciseMode.value }
function canEditSection(section: SplitDraft) { return editMode.value || editingSectionId.value === section.id }
function canEditVariable(variable: VariableDraft) { return editMode.value || editingVariableKey.value === variable.key }
function finishSectionEdit() { const id = editingSectionId.value; if (id) { const section = draft.value?.splits.find(item => item.id === id); const text = sectionEditTexts.get(id); if (section && text !== undefined) commitSectionEdit(section, text); sectionEditSnapshots.delete(id); sectionEditTexts.delete(id); const rest = { ...pendingVariables.value }; delete rest[id]; pendingVariables.value = rest } editingSectionId.value = '' }
function finishVariableEdit() { editingVariableKey.value = '' }
function startSectionEdit(section: SplitDraft) {
  editingSectionId.value = section.id
  editingVariableKey.value = ''
  selectSection(section.id)
  const text = humanText(section)
  const template = templateSource(section)
  const ranges: Array<{ variable: VariableDraft; start: number; end: number }> = []
  let renderedCursor = 0
  let templateCursor = 0
  for (const match of template.matchAll(/\{\{([^}]+)\}\}/g)) {
    const staticText = template.slice(templateCursor, match.index)
    renderedCursor += staticText.length
    const variable = section.variables.find(item => item.key === match[1].trim())
    if (variable) {
      const value = variable.value || ''
      ranges.push({ variable, start: renderedCursor, end: renderedCursor + value.length })
      renderedCursor += value.length
    }
    templateCursor = (match.index || 0) + match[0].length
  }
  const finalStatic = template.slice(templateCursor)
  renderedCursor += finalStatic.length
  sectionEditSnapshots.set(section.id, { text, template, values: new Map(section.variables.map(variable => [variable.key, variable.value || ''])), ranges })
  sectionEditTexts.set(section.id, text)
  nextTick(() => { document.querySelector<HTMLInputElement>(`[data-section-title-input="${CSS.escape(section.id)}"]`)?.focus(); autoGrow(document.querySelector<HTMLTextAreaElement>(`[data-section-editor="${CSS.escape(section.id)}"]`)) })
}
function startVariableEdit(section: SplitDraft, variable: VariableDraft) { editingVariableKey.value = variable.key; editingSectionId.value = ''; selectVariable(variable.key, section.id); nextTick(() => document.querySelector<HTMLInputElement>(`[data-variable-title-input="${CSS.escape(variable.key)}"]`)?.focus()) }
function sectionTarget(section?: SplitDraft) { return section ? { split_id: section.id } : {} }
async function applyManualPatch(patch: TemplatePatch, messageText: string) { if (!draft.value) return; applying.value = true; try { const response = await applyWorkbenchPatch(draft.value.id, draft.value, patch, draftVersion.value, buildSelected()); draft.value = response.data.draft; draftVersion.value = response.data.draft_version; dirty.value = true; pushMessage(messageText, 'assistant'); if (response.data.validation.errors.length) pushMessage(`校验未通过：${response.data.validation.errors.join('；')}`, 'system') } catch (error: any) { pushMessage(`操作失败：${error?.response?.data?.detail || error?.message || '操作失败'}`, 'system') } finally { applying.value = false } }
function openSectionForm(_editing?: SplitDraft, afterSection?: SplitDraft) { const title = window.prompt(afterSection ? `在“${afterSection.section_title || '未命名章节'}”下方新增章节，输入章节标题：` : '输入新章节标题：'); if (!title?.trim()) return; const content = window.prompt('输入章节模板原文（可留空）：', '') || ''; void applyManualPatch({ schema_version: '1.0', summary: `新增章节：${title.trim()}`, operations: [{ op: 'add_section', target: sectionTarget(afterSection), section: { title: title.trim(), content }, position: afterSection ? 'after' : null }] }, `已新增章节“${title.trim()}”，当前仅修改草稿。`) }
function removeSection(section: SplitDraft) { if (!window.confirm(`确定删除章节“${section.section_title || '未命名章节'}”及其 ${section.variables.length} 个变量吗？`)) return; void applyManualPatch({ schema_version: '1.0', summary: `删除章节：${section.section_title}`, operations: [{ op: 'delete_section', target: sectionTarget(section) }] }, `已删除章节“${section.section_title || '未命名章节'}”，当前仅修改草稿。`) }
function openVariableForm(section: SplitDraft, variable?: VariableDraft, position?: 'before' | 'after') { const title = window.prompt(variable ? '变量标题：' : '新变量标题：', variable?.title || ''); if (title === null || !title.trim()) return; const value = window.prompt('value（要生成的内容）：', variable?.value || '') || ''; const promptText = window.prompt('prompt（生成约束）：', variable?.prompt || '') || ''; if (variable) { if (!position) { variable.title = title.trim(); variable.value = value; variable.prompt = promptText; markDirty(); return } const anchor = variable.key; const target: Record<string, unknown> = { split_id: section.id, ...(position === 'after' ? { after_key: anchor } : { before_key: anchor }) }; void applyManualPatch({ schema_version: '1.0', summary: `新增变量：${title.trim()}`, operations: [{ op: 'add_variable', target, variable: { title: title.trim(), value, prompt: promptText, type: 'markdown' } }] }, `已在变量“${variable.title || variable.key}”${position === 'after' ? '后面' : '前面'}新增变量，当前仅修改草稿。`); return } void applyManualPatch({ schema_version: '1.0', summary: `新增变量：${title.trim()}`, operations: [{ op: 'add_variable', target: { split_id: section.id }, variable: { title: title.trim(), value, prompt: promptText, type: 'markdown' } }] }, `已在章节“${section.section_title || '未命名章节'}”新增变量，当前仅修改草稿。`) }
function removeVariable(variable: VariableDraft) { if (!window.confirm(`确定删除变量“${variable.title || variable.key}”吗？`)) return; void applyManualPatch({ schema_version: '1.0', summary: `删除变量：${variable.title || variable.key}`, operations: [{ op: 'delete_variable', target: { key: variable.key } }] }, `已删除变量“${variable.title || variable.key}”，当前仅修改草稿。`) }
function findVariable(key: string) {
  if (!draft.value || !key) return null
  for (const section of draft.value.splits) { const variable = section.variables.find(item => item.key === key); if (variable) return { variable, section } }
  return null
}
function setStatus(text: string, kind = '') { status.value = text; statusKind.value = kind }
function templateSource(section: SplitDraft) {
  const content = section.content || ''
  const display = section.display_content || ''
  const hasKey = (text: string) => /\{\{[^}]+\}\}/.test(text)
  if (hasKey(content)) return content
  if (hasKey(display)) return display
  return content || display
}
function humanText(section: SplitDraft) { let text = templateSource(section); const values = new Map(section.variables.map(variable => [variable.key, variable.value || ''])); text = text.replace(/\{\{([^}]+)\}\}/g, (_, key) => values.get(key.trim()) || `{{${key}}}`); if (!text.trim()) text = section.variables.map(variable => variable.value).filter(Boolean).join('\n\n'); return text }
function renderText(text: string) {
  const placeholders: string[] = []
  const protectedText = text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const token = `PROMA_VARIABLE_${placeholders.length}_TOKEN`
    placeholders.push(key.trim())
    return token
  })
  const rendered = markdown.render(protectedText)
  const doc = new DOMParser().parseFromString(`<div>${rendered}</div>`, 'text/html')
  const allowedTags = new Set(['DIV', 'P', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'EM', 'B', 'I', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'SPAN'])
  const clean = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement
        if (!allowedTags.has(element.tagName)) {
          child.replaceWith(...Array.from(child.childNodes))
          continue
        }
        for (const attribute of Array.from(element.attributes)) {
          if (!['colspan', 'rowspan', 'class'].includes(attribute.name.toLowerCase())) element.removeAttribute(attribute.name)
        }
        clean(element)
      }
    }
  }
  const root = doc.body.firstElementChild as HTMLElement
  clean(root)
  let html = root.innerHTML
  html = html.replace(/PROMA_VARIABLE_(\d+)_TOKEN/g, (_, index) => `<span class="template-key muted-key" data-key="${placeholders[Number(index)]}">{{变量}}</span>`)
  return html
}
function commitSectionEdit(section: SplitDraft, text: string) {
  const snapshot = sectionEditSnapshots.get(section.id)
  if (!snapshot) return
  const template = snapshot.template
  const matches = [...template.matchAll(/\{\{([^}]+)\}\}/g)]
  const placeholderInContent = /\{\{[^}]+\}\}/.test(section.content || '')
  if (!matches.length) {
    if (placeholderInContent) section.content = text
    section.display_content = text
    markDirty()
    return
  }

  const { keys, staticParts, parsed, missing } = parseSectionText(template, text)

  const operations: TemplatePatchOperation[] = []
  let survivingTemplate = ''
  let lastKey = ''
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (missing.includes(key)) { operations.push({ op: 'delete_variable', target: { key } }); continue }
    survivingTemplate += `${staticParts[index]}{{${key}}}`
    lastKey = key
    const value = parsed.get(key) ?? ''
    // 与进入编辑时的快照比较：输入过程中本地 value 已被改动，不能与当前值比较。
    if ((snapshot.values.get(key) ?? '') !== value) {
      const variable = section.variables.find(item => item.key === key)
      if (variable) variable.value = value
      operations.push({ op: 'update_variable', target: { key }, changes: { value } })
    }
  }
  survivingTemplate += staticParts[staticParts.length - 1]

  // 末尾新增的 "## 标题 + 正文" 块视为新增变量，key 与 chapter_index 仍由后端生成。
  if (lastKey) {
    const trailing = parsed.get(keys[keys.length - 1]) ?? ''
    const extraBlocks = extraVariableBlocks(trailing)
    if (extraBlocks.length) {
      const head = trailing.slice(0, extraBlocks[0].index).trim()
      const lastVariable = section.variables.find(item => item.key === keys[keys.length - 1])
      if (lastVariable) lastVariable.value = head
      operations.push({ op: 'update_variable', target: { key: keys[keys.length - 1] }, changes: { value: head } })
      for (const block of extraBlocks) {
        operations.push({ op: 'add_variable', target: { split_id: section.id, after_key: lastKey }, variable: { title: block[1].trim(), value: block[2].trim(), prompt: '', type: 'markdown' } })
      }
    }
  }

  if (placeholderInContent) section.content = survivingTemplate
  else section.display_content = survivingTemplate
  operations.unshift({ op: 'update_section', target: { split_id: section.id }, changes: { section_title: section.section_title, ...(placeholderInContent ? { content: survivingTemplate } : { display_content: survivingTemplate }) } })
  void applyManualPatch({ schema_version: '1.0', summary: `同步章节：${section.section_title || '未命名章节'}`, operations }, `已同步章节“${section.section_title || '未命名章节'}”及其 ${operations.length - 1} 处变量修改，当前仅修改草稿。`)
}

function parseSectionText(template: string, text: string) {
  const matches = [...template.matchAll(/\{\{([^}]+)\}\}/g)]
  const keys = matches.map(match => match[1].trim())
  const staticParts: string[] = []
  let templateCursor = 0
  for (const match of matches) {
    staticParts.push(template.slice(templateCursor, match.index))
    templateCursor = (match.index || 0) + match[0].length
  }
  staticParts.push(template.slice(templateCursor))

  const parsed = new Map<string, string>()
  const missing: string[] = []
  let cursor = 0
  const firstStatic = staticParts[0]
  if (firstStatic) {
    const index = text.indexOf(firstStatic)
    cursor = index < 0 ? 0 : index + firstStatic.length
  }
  for (let index = 0; index < keys.length; index += 1) {
    const nextStatic = staticParts[index + 1]
    if (!nextStatic) { parsed.set(keys[index], text.slice(cursor).trim()); cursor = text.length; continue }
    const nextIndex = text.indexOf(nextStatic, cursor)
    if (nextIndex < 0) { missing.push(keys[index]); continue }
    parsed.set(keys[index], text.slice(cursor, nextIndex).trim())
    cursor = nextIndex + nextStatic.length
  }
  return { keys, staticParts, parsed, missing }
}

function extraVariableBlocks(text: string) {
  return [...text.matchAll(new RegExp(String.raw`(?:^|
)##\s+(.+)
([\s\S]*?)(?=
##\s+|$)`, 'g'))]
}

function syncSectionDraftToVariables(section: SplitDraft, renderedText: string) {
  const snapshot = sectionEditSnapshots.get(section.id)
  if (!snapshot) return
  sectionEditTexts.set(section.id, renderedText)
  const { keys, parsed } = parseSectionText(snapshot.template, renderedText)
  let pending: Array<{ title: string; value: string }> = []
  if (!keys.length) { section.display_content = renderedText; pendingVariables.value = { ...pendingVariables.value, [section.id]: pending }; return }

  // 实时把每个 key 解析到的内容写回变量，避免只有第一个变量能同步显示。
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    const variable = section.variables.find(item => item.key === key)
    if (!variable) continue
    let value = parsed.get(key)
    if (value === undefined) continue
    if (index === keys.length - 1) {
      // 末尾正在输入的新增块先不并入最后一个变量，等“完成”时再拆成新的 key。
      const blocks = extraVariableBlocks(value)
      if (blocks.length) {
        pending = blocks.map(block => ({ title: block[1].trim(), value: block[2].trim() }))
        value = value.slice(0, blocks[0].index).trim()
      }
    }
    variable.value = value
  }
  // 编辑中就把新增块展示为“待新增变量”，点击完成后才真正创建 key。
  pendingVariables.value = { ...pendingVariables.value, [section.id]: pending }
}

function sectionEditText(section: SplitDraft) { return sectionEditTexts.get(section.id) ?? humanText(section) }
function autoGrow(el: HTMLTextAreaElement | null) { if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` }
function updateSectionContent(section: SplitDraft, event: Event) { const el = event.target as HTMLTextAreaElement; const value = el.value; sectionEditTexts.set(section.id, value); syncSectionDraftToVariables(section, value); autoGrow(el); markDirty() }
function selectSection(splitId: string) { selected.value = { key: '', splitId }; scrollVariableSection(splitId) }
function selectVariable(key: string, splitId: string) { selected.value = { key, splitId } }
function onTemplateClick(event: MouseEvent, splitId: string) { const target = event.target as HTMLElement; const key = target.closest<HTMLElement>('[data-key]')?.dataset.key; key ? selectVariable(key, splitId) : selectSection(splitId) }
function scrollVariableSection(splitId: string) { nextTick(() => document.querySelector(`[data-section-id="${CSS.escape(splitId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })) }
function typeClass(type: string) { return ['summary', 'section_summary', 'chapter_summary', 'reference_summary'].includes(type) ? 'orange' : type === 'markdown' ? 'green' : 'blue' }
function pushMessage(text: string, kind: Message['kind']) { messages.value.push({ id: ++messageId, kind, text }); nextTick(scrollChat) }
function scrollChat() { if (chatPane.value) chatPane.value.scrollTop = chatPane.value.scrollHeight }
function onMessageKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); ask() } }
const HIGHLIGHT_NAME = 'proma-template-selection'
function paintSelectionHighlight(range: Range | null) {
  // 用 CSS Custom Highlight API 常驻高亮：不改动 DOM，焦点移到输入框后依然可见。
  const registry = (CSS as any)?.highlights
  const HighlightCtor = (window as any).Highlight
  if (!registry || !HighlightCtor) return
  if (!range) { registry.delete(HIGHLIGHT_NAME); return }
  registry.set(HIGHLIGHT_NAME, new HighlightCtor(range))
}
function captureSelection() {
  const selection = window.getSelection()
  const text = selection?.toString() || ''
  if (!text.trim()) return
  // 只接受落在模板预览区内的划选，避免把聊天记录或变量面板的文字当成目标。
  const node = selection?.anchorNode
  const host = (node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement)
  if (!host?.closest('.template-scroll')) return
  selectionText.value = text.trim()
  if (selection?.rangeCount) paintSelectionHighlight(selection.getRangeAt(0).cloneRange())
  const splitId = host.closest<HTMLElement>('.section')?.dataset.splitId
  if (splitId && splitId !== selected.value.splitId) selectSection(splitId)
  setStatus('已选中原文，可在右侧直接说明要改成什么')
}
function clearSelection() { selectionText.value = ''; paintSelectionHighlight(null); setStatus('已取消原文选择') }
function buildSelected(): Record<string, unknown> { const result: Record<string, unknown> = { split_id: selected.value.splitId, key: selected.value.key }; const found = selectedVariable.value; if (found) result.variable = found.variable; if (selectionText.value) result.selection_text = selectionText.value; return result }
async function load() { loading.value = true; loadError.value = ''; setStatus('读取中…'); try { const response = await getWorkbenchTemplate(props.templateId); const payload = response.data; draft.value = payload.template; draftVersion.value = payload.draft_version || 1; setStatus(`已加载 · ${draft.value.name || draft.value.id}`, 'ok') } catch (error: any) { loadError.value = error?.response?.data?.detail || error?.message || '读取模板失败'; setStatus('读取失败', 'err') } finally { loading.value = false } }
async function ask() { const text = message.value.trim(); if (!text || !draft.value || loading.value || asking.value) return; pushMessage(text, 'user'); message.value = ''; asking.value = true; setStatus('AI 正在分析修改要求…'); pushMessage('AI 正在分析模板结构和修改要求', 'assistant'); try { const response = await askWorkbenchAssistant({ template_id: draft.value.id, message: text, draft: draft.value, selected: buildSelected() }); const result = response.data; pendingPatch.value = result.patch; pendingPatchMessageId.value = messages.value[messages.value.length - 1].id; messages.value[messages.value.length - 1].text = result.message || result.patch.summary || '已生成修改建议'; setStatus('AI 修改建议已生成', 'ok') } catch (error: any) { messages.value[messages.value.length - 1].kind = 'system'; messages.value[messages.value.length - 1].text = `处理失败：${error?.response?.data?.detail || error?.message || '请求失败'}`; setStatus('AI 处理失败', 'err') } finally { asking.value = false; nextTick(scrollChat) } }
async function applyPatch() { if (!draft.value || !pendingPatch.value) return; applying.value = true; try { const response = await applyWorkbenchPatch(draft.value.id, draft.value, pendingPatch.value, draftVersion.value, buildSelected()); draft.value = response.data.draft; draftVersion.value = response.data.draft_version; pendingPatch.value = null; pendingPatchMessageId.value = 0; selectionText.value = ''; paintSelectionHighlight(null); pushMessage('修改已应用到当前草稿，尚未写入数据库。请检查后点击“保存模板”。', 'assistant'); if (response.data.validation.errors.length) pushMessage(`校验未通过：${response.data.validation.errors.join('；')}`, 'system') } catch (error: any) { pushMessage(`应用失败：${error?.response?.data?.detail || error?.message || '应用失败'}`, 'system') } finally { applying.value = false } }
function rejectPatch() { pendingPatch.value = null; pendingPatchMessageId.value = 0; selectionText.value = ''; paintSelectionHighlight(null) }
function save() { if (dirty.value) void persistSave(); else void persistSave() }
// 每次保存都派生一个新模板，底版不被修改，所以先让用户给新模板命名。
async function persistSave() { if (!draft.value) return; const inputName = window.prompt('保存为新模板，请输入模板名称：', `${draft.value.name} 副本`); if (inputName === null) return; const newName = inputName.trim(); if (!newName) { pushMessage('模板名不能为空，已取消保存。', 'system'); return } saving.value = true; setStatus('保存中…'); try { const response = await saveWorkbenchTemplate(draft.value.id, draft.value, draftVersion.value, newName); if (!response.data.saved) { pushMessage(`保存前校验未通过：${response.data.validation.errors.join('；')}`, 'system'); setStatus('校验未通过', 'err') } else { dirty.value = false; pushMessage(`已另存为新模板“${response.data.template_name || newName}”，原模板未被修改。返回列表可看到它。`, 'assistant'); setStatus('已另存为新模板', 'ok') } } catch (error: any) { pushMessage(`保存失败：${error?.response?.data?.detail || error?.message || '保存失败'}`, 'system'); setStatus('保存失败', 'err') } finally { saving.value = false } }
onMounted(load)
</script>

<style scoped>
:global(::highlight(proma-template-selection)){background:#0078d7;background:Highlight;color:#fff;color:HighlightText}
:global(body){margin:0;background:#f5f7fb;color:#202532;font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.workbench-page{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}.topbar{height:62px;display:flex;align-items:center;gap:14px;padding:0 22px;background:#fff;border-bottom:1px solid #e5e9f0;flex-shrink:0}.brand{font-size:17px;font-weight:700}.brand i{display:inline-block;width:9px;height:9px;background:#3867ef;border-radius:3px;margin-right:8px}.crumb,.status,.pane-head small,.selection-hint,.block-label,.var-label{color:#7c8494;font-size:11px}.grow{flex:1}.btn{border:1px solid #e5e9f0;background:#fff;color:#4f5868;border-radius:7px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}.btn:hover{border-color:#b9c5e2;color:#3867ef}.btn.primary{background:#3867ef;border-color:#3867ef;color:#fff}.btn:disabled{opacity:.45;cursor:not-allowed}.status.ok{color:#159765}.status.err,.error{color:#d84a54}.workspace{flex:1;min-height:0;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:12px;padding:12px}.workspace.precise-mode{grid-template-columns:minmax(0,1fr) minmax(360px,1fr)}.pane{min-width:0;min-height:0;background:#fff;border:1px solid #e5e9f0;border-radius:10px;box-shadow:0 8px 30px rgba(34,48,80,.07);display:flex;flex-direction:column;overflow:hidden}.pane-head{min-height:58px;padding:12px 16px;border-bottom:1px solid #e5e9f0;display:flex;align-items:center;gap:9px;flex-shrink:0}.pane-head h2{margin:0;font-size:14px}.scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:14px;overscroll-behavior:contain}.template-scroll,.variable-scroll{scrollbar-gutter:stable}.variable-pane{min-width:0}.assistant-pane{min-height:0}.assistant-pane .chat-scroll{flex:1;min-height:0;overflow-y:auto}.toggle{font-size:11px;color:#7c8494}.inline-input,.type-select{border:1px solid #dfe4ee;border-radius:5px;padding:4px 7px;font:inherit;font-size:12px;outline:none;background:#fff;min-width:0}.inline-input:focus,.type-select:focus,.section-editor:focus,.variable-editor:focus{border-color:#9bb0fa;box-shadow:0 0 0 3px #edf2ff}.section-input{width:min(52%,360px);font-size:15px;font-weight:700}.var-title-input{flex:1}.type-select{max-width:130px}.reference-input{flex:1;min-width:120px}.section-actions,.variable-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-left:6px}.mini-btn{border:1px solid #dfe4ee;background:#fff;color:#3867ef;border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;white-space:nowrap}.mini-btn:hover{border-color:#9bb0fa;background:#edf2ff}.mini-btn.danger{color:#d84a54}.precision-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #c8d5ff;background:linear-gradient(135deg,#f4f7ff,#edf2ff);color:#3867ef;border-radius:7px;padding:5px 10px;font:600 11px/1.4 inherit;cursor:pointer;box-shadow:0 2px 5px rgba(56,103,239,.08);transition:all .18s ease}.precision-btn:hover{border-color:#8da6fa;background:linear-gradient(135deg,#edf2ff,#e4ebff);box-shadow:0 4px 10px rgba(56,103,239,.16);transform:translateY(-1px)}.precision-btn.active{border-color:#3867ef;background:linear-gradient(135deg,#3867ef,#5d7ff2);color:#fff;box-shadow:0 4px 12px rgba(56,103,239,.24)}.precision-icon{font-size:14px;line-height:1}.mini-btn:hover{border-color:#9bb0fa;background:#edf2ff}.mini-btn.danger{color:#d84a54}.section-editor,.variable-editor{width:100%;min-height:110px;overflow:hidden;resize:vertical;display:block;border:1px solid #dfe4ee;border-radius:7px;padding:9px 10px;font:inherit;font-size:12px;line-height:1.6;outline:none;background:#fbfcfe}.section-editor{min-height:320px;resize:vertical;overflow-y:auto}.prompt-editor{min-height:76px}.variable-actions{margin-top:9px}.section-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.section-title .badge{flex-shrink:0}.empty{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:#7c8494;padding:30px}.section{margin-bottom:18px;cursor:pointer}.section-title{font-size:15px;font-weight:700;padding:8px 10px;margin-bottom:8px;background:#f8f9fc;border-left:3px solid #3867ef;border-radius:0 5px 5px 0}.section.selected-block .section-title{background:#eef3ff}.template-block{padding:8px 5px;border-radius:6px}.section.selected-block .template-block{background:#eef3ff;box-shadow:inset 3px 0 #3867ef}.block-text{white-space:normal;word-break:break-word}.block-text :deep(p){margin:0 0 10px}.block-text :deep(table){width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;background:#fff}.block-text :deep(th),.block-text :deep(td){border:1px solid #cfd6e4;padding:7px 8px;text-align:left;vertical-align:top;word-break:break-word}.block-text :deep(th){background:#f1f4fa;color:#303b52;font-weight:700}.block-text :deep(tr:nth-child(even) td){background:#fafbfe}.block-text :deep(ul),.block-text :deep(ol){padding-left:22px}.block-text :deep(h1),.block-text :deep(h2),.block-text :deep(h3),.block-text :deep(h4){margin:12px 0 6px}.block-text :deep(hr){border:0;border-top:1px solid #e5e9f0;margin:12px 0}.template-key{color:#3867ef;background:#edf2ff;border-radius:3px;padding:0 2px;cursor:pointer;font-family:ui-monospace,Consolas,monospace}.muted-key{color:#3867ef}.badge{display:inline-flex;align-items:center;border-radius:99px;padding:2px 7px;font-size:10px;line-height:1.5;white-space:nowrap;background:#f0f2f6;color:#626b7a}.badge.blue{background:#edf2ff;color:#3867ef}.badge.green{background:#e8f7f0;color:#159765}.badge.orange{background:#fff3df;color:#c77713}.split-card{border:1px solid #e5e9f0;border-radius:8px;margin-bottom:10px;overflow:hidden}.split-card.selected{border-color:#9bb0fa;box-shadow:0 0 0 2px #edf2ff}.split-head{display:flex;align-items:center;gap:8px;padding:10px 11px;background:#fbfcfe;cursor:pointer}.split-index{width:25px;height:25px;display:flex;align-items:center;justify-content:center;background:#edf2ff;color:#3867ef;border-radius:6px;font:12px ui-monospace,Consolas,monospace;flex-shrink:0}.split-name,.var-title{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.split-body{padding:9px 10px;background:#fff}.variable-card{border:1px solid #e5e9f0;border-radius:7px;margin-bottom:7px;padding:10px;cursor:pointer}.variable-card:last-child{margin-bottom:0}.variable-card.pending{border-style:dashed;border-color:#e8c88a;background:#fffdf7}.variable-card.selected{border-color:#9bb0fa;background:#fbfcff;box-shadow:0 0 0 2px #edf2ff}.var-top{display:flex;align-items:center;gap:7px;margin-bottom:6px}.key{font:11px ui-monospace,Consolas,monospace;color:#8b93a2}.var-label{font-weight:600;margin:7px 0 3px}.var-value,.var-prompt{white-space:pre-wrap;word-break:break-word;max-height:125px;overflow:auto;background:#fafbfc;border:1px solid #e5e9f0;border-radius:5px;padding:7px 8px;font-size:12px}.var-prompt{max-height:88px;color:#4d5665}.chat-scroll{padding:18px 16px 14px;display:flex;flex-direction:column;gap:12px;background:#f7f8fb}.bubble{max-width:88%;padding:10px 13px;border-radius:12px;font-size:13px;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 2px rgba(31,44,73,.04)}.bubble.user{align-self:flex-end;background:#3867ef;color:#fff;border-bottom-right-radius:4px}.bubble.assistant{align-self:flex-start;background:#fff;color:#394252;border:1px solid #e7eaf1;border-bottom-left-radius:4px}.bubble.system{align-self:flex-start;background:#fff8ea;color:#8c5b18;font-size:12px;border:1px solid #f2dfb8}.bubble.welcome{max-width:100%;white-space:normal;background:#fff;color:#4f5868;border-color:#e7eaf1}.welcome-title{font-size:13px;font-weight:700;color:#202532;margin-bottom:9px}.welcome-group{margin-bottom:9px}.welcome-label{font-size:10px;font-weight:700;color:#3867ef;background:#edf2ff;border-radius:99px;display:inline-block;padding:1px 8px;margin-bottom:4px}.bubble.welcome ul{margin:0;padding-left:18px}.bubble.welcome li{margin:2px 0;line-height:1.6}.welcome-examples li{color:#394252}.bubble.welcome li b{color:#3867ef;font-weight:700}.welcome-foot{margin-top:10px;padding-top:8px;border-top:1px dashed #e7eaf1;font-size:11px;color:#7c8494;line-height:1.6}.chat-input{padding:12px 14px 14px;border-top:1px solid #e5e9f0;background:#fff;flex:0 0 auto;position:relative;z-index:2}.selection-hint{margin:0 0 8px}.selection-chip{display:flex;align-items:center;gap:7px;margin:0 0 8px;padding:7px 9px;border:1px solid #c8d5ff;background:#f4f7ff;border-radius:8px}.chip-label{flex:0 0 auto;font-size:10px;font-weight:700;color:#3867ef;padding:1px 6px;background:#e4ebff;border-radius:99px;line-height:1.6}.chip-count{flex:0 0 auto;font-size:11px;font-weight:600;color:#3867ef}.chip-tip{flex:1;min-width:0;font-size:11px;color:#7c8494;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chip-clear{flex:0 0 auto;border:0;background:transparent;color:#7c8494;font-size:15px;line-height:1;cursor:pointer;padding:0 2px}.chip-clear:hover{color:#d84a54}.chat-input textarea{width:100%;height:82px;resize:vertical;display:block;border:1px solid #dfe4ee;border-radius:10px;padding:10px 12px;font:inherit;font-size:13px;line-height:1.6;outline:none;background:#fbfcfe}.chat-input textarea:disabled{background:#f4f6fa;color:#9aa2b1;cursor:not-allowed}.chat-input textarea:focus{border-color:#9bb0fa;box-shadow:0 0 0 3px #edf2ff;background:#fff}.patch{width:100%;border:1px solid #dfe5f2;background:#fff;border-radius:12px;padding:13px;box-shadow:0 5px 16px rgba(42,58,96,.06)}.patch h3{font-size:12px;margin:0 0 9px;color:#3154c2}.op{padding:8px 10px;border-radius:7px;background:#f7f8fb;border:1px solid #e8ebf2;margin:6px 0;font-size:12px}.op b{color:#3867ef;font-family:ui-monospace,Consolas,monospace;font-size:11px}.patch pre{white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;background:#202633;color:#e9edf6;border-radius:7px;padding:9px;font:11px/1.5 ui-monospace,Consolas,monospace}.patch-actions{display:flex;gap:8px;margin-top:11px}.patch-actions .btn{flex:1}.notice{padding:9px 11px;background:#f7f8fb;border-radius:6px;color:#7c8494;font-size:11px;margin-top:7px}@media(max-width:1050px){.workspace{grid-template-columns:1fr}.workspace.precise-mode{grid-template-columns:1fr}.assistant-pane,.variable-pane{height:480px}}@media(max-width:700px){.topbar{padding:0 12px}.crumb,.topbar .status{display:none}.workspace{display:flex;flex-direction:column;overflow:auto}.pane{height:520px;flex-shrink:0}.assistant-pane{height:650px}}
</style>
