<template>
	<div class="editor-container" v-if="store.templateMarkdown" @dragstart.prevent @drop.prevent>
		<div class="editor-toolbar">
			<div class="editor-toolbar__title">
				<span>模板内容</span>
				<strong v-if="sectionTitleCount">{{ sectionTitleCount }} 个章节</strong>
			</div>
			<div class="editor-toolbar__actions">
				<button @click="addChipFromSelection" :disabled="!hasSelection">添加占位符</button>
				<button @click="undoDelete" :disabled="store.deletedStack.length === 0">撤销删除</button>
			</div>
		</div>
		<editor-content
			:editor="editor"
			class="editor-content"
			@dragstart.prevent
			@drop.prevent
		/>
	</div>
	<div v-else class="editor-container" @dragstart.prevent @drop.prevent>
		<div class="editor-toolbar">
			<div class="editor-toolbar__title">
				<span>模板内容</span>
			</div>
			<div class="editor-toolbar__actions">
				<button disabled>添加占位符</button>
				<button disabled>撤销删除</button>
			</div>
		</div>
		<div class="editor-placeholder">请先上传 Word 模板</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection } from '@tiptap/pm/state'
import { DOMSerializer } from '@tiptap/pm/model'
import { ChipNode } from '../editor/ChipNode'
import { HtmlBlockNode } from '../editor/HtmlBlockNode'
import { useTemplateStore } from '../stores/template'
import '../editor/chipStyles.css'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: true, breaks: false, linkify: false })
const tablePattern = /<table\b[\s\S]*?<\/table>/gi

const store = useTemplateStore()
const hasSelection = ref(false)
let skipNextSync = false
let editorReady = false
let preserveClickedSelection = false

const sectionTitleCount = computed(() => getUniqueSectionTitles().length)

const TYPE_CLASSES: Record<string, string> = {
	TYPE_FILL: 'chip--TYPE_FILL',
	TYPE_DESCRIPTION: 'chip--TYPE_DESCRIPTION',
}
const ALL_TYPE_CLASSES = Object.values(TYPE_CLASSES)

function getEditorDom(): HTMLElement | null {
	return editor.value?.view?.dom as HTMLElement | null
}

function findChipElement(key: string): HTMLElement | null {
	const editorDom = getEditorDom()
	if (!editorDom) return null
	return editorDom.querySelector(`span[data-chip][data-key="${key}"]`) as HTMLElement | null
}

function findTableBlockElement(key: string): HTMLElement | null {
	const editorDom = getEditorDom()
	if (!editorDom) return null
	return editorDom.querySelector(`div[data-html-block][data-chip-key="${key}"]`) as HTMLElement | null
}

function findKeyTargetElement(key: string): HTMLElement | null {
	return findTableBlockElement(key) || findChipElement(key)
}

function clearTargetState(key: string) {
	const chip = findChipElement(key)
	if (chip) {
		chip.classList.remove('chip--selected', 'chip--flash')
	}

	const tableBlock = findTableBlockElement(key)
	if (tableBlock) {
		tableBlock.classList.remove('html-block--selected', 'html-block--flash')
	}
}

function focusTarget(key: string) {
	const target = findKeyTargetElement(key)
	if (!target) return

	if (target.matches('span[data-chip]')) {
		target.classList.add('chip--selected', 'chip--flash')
		window.setTimeout(() => target.classList.remove('chip--flash'), 900)
	} else {
		target.classList.add('html-block--selected', 'html-block--flash')
		window.setTimeout(() => target.classList.remove('html-block--flash'), 900)
	}

	scrollEditorToTarget(target)
}

function scrollEditorToTarget(target: HTMLElement) {
	const scrollContainer = target.closest('.editor-content') as HTMLElement | null
	if (!scrollContainer) return

	const containerRect = scrollContainer.getBoundingClientRect()
	const targetRect = target.getBoundingClientRect()
	const targetTop = targetRect.top - containerRect.top + scrollContainer.scrollTop
	const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
	const nextScrollTop = Math.min(Math.max(targetTop - 72, 0), Math.max(maxScrollTop, 0))

	scrollContainer.scrollTo({
		top: nextScrollTop,
		behavior: 'smooth',
	})
}

