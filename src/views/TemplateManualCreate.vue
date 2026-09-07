<template>
  <div class="manual-page">
    <div class="page-head">
      <div class="head-left">
        <div class="brand"><i />手工新建模板</div>
        <div class="crumb">不上传文档，直接搭章节与变量</div>
      </div>
      <div class="grow" />
      <span class="stat">{{ splits.length }} 章节 · {{ variableCount }} 个变量</span>
      <button class="btn-secondary" @click="emit('back')">返回列表</button>
      <button class="btn-primary" :disabled="saving" @click="save">
        {{ saving ? '保存中...' : '保存模板' }}
      </button>
    </div>

    <div class="scroll-body">
      <!-- 基本信息 -->
      <section class="card">
        <h2>基本信息</h2>
        <div class="form-row">
          <label>模板名称 <em>*</em></label>
          <input v-model="name" type="text" placeholder="例如：事中监控报告模板" maxlength="120" />
        </div>
        <div class="form-row">
          <label>描述</label>
          <input v-model="description" type="text" placeholder="选填，用于列表页展示" maxlength="200" />
        </div>
        <div class="form-row">
          <label>模板类型</label>
          <select v-model="templateType">
            <option value="">未分类</option>
            <option v-for="t in TEMPLATE_TYPES" :key="t.code" :value="t.code">{{ t.label }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>替换模式</label>
          <select v-model="isReplace">
            <option :value="true">是（is_replace）</option>
            <option :value="false">否</option>
          </select>
        </div>
        <p class="help">替换模式开启后，每个变量会独立拆分为一个 split 进行搜索和生成。</p>
      </section>

      <!-- 章节列表 -->
      <section class="card">
        <h2>
          <span>章节列表</span>
          <span class="head-btns">
            <button class="btn-mini" @click="toggleAll">{{ allOpen ? '全部收起' : '全部展开' }}</button>
            <button class="btn-mini btn-mini-primary" @click="addSplit">＋ 添加章节</button>
          </span>
        </h2>

        <div v-if="!splits.length" class="empty">暂无章节，点击「添加章节」开始</div>

        <div v-for="(split, si) in splits" :key="split.uid" class="split">
          <div class="split-head">
            <button class="fold" :title="split.open ? '收起' : '展开'" @click="split.open = !split.open">
              {{ split.open ? '▾' : '▸' }}
            </button>
            <input
              v-model="split.section_title"
              class="split-title"
              type="text"
              :placeholder="`第 ${si + 1} 章节标题，例如：一、基本情况`"
            />
            <span class="split-meta">{{ split.variables.length }} 变量</span>
            <button class="btn-mini" :disabled="si === 0" title="上移" @click="moveSplit(si, -1)">↑</button>
            <button class="btn-mini" :disabled="si === splits.length - 1" title="下移" @click="moveSplit(si, 1)">↓</button>
            <button class="btn-mini btn-mini-danger" @click="removeSplit(si)">删除</button>
          </div>

          <div v-show="split.open" class="split-body">
            <div class="form-row">
              <label>章节正文</label>
              <textarea
                v-model="split.content"
                rows="3"
                placeholder="选填。章节的固定正文，变量占位符会在保存时按 {{key}} 自动追加"
              />
            </div>

            <div class="var-head">
              <span>变量</span>
              <button class="btn-mini btn-mini-primary" @click="addVariable(si)">＋ 添加变量</button>
            </div>

            <div v-if="!split.variables.length" class="empty empty-sm">该章节还没有变量</div>

            <div v-for="(v, vi) in split.variables" :key="v.uid" class="var">
              <div class="var-top">
                <span class="var-idx">{{ vi + 1 }}</span>
                <input v-model="v.title" class="var-title" type="text" placeholder="变量标题，例如：（一）项目背景" />
                <select v-model="v.type" class="var-type">
                  <option value="markdown">markdown</option>
                  <option value="json">json</option>
                  <option value="summary">summary</option>
                </select>
                <button class="btn-mini" :disabled="vi === 0" title="上移" @click="moveVariable(si, vi, -1)">↑</button>
                <button class="btn-mini" :disabled="vi === split.variables.length - 1" title="下移" @click="moveVariable(si, vi, 1)">↓</button>
                <button class="btn-mini btn-mini-danger" @click="removeVariable(si, vi)">删除</button>
              </div>
              <div class="var-fields">
                <label>value</label>
                <textarea v-model="v.value" rows="2" placeholder="要生成的内容，或 [获取XX] 这类抽取占位" />
                <label>prompt</label>
                <textarea v-model="v.prompt" rows="2" placeholder="选填。生成约束" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="toast" class="toast" :class="`toast--${toast.kind}`">{{ toast.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { createTemplateV2 } from '../api/template'
import { TEMPLATE_TYPES } from '../types/templateType'
import type { V2CreateRequest, V2TemplateSplit } from '../types/template'

const emit = defineEmits<{
  back: []
  created: [templateId: string, templateType: string]
}>()

interface DraftVariable {
  uid: number
  title: string
  type: string
  value: string
  prompt: string
}

interface DraftSplit {
  uid: number
  section_title: string
  content: string
  open: boolean
  variables: DraftVariable[]
}

let seq = 0
const nextUid = () => ++seq

const name = ref('')
const description = ref('')
const templateType = ref('')
const isReplace = ref(true)
const splits = ref<DraftSplit[]>([])
const saving = ref(false)
const toast = ref<{ text: string; kind: 'ok' | 'err' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

const variableCount = computed(() =>
  splits.value.reduce((sum, s) => sum + s.variables.length, 0),
)
const allOpen = computed(() => splits.value.length > 0 && splits.value.every(s => s.open))

function showToast(text: string, kind: 'ok' | 'err' = 'ok') {
  toast.value = { text, kind }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, kind === 'err' ? 4000 : 2200)
}

function addSplit() {
  splits.value.push({
    uid: nextUid(),
    section_title: '',
    content: '',
    open: true,
    variables: [],
  })
}

function removeSplit(index: number) {
  const split = splits.value[index]
  const label = split.section_title.trim() || `第 ${index + 1} 个章节`
  if (split.variables.length && !window.confirm(`「${label}」下有 ${split.variables.length} 个变量，一并删除？`)) return
  splits.value.splice(index, 1)
}

function moveSplit(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= splits.value.length) return
  const list = splits.value
  ;[list[index], list[target]] = [list[target], list[index]]
}

function toggleAll() {
  const next = !allOpen.value
  splits.value.forEach(s => { s.open = next })
}

function addVariable(si: number) {
  splits.value[si].variables.push({
    uid: nextUid(),
    title: '',
    type: 'markdown',
    value: '',
    prompt: '',
  })
  splits.value[si].open = true
}

function removeVariable(si: number, vi: number) {
  splits.value[si].variables.splice(vi, 1)
}

function moveVariable(si: number, vi: number, delta: number) {
  const list = splits.value[si].variables
  const target = vi + delta
  if (target < 0 || target >= list.length) return
  ;[list[vi], list[target]] = [list[target], list[vi]]
}

/**
 * 组装后端要的结构。
 *
 * key 与 chapter_index 都由前端按「章节序号 + 变量序号」生成，保证同一模板内
 * 唯一——后端 v2/create 不会替你补这两个字段，重复会导致变量互相覆盖。
 * content 里同时写入 {{key}} 占位符：远端 PlanTemplateSplit 只认 content，
 * 没有占位符引用的变量会成为「孤儿」，生成报告时永远不出现。
 */
function buildPayload(): V2CreateRequest {
  const list: V2TemplateSplit[] = splits.value.map((split, si) => {
    const chapterNo = si + 1
    const lines: string[] = []
    const base = split.content.trim()
    if (base) lines.push(base)

    const variables = split.variables.map((v, vi) => {
      const key = `key_${chapterNo}_${vi + 1}`
      const title = v.title.trim()
      if (title) lines.push(`## ${title}`)
      lines.push(`{{${key}}}`)
      return {
        key,
        type: v.type || 'markdown',
        value: v.value,
        chapter_index: chapterNo * 10000 + (vi + 1),
        prompt: v.prompt,
        title,
      }
    })

    return {
      content: lines.join('\n\n'),
      index: chapterNo * 10000,
      section_title: split.section_title.trim(),
      variable_mapping_list: variables.length ? variables : null,
    }
  })

  return {
    name: name.value.trim(),
    description: description.value.trim(),
    is_replace: isReplace.value,
    content: list.map(s => (s.section_title ? `# ${s.section_title}\n\n${s.content}` : s.content)).join('\n\n'),
    template_split_list: list,
  }
}

function validate(): string {
  if (!name.value.trim()) return '请填写模板名称'
  if (!splits.value.length) return '至少添加一个章节'
  for (const [si, split] of splits.value.entries()) {
    if (!split.section_title.trim()) return `第 ${si + 1} 个章节还没有标题`
    for (const [vi, v] of split.variables.entries()) {
      if (!v.title.trim()) return `「${split.section_title.trim()}」第 ${vi + 1} 个变量还没有标题`
    }
  }
  return ''
}

async function save() {
  const problem = validate()
  if (problem) {
    showToast(problem, 'err')
    return
  }
  saving.value = true
  try {
    // v2/create 返回的是扁平的 SubmitResponse（success/template_id），
    // 不是列表、删除那些接口的 {code,message,data} 包裹结构。
    const res = await createTemplateV2(buildPayload())
    if (res.success && res.template_id) {
      showToast('模板创建成功')
      emit('created', res.template_id, templateType.value)
    } else {
      showToast('创建失败', 'err')
    }
  } catch (err: any) {
    showToast(err.response?.data?.error || err.response?.data?.message || err.message || '创建失败', 'err')
  } finally {
    saving.value = false
  }
}

addSplit()
</script>

<style scoped>
.manual-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fb;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

/* 顶栏与两个工作台保持一致 */
.page-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  padding: 0 22px;
  height: 52px;
  border-bottom: 1px solid #e4e9f2;
  background: #ffffff;
}

.head-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #1f2937;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.brand i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2563eb;
}

