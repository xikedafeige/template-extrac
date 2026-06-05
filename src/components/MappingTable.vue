<template>
	<div class="mapping-table" v-if="store.placeholders.length" @dragstart.prevent @drop.prevent>
		<div class="mapping-header">
			<label>模板名称：</label>
			<input v-model="store.templateName" placeholder="输入模板名称" />
			<label>模板描述：</label>
			<input v-model="store.templateDescription" placeholder="输入模板描述（可选）" />
			<label>业务ID：</label>
			<input v-model="store.customId" placeholder="可选" class="mapping-header__id" />
		</div>

		<div class="mapping-list" ref="listRef">
			<div v-for="ph in sortedPlaceholders" :key="ph.key" :data-ph-key="ph.key" class="mapping-item" :class="{
				'mapping-item--selected': store.selectedChipKey === ph.key,
				[`mapping-item--${ph.type}`]: true,
			}" @click="store.selectChip(ph.key)">
				<div class="mapping-item-header">
					<input class="mapping-key-input" :value="ph.key"
						@change="renameKey(ph.key, ($event.target as HTMLInputElement).value)" @focus="store.selectChip(ph.key)"
						@click.stop />
					<span class="mapping-type-badge" :class="`badge--${ph.type}`">
						{{ typeLabel(ph.type) }}
					</span>
				</div>

				<div v-if="formatKeyPosition(ph.key)" class="mapping-position">
					{{ formatKeyPosition(ph.key) }}
				</div>
				<div class="mapping-item-original">
					<div class="mapping-preview-label">原文内容</div>
					<div class="mapping-original-text" v-html="renderPlaceholderOriginal(ph)"></div>
				</div>

				<!-- TYPE_FILL: 字段绑定 -->
				<div v-if="ph.type === 'TYPE_FILL'" class="mapping-field">
					<label>绑定字段：</label>
					<select :value="ph.field" @change="updateField(ph.key, ($event.target as HTMLSelectElement).value)">
						<option :value="null">-- 未绑定 --</option>
						<option v-for="f in store.availableFields" :key="f" :value="f">{{ f }}</option>
					</select>
				</div>

				<!-- TYPE_DESCRIPTION: prompt -->
				<div v-if="ph.type === 'TYPE_DESCRIPTION'" class="mapping-prompt">
					<label>提示词：</label>
					<textarea :value="ph.prompt || ''" @input="updatePrompt(ph.key, ($event.target as HTMLTextAreaElement).value)"
						rows="2" />
					<button class="generate-prompt-btn" :disabled="generatingKey === ph.key" @click.stop="generatePrompt(ph.key)">
						<i class="fa-solid" :class="generatingKey === ph.key ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'"></i>
						{{ generatingKey === ph.key ? '生成中...' : 'AI 生成' }}
					</button>
				</div>

				<div class="mapping-actions">
					<button @click.stop="changeType(ph.key)">改类型</button>
					<button @click.stop="removePh(ph.key)">删除</button>
				</div>
			</div>
		</div>

		<div class="mapping-footer">
			<span class="mapping-count">共 {{ store.placeholders.length }} 个占位符</span>
			<button class="submit-btn" :disabled="submitting" @click="handleSubmit">
				<i class="fa-solid" :class="submitting ? 'fa-spinner fa-spin' : 'fa-paper-plane'"></i>
				<span>{{ submitting ? '提交中...' : submitButtonText }}</span>
			</button>
		</div>
	</div>
	<div v-else class="mapping-table" @dragstart.prevent @drop.prevent>
		<div class="mapping-header">
			<label>模板名称：</label>
			<input v-model="store.templateName" placeholder="输入模板名称" />
			<label>模板描述：</label>
			<input v-model="store.templateDescription" placeholder="输入模板描述（可选）" />
			<label>业务ID：</label>
			<input v-model="store.customId" placeholder="可选" class="mapping-header__id" />
		</div>
		<div class="mapping-empty">暂无占位符</div>
		<div class="mapping-footer">
			<span class="mapping-count">共 0 个占位符</span>
			<button class="submit-btn" disabled>
				<i class="fa-solid fa-paper-plane"></i>
				<span>提交填充</span>
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useTemplateStore } from '../stores/template'
import { editTemplate, submitTemplate, generatePlaceholderPrompt } from '../api/template'
import { escapeHtml, renderOriginalMarkdown } from '../utils/markdownOriginal'
import { computed, watch, ref, nextTick } from 'vue'

const props = defineProps<{
	isEditMode?: boolean
}>()

const emit = defineEmits<{
	submit: []
	edit: []
}>()