function applyChipType(key: string, newType: string) {
	const el = findChipElement(key)
	if (el) {
		el.setAttribute('data-type', newType)
		el.classList.remove(...ALL_TYPE_CLASSES)
		const cls = TYPE_CLASSES[newType]
		if (cls) el.classList.add(cls)
	}

	const block = findTableBlockElement(key)
	if (block) {
		block.setAttribute('data-chip-type', newType)
		block.style.borderColor = '#86efac'
		block.style.background = '#f0fdf4'
	}
}

watch(
	() => store.placeholders.map(p => `${p.key}:${p.type}`).join('|'),
	() => {
		if (!editorReady) return
		for (const ph of store.placeholders) {
			applyChipType(ph.key, ph.type)
		}
	}
)

watch(
	() => store.selectedChipKey,
	async (newKey, oldKey) => {
		if (!editorReady) return
		if (oldKey) clearTargetState(oldKey)
		if (!newKey) return

		await nextTick()
		focusTarget(newKey)
	}
)

const editor = useEditor({
	extensions: [
		StarterKit,
		HtmlBlockNode,
		ChipNode,
	],
	editorProps: {
		handleClick(_view, _pos, event) {
			const key = getClickedPlaceholderKey(event.target)
			if (!key) return false

			preserveClickedSelection = true
			store.selectChip(key)
			return false
		},
	},
	content: '',
	onCreate({ editor: ed }) {
		editorReady = true
		disableEditorDrag(ed)
		if (store.templateMarkdown) {
			ed.commands.setContent(buildEditorHtml())
			nextTick(() => scanChips(ed))
		}
	},
	onSelectionUpdate({ editor: ed }) {
		const { from, to } = ed.state.selection
		hasSelection.value = from !== to
	},
	onTransaction({ editor: ed }) {
		if (preserveClickedSelection) {
			preserveClickedSelection = false
			return
		}

		const sel = ed.state.selection
		if (sel instanceof NodeSelection && sel.node.type.name === 'chip') {
			store.selectChip(sel.node.attrs.key)
		} else {
			const { $from } = sel
			const chipNode = $from.node($from.depth)
			if (chipNode && chipNode.type.name === 'chip') {
				store.selectChip(chipNode.attrs.key)
			} else {
				store.selectChip(null)
			}
		}
	},
})

function getClickedPlaceholderKey(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) return null

	const placeholder = target.closest('[data-chip], [data-html-block]') as HTMLElement | null
	if (!placeholder) return null

	return placeholder.dataset.key || placeholder.dataset.chipKey || null
}

// 只在结构性内容变化时重建编辑器（templateMarkdown、sections 的 template_content、以及占位符的 key/original 集合）
// 不在 prompt/field 等元数据变化时重建，避免覆盖编辑器内已有内容
watch(
	() => {
		const mdKey = store.templateMarkdown
		const sectionsKey = store.sections.map(s => s.template_content || '').join('\x00')
		const placeholderStructureKey = store.placeholders.map(p => `${p.key}:${p.original}`).join('|')
		return mdKey + '\x01' + sectionsKey + '\x01' + placeholderStructureKey
	},
	() => {
		if (!editorReady || !editor.value || !store.templateMarkdown) return
		if (skipNextSync) {
			skipNextSync = false
			return
		}
		editor.value.commands.setContent(buildEditorHtml())
		nextTick(() => {
			scanChips(editor.value!)
		})
	},
)

function scanChips(ed: any) {
	const editorDom = ed?.view?.dom as HTMLElement | null
	if (!editorDom) return
	disableEditorDrag(ed)
	editorDom.querySelectorAll('span[data-chip]').forEach((chip) => {
		const el = chip as HTMLElement
		el.setAttribute('draggable', 'false')
		const type = el.getAttribute('data-type') || 'TYPE_FILL'
		el.classList.remove('chip--TYPE_FILL', 'chip--TYPE_DESCRIPTION')
		if (type === 'TYPE_FILL') el.classList.add('chip--TYPE_FILL')
		else if (type === 'TYPE_DESCRIPTION') el.classList.add('chip--TYPE_DESCRIPTION')
	})
}

function disableEditorDrag(ed: any) {
	const editorDom = ed?.view?.dom as HTMLElement | null
	if (!editorDom) return

	editorDom.setAttribute('draggable', 'false')
	editorDom.ondragstart = (event) => {
		event.preventDefault()
		return false
	}
	editorDom.ondrop = (event) => {
		event.preventDefault()
		return false
	}
	editorDom.querySelectorAll('[data-chip], [data-html-block], table, thead, tbody, tr, th, td').forEach((node) => {
		node.setAttribute('draggable', 'false')
	})
}