.crumb {
  color: #8b93a3;
  font-size: 12px;
  white-space: nowrap;
}

.grow { flex: 1 1 auto; }

.stat {
  color: #6b7280;
  font-size: 11px;
  white-space: nowrap;
}

.btn-primary,
.btn-secondary {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.btn-primary {
  border: 0;
  background: #2563eb;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) { background: #1d4ed8; }

.btn-primary:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.btn-secondary {
  border: 1px solid #d6dfed;
  background: #ffffff;
  color: #355173;
}

.btn-secondary:hover { border-color: #2563eb; color: #2563eb; }

.scroll-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 18px 22px 40px;
}

.card {
  max-width: 900px;
  margin: 0 auto 16px;
  padding: 18px 20px;
  border: 1px solid #e6eaf2;
  border-radius: 12px;
  background: #ffffff;
}

.card h2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef1f6;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
}

.head-btns { display: flex; gap: 6px; }

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.form-row label {
  flex: 0 0 82px;
  padding-top: 8px;
  color: #55607a;
  font-size: 13px;
}

.form-row label em {
  color: #dc2626;
  font-style: normal;
}

.form-row input,
.form-row select,
.form-row textarea {
  flex: 1 1 auto;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid #d9e0ec;
  border-radius: 7px;
  background: #ffffff;
  color: #1f2937;
  font-family: inherit;
  font-size: 13px;
}

.form-row textarea { resize: vertical; line-height: 1.6; }

.form-row input:focus,
.form-row select:focus,
.form-row textarea:focus {
  outline: none;
  border-color: #2563eb;
}

.help {
  margin: 2px 0 0 94px;
  color: #98a1b3;
  font-size: 12px;
}

.empty {
  padding: 26px;
  color: #98a1b3;
  text-align: center;
  font-size: 13px;
}

.empty-sm { padding: 14px; font-size: 12px; }

/* ---- 章节 ---- */
.split {
  margin-bottom: 12px;
  border: 1px solid #e6eaf2;
  border-radius: 10px;
  overflow: hidden;
}

.split-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: #f8fafc;
}

