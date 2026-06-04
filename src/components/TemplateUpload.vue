<template>
	<div class="topbar">
		<i class="fa-solid fa-file-lines topbar-icon"></i>
		<button class="topbar-back" type="button" @click="emit('back-list')">
			<i class="fa-solid fa-arrow-left"></i>
			<span>返回列表</span>
		</button>
		<span class="topbar-separator">/</span>
		<span class="topbar-title">{{ topbarTitle }}</span>
		<span class="topbar-spacer"></span>

		<template v-if="showUpload">
			<input ref="fileInput" type="file" accept=".docx" class="topbar-file-input" @change="handleFile" />
			<button class="upload-btn" :class="{ parsing: loading }" :disabled="loading" @click="openFilePicker">
				<i class="fa-solid" :class="loading ? 'fa-spinner fa-spin' : 'fa-upload'"></i>
				<span>{{ loading ? '解析中...' : '上传 Word 模板' }}</span>
			</button>
			<span v-if="fileName" class="file-name">{{ fileName }}</span>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { uploadTemplate } from '../api/template'
import { useTemplateStore } from '../stores/template'

const props = withDefaults(defineProps<{
	mode?: 'create' | 'edit'
}>(), {
	mode: 'create',
})

const store = useTemplateStore()
const emit = defineEmits<{
	'back-list': []
}>()

const loading = ref(false)
const fileName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const showUpload = computed(() => props.mode === 'create' || props.mode === 'edit')
const topbarTitle = computed(() => {
	if (props.mode === 'create') return '新建模板'
	return store.templateName || '编辑模板'
})

function openFilePicker() {
	fileInput.value?.click()
}

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
	gap: 14px;
	padding: 10px 20px;
	background: #fff;
	border-bottom: 1px solid #e2e8f0;
}

.topbar-icon {
	color: #2563eb;
	font-size: 18px;
}

.topbar-back {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 0;
	border: none;
	background: transparent;
	color: #2563eb;
	cursor: pointer;
	font-size: 14px;
	font-weight: 600;
}

.topbar-back:hover {
	color: #1d4ed8;
}

.topbar-separator {
	color: #94a3b8;
	font-size: 14px;
}

.topbar-title {
	color: #334155;
	font-size: 14px;
	font-weight: 600;
	max-width: 360px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.topbar-spacer {
	flex: 1;
	min-width: 16px;
}

.topbar-file-input {
	display: none;
}

.upload-btn {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 36px;
	padding: 0 20px;
	border: 2px dashed #93c5fd;
	border-radius: 8px;
	background: #eff6ff;
	color: #2563eb;
	cursor: pointer;
	font-size: 13px;
	font-weight: 600;
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
	white-space: nowrap;
}
</style>