const store = useTemplateStore()
const listRef = ref<HTMLElement | null>(null)
const submitting = ref(false)
const generatingKey = ref<string | null>(null)
const sortedPlaceholders = computed(() => store.sortPlaceholders(store.placeholders))
const submitButtonText = computed(() => props.isEditMode ? '保存修改' : '提交填充')

watch(
	() => [store.selectedChipKey, store.selectedChipVersion] as const,
	async ([key]) => {
		if (!key) return
		await nextTick()
		if (!listRef.value) return

		const el = listRef.value.querySelector(`[data-ph-key="${key}"]`) as HTMLElement | null
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
			// 短暂闪烁吸引注意
			el.classList.add('mapping-item--flash')
			setTimeout(() => el.classList.remove('mapping-item--flash'), 800)
		}
	}
)

const TYPE_CYCLE = ['TYPE_FILL', 'TYPE_DESCRIPTION'] as const

function typeLabel(type: string) {
	const map: Record<string, string> = {
		TYPE_FILL: '填充',
		TYPE_DESCRIPTION: '描述',
	}
	return map[type] || type
}

function renderPlaceholderOriginal(ph: { original?: string; originalHtml?: string }) {
	const source = ph.originalHtml || ph.original || ''
	return source ? renderOriginalMarkdown(source) : escapeHtml('-')
}

function updateField(key: string, value: string) {
	store.updatePlaceholder(key, { field: value || null })
}

function updatePrompt(key: string, value: string) {
	store.updatePlaceholder(key, { prompt: value || null })
}

async function generatePrompt(key: string) {
	if (generatingKey.value) return
	const ph = store.placeholders.find(p => p.key === key)
	if (!ph) return

	generatingKey.value = key
	try {
		// 构建 template_content：标题 + template_content 拼接，保留 {{key}} 以便后续替换
		const phMap = new Map(store.placeholders.map(p => [p.key, p]))
		const mdParts: string[] = []
		for (const sec of store.sections) {
			if (sec.title) mdParts.push(sec.title)
			if (sec.template_content) mdParts.push(sec.template_content)
		}
		const allTemplateContent = mdParts.join('\n\n')

		// 除了当前 key 外，其他 {{key}} 都替换为原文
		const contextWithOriginals = allTemplateContent.replace(
			/\{\{([\w]+)\}\}/g,
			(_, k) => {
				if (k === key) return `{{${k}}}`
				return phMap.get(k)?.original ?? `{{${k}}}`
			}
		)

		const res = await generatePlaceholderPrompt({
			placeholder_key: key,
			text_fragment: ph.original || '',
			template_content: contextWithOriginals,
		})

		if (res.success && res.generated_prompt) {
			store.updatePlaceholder(key, { prompt: res.generated_prompt })
		}
	} catch (err) {
		console.error('[generatePrompt] error:', err)
		alert('生成提示词失败，请重试')
	} finally {
		generatingKey.value = null
	}
}

function changeType(key: string) {
	const ph = store.placeholders.find(p => p.key === key)
	if (!ph) return
	const idx = TYPE_CYCLE.indexOf(ph.type as any)
	const nextType = TYPE_CYCLE[(idx + 1) % TYPE_CYCLE.length]
	store.updatePlaceholder(key, {
		type: nextType,
		fill_mode: nextType === 'TYPE_DESCRIPTION' ? 'newline' : 'inline',
		field: nextType === 'TYPE_DESCRIPTION' ? null : ph.field,
		prompt: nextType === 'TYPE_FILL' ? null : ph.prompt,
	})
	store.selectChip(key)
}

function removePh(key: string) {
	store.removePlaceholder(key)
}

function renameKey(oldKey: string, newKey: string) {
	const trimmed = store.normalizePlaceholderKey(newKey)
	if (!trimmed || trimmed === oldKey) return
	if (store.placeholders.some(p => store.normalizePlaceholderKey(p.key) === trimmed)) {
		alert('该 key 名已存在')
		return
	}
	store.renamePlaceholder(oldKey, trimmed)
}

async function handleSubmit() {
	if (submitting.value) return
	submitting.value = true
	try {
		const sections = store.buildSubmitSections()

		if (props.isEditMode && store.templateId) {
			const payload = {
				template_id: store.templateId,
				template_markdown: store.templateMarkdown,
				sections,
				template_name: store.templateName,
				template_description: store.templateDescription,
				custom_id: store.customId,
			}
			console.log('[edit payload]', payload)
			// return
			const res = await editTemplate(payload)
			alert(`保存成功！template_id: ${res.template_id}`)
			console.log('[edit response]', res)
			emit('edit')
			return
		}

		const payload = {
			template_markdown: store.templateMarkdown,
			sections,
			template_name: store.templateName,
			template_description: store.templateDescription,
			custom_id: store.customId,
		}
		console.log('[submit payload]', payload)
		const res = await submitTemplate(payload)
		alert(`提交成功！template_id: ${res.template_id}`)
		console.log('[submit response]', res)
		store.templateId = res.template_id
		store.isEditMode = true
		emit('submit')
	} catch (err: any) {
		alert('操作失败: ' + (err.response?.data?.error || err.message))
	} finally {
		submitting.value = false
	}
}