.fold {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 12px;
}

.fold:hover { background: #e8edf5; }

.split-title {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 9px;
  border: 1px solid #d9e0ec;
  border-radius: 6px;
  color: #1f2937;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
}

.split-title:focus { outline: none; border-color: #2563eb; }

.split-meta {
  color: #98a1b3;
  font-size: 11px;
  white-space: nowrap;
}

.split-body {
  padding: 14px 12px 12px;
  border-top: 1px solid #eef1f6;
}

.var-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 0 10px;
  color: #55607a;
  font-size: 12px;
  font-weight: 600;
}

/* ---- 变量 ---- */
.var {
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid #eaeef6;
  border-radius: 8px;
  background: #fcfdff;
}

.var-top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.var-idx {
  flex: 0 0 20px;
  height: 20px;
  border-radius: 50%;
  background: #e8f2ff;
  color: #1868c0;
  text-align: center;
  font-size: 11px;
  line-height: 20px;
}

.var-title {
  flex: 1 1 auto;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid #d9e0ec;
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
}

.var-type {
  flex: 0 0 108px;
  padding: 5px 6px;
  border: 1px solid #d9e0ec;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
}

.var-title:focus,
.var-type:focus { outline: none; border-color: #2563eb; }

.var-fields {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 6px 10px;
  align-items: start;
  margin-top: 9px;
}

.var-fields label {
  padding-top: 6px;
  color: #7c8494;
  font-size: 12px;
}

.var-fields textarea {
  padding: 6px 9px;
  border: 1px solid #d9e0ec;
  border-radius: 6px;
  color: #1f2937;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}

.var-fields textarea:focus { outline: none; border-color: #2563eb; }

/* ---- 小按钮 ---- */
.btn-mini {
  height: 24px;
  padding: 0 9px;
  border: 1px solid #d9e0ec;
  border-radius: 6px;
  background: #ffffff;
  color: #55607a;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.btn-mini:hover:not(:disabled) { border-color: #2563eb; color: #2563eb; }

.btn-mini:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.btn-mini-primary {
  border-color: #bfd4f5;
  background: #eff5ff;
  color: #1d4ed8;
}

.btn-mini-danger { color: #dc2626; }

.btn-mini-danger:hover { border-color: #dc2626; color: #dc2626; }

/* ---- 轻提示 ---- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  z-index: 70;
  padding: 10px 18px;
  border-radius: 10px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, .18);
  color: #ffffff;
  font-size: 13px;
  transform: translateX(-50%);
}

.toast--ok { background: #16a34a; }

.toast--err { background: #dc2626; }

@media (max-width: 720px) {
  .page-head { flex-wrap: wrap; height: auto; padding: 10px 14px; }
  .crumb, .stat { display: none; }
  .form-row { flex-direction: column; gap: 5px; }
  .form-row label { flex: none; padding-top: 0; }
  .help { margin-left: 0; }
}
</style>
