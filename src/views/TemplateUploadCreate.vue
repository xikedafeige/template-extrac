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
        <!-- 选择文件 -->
        <div v-if="!busy && !failed" class="picker" @dragover.prevent @drop.prevent="onDrop">
          <div class="picker-icon">↑</div>
          <div class="picker-title">选择或拖入 .docx 文件</div>
          <div class="picker-hint">解析完成后会自动建好模板并进入工作台</div>
          <button class="btn-primary" @click="openPicker">选择文件</button>
          <input ref="fileInput" type="file" accept=".docx" hidden @change="onPick" />
        </div>

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

const emit = defineEmits<{
  back: []
  created: [templateId: string]
}>()

const steps = ['上传文档', '解析正文与待填项、创建模板', '打开工作台']
const stepIndex = ref(0)
const busy = ref(false)
const failed = ref('')
const fileName = ref('')
const toast = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

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
    const created = await uploadTemplateToWorkbench(file)
    if (!created.success || !created.template_id) throw new Error('创建模板失败')

    stepIndex.value = 2
    emit('created', created.template_id)
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
  max-width: 520px;
  padding: 34px 30px;
  border: 1px solid #e6eaf2;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, .04);
}

/* ---- 选择文件 ---- */
.picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 26px 0;
  border: 1.5px dashed #cfdaea;
  border-radius: 12px;
  transition: border-color .18s ease, background .18s ease;
}

.picker:hover { border-color: #2563eb; background: #f9fbff; }

.picker-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #eff5ff;
  color: #1d4ed8;
  text-align: center;
  font-size: 20px;
  line-height: 44px;
}

.picker-title {
  color: #1f2937;
  font-size: 15px;
  font-weight: 600;
}

.picker-hint {
  margin-bottom: 6px;
  color: #8b93a3;
  font-size: 12px;
}

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