function formatKeyPosition(key: string) {
	const matched = key.match(/^key_(\d+)_(\d+)_(md|json)$/)
	if (!matched) return ''
	return `第${matched[1]}章第${matched[2]}节`
}

function extractTableHtml(value?: string | null) {
	if (!value) return ''
	const trimmed = value.trim()
	if (!trimmed) return ''

	const decoded = decodeHtmlEntities(trimmed)
	const matched = decoded.match(/<table\b[\s\S]*?<\/table>/i)
	return matched ? matched[0] : ''
}

function decodeHtmlEntities(value: string) {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
}
</script>

<style scoped>
.mapping-table {
	display: flex;
	flex-direction: column;
	height: 100%;
	background:
		linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.96)),
		radial-gradient(circle at top right, rgba(191, 219, 254, 0.35), transparent 28%);
}

.mapping-header {
	padding: 14px 14px 12px;
	border-bottom: 1px solid #dbe3ef;
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: 10px;
	background: rgba(255, 255, 255, 0.92);
	backdrop-filter: blur(8px);
}

.mapping-header label {
	color: #334155;
	font-size: 12px;
	font-weight: 600;
	white-space: nowrap;
	letter-spacing: 0.01em;
}

.mapping-header input,
.mapping-field select,
.mapping-prompt textarea {
	border: 1px solid #d1dae6;
	border-radius: 8px;
	background: #ffffff;
	color: #0f172a;
	box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
}

.mapping-header input {
	min-width: 0;
	height: 34px;
	padding: 0 10px;
	font-size: 13px;
}

.mapping-list {
	flex: 1;
	overflow-y: auto;
	padding: 14px;
}

.mapping-item {
	padding: 14px;
	margin-bottom: 12px;
	border: 1px solid rgba(203, 213, 225, 0.75);
	border-radius: 12px;
	background: rgba(255, 255, 255, 0.96);
	cursor: pointer;
	box-shadow: 0 12px 26px rgba(15, 23, 42, 0.05);
	transition: border-color 0.15s, box-shadow 0.15s, background 0.15s, transform 0.15s;
}

.mapping-item:hover {
	border-color: #93c5fd;
	box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
	transform: translateY(-1px);
}

.mapping-item--selected {
	border-color: #3b82f6;
	background: linear-gradient(180deg, #f8fbff, #eff6ff);
	box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12), 0 16px 30px rgba(59, 130, 246, 0.08);
}

.mapping-item-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 6px;
}

.mapping-key {
	font-family: monospace;
	font-size: 12px;
	color: #6b7280;
}

.mapping-type-badge {
	font-size: 11px;
	padding: 3px 10px;
	border-radius: 999px;
	font-weight: 600;
	flex-shrink: 0;
}

.badge--TYPE_FILL {
	background: #dcfce7;
	color: #15803d;
}

.badge--TYPE_DESCRIPTION {
	background: #dbeafe;
	color: #1d4ed8;
}

.mapping-position {
	display: inline-flex;
	align-items: center;
	margin-bottom: 8px;
	padding: 3px 8px;
	border-radius: 999px;
	background: #f1f5f9;
	color: #475569;
	font-size: 12px;
	font-weight: 600;
}

.mapping-position::before {
	content: "\f3c5";
	display: inline-block;
	flex: none;
	margin-right: 4px;
	font-family: "Font Awesome 7 Free";
	font-style: normal;
	font-size: 12px;
	font-weight: 900;
}

.mapping-item-original {
	margin-bottom: 8px;
	padding: 10px;
	border: 1px solid #e2e8f0;
	border-radius: 8px;
	background: #f8fafc;
	overflow: hidden;
}

.mapping-field,
.mapping-prompt {
	margin-bottom: 8px;
}

.mapping-field label,
.mapping-prompt label {
	font-size: 12px;
	color: #475569;
	display: block;
	margin-bottom: 4px;
	font-weight: 600;
}

.mapping-field label::before,
.mapping-prompt label::before,
.mapping-preview-label::before {
	display: inline-block;
	flex: none;
	margin-right: 4px;
	font-family: "Font Awesome 7 Free";
	font-style: normal;
	font-weight: 900;
}

.mapping-field label::before {
	content: "\f1e6";
}

.mapping-prompt label::before {
	content: "\f27a";
}

.mapping-preview-label::before {
	content: "\f15c";
}

.mapping-field select {
	width: 100%;
	height: 34px;
	padding: 0 10px;
}

