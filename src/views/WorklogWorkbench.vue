<template>
  <div class="worklog-page">
    <header class="topbar">
      <div class="brand"><i />{{ view?.template_name || '工作记录表模板' }}</div>
      <div class="crumb">工作记录表 · 版式还原与 AI 辅助修改</div>
      <div class="grow" />
      <span v-if="dirty" class="badge orange">有未保存修改</span>
      <span class="status" :class="statusKind">{{ status }}</span>
      <button class="btn" @click="leave">返回模板列表</button>
      <button class="btn primary" :disabled="saving || !dirty" @click="persistSave">
        {{ saving ? '保存中…' : '保存模板' }}
      </button>
    </header>

    <div v-if="loading" class="state-box">读取模板中…</div>
    <div v-else-if="error" class="state-box error">{{ error }}</div>

    <main v-else-if="view" class="workspace" :class="{ 'precise-mode': preciseMode }">
      <!-- 左：版式还原预览 -->
      <section class="pane">
        <div class="pane-head">
          <div class="head-text">
            <h3>模板预览</h3>
            <small>{{ layoutSubtitle }}</small>
          </div>
          <div class="head-actions">
            <button class="btn" :disabled="uploadingLayout" @click="pickLayoutFile">
              {{ uploadingLayout ? '上传中…' : '更新版式源' }}
            </button>
            <input
              ref="layoutInput"
              type="file"
              accept=".docx"
              class="hidden-file"
              @change="uploadLayout"
            />
            <button class="precision-btn" :class="{ active: preciseMode }" @click="preciseMode = !preciseMode">
              <span class="precision-icon">◎</span>
              {{ preciseMode ? '返回 AI 助手' : '精准编辑' }}
            </button>
          </div>
        </div>

        <div class="pane-body scroll" @mouseup="captureSelection">
          <div v-if="view.layout_error" class="tip warn">
            版式还原失败，已退回按章节展示：{{ view.layout_error }}
          </div>
          <div v-else-if="!layoutHasTable" class="tip warn">
            没能还原出原始表格版式。当前用于还原的 Word 是由 Markdown 反向生成的，表格结构已经丢失。
            请用右上角“更新版式源”上传原始 Word。
          </div>
          <div v-else-if="!layoutHasKeys" class="tip">
            已按原始 Word 还原版式。这份 Word 里是手写的空括号，尚未替换成
            <code>{{ keyPlaceholderSample }}</code> 占位符，因此暂时无法点选联动。
          </div>

          <div v-if="extraSections.length" class="tip warn">
            本次新增的 {{ extraSections.length }} 个章节（{{ extraSectionTitles }}）在原始 Word 版式里
            还没有对应占位符，已附在版式末尾展示。要让它们回到正确位置，
            请在原始 Word 里插入占位符后用右上角“更新版式源”重新上传。
          </div>

          <div v-if="aliasedKeys.length" class="tip">
            有 {{ aliasedKeys.length }} 个占位符在版式与模板数据里写法不同，已按等价命名自动匹配
            （{{ aliasedKeys.join('、') }}）。内容能正常显示，但建议尽快统一命名，
            否则导出 Word 时可能对不上。
          </div>

          <div v-if="keyMismatchCount" class="tip">
            有 {{ keyMismatchCount }} 个占位符在原始 Word 里存在、但模板数据里没有同名变量，
            这些位置会显示“待填写”。常见原因是命名不一致（如
            <code>key_3_1</code> 与 <code>key_3_1_md</code>）。
            <button class="link-btn" @click="showKeyMismatch = !showKeyMismatch">
              {{ showKeyMismatch ? '收起' : '查看详情' }}
            </button>
            <div v-if="showKeyMismatch" class="mismatch-detail">
              <div v-if="unmatchedLayoutKeys.length">
                <b>Word 有、数据库无：</b>{{ unmatchedLayoutKeys.join('、') }}
              </div>
              <div v-if="unmatchedDbKeys.length">
                <b>数据库有、Word 无：</b>{{ unmatchedDbKeys.join('、') }}
              </div>
            </div>
          </div>

          <div
            v-if="layoutHasTable"
            class="layout-host"
            v-html="view.layout_html"
            @click="onLayoutClick"
          />

          <div v-else class="fallback">
            <article v-for="section in view.sections" :key="String(section.index)" class="fb-section">
              <h4>{{ section.section_title }}</h4>
              <div
                v-for="variable in section.variables"
                :key="variable.key"
                class="fb-var"
                :class="{ active: activeKey === variable.key }"
                @click="selectKey(variable.key)"
              >
                <div class="fb-var-head">{{ variable.title || variable.key }}</div>
                <div class="fb-var-body" v-html="renderMarkdown(variable.value)" />
              </div>
              <p v-if="!section.variables.length" class="fb-empty">该章节暂无变量</p>
            </article>
          </div>
        </div>
      </section>

      <!-- 右：精准编辑（变量内容） -->
      <aside v-if="preciseMode" class="pane">
        <div class="pane-head">
          <div class="head-text">
            <h3>变量内容</h3>
            <small>共 {{ view.variables.length }} 个变量</small>
          </div>
        </div>
        <div class="pane-body scroll">
          <p v-if="!view.variables.length" class="tip">这份模板还没有变量。</p>
          <div
            v-for="variable in view.variables"
            :id="`wl-var-${variable.key}`"
            :key="variable.key"
            class="var-card"
            :class="{ active: activeKey === variable.key }"
            @click="selectKey(variable.key)"
          >
            <div class="var-head">
              <span class="var-title">{{ variable.title || '(未命名)' }}</span>
              <code class="var-key">{{ variable.key }}</code>
            </div>
            <div class="var-meta">
              <span class="chip">{{ variable.type }}</span>
              <span v-if="variable.section_title" class="var-section">{{ variable.section_title }}</span>
            </div>
            <div class="var-block">
              <span class="var-label">内容结构</span>
              <div class="var-value" v-html="renderMarkdown(variable.value)" />
            </div>
            <div class="var-block">
              <span class="var-label">取数提示词</span>
              <p class="var-prompt" :class="{ empty: !variable.prompt }">{{ variable.prompt || '未填写' }}</p>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右：模板 AI 助手 -->
      <aside v-else class="pane assistant-pane">
        <div class="pane-head">
          <div class="head-text">
            <h3>模板 AI 助手</h3>
            <small>用中文描述要改什么</small>
          </div>
        </div>

        <div ref="chatPane" class="pane-body scroll chat-scroll">
          <div class="bubble system welcome">
            <div class="welcome-title">我可以帮你改这份工作记录表，直接用中文说要求就行。</div>
            <div class="welcome-group">
              <div class="welcome-label">怎么告诉我改哪里</div>
              <ul>
                <li><b>划选</b>：在左侧表格里选中一段文字，我只改这一段</li>
                <li><b>点选</b>：点一下变量，再说“当前变量”</li>
                <li><b>直接说</b>：也可以直接写名字，比如“绩效目标完成情况”</li>
              </ul>
            </div>
            <div class="welcome-group">
              <div class="welcome-label">能改什么</div>
              <ul>
                <li>改写表格里的措辞，统一年份、单位、金额口径</li>
                <li>给表格加减行列，或调整表头</li>
                <li>调整变量的取数提示词，约束写报告时的口径</li>
                <li>增删章节和变量，指定插在谁前面或后面</li>
              </ul>
            </div>
            <div class="welcome-group">
              <div class="welcome-label">照着说就行</div>
              <ul class="welcome-examples">
                <li>绩效指标表改成按实际指标数量动态生成，不要固定 12 行</li>
                <li>这个变量的提示词加一条：数据必须来自知识库，缺失就写“暂无数据”</li>
                <li>把“项目支付明细表”的科目列改成可变列</li>
              </ul>
            </div>
            <div class="welcome-foot">
              改动不会直接生效：我先给出预览，你确认后点“应用到草稿”，最后点“保存模板”才写入数据库。
            </div>
          </div>

          <template v-for="item in messages" :key="item.id">
          <div class="bubble" :class="item.kind">{{ item.text }}</div>

          <div v-if="pendingPatch && pendingPatchMessageId === item.id" class="patch">
            <h3>修改预览{{ pendingPatch.summary ? ` · ${pendingPatch.summary}` : '' }}</h3>
            <div v-if="pendingPatch.operations.length">
              <div v-for="(operation, index) in pendingPatch.operations" :key="index" class="op">
                <b>{{ operation.op }}</b>
                {{ operation.target?.key || operation.target?.section_title || operation.target?.title || '' }}
              </div>
            </div>
            <div v-else class="notice">AI 没有生成可执行修改</div>
            <div v-if="pendingPatch.questions?.length" class="notice">
              需要补充：{{ pendingPatch.questions.join('；') }}
            </div>
            <details>
              <summary>查看完整 Patch JSON</summary>
              <pre>{{ JSON.stringify(pendingPatch, null, 2) }}</pre>
            </details>
            <div v-if="pendingPatch.operations.length" class="patch-actions">
              <button class="btn primary" :disabled="applying" @click="applyPatch">
                {{ applying ? '应用中…' : '应用到草稿' }}
              </button>
              <button class="btn" @click="rejectPatch">拒绝</button>
            </div>
          </div>
          </template>
        </div>

        <div class="chat-input">
          <div v-if="selectionText" class="selection-chip" :title="selectionText">
            <span class="chip-label">已选原文</span>
            <span class="chip-count">{{ selectionText.length }} 字</span>
            <span class="chip-tip">左侧选中处将被改写</span>
            <button class="chip-clear" title="取消选择" @click="clearSelection">×</button>
          </div>
          <div class="selection-hint">{{ selectionHint }}</div>
          <textarea
            v-model="message"
            :disabled="asking"
            :placeholder="asking ? 'AI 正在处理，请稍候…' : '输入修改要求，按 Enter 发送；Shift+Enter 换行'"
            @keydown="onMessageKeydown"
          />
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import axios from 'axios'
import { getWorklogTemplate, previewWorklogTemplate } from '../api/worklog'
import { applyWorkbenchPatch, askWorkbenchAssistant, getWorkbenchTemplate, saveWorkbenchTemplate } from '../api/workbench'
import type { WorklogView } from '../types/worklog'
import type { TemplateDraft, TemplatePatch } from '../types/workbench'