function buildEditorHtml(): string {
	if (store.sections.length) {
		const usedTitles = new Set<string>()
		return store.sections
			.map((section) => {
				const title = getSectionDisplayTitle(section.title)
				const titleKey = normalizeSectionTitle(title)
				const shouldRenderTitle = Boolean(titleKey) && !usedTitles.has(titleKey)
				if (titleKey) usedTitles.add(titleKey)
				const source = section.template_content || section.content || ''
				return [
					shouldRenderTitle ? `<h2>${escapeHtml(title)}</h2>` : '',
					markdownToHtml(source, store.placeholders),
				].join('')
			})
			.join('')
	}

	return markdownToHtml(store.templateMarkdown, store.placeholders)
}

function getUniqueSectionTitles(): string[] {
	const titles: string[] = []
	const seen = new Set<string>()

	store.sections.forEach((section) => {
		const title = getSectionDisplayTitle(section.title)
		const titleKey = normalizeSectionTitle(title)
		if (!titleKey) return
		if (seen.has(titleKey)) return

		seen.add(titleKey)
		titles.push(title)
	})

	return titles
}

function getSectionDisplayTitle(title: string | null): string {
	return title?.trim() || ''
}

function normalizeSectionTitle(title: string): string {
	return title.replace(/\s+/g, ' ').trim()
}

function markdownToHtml(mdText: string, placeholders: any[]): string {
	const phMap = new Map(placeholders.map(p => [p.key, p]))

	function makeChipHtml(key: string): string {
		const ph = phMap.get(key)
		if (!ph) return `{{${key}}}`

		// 优先使用 originalHtml（包含表格的完整 HTML）
		const htmlContent = ph.originalHtml || ph.original
		const hasTable = /<table\b[\s\S]*?<\/table>/i.test(decodeHtmlEntities(htmlContent || ''))

		if (hasTable) {
			return wrapTableHtml(htmlContent, key, ph.type)
		}

		const position = formatKeyPosition(key)
		const title = position ? `${position} | key: ${key}` : `key: ${key}`
		return `<span data-chip="" data-key="${key}" data-original="${escapeAttr(ph.original || key)}" data-type="${ph.type}" data-fill_mode="${ph.fill_mode}" data-field="${ph.field || ''}" data-prompt="${escapeAttr(ph.prompt || '')}" data-note="${escapeAttr(ph.note || '')}" class="chip ${ph.type === 'TYPE_FILL' ? 'chip--TYPE_FILL' : 'chip--TYPE_DESCRIPTION'}" title="${escapeAttr(title)}" draggable="false">${escapeHtml(ph.original || key)}</span>`
	}

	function wrapTableHtml(tableHtml: string, keyOverride = '', typeOverride = ''): string {
		const keyMatch = tableHtml.match(/\{\{([\w]+)\}\}/)
		const tableKey = keyOverride || (keyMatch ? keyMatch[1] : '')
		const tablePh = tableKey ? phMap.get(tableKey) : null
		const chipType = typeOverride || (tablePh ? tablePh.type : 'TYPE_DESCRIPTION')
		const encoded = btoa(encodeURIComponent(tableHtml))
		return `<div data-html-block="" data-html-encoded="${encoded}" data-chip-type="${chipType}" data-chip-key="${tableKey}" draggable="false"></div>`
	}

	function wrapRenderedTables(renderedHtml: string): string {
		return renderedHtml.replace(tablePattern, tableHtml => wrapTableHtml(tableHtml))
	}

	function renderMarkdownPart(part: string): string {
		const chipHtmlMap = new Map<string, string>()
		const withTokens = part.replace(/\{\{([\w]+)\}\}/g, (_, key) => {
			const token = `CHIPTOKEN_${key}_ENDCHIP`
			chipHtmlMap.set(token, makeChipHtml(key))
			return token
		})
		let rendered = md.render(withTokens)
		for (const [token, chipHtml] of chipHtmlMap) {
			rendered = rendered.split(token).join(chipHtml)
		}
		return wrapRenderedTables(rendered)
	}

	const htmlParts: string[] = []
	let lastIndex = 0
	tablePattern.lastIndex = 0

	for (const match of mdText.matchAll(tablePattern)) {
		const tableHtml = match[0]
		const matchIndex = match.index || 0
		const before = mdText.slice(lastIndex, matchIndex)

		if (before) {
			htmlParts.push(renderMarkdownPart(before))
		}

		htmlParts.push(wrapTableHtml(tableHtml))

		lastIndex = matchIndex + tableHtml.length
	}

	const rest = mdText.slice(lastIndex)
	if (rest) {
		htmlParts.push(renderMarkdownPart(rest))
	}

	return htmlParts.join('')
}

