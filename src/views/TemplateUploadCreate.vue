<template>
  <div class="upload-page">
    <div class="page-head">
      <div class="head-left">
        <div class="brand"><i />上传文档解析</div>
        <div class="crumb">选一份 Word，自动抽取正文与待填项</div>
      </div>
      <div class="grow" />
      <button class="btn-secondary" :disabled="busy" @click="emit('back')">返回列表</button>
    </div>

    <div class="body">
      <div class="panel">
        <!-- 空闲态：选类型 + 选文件。两块必须包在同一个 v-if 里，
             否则下面的 busy / failed 分支会接错条件 -->
        <template v-if="!busy && !failed">
          <!-- 类型选择：仅 URL 没带 type 时出现；带了就以 URL 为准，不让用户改 -->
          <section v-if="needKindPick" class="field">
            <div class="field-head">
              <span class="field-no">1</span>
              <div class="field-text">
                <div class="field-title">选择模板类型</div>
                <div class="field-desc">决定解析方式与编辑页形式，选错需重新上传</div>
              </div>
            </div>
            <div class="kind-opts">
              <label
                v-for="opt in kindOptions"
                :key="opt.value"
                class="kind-opt"
                :class="{ 'is-active': pickedKind === opt.value }"
              >
                <input
                  v-model="pickedKind"
                  type="radio"
                  name="template-kind"
                  :value="opt.value"
                  class="sr-only"
                />
                <span class="kind-tick" aria-hidden="true" />
                <span class="kind-name">{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <!-- 预算绩效类型：与类型选择同条件出现。后端只在 type=1 且带
               commission_task_id 时能从达梦推出阶段，直接打开页面时推不出来，
               正好由用户手选补上 -->
          <section v-if="needKindPick" class="field">
            <div class="field-head">
              <span class="field-no">2</span>
              <div class="field-text">
                <div class="field-title">选择预算绩效类型</div>
                <div class="field-desc">对应模板的评审阶段，入库后可在列表页查看</div>
              </div>
            </div>
            <div class="kind-opts kind-opts--stage">
              <label
                v-for="opt in stageOptions"
                :key="opt.value"
                class="kind-opt"
                :class="{ 'is-active': pickedStage === opt.value }"
              >
                <input
                  v-model="pickedStage"
                  type="radio"
                  name="review-stage"
                  :value="opt.value"
                  class="sr-only"
                />
                <span class="kind-tick" aria-hidden="true" />
                <span class="kind-name">{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <!-- 选择文件 -->
          <section class="field">
            <div v-if="needKindPick" class="field-head">
              <span class="field-no">3</span>
              <div class="field-text">
                <div class="field-title">上传 Word 文档</div>
                <div class="field-desc">解析完成后自动建好模板并进入工作台</div>
              </div>
            </div>

            <div
              class="picker"
              :class="{ 'is-over': dragOver }"
              role="button"
              tabindex="0"
              @click="openPicker"
              @keydown.enter.prevent="openPicker"
              @keydown.space.prevent="openPicker"
              @dragover.prevent="dragOver = true"
              @dragenter.prevent="dragOver = true"
              @dragleave="dragOver = false"
              @drop.prevent="onDrop"
            >
              <div class="picker-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 16V4" />
                  <path d="M7.5 8.5 12 4l4.5 4.5" />
                  <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" />
                </svg>
              </div>
              <div class="picker-title">点击选择，或拖入文件</div>
              <div class="picker-hint">仅支持 .docx 格式</div>
              <span class="picker-btn">选择文件</span>
              <input ref="fileInput" type="file" accept=".docx" hidden @change="onPick" />
            </div>
          </section>
        </template>

        <!-- 进度 -->
        <div v-else-if="busy" class="progress">
          <div class="spinner" />
          <div class="progress-file">{{ fileName }}</div>
          <ol class="steps">
            <li v-for="(s, i) in steps" :key="s" :class="stepClass(i)">
              <span class="dot">{{ i < stepIndex ? '✓' : i + 1 }}</span>
              <span>{{ s }}</span>
            </li>
          </ol>
          <p class="progress-hint">解析要调大模型逐章抽取，文档较长时可能要一两分钟，请不要关闭页面。</p>
        </div>

        <!-- 失败 -->
        <div v-else class="failed">
          <div class="failed-icon">!</div>
          <div class="failed-title">{{ failed }}</div>
          <div class="failed-file">{{ fileName }}</div>
          <div class="failed-actions">
            <button class="btn-secondary" @click="reset">重新选择</button>
            <button class="btn-secondary" @click="emit('back')">返回列表</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="toast" class="toast toast--err">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { uploadTemplateToWorkbench } from '../api/template'
import { getUrlContext } from '../api/urlContext'
import { TEMPLATE_KIND_OPTIONS, REVIEW_STAGE_OPTIONS } from '../types/listEnums'

const emit = defineEmits<{
  back: []
  created: [templateId: string, templateType: string]
}>()

const steps = ['上传文档', '解析正文与待填项、创建模板', '打开工作台']
const stepIndex = ref(0)
const busy = ref(false)
const failed = ref('')
const fileName = ref('')
const toast = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | undefined

// URL 带了 type 就按外部系统的分流走，不展示选择框；没带（比如直接打开
// 页面）才让用户选，选中值作为 fallback 传给后端。只在初始化时读一次：
// 上传页停留期间 URL 不会变。
const needKindPick = !getUrlContext().type
const kindOptions = TEMPLATE_KIND_OPTIONS
const pickedKind = ref(kindOptions[0]?.value || '')

// 预算绩效类型同理：后端能从达梦推出阶段时以后端为准，推不出来才用这个值。
// 默认预选「事后」——不预选时用户容易直接跳过，库里会留空 review_stage，
// 列表页的阶段 tag 渲染成空白。后端同样有 DEFAULT_REVIEW_STAGE 兜底。
const stageOptions = REVIEW_STAGE_OPTIONS
const DEFAULT_STAGE = 'post'
const pickedStage = ref(
  stageOptions.some(o => o.value === DEFAULT_STAGE) ? DEFAULT_STAGE : (stageOptions[0]?.value || ''),
)

function stepClass(i: number) {
  if (i < stepIndex.value) return 'done'
  if (i === stepIndex.value) return 'active'
  return ''
}

function showToast(text: string) {
  toast.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 4000)
}

function openPicker() {
  fileInput.value?.click()
}

function reset() {
  failed.value = ''
  fileName.value = ''
  stepIndex.value = 0
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void run(file)
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void run(file)
}


async function run(file: File) {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    showToast('仅支持 .docx 文件')
    return
  }
  fileName.value = file.name
  failed.value = ''
  busy.value = true
  stepIndex.value = 0

  try {
    stepIndex.value = 1
    // 后端一次把「解析 → 建模板 → 生成 Word」做完，直接回 template_id。
    // 不在前端重拼 sections 再调 submit：占位符按章节归位的规则在后端，
    // 前端再拼一份很容易和后端走叉。
    const created = await uploadTemplateToWorkbench(
      file,
      needKindPick ? pickedKind.value : '',
      needKindPick ? pickedStage.value : '',
    )
    if (!created.success || !created.template_id) throw new Error('创建模板失败')

    stepIndex.value = 2
    // 类型以后端落库结果为准：后端靠 URL 上的 type 分流，工作记录表会回
    // template_type=WORK_LOG，其余类型不回（空字串即走通用工作台）。
    emit('created', created.template_id, created.template_type || '')
  } catch (err: any) {
    failed.value = err.response?.data?.error || err.response?.data?.message || err.message || '处理失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.upload-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fb;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

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

.btn-primary,
.btn-secondary {
  height: 34px;
  padding: 0 16px;
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

.btn-secondary {
  border: 1px solid #d6dfed;
  background: #ffffff;
  color: #355173;
}

.btn-secondary:hover:not(:disabled) { border-color: #2563eb; color: #2563eb; }

.btn-primary:disabled,
.btn-secondary:disabled { opacity: .6; cursor: not-allowed; }

.body {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
}

.panel {
  width: 100%;
  max-width: 560px;
  padding: 30px 32px 32px;
  border: 1px solid #e8edf6;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04), 0 12px 32px -12px rgba(15, 23, 42, .12);
}

/* 只读屏幕阅读器可见：单选框视觉上自绘，但要保留原生键盘与焦点语义 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ---- 分步小节 ---- */
.field + .field { margin-top: 26px; }

.field-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.field-no {
  flex: 0 0 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  background: #eff5ff;
  color: #1d4ed8;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
}

.field-text { min-width: 0; }

.field-title {
  color: #111827;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.field-desc {
  margin-top: 3px;
  color: #8b93a3;
  font-size: 12px;
  line-height: 1.5;
}

/* ---- 类型选择 ---- */
.kind-opts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.kind-opt {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 14px;
  border: 1px solid #e1e8f3;
  border-radius: 10px;
  background: #ffffff;
  color: #44546b;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.3;
  transition: border-color .16s ease, background .16s ease, color .16s ease, box-shadow .16s ease;
}

.kind-opt:hover { border-color: #b9ccea; background: #fbfdff; }

.kind-opt.is-active {
  border-color: #2563eb;
  background: #f5f9ff;
  color: #1d4ed8;
  font-weight: 600;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .09);
}

/* 自绘圆点：原生 radio 各平台尺寸不一致 */
.kind-tick {
  position: relative;
  flex: 0 0 15px;
  height: 15px;
  border: 1.5px solid #c6d2e4;
  border-radius: 50%;
  background: #ffffff;
  transition: border-color .16s ease;
}

.kind-opt.is-active .kind-tick { border-color: #2563eb; }

.kind-opt.is-active .kind-tick::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2563eb;
  transform: translate(-50%, -50%);
}

/* 键盘聚焦环：原生 radio 被视觉隐藏后要把焦点表现补到卡片上 */
.kind-opt:focus-within {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .18);
}

.kind-name { min-width: 0; white-space: nowrap; }

/* 预算绩效类型是 4 项，面板内宽 494px 装不下 4×150+间隙，
   auto-fit + 150px 会把第 4 项挤到第二行。这里固定 4 列并把卡片收窄。
   窄屏（面板实际宽度 < 460px）再回落到两列，避免文字被压缩换行。 */
.kind-opts--stage {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.kind-opts--stage .kind-opt {
  gap: 7px;
  padding: 11px 10px;
  font-size: 12.5px;
}

@media (max-width: 460px) {
  .kind-opts--stage { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kind-opts--stage .kind-opt { font-size: 13px; padding: 12px 12px; }
}

/* ---- 选择文件 ---- */
.picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 30px 20px 26px;
  border: 1.5px dashed #d2ddee;
  border-radius: 12px;
  background: #fcfdff;
  cursor: pointer;
  text-align: center;
  transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
}

.picker:hover,
.picker:focus-visible {
  border-color: #2563eb;
  background: #f5f9ff;
  outline: none;
}

.picker:focus-visible { box-shadow: 0 0 0 3px rgba(37, 99, 235, .18); }

/* 拖拽悬停：比 hover 更强的反馈，让落点区域明确 */
.picker.is-over {
  border-color: #2563eb;
  border-style: solid;
  background: #eef5ff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .12);
}

.picker-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  margin-bottom: 3px;
  border-radius: 13px;
  background: #eff5ff;
  color: #2563eb;
  transition: transform .18s ease;
}

.picker-icon svg { width: 23px; height: 23px; }

.picker:hover .picker-icon,
.picker.is-over .picker-icon { transform: translateY(-2px); }

.picker-title {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}

.picker-hint {
  margin-bottom: 11px;
  color: #98a1b3;
  font-size: 12px;
}

/* 看着像按钮，实际是 span：整张卡片已经是触发区，
   嵌真按钮会产生嵌套点击目标 */
.picker-btn {
  padding: 8px 18px;
  border-radius: 8px;
  background: #2563eb;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  transition: background .16s ease;
}

.picker:hover .picker-btn { background: #1d4ed8; }

/* ---- 进度 ---- */
.progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #e3ebf8;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.progress-file {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  word-break: break-all;
}

.steps {
  width: 100%;
  max-width: 300px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.steps li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  color: #a3abbb;
  font-size: 13px;
}

.steps li.done { color: #55607a; }

.steps li.active { color: #1d4ed8; font-weight: 600; }

.dot {
  flex: 0 0 20px;
  height: 20px;
  border-radius: 50%;
  background: #eef1f6;
  color: #98a1b3;
  text-align: center;
  font-size: 11px;
  line-height: 20px;
}

.steps li.done .dot { background: #e6f6ed; color: #1a7f45; }

.steps li.active .dot { background: #2563eb; color: #ffffff; }

.progress-hint {
  margin: 0;
  color: #98a1b3;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

/* ---- 失败 ---- */
.failed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.failed-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fef2f2;
  color: #dc2626;
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  line-height: 40px;
}

.failed-title {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  line-height: 1.6;
}

.failed-file {
  color: #98a1b3;
  font-size: 12px;
  word-break: break-all;
}

.failed-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

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

.toast--err { background: #dc2626; }
</style>