const props = defineProps<{ templateId: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()

type ChatMessage = { id: number; kind: 'user' | 'assistant' | 'system'; text: string }

const md = new MarkdownIt({ html: false, breaks: true, linkify: false })
const HIGHLIGHT_NAME = 'proma-worklog-selection'

const view = ref<WorklogView | null>(null)
const draft = ref<TemplateDraft | null>(null)
const draftVersion = ref(0)

const loading = ref(false)
const error = ref('')
const status = ref('未加载模板')
const statusKind = ref<'' | 'ok' | 'err'>('')

const activeKey = ref('')
const preciseMode = ref(false)
const dirty = ref(false)

const messages = ref<ChatMessage[]>([])
const message = ref('')
const messageId = ref(0)
const pendingPatch = ref<TemplatePatch | null>(null)
// Patch 卡片绑定到产生它的那条消息，避免后续新消息插到卡片上方。
const pendingPatchMessageId = ref(0)
const asking = ref(false)
const applying = ref(false)
const saving = ref(false)
const chatPane = ref<HTMLElement | null>(null)

const selectionText = ref('')
const layoutInput = ref<HTMLInputElement | null>(null)
const uploadingLayout = ref(false)

// 直接在模板里写双大括号会被 Vue 当成插值语法
const keyPlaceholderSample = '{' + '{key}' + '}'

const layoutHasTable = computed(() => view.value?.layout_has_table !== false && Boolean(view.value?.layout_html))
const layoutHasKeys = computed(() => view.value?.layout_has_keys !== false)

/** 原始 Word 骨架里没有占位符的章节，仅附在版式末尾展示 */
const extraSections = computed(() => view.value?.layout_extra_sections ?? [])
const extraSectionTitles = computed(() =>
  extraSections.value.map((s) => s.section_title || '未命名章节').join('、'),
)

const showKeyMismatch = ref(false)
const unmatchedLayoutKeys = computed(() => view.value?.unmatched_layout_keys ?? [])
const unmatchedDbKeys = computed(() => view.value?.unmatched_db_keys ?? [])
const keyMismatchCount = computed(() => unmatchedLayoutKeys.value.length)
/** 写法不同但已自动对上的 key */
const aliasedKeys = computed(() => view.value?.aliased_keys ?? [])

const layoutSubtitle = computed(() => {
  if (!view.value) return ''
  if (!layoutHasTable.value) return '按章节顺序展示'
  return view.value.layout_is_dedicated ? '按原始 Word 版式还原' : '按模板 Word 还原'
})

const selectionHint = computed(() => {
  if (selectionText.value) return '已选中左侧原文，我只会改这一段'
  if (activeKey.value) return `当前选中变量：${activeKey.value}`
  return '可以先在左侧划选或点选，再描述修改'
})

function setStatus(text: string, kind: '' | 'ok' | 'err' = '') {
  status.value = text
  statusKind.value = kind
}

function renderMarkdown(text: string): string {
  if (!text) return '<p class="empty">（空）</p>'
  return md.render(text)
}

function pushMessage(text: string, kind: ChatMessage['kind']) {
  messages.value.push({ id: ++messageId.value, kind, text })
  nextTick(scrollChat)
}

function scrollChat() {
  if (chatPane.value) chatPane.value.scrollTop = chatPane.value.scrollHeight
}

/* ---------------- 选择与联动 ---------------- */

function onLayoutClick(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest('.wl-key') as HTMLElement | null
  if (!target) return
  const key = target.dataset.key
  if (key) selectKey(key)
}

function selectKey(key: string) {
  activeKey.value = key
  requestAnimationFrame(() => {
    document.getElementById(`wl-var-${key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

/** 用 CSS Custom Highlight 保留划选状态，聚焦输入框后仍可见 */
function paintSelectionHighlight(range: Range | null) {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  if (!registry) return
  if (!range) {
    registry.delete(HIGHLIGHT_NAME)
    return
  }
  try {
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (!HighlightCtor) return
    registry.set(HIGHLIGHT_NAME, new HighlightCtor(range.cloneRange()))
  } catch {
    registry.delete(HIGHLIGHT_NAME)
  }
}

function captureSelection() {
  const selection = window.getSelection()
  const text = selection?.toString().trim() || ''
  // 新一次划选或单击清空选区时，必须先抹掉上一次的高亮，
  // 否则两段高亮会同时停在页面上。
  if (!text || !selection || selection.rangeCount === 0) {
    clearSelection()
    return
  }
  selectionText.value = text
  paintSelectionHighlight(selection.getRangeAt(0))
}

function clearSelection() {
  selectionText.value = ''
  paintSelectionHighlight(null)
  // 仅删 Custom Highlight 不够：浏览器原生选区还在，看起来就像“取消没生效”。
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) selection.removeAllRanges()
}

function buildSelected(): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (activeKey.value) payload.key = activeKey.value
  if (selectionText.value) payload.selection_text = selectionText.value
  return payload
}

/* ---------------- AI 助手 ---------------- */

function onMessageKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  ask()
}

async function ask() {
  const text = message.value.trim()
  if (!text || !draft.value || asking.value) return
  pushMessage(text, 'user')
  message.value = ''
  asking.value = true
  setStatus('AI 正在分析修改要求…')
  pushMessage('AI 正在分析模板结构和修改要求', 'assistant')
  try {
    const response = await askWorkbenchAssistant({
      template_id: draft.value.id,
      message: text,
      draft: draft.value,
      selected: buildSelected(),
    })
    const result = response.data
    pendingPatch.value = result.patch
    pendingPatchMessageId.value = messages.value[messages.value.length - 1].id
    messages.value[messages.value.length - 1].text =
      result.message || result.patch.summary || '已生成修改建议'
    setStatus('AI 修改建议已生成', 'ok')
  } catch (e: any) {
    const last = messages.value[messages.value.length - 1]
    last.kind = 'system'
    last.text = `处理失败：${e?.response?.data?.detail || e?.message || '请求失败'}`
    setStatus('AI 处理失败', 'err')
  } finally {
    asking.value = false
    nextTick(scrollChat)
  }
}

async function applyPatch() {
  if (!draft.value || !pendingPatch.value) return
  applying.value = true
  try {
    const response = await applyWorkbenchPatch(
      draft.value.id,
      draft.value,
      pendingPatch.value,
      draftVersion.value,
      buildSelected(),
    )
    draft.value = response.data.draft
    draftVersion.value = response.data.draft_version
    pendingPatch.value = null
    pendingPatchMessageId.value = 0
    dirty.value = true
    clearSelection()
    await syncDraftToView()
    pushMessage('修改已应用到当前草稿，尚未写入数据库。请检查后点击“保存模板”。', 'assistant')
    if (response.data.validation.errors.length) {
      pushMessage(`校验未通过：${response.data.validation.errors.join('；')}`, 'system')
    }
  } catch (e: any) {
    pushMessage(`应用失败：${e?.response?.data?.detail || e?.message || '应用失败'}`, 'system')
  } finally {
    applying.value = false
  }
}

function rejectPatch() {
  pendingPatch.value = null
  pendingPatchMessageId.value = 0
  clearSelection()
  pushMessage('已放弃这次修改建议。', 'assistant')
}

async function persistSave() {
  if (!draft.value) return
  // 每次保存都派生一个新模板，底版不被修改，所以先让用户给新模板命名。
  const inputName = window.prompt('保存为新模板，请输入模板名称：', `${draft.value.name} 副本`)
  if (inputName === null) return
  const newName = inputName.trim()
  if (!newName) {
    pushMessage('模板名不能为空，已取消保存。', 'system')
    return
  }
  saving.value = true
  setStatus('保存中…')
  try {
    const response = await saveWorkbenchTemplate(draft.value.id, draft.value, draftVersion.value, newName)
    if (!response.data.saved) {
      pushMessage(`保存前校验未通过：${response.data.validation.errors.join('；')}`, 'system')
      setStatus('校验未通过', 'err')
      return
    }
    dirty.value = false
    pushMessage(
      `已另存为新模板“${response.data.template_name || newName}”，原模板未被修改。返回列表可看到它。`,
      'assistant',
    )
    setStatus('已另存为新模板', 'ok')
    // 不能再调 load()：它会重新拉取当前（源）模板，把用户刚才的修改冲掉。
    // 派生出的新模板需要回列表重新进入才能编辑。
  } catch (e: any) {
    pushMessage(`保存失败：${e?.response?.data?.detail || e?.message || '保存失败'}`, 'system')
    setStatus('保存失败', 'err')
  } finally {
    saving.value = false
  }
}

/** 草稿变化后重算版式预览。
 *
 * 左侧版式是后端拿原始 docx 拼出来的，前端改不了；只改本地 sections
 * 只能刷新右侧面板，所以必须把草稿发给后端重新渲染。 */
async function syncDraftToView() {
  if (!draft.value || !view.value) return
  try {
    const res = await previewWorklogTemplate(props.templateId, draft.value)
    if (res.code === 0 && res.data) {
      view.value = res.data
      return
    }
    setStatus(res.message || '预览刷新失败', 'err')
  } catch (e: any) {
    setStatus(`预览刷新失败：${e?.response?.data?.detail || e?.message || '请求失败'}`, 'err')
  }
  // 预览接口不可用时至少把右侧变量面板刷新成草稿内容，不致于完全看不到变化。
  syncDraftToPanel()
}

/** 兼容退路：只把草稿章节/变量映射到右侧面板 */
function syncDraftToPanel() {
  if (!draft.value || !view.value) return
  const sections = draft.value.splits.map((split) => ({
    index: split.index,
    section_title: split.section_title,
    content: split.content,
    display_content: split.display_content ?? '',
    variables: split.variables.map((v) => ({
      key: v.key,
      title: v.title ?? '',
      type: v.type,
      value: v.value ?? '',
      prompt: v.prompt ?? '',
      chapter_index: v.chapter_index ?? null,
    })),
  }))
  const variables = sections.flatMap((section) =>
    section.variables.map((v) => ({
      ...v,
      section_title: section.section_title,
      section_index: section.index,
    })),
  )
  view.value = { ...view.value, sections, variables }
}

/* ---------------- 版式源上传 ---------------- */

function pickLayoutFile() {
  layoutInput.value?.click()
}

async function uploadLayout(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingLayout.value = true
  setStatus('上传版式源…')
  try {
    const form = new FormData()
    form.append('file', file)
    const base = import.meta.env.PROD ? '/performance-api' : ''
    const { data } = await axios.post(
      `${base}/api/template/worklog/${encodeURIComponent(props.templateId)}/layout`,
      form,
      {
        headers: {
          token: 'feb9ff10-508d-4f32-8050-10bfea07b2e1',
          tenantid: '1',
        },
      },
    )
    if (data.code !== 0) {
      setStatus(data.message || '上传失败', 'err')
      return
    }
    setStatus(`版式源已更新，识别到 ${data.data.table_count} 张表`, 'ok')
    await load()
  } catch (e: any) {
    setStatus(`上传失败：${e?.response?.data?.detail || e?.message || '上传失败'}`, 'err')
  } finally {
    uploadingLayout.value = false
    input.value = ''
  }
}

/* ---------------- 载入 ---------------- */

async function load() {
  if (!props.templateId) return
  loading.value = true
  error.value = ''
  try {
    const res = await getWorklogTemplate(props.templateId)
    if (res.code !== 0 || !res.data) {
      error.value = res.message || '读取模板失败'
      view.value = null
      return
    }
    view.value = res.data

    // AI 助手复用既有工作台草稿结构，操作与普通模板保持一致
    try {
      const wb = await getWorkbenchTemplate(props.templateId)
      draft.value = wb.data.template
      draftVersion.value = wb.data.draft_version
    } catch {
      draft.value = null
      setStatus('AI 助手不可用：草稿读取失败', 'err')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取模板失败'
    view.value = null
  } finally {
    loading.value = false
  }
}

function leave() {
  if (dirty.value && !window.confirm('当前有未保存修改，确定返回模板列表并放弃修改吗？')) return
  clearSelection()
  emit('back')
}

watch(activeKey, (key) => {
  document.querySelectorAll('.wl-key.active').forEach((el) => el.classList.remove('active'))
  if (!key) return
  document
    .querySelectorAll(`.wl-key[data-key="${CSS.escape(key)}"]`)
    .forEach((el) => el.classList.add('active'))
})

watch(() => props.templateId, load)
onMounted(load)
</script>

<style scoped>
/* Custom Highlight 必须有对应的 ::highlight() 规则才会显示；
   名字要与脚本里的 HIGHLIGHT_NAME 一致。 */
:global(::highlight(proma-worklog-selection)) {
  background: #0078d7;
  background: Highlight;
  color: #fff;
  color: HighlightText;
}

.worklog-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #f5f7fb;
  color: #202532;
}

.topbar {
  height: 62px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 22px;
  background: #fff;
  border-bottom: 1px solid #e5e9f0;
  flex: none;
}

/* 与「模板智能维护工作台」顶栏保持一致：蓝点 + 标题 + 副标题 + 右侧按钮 */
.brand {
  font-size: 17px;
  font-weight: 700;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand i {
  display: inline-block;
  width: 9px;
  height: 9px;
  background: #3867ef;
  border-radius: 3px;
  margin-right: 8px;
}

.crumb {
  color: #7c8494;
  font-size: 11px;
  white-space: nowrap;
}

.grow {
  flex: 1;
}

.badge {
  flex: none;
  padding: 2px 8px;
  border-radius: 99px;
  background: #edf2ff;
  color: #3867ef;
  font-size: 11px;
}

.badge.orange {
  background: #fff3df;
  color: #c77713;
}

.status {
  color: #7c8494;
  font-size: 11px;
  white-space: nowrap;
}

.status.ok {
  color: #159765;
}

.status.err {
  color: #d84a54;
}

.btn {
  border: 1px solid #e5e9f0;
  background: #fff;
  color: #4f5868;
  border-radius: 7px;
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  border-color: #b9c5e2;
  color: #3867ef;
}

.btn.primary {
  background: #3867ef;
  border-color: #3867ef;
  color: #fff;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.state-box {
  margin: 40px auto;
  padding: 24px 32px;
  border-radius: 10px;
  background: #fff;
  color: #7c8494;
}

.state-box.error {
  color: #d84a54;
}

.workspace {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 12px;
  padding: 12px;
}

.workspace.precise-mode {
  grid-template-columns: minmax(0, 1fr) minmax(360px, 1fr);
}

.pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e5e9f0;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(34, 48, 80, 0.07);
  overflow: hidden;
}

.pane-head {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid #e5e9f0;
  flex: none;
}

.head-text h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.head-text small {
  color: #7c8494;
  font-size: 11px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.precision-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #c8d5ff;
  background: linear-gradient(135deg, #f4f7ff, #edf2ff);
  color: #3867ef;
  border-radius: 7px;
  padding: 5px 10px;
  font: 600 11px/1.4 inherit;
  cursor: pointer;
}

.precision-btn:hover {
  border-color: #8da6fa;
}

.precision-btn.active {
  border-color: #3867ef;
  background: linear-gradient(135deg, #3867ef, #5d7ff2);
  color: #fff;
}

.precision-icon {
  font-size: 13px;
  line-height: 1;
}

.pane-body {
  flex: 1;
  min-height: 0;
  padding: 14px 16px;
}

.scroll {
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.tip {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 7px;
  background: #f7f8fb;
  color: #7c8494;
  font-size: 12px;
  line-height: 1.7;
}

.tip.warn {
  background: #fff8ea;
  color: #8c5b18;
}

.tip code {
  padding: 0 4px;
  border-radius: 3px;
  background: #edf2ff;
  color: #3867ef;
  font-family: ui-monospace, Consolas, monospace;
}

.link-btn {
  margin-left: 4px;
  border: 0;
  background: transparent;
  color: #3867ef;
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.hidden-file {
  display: none;
}

/* ---- 版式还原 ---- */
/* 字体、字号均与通用模板页正文对齐 */
.layout-host {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  line-height: 1.65;
}

.layout-host :deep(.wl-table) {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
  margin: 0 0 10px;
}

.layout-host :deep(.wl-table td),
.layout-host :deep(.wl-table th) {
  border: 1px solid #333;
  padding: 6px 8px;
  vertical-align: top;
  word-break: break-word;
}

.layout-host :deep(.wl-md-table th) {
  background: #f3f5f9;
  font-weight: 600;
  text-align: center;
}

/* Markdown 表格宽度由内容决定，避免固定布局把列挤成一团 */
.layout-host :deep(.wl-md-table) {
  table-layout: auto;
  margin: 6px 0;
  font-size: 13px;
}

/* 变量 value 里的 Markdown 标题。不用 h1~h6：浏览器默认字号会把公文
   版式顶得很松散，这里只做小幅加粗和层级缩小。 */
.layout-host :deep(.wl-md-heading) {
  margin: 8px 0 4px;
  font-weight: 700;
  line-height: 1.5;
}

.layout-host :deep(.wl-md-heading[data-level="1"]) {
  font-size: 15px;
}

.layout-host :deep(.wl-md-heading[data-level="2"]) {
  font-size: 14px;
}

/* 3 级及以下与正文同字号，只靠加粗区分 */
.layout-host :deep(.wl-md-heading[data-level="3"]),
.layout-host :deep(.wl-md-heading[data-level="4"]),
.layout-host :deep(.wl-md-heading[data-level="5"]),
.layout-host :deep(.wl-md-heading[data-level="6"]) {
  font-size: 13px;
}

/* 变量 value 里的 Markdown 列表 */
.layout-host :deep(.wl-md-list) {
  margin: 4px 0;
  padding-left: 22px;
}

.layout-host :deep(.wl-md-list li) {
  margin: 2px 0;
  line-height: 1.65;
}

.layout-host :deep(.wl-table p),
.layout-host :deep(p) {
  margin: 5px 0;
}

.layout-host :deep(.wl-key) {
  cursor: pointer;
  border-bottom: 1px dashed #c7d2fe;
}

/* 块级变量（内含表格）不需要下边框，否则会在表格下方多出一条线 */
.layout-host :deep(div.wl-key) {
  border-bottom: none;
}

.layout-host :deep(.wl-key.wl-empty) {
  color: #9aa1b1;
}

/* ---- 骨架外的新增章节 ---- */
.mismatch-detail {
  margin-top: 7px;
  padding: 7px 9px;
  border-radius: 5px;
  background: #fafbfc;
  border: 1px solid #e5e9f0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  line-height: 1.7;
  word-break: break-all;
}

.layout-host :deep(.wl-extra) {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 2px dashed #c8d5ff;
}

.layout-host :deep(.wl-extra-note) {
  margin-bottom: 12px;
  padding: 9px 11px;
  border-radius: 6px;
  background: #fff8ea;
  border: 1px solid #f2dfb8;
  color: #8c5b18;
  font-size: 12px;
  line-height: 1.6;
}

.layout-host :deep(.wl-extra-section) {
  margin-bottom: 14px;
  padding: 11px 13px;
  border: 1px solid #e5e9f0;
  border-radius: 7px;
  background: #fbfcff;
}

.layout-host :deep(.wl-extra-section h4) {
  margin: 0 0 9px;
  font-size: 14px;
  font-weight: 700;
}

.layout-host :deep(.wl-extra-label) {
  margin: 8px 0 3px;
  color: #7c8494;
  font-size: 11px;
}

/* 已有章节里新增的变量：嵌在正文流里，不能像新章节那样加整块边框，
   否则一个小变量会把段落打断。只用左侧细线标识“这是新加的”。 */
/* 已有章节里新增的变量：完全嵌入正文流，不加任何缩进或装饰线。
   早先用过 padding-left + border-left 做“新增”标识，但那会让新增的（三）
   比相邻的（二）（四）向右错开一截，左侧还多一条竖线，反而像渲染缺陷。
   它保存后就会走正常占位符渲染，本来也不需要永久标识。 */
.layout-host :deep(.wl-extra-variable) {
  display: block;
}

/* 新增变量的标题：版式里变量小标题本身就是普通 <p>，与正文同色同字号
   （如“（四）项目实施效果方面的问题”）。不能用 .wl-extra-label 的灰字 11px，
   否则新增的（三）看起来比相邻标题淡一截。
   margin 也跟版式正文段落一致（5px 0），让行间节奏对齐。 */
.layout-host :deep(.wl-extra-heading) {
  margin: 5px 0;
  padding: 0;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}

/* 选中态与「模板智能维护工作台」的模板预览保持一致：
   只加淡蓝色背景，文字颜色不变，也不做外发光；
   hover 不做任何视觉变化，避免和框选、选中态互相干扰。 */
.layout-host :deep(.wl-key.active) {
  background: #eef3ff;
  border-radius: 3px;
  /* 行内元素的背景默认只覆盖文字内容区，行距会露出白条。
     用上下 padding 把背景撑到整个行高（line-height 1.65，半行距约 0.235em），
     配合 box-decoration-break: clone 让每一个折行片段都带上 padding，
     多行时上下相接，视觉上就是连续的一整块。
     行内元素的垂直 padding 不影响行盒高度，不会引起重排。 */
  padding: 0.26em 0;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  /* 选中时隐去虚线下边框，否则它会在蓝底块内部拉出横线，反而显得割裂；
     保留 1px 宽度只改颜色，几何尺寸不变。 */
  border-bottom-color: transparent;
}

/* 块级变量（内含表格）本身就是块，背景已经连续，
   不能加垂直 padding，否则会撑开表格前后的间距。 */
.layout-host :deep(div.wl-key.active) {
  padding: 0;
}

/* ---- 兜底章节 ---- */
.fb-section {
  margin-bottom: 18px;
}

.fb-section h4 {
  margin: 0 0 9px;
  padding: 8px 10px;
  background: #f8f9fc;
  border-left: 3px solid #3867ef;
  border-radius: 0 5px 5px 0;
  font-size: 14px;
}

.fb-var {
  margin-bottom: 8px;
  padding: 10px 11px;
  border: 1px solid #e5e9f0;
  border-radius: 7px;
  cursor: pointer;
}

.fb-var.active {
  border-color: #9bb0fa;
  background: #fbfcff;
}

.fb-var-head {
  margin-bottom: 5px;
  font-weight: 600;
  font-size: 13px;
}

.fb-var-body {
  font-size: 12px;
  color: #4d5665;
}

.fb-empty {
  margin: 0;
  color: #9aa2b1;
  font-size: 12px;
}

/* ---- 变量卡片 ---- */
.var-card {
  margin-bottom: 8px;
  padding: 11px;
  border: 1px solid #e5e9f0;
  border-radius: 8px;
  cursor: pointer;
}

.var-card.active {
  border-color: #9bb0fa;
  background: #fbfcff;
  box-shadow: 0 0 0 2px #edf2ff;
}

.var-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.var-title {
  font-weight: 600;
  font-size: 13px;
  word-break: break-all;
}

.var-key {
  flex: none;
  color: #8b93a2;
  font: 11px ui-monospace, Consolas, monospace;
}

.var-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 6px 0 8px;
}

.chip {
  padding: 1px 7px;
  border-radius: 99px;
  background: #edf2ff;
  color: #3867ef;
  font-size: 10px;
}

.var-section {
  color: #9aa2b1;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.var-block {
  margin-top: 7px;
}

.var-label {
  display: block;
  margin-bottom: 3px;
  color: #7c8494;
  font-size: 11px;
  font-weight: 600;
}

.var-value,
.var-prompt {
  max-height: 200px;
  overflow: auto;
  margin: 0;
  padding: 7px 8px;
  border: 1px solid #e5e9f0;
  border-radius: 5px;
  background: #fafbfc;
  font-size: 12px;
  line-height: 1.7;
  color: #4d5665;
  word-break: break-word;
}

.var-prompt {
  white-space: pre-wrap;
}

.var-prompt.empty {
  color: #b0b5bd;
}

.var-value :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 4px 0;
}

.var-value :deep(td),
.var-value :deep(th) {
  border: 1px solid #dfe3e8;
  padding: 3px 5px;
  font-size: 11px;
}

.var-value :deep(.empty) {
  margin: 0;
  color: #b0b5bd;
}

/* ---- AI 助手 ---- */
.assistant-pane .chat-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: #f7f8fb;
}

.bubble {
  max-width: 88%;
  padding: 10px 13px;
  border-radius: 12px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble.user {
  align-self: flex-end;
  background: #3867ef;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble.assistant {
  align-self: flex-start;
  background: #fff;
  border: 1px solid #e7eaf1;
  border-bottom-left-radius: 4px;
}

.bubble.system {
  align-self: flex-start;
  background: #fff8ea;
  border: 1px solid #f2dfb8;
  color: #8c5b18;
  font-size: 12px;
}

.bubble.welcome {
  max-width: 100%;
  white-space: normal;
  background: #fff;
  border-color: #e7eaf1;
  color: #4f5868;
}

.welcome-title {
  margin-bottom: 9px;
  font-size: 13px;
  font-weight: 700;
  color: #202532;
}

.welcome-group {
  margin-bottom: 9px;
}

.welcome-label {
  display: inline-block;
  margin-bottom: 4px;
  padding: 1px 8px;
  border-radius: 99px;
  background: #edf2ff;
  color: #3867ef;
  font-size: 10px;
  font-weight: 700;
}

.bubble.welcome ul {
  margin: 0;
  padding-left: 18px;
}

.bubble.welcome li {
  margin: 2px 0;
  line-height: 1.6;
}

.bubble.welcome li b {
  color: #3867ef;
}

.welcome-foot {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e7eaf1;
  color: #7c8494;
  font-size: 11px;
  line-height: 1.6;
}

.patch {
  width: 100%;
  padding: 13px;
  border: 1px solid #dfe5f2;
  border-radius: 12px;
  background: #fff;
}

.patch h3 {
  margin: 0 0 9px;
  color: #3154c2;
  font-size: 12px;
}

.op {
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px solid #e8ebf2;
  border-radius: 7px;
  background: #f7f8fb;
  font-size: 12px;
}

.op b {
  color: #3867ef;
  font: 11px ui-monospace, Consolas, monospace;
}

.patch pre {
  max-height: 180px;
  overflow: auto;
  padding: 9px;
  border-radius: 7px;
  background: #202633;
  color: #e9edf6;
  font: 11px/1.5 ui-monospace, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.patch-actions {
  display: flex;
  gap: 8px;
  margin-top: 11px;
}

.patch-actions .btn {
  flex: 1;
}

.notice {
  margin-top: 7px;
  padding: 9px 11px;
  border-radius: 6px;
  background: #f7f8fb;
  color: #7c8494;
  font-size: 11px;
}

.chat-input {
  flex: none;
  padding: 12px 14px 14px;
  border-top: 1px solid #e5e9f0;
  background: #fff;
}

.selection-hint {
  margin: 0 0 8px;
  color: #7c8494;
  font-size: 11px;
}

.selection-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid #c8d5ff;
  border-radius: 8px;
  background: #f4f7ff;
}

.chip-label {
  padding: 1px 6px;
  border-radius: 99px;
  background: #e4ebff;
  color: #3867ef;
  font-size: 10px;
  font-weight: 700;
}

.chip-count {
  color: #3867ef;
  font-size: 11px;
  font-weight: 600;
}

.chip-tip {
  flex: 1;
  min-width: 0;
  color: #7c8494;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-clear {
  border: 0;
  background: transparent;
  color: #7c8494;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.chat-input textarea {
  width: 100%;
  height: 82px;
  display: block;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid #dfe4ee;
  border-radius: 10px;
  background: #fbfcfe;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
}

.chat-input textarea:focus {
  border-color: #9bb0fa;
  box-shadow: 0 0 0 3px #edf2ff;
  background: #fff;
}

.chat-input textarea:disabled {
  background: #f4f6fa;
  color: #9aa2b1;
  cursor: not-allowed;
}

@media (max-width: 1050px) {
  .workspace,
  .workspace.precise-mode {
    grid-template-columns: 1fr;
  }

  .pane {
    height: 520px;
  }

  .assistant-pane {
    height: 650px;
  }
}

/* 窄屏下隐去副标题和状态，与「模板智能维护工作台」一致，避免按钮被挤换行 */
@media (max-width: 700px) {
  .topbar {
    padding: 0 12px;
  }

  .crumb,
  .topbar .status {
    display: none;
  }
}
</style>