function formatKeyPosition(key: string): string {
	const matched = key.match(/^key_(\d+)_(\d+)_(md|json)$/)
	if (!matched) return ''
	return `第${matched[1]}章第${matched[2]}节`
}

function normalizeTableHtml(value: string): string | null {
	const trimmed = value.trim()
	if (!trimmed) return null

	const decoded = decodeHtmlEntities(trimmed)
	const candidate = /<table\b[\s\S]*?<\/table>/i.test(decoded) ? decoded : trimmed
	const matched = candidate.match(/<table\b[\s\S]*?<\/table>/i)
	return matched ? matched[0] : null
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
	return escapeHtml(s)
		.replace(/"/g, '&quot;')
		.replace(/\r?\n/g, '&#10;')
}

function extractSelectedHtml(from: number, to: number): string {
	if (!editor.value) return ''
	const slice = editor.value.state.doc.slice(from, to)
	const serializer = DOMSerializer.fromSchema(editor.value.schema)
	const fragment = serializer.serializeFragment(slice.content)
	const div = document.createElement('div')
	div.appendChild(fragment)

	// 将 htmlBlock 节点展开为其内部 HTML（data-html-encoded 解码后的表格内容）
	div.querySelectorAll('[data-html-encoded]').forEach((el) => {
		const encoded = el.getAttribute('data-html-encoded') || ''
		if (encoded) {
			try {
				const html = decodeURIComponent(atob(encoded))
				const wrapper = document.createElement('div')
				wrapper.innerHTML = html
				el.replaceWith(wrapper)
			} catch {
				// keep as-is
			}
		}
	})

	// 移除 data-chip 占位符 span，只保留文本内容
	div.querySelectorAll('span[data-chip]').forEach((el) => {
		const original = el.getAttribute('data-original') || el.textContent || ''
		el.replaceWith(document.createTextNode(original))
	})

	return div.innerHTML.trim()
}

// 提取选区内容：文本节点取纯文本，htmlBlock 节点取解码后的原始 <table> HTML 标签
function extractSelectedContent(from: number, to: number): string {
	if (!editor.value) return ''
	const doc = editor.value.state.doc
	const parts: string[] = []

	doc.nodesBetween(from, to, (node) => {
		if (node.type.name === 'htmlBlock') {
			const encoded = node.attrs.encoded || ''
			if (encoded) {
				try {
					parts.push(decodeURIComponent(atob(encoded)))
				} catch {
					// skip
				}
			}
			return false // 不遍历子节点
		}
		if (node.isText) {
			// 计算实际在选区范围内的文本
			parts.push(node.text || '')
		}
		return true
	})

	return parts.join('\n').trim()
}

function addChipFromSelection() {
	if (!editor.value) return
	const { from, to } = editor.value.state.selection
	if (from === to) return

	const sel = editor.value.state.selection

	// --- 表格 HtmlBlockNode 特殊处理 ---
	if (sel instanceof NodeSelection && sel.node.type.name === 'htmlBlock') {
		const node = sel.node
		const encoded = node.attrs.encoded || ''
		if (!encoded) return

		let tableHtml = ''
		try {
			tableHtml = decodeURIComponent(atob(encoded))
		} catch { return }

		const textBefore = editor.value.state.doc.textBetween(0, from)
		const sectionNum = store.getSectionNum(textBefore)
		const autoKey = store.generateKey(sectionNum)

		const inputKey = prompt('请输入占位符 key 名称：', autoKey)
		if (!inputKey) return
		const key = store.normalizePlaceholderKey(inputKey)
		if (!key) return

		// 和普通文本一样，用 ChipNode 显示原始 HTML 标签文本
		editor.value.chain().focus().deleteSelection().insertChip({
			key,
			original: tableHtml,
			type: 'TYPE_DESCRIPTION',
			fill_mode: 'newline',
			field: null,
			prompt: null,
			note: '',
		}).run()

		skipNextSync = true
		store.addPlaceholderFromOriginal({
			key,
			original: tableHtml,
			originalHtml: tableHtml,
			type: 'TYPE_DESCRIPTION',
			fill_mode: 'newline',
			field: null,
			prompt: null,
		})
		store.selectChip(key)
		return
	}

	// --- 普通文本选区 ---
	const selectedContent = extractSelectedContent(from, to)
	const selectedHtml = extractSelectedHtml(from, to)
	const textBefore = editor.value.state.doc.textBetween(0, from)
	const sectionNum = store.findSectionNumByOriginal(selectedContent) || store.getSectionNum(textBefore)
	const autoKey = store.generateKey(sectionNum)

	const inputKey = prompt('请输入占位符 key 名称：', autoKey)
	if (!inputKey) return
	const key = store.normalizePlaceholderKey(inputKey)
	if (!key) return

	editor.value.chain().focus().deleteSelection().insertChip({
		key,
		original: selectedContent,
		type: 'TYPE_DESCRIPTION',
		fill_mode: 'newline',
		field: null,
		prompt: null,
		note: '',
	}).run()

	skipNextSync = true
	store.addPlaceholderFromOriginal({
		key,
		original: selectedContent,
		originalHtml: selectedHtml || undefined,
		type: 'TYPE_DESCRIPTION',
		fill_mode: 'newline',
		field: null,
		prompt: null,
	})
	store.selectChip(key)
}

function undoDelete() {
	const ph = store.popDeleted()
	if (ph) {
		store.restorePlaceholder(ph)
	}
}

onBeforeUnmount(() => {
	editor.value?.destroy()
})
</script>

<style scoped>
.editor-container {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: #fff;
}

.editor-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 16px;
	border-bottom: 1px solid #e2e8f0;
	background: #f8fafc;
}

