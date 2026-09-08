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
              :placeholder="`第 ${si + 1} 章节标题，例如：一、基本情况（可空）`"
            />
            <span class="split-meta">{{ splitVarCount(split) }} 变量</span>
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
                placeholder="选填。写什么就存什么，不会自动追加小标题和占位符"
              />
            </div>
            <div class="form-row">
              <label>SERP 提示词</label>
              <input v-model="split.serp_prompt" type="text" placeholder="选填。该章节的检索提示词" />
            </div>

            <div class="var-head">
              <span>变量<em class="var-head-hint">标题作为二级标题</em></span>
              <span class="head-btns">
                <button class="btn-mini btn-mini-primary" @click="addVariable(si)">＋ 添加变量</button>
                <button class="btn-mini" @click="addSubsection(si)">＋ 添加二级标题</button>
              </span>
            </div>

            <div v-if="!split.variables.length" class="empty empty-sm">该章节还没有未分组变量</div>

            <div v-for="(v, vi) in split.variables" :key="v.uid" class="var">
              <div class="var-top">
                <span class="var-idx">{{ vi + 1 }}</span>
                <input v-model="v.title" class="var-title" type="text" placeholder="变量标题，例如：（一）项目背景（可空）" />
                <select v-model="v.type" class="var-type">
                  <option v-for="t in VAR_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
                <button class="btn-mini" :disabled="vi === 0" title="上移" @click="moveVariable(si, vi, -1)">↑</button>
                <button class="btn-mini" :disabled="vi === split.variables.length - 1" title="下移" @click="moveVariable(si, vi, 1)">↓</button>
                <button class="btn-mini btn-mini-danger" @click="removeVariable(si, vi)">删除</button>
              </div>
              <div class="var-fields">
                <template v-if="v.type === 'json'">
                  <label>变量标识 <em>*</em></label>
                  <input v-model="v.key" type="text" placeholder="json 类型需自己指定 key" />
                </template>
                <label>value</label>
                <textarea v-model="v.value" rows="2" placeholder="要生成的内容，或 [获取XX] 这类抽取占位" />
                <label>prompt</label>
                <textarea v-model="v.prompt" rows="2" placeholder="选填。生成约束" />
              </div>
            </div>

            <!-- 二级标题分组：组内变量标题作为三级标题 -->
            <div v-for="(sub, sui) in split.subsections" :key="sub.uid" class="sub">
              <div class="sub-head">
                <input v-model="sub.title" class="sub-title" type="text" placeholder="二级标题，例如：一、项目决策指标" />
                <span class="split-meta">{{ sub.variables.length }} 变量</span>
                <button class="btn-mini" :disabled="sui === 0" title="上移" @click="moveSubsection(si, sui, -1)">↑</button>
                <button class="btn-mini" :disabled="sui === split.subsections.length - 1" title="下移" @click="moveSubsection(si, sui, 1)">↓</button>
                <button class="btn-mini btn-mini-primary" @click="addSubVariable(si, sui)">＋ 变量</button>
                <button class="btn-mini btn-mini-danger" @click="removeSubsection(si, sui)">删除</button>
              </div>

              <div v-if="!sub.variables.length" class="empty empty-sm">该分组还没有变量</div>

              <div v-for="(v, vi) in sub.variables" :key="v.uid" class="var">
                <div class="var-top">
                  <span class="var-idx">{{ vi + 1 }}</span>
                  <input v-model="v.title" class="var-title" type="text" placeholder="变量标题（三级，可空）" />
                  <select v-model="v.type" class="var-type">
                    <option v-for="t in VAR_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                  </select>
                  <button class="btn-mini" :disabled="vi === 0" title="上移" @click="moveSubVariable(si, sui, vi, -1)">↑</button>
                  <button class="btn-mini" :disabled="vi === sub.variables.length - 1" title="下移" @click="moveSubVariable(si, sui, vi, 1)">↓</button>
                  <button class="btn-mini btn-mini-danger" @click="removeSubVariable(si, sui, vi)">删除</button>
                </div>
                <div class="var-fields">
                  <template v-if="v.type === 'json'">
                    <label>变量标识 <em>*</em></label>
                    <input v-model="v.key" type="text" placeholder="json 类型需自己指定 key" />
                  </template>
                  <label>value</label>
                  <textarea v-model="v.value" rows="2" placeholder="要生成的内容，或 [获取XX] 这类抽取占位" />
                  <label>prompt</label>
                  <textarea v-model="v.prompt" rows="2" placeholder="选填。生成约束" />
                </div>
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
  /** 仅 json 类型由用户自填；其余类型按位置生成，与 template_edit_v2.html 一致 */
  key: string
  value: string
  prompt: string
}

interface DraftSubsection {
  uid: number
  title: string
  variables: DraftVariable[]
}

interface DraftSplit {
  uid: number
  section_title: string
  content: string
  serp_prompt: string
  open: boolean
  variables: DraftVariable[]
  subsections: DraftSubsection[]
}

let seq = 0
const nextUid = () => ++seq

/** 与 template_edit_v2.html renderVariable() 的下拉选项保持一致 */
const VAR_TYPES = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
  { value: 'summary', label: 'Summary' },
  { value: 'fill', label: '填空（占位符替换/原样输出）' },
]

const name = ref('')
const description = ref('')
const templateType = ref('')
const isReplace = ref(true)
const splits = ref<DraftSplit[]>([])
const saving = ref(false)
const toast = ref<{ text: string; kind: 'ok' | 'err' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

const variableCount = computed(() =>
  splits.value.reduce(
    (sum, s) =>
      sum + s.variables.length + s.subsections.reduce((n, sub) => n + sub.variables.length, 0),
    0,
  ),
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
    serp_prompt: '',
    open: true,
    variables: [],
    subsections: [],
  })
}