.mapping-prompt textarea {
	width: 100%;
	min-height: 52px;
	padding: 8px 10px;
	font-size: 13px;
	line-height: 1.5;
	resize: vertical;
}

.generate-prompt-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-top: 6px;
	padding: 4px 10px;
	font-size: 12px;
	border: 1px solid #a78bfa;
	border-radius: 6px;
	background: #f5f3ff;
	color: #7c3aed;
	cursor: pointer;
	transition: all 0.15s;
}

.generate-prompt-btn:hover:not(:disabled) {
	background: #ede9fe;
	border-color: #7c3aed;
}

.generate-prompt-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.mapping-actions {
	display: flex;
	gap: 8px;
}

.mapping-actions button {
	height: 28px;
	padding: 0 12px;
	font-size: 12px;
	border: 1px solid #cbd5e1;
	border-radius: 6px;
	background: #ffffff;
	color: #334155;
	cursor: pointer;
	transition: all 0.15s;
	display: flex;
	align-items: center;
	gap: 4px;
}

.mapping-actions button:hover {
	border-color: #93c5fd;
	color: #2563eb;
	background: #fff;
}

.mapping-actions button:first-child::before,
.mapping-actions button:last-child::before {
	display: inline-block;
	flex: none;
	font-family: "Font Awesome 7 Free";
	font-style: normal;
	font-weight: 900;
}

.mapping-actions button:first-child::before {
	content: "\f2f1";
}

.mapping-actions button:last-child::before {
	content: "\f2ed";
}

.mapping-actions button:last-child:hover {
	border-color: #fca5a5;
	color: #dc2626;
}

.mapping-footer {
	padding: 12px 14px;
	border-top: 1px solid #dbe3ef;
	background: rgba(255, 255, 255, 0.94);
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.mapping-count {
	font-size: 13px;
	color: #64748b;
}

.submit-btn {
	height: 38px;
	padding: 0 24px;
	background: #2563eb;
	color: white;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 600;
	transition: all 0.15s;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
}

.submit-btn:hover {
	background: #1d4ed8;
}

.submit-btn:disabled {
	background: #94a3b8;
	cursor: not-allowed;
}

.mapping-item--flash {
	animation: flash-highlight 0.8s ease;
}

@keyframes flash-highlight {
	0% {
		background: #fef9c3;
		border-color: #eab308;
	}

	100% {
		background: inherit;
		border-color: inherit;
	}
}

.mapping-key-input {
	font-size: 13px;
	font-weight: 600;
	color: #1f2937;
	border: 1px solid transparent;
	border-radius: 6px;
	padding: 4px 6px;
	background: transparent;
	min-width: 0;
	max-width: 210px;
	flex: 1;
	outline: none;
}

.mapping-key-input:hover {
	border-color: #d1d5db;
}

.mapping-key-input:focus {
	border-color: #3b82f6;
	background: white;
}

.mapping-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	flex-direction: column;
	height: 100%;
	color: #94a3b8;
	font-size: 14px;
	text-align: center;
	background: transparent;
}

.mapping-empty::before {
	content: "\f02c";
	display: block;
	margin-bottom: 12px;
	font-family: "Font Awesome 7 Free";
	font-size: 36px;
	font-style: normal;
	font-weight: 900;
}

.mapping-preview-label {
	padding: 0 0 4px;
	border-bottom: 0;
	background: transparent;
	color: #94a3b8;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0;
	text-transform: none;
}

.mapping-original-text {
	padding: 0;
	color: #64748b;
	font-size: 13px;
	line-height: 1.6;
	white-space: normal;
	word-break: break-word;
}

.mapping-original-text :deep(p) {
	margin: 0;
}

.mapping-original-text :deep(code) {
	padding: 1px 4px;
	border-radius: 4px;
	background: #f1f5f9;
	color: #475569;
}

.mapping-original-text :deep(a) {
	color: #2563eb;
	text-decoration: none;
}

.mapping-table-preview {
	max-width: 100%;
	overflow-x: auto;
	padding: 0;
	background: transparent;
}

.mapping-table-preview :deep(table) {
	width: 100%;
	min-width: 680px;
	border-collapse: collapse;
	background: #ffffff;
	font-size: 12px;
	line-height: 1.45;
}

.mapping-table-preview :deep(td),
.mapping-table-preview :deep(th) {
	min-width: 70px;
	padding: 6px 8px;
	border: 1px solid #cbd5e1;
	color: #334155;
	vertical-align: top;
	white-space: normal;
	word-break: break-word;
	overflow-wrap: anywhere;
}

.mapping-table-preview :deep(th) {
	background: #f1f5f9;
	color: #334155;
	font-weight: 600;
}
</style>