.editor-toolbar__title {
	display: flex;
	align-items: center;
	gap: 8px;
	color: #64748b;
	font-size: 13px;
	font-weight: 400;
}

.editor-toolbar__title strong {
	color: #334155;
	font-weight: 600;
}

.editor-toolbar__actions {
	display: flex;
	gap: 8px;
}

.editor-toolbar button {
	height: 30px;
	padding: 0 14px;
	border: 1px solid #d1dae6;
	border-radius: 6px;
	background: #ffffff;
	cursor: pointer;
	font-size: 12px;
	transition: all 0.15s;
	display: flex;
	align-items: center;
	gap: 4px;
}

.editor-toolbar button:first-child::before,
.editor-toolbar button:last-child::before {
	--fa-family: "Font Awesome 7 Free";
	--fa-style: 900;
	display: inline-block;
	font-family: "Font Awesome 7 Free";
	font-style: normal;
	font-weight: 900;
}

.editor-toolbar button:first-child::before {
	content: "\2b";
}

.editor-toolbar button:last-child::before {
	content: "\f2ea";
}

.editor-toolbar button:hover {
	border-color: #93c5fd;
	color: #2563eb;
}

.editor-toolbar button:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.editor-content {
	flex: 1;
	overflow-y: auto;
	padding: 24px 32px;
	font-size: 15px;
	line-height: 1.8;
	color: #334155;
}

.editor-content :deep(.ProseMirror) {
	width: 100%;
	min-height: 100%;
	padding: 0 0 40px;
	outline: none;
	color: #334155;
	line-height: 1.8;
}

.editor-content :deep(.ProseMirror h2) {
	font-size: 20px;
	font-weight: 700;
	margin: 24px 0 12px;
	padding: 0 0 8px;
	border-bottom: 2px solid #e2e8f0;
	color: #0f172a;
	line-height: 1.4;
}

.editor-content :deep(.ProseMirror h2:first-child) {
	margin-top: 0;
}

.editor-content :deep(.ProseMirror p) {
	margin: 8px 0;
}

.editor-content :deep(.ProseMirror h3) {
	font-size: 18px;
	font-weight: 600;
	margin: 20px 0 8px;
	color: #334155;
}

.editor-content :deep(.ProseMirror ul),
.editor-content :deep(.ProseMirror ol) {
	padding-left: 24px;
	margin: 8px 0;
}

.editor-placeholder {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	padding: 120px 20px;
	color: #94a3b8;
	text-align: center;
	background: #fff;
}

.editor-placeholder::before {
	--fa-family: "Font Awesome 7 Free";
	--fa-style: 900;
	content: "\f0ee";
	display: block;
	margin-bottom: 16px;
	font-family: "Font Awesome 7 Free";
	font-size: 48px;
	font-style: normal;
	font-weight: 900;
}

.editor-placeholder {
	font-size: 18px;
	font-weight: 500;
}
</style>