function splitVarCount(split: DraftSplit) {
  return split.variables.length + split.subsections.reduce((n, s) => n + s.variables.length, 0)
}

function removeSplit(index: number) {
  const split = splits.value[index]
  const label = split.section_title.trim() || `第 ${index + 1} 个章节`
  const total = splitVarCount(split)
  if (total && !window.confirm(`「${label}」下有 ${total} 个变量，一并删除？`)) return
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

function newVariable(): DraftVariable {
  return { uid: nextUid(), title: '', type: 'markdown', key: '', value: '', prompt: '' }
}

function addVariable(si: number) {
  splits.value[si].variables.push(newVariable())
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

function addSubsection(si: number) {
  splits.value[si].subsections.push({ uid: nextUid(), title: '', variables: [] })
  splits.value[si].open = true
}

function removeSubsection(si: number, sui: number) {
  const sub = splits.value[si].subsections[sui]
  if (sub.variables.length && !window.confirm(`该二级标题下有 ${sub.variables.length} 个变量，一并删除？`)) return
  splits.value[si].subsections.splice(sui, 1)
}

function moveSubsection(si: number, sui: number, delta: number) {
  const list = splits.value[si].subsections
  const target = sui + delta
  if (target < 0 || target >= list.length) return
  ;[list[sui], list[target]] = [list[target], list[sui]]
}

function addSubVariable(si: number, sui: number) {
  splits.value[si].subsections[sui].variables.push(newVariable())
}

function removeSubVariable(si: number, sui: number, vi: number) {
  splits.value[si].subsections[sui].variables.splice(vi, 1)
}

function moveSubVariable(si: number, sui: number, vi: number, delta: number) {
  const list = splits.value[si].subsections[sui].variables
  const target = vi + delta
  if (target < 0 || target >= list.length) return
  ;[list[vi], list[target]] = [list[target], list[vi]]
}

/**
 * 组装后端要的结构，取齐 static/template_edit_v2.html 的 collectTemplateData()。
 *
 * 三个关键约定，和 HTML 页一致：
 * 1. split.content 原样透传用户输入，不自动拼 `## title` + `{{key}}`。
 *    后端 _compute_split_display_content() 会按变量 title 生成 display_content，
 *    远端 /detail 还会再生成一遍；在 content 里自己再拼一份就是标题重复。
 * 2. 顶层 content 传空串，由后端 _build_template_markdown() 自己算。
 * 3. key 只有 json 类型用用户填的，其余按位置生成；
 *    chapter_index 未分组从 1 开始，第 n 个二级分组偏移 n*100。
 */
function buildPayload(): V2CreateRequest {
  const list: V2TemplateSplit[] = splits.value.map((split, si) => {
    const chapterNo = si + 1

    const mapVars = (vars: DraftVariable[], varStart: number) =>
      vars.map((v, vi) => ({
        key: v.type === 'json' ? v.key.trim() : `key_${chapterNo}_${varStart + vi + 1}`,
        type: v.type || 'markdown',
        value: v.value,
        chapter_index: chapterNo * 10000 + varStart + vi + 1,
        prompt: v.prompt,
        title: v.title.trim(),
      }))

    const variables = mapVars(split.variables, 0)
    const subsections = split.subsections.map((sub, sui) => ({
      title: sub.title.trim(),
      order: sui,
      variable_mapping_list: sub.variables.length
        ? mapVars(sub.variables, (sui + 1) * 100)
        : null,
    }))

    return {
      content: split.content,
      index: chapterNo * 10000,
      section_title: split.section_title.trim(),
      serp_prompt: split.serp_prompt.trim() || null,
      variable_mapping_list: variables.length ? variables : null,
      subsection_list: subsections.length ? subsections : null,
    }
  })

  return {
    name: name.value.trim(),
    description: description.value.trim(),
    is_replace: isReplace.value,
    content: '',
    template_split_list: list,
  }
}

/**
 * 只保留 HTML 页同款的两条硬校验：模板名必填、json 类型的 value 要能 parse。
 * 章节标题和变量标题都允许为空：后端 V2VariableMapping.title 默认空串，
 * 且空 title 才能避开远端按 title 重生成 display_content 带来的标题重复。
 */
function validate(): string {
  if (!name.value.trim()) return '请填写模板名称'
  if (!splits.value.length) return '至少添加一个章节'
  for (const [si, split] of splits.value.entries()) {
    const label = split.section_title.trim() || `第 ${si + 1} 个章节`
    const all = [
      ...split.variables,
      ...split.subsections.flatMap(sub => sub.variables),
    ]
    for (const v of all) {
      if (v.type === 'json') {
        if (!v.key.trim()) return `「${label}」有 json 变量没填变量标识`
        if (v.value.trim()) {
          try {
            JSON.parse(v.value)
          } catch (e: any) {
            return `「${label}」变量「${v.key.trim()}」的 JSON 格式错误: ${e.message}`
          }
        }
      }
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

.var-head-hint {
  margin-left: 6px;
  color: #9aa3b5;
  font-style: normal;
  font-weight: 400;
}

/* ---- 二级标题分组 ---- */
.sub {
  margin: 10px 0;
  padding: 10px;
  border: 1px dashed #cdd6e5;
  border-radius: 8px;
  background: #f7f9fc;
}

.sub-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.sub-title {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 9px;
  border: 1px solid #d8dfeb;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: #2b3245;
}

.sub-title:focus {
  outline: none;
  border-color: #4a90e2;
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
