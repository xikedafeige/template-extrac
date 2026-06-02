<template>
  <div class="topbar">
    <i class="fa-solid fa-file-lines topbar-icon"></i>
    <a class="topbar-link" href="javascript:void(0)">模板管理</a>
    <span class="topbar-separator">/</span>
    <span class="topbar-title">{{ store.templateName || '编辑模板' }}</span>
    <span class="topbar-spacer"></span>
    <input type="file" accept=".docx" @change="handleFile" ref="fileInput" style="display:none" />
    <button class="upload-btn" :class="{ parsing: loading }" @click="($refs.fileInput as HTMLInputElement).click()" :disabled="loading">
      <i class="fa-solid" :class="loading ? 'fa-spinner fa-spin' : 'fa-upload'"></i>
      <span>{{ loading ? '解析中...' : '上传 Word 模板' }}</span>
    </button>
    <span v-if="fileName" class="file-name">{{ fileName }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { uploadTemplate } from '../api/template'
import { useTemplateStore } from '../stores/template'

const store = useTemplateStore()
const loading = ref(false)
const fileName = ref('')

async function handleFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  fileName.value = file.name
  loading.value = true
  try {
    const res = await uploadTemplate(file)
    console.log('[upload response]', res)
    store.setUploadResult(res.template_markdown, res.placeholders, res.sections)
  } catch (err: any) {
    alert('上传失败: ' + (err.response?.data?.error || err.message))
  } finally {
    loading.value = false
    input.value = ''
  }
}
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.topbar-icon {
  color: #2563eb;
  font-size: 18px;
}

.topbar-link {
  color: #64748b;
  cursor: pointer;
  font-size: 14px;
  text-decoration: none;
}

.topbar-link:hover {
  color: #2563eb;
}

.topbar-separator {
  color: #94a3b8;
  font-size: 14px;
}

.topbar-title {
  color: #334155;
  font-size: 14px;
  font-weight: 600;
}

.topbar-spacer {
  flex: 1;
}

.upload-btn {
  height: 36px;
  padding: 0 20px;
  border-radius: 8px;
  border: 2px dashed #93c5fd;
  background: #eff6ff;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
}

.upload-btn:hover {
  background: #dbeafe;
  border-color: #60a5fa;
}

.upload-btn.parsing,
.upload-btn:disabled {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
  opacity: 0.8;
  cursor: not-allowed;
}

.file-name {
  color: #64748b;
  font-size: 13px;
}
</style>
