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
import { SectionNode } from '../editor/SectionNode'
import { useTemplateStore } from '../stores/template'
import { escapeAttr, escapeHtml, renderInlineMarkdownInHtml, renderOriginalMarkdown } from '../utils/markdownOriginal'
import '../editor/chipStyles.css'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: true, breaks: false, linkify: false })
const tablePattern = /<table\b[\s\S]*?<\/table>/gi

const store = useTemplateStore()
const hasSelection = ref(false)
// Per-operation suppression flag - reset after each rebuild, unlike the old global skipNextSync
let suppressNextStructuralRebuild = false
let editorReady = false
let preserveClickedSelection = false
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
let isSettingContent = false

function debouncedSyncSections() {
	if (syncDebounceTimer !== null) clearTimeout(syncDebounceTimer)
	syncDebounceTimer = setTimeout(() => {
		syncDebounceTimer = null
		suppressNextStructuralRebuild = true
		syncSectionsFromEditor()
	}, 300)
}

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
		SectionNode,
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
	onUpdate() {
		if (!editorReady || isSettingContent) return
		debouncedSyncSections()
	},
})

function getClickedPlaceholderKey(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) return null

	const placeholder = target.closest('[data-chip], [data-html-block]') as HTMLElement | null
	if (!placeholder) return null

	return placeholder.dataset.key || placeholder.dataset.chipKey || null
}

function extractPlaceholderKeysFromText(value: string): string[] {
	const seen = new Set<string>()
	const keys: string[] = []
	for (const match of value.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) {
		const key = store.normalizePlaceholderKey(match[1] || '')
		if (!key || seen.has(key)) continue
		seen.add(key)
		keys.push(key)
	}
	return keys
}

// 精确替换被删除的占位符节点，并在同一个 watcher 中同步更新 store（templateMarkdown、sections.template_content）。
// 关键执行顺序：
//  1. 保存 restoreText（避免 deletedStack 竞态）
//  2. 查找 ProseMirror 中的 chip 位置
//  3. 【立即】设置 suppressNextStructuralRebuild=true（阻止后续 structural watcher 触发 setContent）
//  4. 更新 store（remove key + reindex）
//  5. 调度 ProseMirror transaction
//  这样 Vue 响应式 watcher 只在所有操作完成后才执行，且 suppressNextStructuralRebuild 已为 true。
watch(
	() => store.pendingRemoveKey,
	(removedKey) => {
		if (!removedKey || !editorReady || !editor.value) {
			return
		}

		// Step 0: 立即保存 restoreText（必须在 store 操作之前，避免 deletedStack 被后续删除覆盖）
		const deletedPh = store.deletedStack[store.deletedStack.length - 1]
		const restoreText = unwrapPlaceholderContent(deletedPh?.originalHtml?.trim() || deletedPh?.original || '')

		// Step 1: 在当前 DOM 中查找 chip 位置（用当前 ProseMirror 文档）
		const view = editor.value.view
		const doc = view.state.doc
		let targetPos = -1
		let targetNodeSize = 0
		let isChip = false

		doc.descendants((node, pos) => {
			if (targetPos >= 0) return false
			if (node.type.name === 'chip' && node.attrs.key === removedKey) {
				targetPos = pos
				targetNodeSize = node.nodeSize
				isChip = true
				return false
			}
			if (node.type.name === 'htmlBlock' && node.attrs.chipKey === removedKey) {
				targetPos = pos
				targetNodeSize = node.nodeSize
				return false
			}
			return true
		})

		// Step 2: 【立即】设置 suppressNextStructuralRebuild=true，在所有 store 操作之前。
		//         这样当 Step 3 的 store 赋值触发 Vue 响应式 watcher 时，它们看到的是 true。
		suppressNextStructuralRebuild = true

		// Step 3: 更新 store（会触发 Vue watcher，但因为 suppressNextStructuralRebuild=true 而被跳过）
		// 直接过滤，store.sortPlaceholders 由 store 内部处理（addPlaceholder/updatePlaceholder 会自动排序）
		store.placeholders = store.placeholders.filter(p => p.key !== removedKey)

		// Step 3.5: 从 templateMarkdown 和 section.template_content 中移除被删 key 的令牌
		// 必须在 reindexSection 之前执行，否则 reindex 后会出现重复的 {{key}} 令牌
		const removeRe = new RegExp(`\\{\\{${removedKey}\\}\\}`, 'g')
		const restoreOriginal = deletedPh?.original || ''
		store.templateMarkdown = store.templateMarkdown.replace(removeRe, () => restoreOriginal)
		store.sections = store.sections.map(sec => ({
			...sec,
			title: typeof sec.title === 'string' ? sec.title.replace(removeRe, () => restoreOriginal) : sec.title,
			template_content: (sec.template_content || '').replace(removeRe, () => restoreOriginal),
		}))

		const m = removedKey.match(/^key_(\d+)_\d+_md$/)
		const sectionNum = m ? parseInt(m[1], 10) : -1
		if (m) {
			store.reindexSection(sectionNum)
		}
		isSettingContent = true
		try {
			// Step 4: 先从 DOM 移除被删除的 chip 节点
			if (targetPos >= 0) {
				if (isChip) {
					const tr = view.state.tr.replaceWith(
						targetPos,
						targetPos + targetNodeSize,
						view.state.schema.text(restoreText)
					)
					view.dispatch(tr)
				} else {
					const tempDiv = document.createElement('div')
					tempDiv.innerHTML = restoreText
					const plainText = tempDiv.textContent || tempDiv.innerText || restoreText
					const tr = view.state.tr.replaceWith(
						targetPos,
						targetPos + targetNodeSize,
						view.state.schema.text(plainText)
					)
					view.dispatch(tr)
				}
			}

			// Step 5: chip 已移除，现在更新剩余 chip 的 key 属性（索引对位正确）
			if (sectionNum >= 0) {
				updateReindexedDomKeys(sectionNum)
			}
		} finally {
			isSettingContent = false
			store.pendingRemoveKey = null
			nextTick(() => {
				if (!editor.value) return
				isSettingContent = true
				editor.value.commands.setContent(buildEditorHtml())
				nextTick(() => {
					isSettingContent = false
					scanChips(editor.value!)
				})
			})
		}
	}
)

// 将 store 中 reindex 后的 key 同步更新到编辑器 DOM 上
// 不触发 setContent，只修改节点属性
// 更新被 reindex 重命名的 key 到编辑器 DOM 上（仅限指定章节）
// 权威来源：store.sections[sectionNum].placeholders（reindex 后已是最新的）
function updateReindexedDomKeys(sectionNum: number) {
	if (!editor.value) return
	const view = editor.value.view
	const doc = view.state.doc

	// 当前章节文本中实际存在的 key 是权威顺序，placeholder 元数据从全局右侧列表读取。
	const section = store.sections[sectionNum]
	const expectedKeys = extractPlaceholderKeysFromText(`${section?.title || ''}\n${section?.template_content || ''}`)
	const placeholderMap = new Map(store.placeholders.map(p => [p.key, p]))

	// 在 ProseMirror doc 中找到对应 section 节点，只遍历其内部
	let sectionStart = -1
	let sectionEnd = -1
	doc.descendants((node, pos) => {
		if (node.type.name === 'section' && (node.attrs.index as number) === sectionNum) {
			sectionStart = pos
			sectionEnd = pos + node.nodeSize
			return false
		}
		return true
	})
	if (sectionStart < 0) return

	// 收集该章节内 chip/htmlBlock 的 key（按文档顺序）
	const domKeys: Array<{ key: string; pos: number; nodeType: string }> = []
	doc.nodesBetween(sectionStart, sectionEnd, (node, pos) => {
		if (node.type.name === 'chip') {
			const k = node.attrs.key as string
			if (/^key_\d+_/.test(k)) domKeys.push({ key: k, pos, nodeType: 'chip' })
		} else if (node.type.name === 'htmlBlock') {
			const k = node.attrs.chipKey as string
			if (/^key_\d+_/.test(k)) domKeys.push({ key: k, pos, nodeType: 'htmlBlock' })
		}
		return true
	})

	// 找出不一致的节点（DOM key/type 等元数据与右侧期望数据不同）
	const mismatches: Array<{ expectedKey: string; pos: number; nodeType: string }> = []
	for (let i = 0; i < domKeys.length; i++) {
		const expectedKey = expectedKeys[i]
		const expectedPh = placeholderMap.get(expectedKey)
		if (!expectedKey || !expectedPh) continue
		const node = doc.nodeAt(domKeys[i].pos)
		const isChipMismatch = domKeys[i].nodeType === 'chip' && node && (
			domKeys[i].key !== expectedKey ||
			node.attrs.original !== expectedPh.original ||
			(node.attrs.originalHtml || '') !== (expectedPh.originalHtml || '') ||
			node.attrs.type !== expectedPh.type ||
			node.attrs.fill_mode !== expectedPh.fill_mode ||
			(node.attrs.field || null) !== (expectedPh.field || null) ||
			(node.attrs.prompt || null) !== (expectedPh.prompt || null) ||
			(node.attrs.note || '') !== (expectedPh.note || '')
		)
		const isHtmlBlockMismatch = domKeys[i].nodeType === 'htmlBlock' && node && (
			domKeys[i].key !== expectedKey ||
			node.attrs.chipType !== expectedPh.type
		)
		if (isChipMismatch || isHtmlBlockMismatch) {
			mismatches.push({ expectedKey, pos: domKeys[i].pos, nodeType: domKeys[i].nodeType })
		}
	}

	if (mismatches.length === 0) return

	// 从后往前重命名，避免位置被覆盖
	const tr = view.state.tr
	for (let i = mismatches.length - 1; i >= 0; i--) {
		const { expectedKey, pos, nodeType } = mismatches[i]
		if (!expectedKey) continue
		const expectedPh = placeholderMap.get(expectedKey)
		if (!expectedPh) continue
		const node = doc.nodeAt(pos)
		if (node) {
			if (nodeType === 'chip') {
				tr.setNodeMarkup(pos, undefined, {
					...node.attrs,
					key: expectedKey,
					original: expectedPh.original,
					originalHtml: expectedPh.originalHtml || '',
					type: expectedPh.type,
					fill_mode: expectedPh.fill_mode,
					field: expectedPh.field || null,
					prompt: expectedPh.prompt || null,
					note: expectedPh.note || '',
				})
			} else {
				tr.setNodeMarkup(pos, undefined, {
					...node.attrs,
					chipKey: expectedKey,
					chipType: expectedPh.type,
				})
			}
		}
	}

	view.dispatch(tr)
	nextTick(() => scanChips(editor.value!))
}

// 只在结构性内容变化时重建编辑器（templateMarkdown、sections 的 template_content、以及占位符的 key/original 集合）
// 不在 prompt/field 等元数据变化时重建，避免覆盖编辑器内已有内容
// 注意：pendingRemoveKey 的处理由上面的精确替换 watcher 负责，不再触发全量重建
watch(
	() => {
		const mdKey = store.templateMarkdown
		const sectionsKey = store.sections.map(s => `${s.title || ''}\x00${s.template_content || ''}`).join('\x00')
		const placeholderStructureKey = store.placeholders.map(p => `${p.key}:${p.original}:${p.originalHtml || ''}`).join('|')
		return mdKey + '\x01' + sectionsKey + '\x01' + placeholderStructureKey
	},
	() => {
		if (!editorReady || !editor.value || !store.templateMarkdown) return
		if (isSettingContent) return
		if (suppressNextStructuralRebuild) {
			suppressNextStructuralRebuild = false
			return
		}
		// pendingRemoveKey 不为 null 时（删除 chip 流程中），pendingRemoveKey watcher 会负责
		// 精确的 DOM 替换，不需要 setContent 重建。
		if (store.pendingRemoveKey !== null) {
			return
		}
		isSettingContent = true
		editor.value.commands.setContent(buildEditorHtml())
		nextTick(() => {
			isSettingContent = false
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
			.map((section, index) => {
				const title = getSectionDisplayTitle(section.title)
				const titleKey = normalizeSectionTitle(title)
				const shouldRenderTitle = Boolean(titleKey) && !usedTitles.has(titleKey)
				if (titleKey) usedTitles.add(titleKey)
				const source = section.template_content || section.content || ''
				// 标题也需要处理 {{key}} 占位符高亮
				const renderedTitle = shouldRenderTitle
					? (() => {
						const phMap = new Map(store.placeholders.map(p => [p.key, p]))
						const chipHtmlMap = new Map<string, string>()
						const withTokens = title.replace(/\{\{([\w]+)\}\}/g, (_, key) => {
							const ph = phMap.get(key)
							if (!ph) return `{{${key}}}`
							const position = formatKeyPosition(key)
							const chipTitle = position ? `${position} | key: ${key}` : `key: ${key}`
							const hasTable = /<table\b[\s\S]*?<\/table>/i.test(decodeHtmlEntities(ph.original || ''))
							const token = `TITLECHIPTOKEN_${key}_ENDCHIP`
							if (hasTable) {
								const encoded = btoa(encodeURIComponent(ph.original || ''))
								chipHtmlMap.set(token, `<div data-html-block="" data-html-encoded="${encoded}" data-chip-type="${ph.type}" data-chip-key="${key}" draggable="false"></div>`)
								return token
							}
							chipHtmlMap.set(token, buildChipHtml(ph, key, chipTitle))
							return token
						})
						let rendered = md.renderInline(withTokens)
						for (const [token, chipHtml] of chipHtmlMap) {
							rendered = rendered.split(token).join(chipHtml)
						}
						return `<h2>${renderInlineMarkdownInHtml(rendered)}</h2>`
					})()
					: ''
				const inner = [
					renderedTitle,
					markdownToHtml(source, store.placeholders),
				].join('')
				return `<div data-section-index="${index}">${inner}</div>`
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

function buildChipHtml(ph: any, key: string, title: string): string {
	const original = ph.original || key
	const originalHtml = ph.originalHtml || ''
	const displayHtml = renderOriginalMarkdown(originalHtml || original) || escapeHtml(original)
	const typeClass = ph.type === 'TYPE_FILL' ? 'chip--TYPE_FILL' : 'chip--TYPE_DESCRIPTION'
	return `<span data-chip="" data-key="${key}" data-original="${escapeAttr(original)}" data-original-html="${escapeAttr(originalHtml)}" data-type="${ph.type}" data-fill_mode="${ph.fill_mode}" data-field="${ph.field || ''}" data-prompt="${escapeAttr(ph.prompt || '')}" data-note="${escapeAttr(ph.note || '')}" class="chip ${typeClass}" title="${escapeAttr(title)}" draggable="false">${displayHtml}</span>`
}

function markdownToHtml(mdText: string, placeholders: any[]): string {
	const phMap = new Map(placeholders.map(p => [p.key, p]))

	function makeChipHtml(key: string): string {
		const ph = phMap.get(key)
		if (!ph) {
			return `{{${key}}}`
		}

		// 优先使用 originalHtml（包含表格的完整 HTML）
		const htmlContent = ph.originalHtml || ph.original
		const hasTable = /<table\b[\s\S]*?<\/table>/i.test(decodeHtmlEntities(htmlContent || ''))

		if (hasTable) {
			return wrapTableHtml(htmlContent, key, ph.type)
		}

		const position = formatKeyPosition(key)
		const title = position ? `${position} | key: ${key}` : `key: ${key}`
		return buildChipHtml(ph, key, title)
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
		return wrapRenderedTables(renderInlineMarkdownInHtml(rendered))
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

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
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

function selectionContainsExistingKey(from: number, to: number): boolean {
	if (!editor.value) return false
	let hasExistingKey = false

	editor.value.state.doc.nodesBetween(from, to, (node) => {
		if (node.type.name === 'chip' || node.type.name === 'htmlBlock') {
			hasExistingKey = true
			return false
		}
		return true
	})

	return hasExistingKey
}

function unwrapPlaceholderContent(content: string): string {
	if (!content || !/(data-chip|data-html-block|data-html-encoded)/i.test(content)) return content
	const div = document.createElement('div')
	div.innerHTML = content

	div.querySelectorAll('[data-html-encoded]').forEach((el) => {
		const encoded = el.getAttribute('data-html-encoded') || ''
		if (!encoded) return
		try {
			const html = decodeURIComponent(atob(encoded))
			const wrapper = document.createElement('div')
			wrapper.innerHTML = html
			el.replaceWith(...Array.from(wrapper.childNodes))
		} catch {
			el.replaceWith(document.createTextNode(el.textContent || ''))
		}
	})

	div.querySelectorAll('span[data-chip]').forEach((el) => {
		const original = el.getAttribute('data-original') || el.textContent || ''
		el.replaceWith(document.createTextNode(original))
	})

	return div.innerHTML.trim() || div.textContent || content
}

// 提取选区内容：文本节点取纯文本，htmlBlock 节点取解码后的原始 <table> HTML 标签
function extractSelectedContent(from: number, to: number): string {
	if (!editor.value) return ''
	const doc = editor.value.state.doc
	const parts: string[] = []

	doc.nodesBetween(from, to, (node, pos) => {
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
			// 裁剪到选区范围内的实际文本
			const textStart = Math.max(from, pos) - pos
			const textEnd = Math.min(to, pos + node.nodeSize) - pos
			const sliced = (node.text || '').slice(textStart, textEnd)
			if (sliced) parts.push(sliced)
		}
		return true
	})

	return parts.join('\n').trim()
}

// 从选区的 DOM 位置找到所在 section 的索引
function getSectionIndexFromSelection(): number {
	if (!editor.value) return 0
	const { from } = editor.value.state.selection
	try {
		const domAtPos = editor.value.view.domAtPos(from)
		const node = domAtPos.node instanceof Element ? domAtPos.node : domAtPos.node.parentElement
		const sectionDiv = node?.closest('[data-section-index]')
		if (sectionDiv) {
			return parseInt(sectionDiv.getAttribute('data-section-index') || '0', 10)
		}
	} catch {
		// fallback
	}
	return 0
}

// 从编辑器文档中重建每个 section 的 template_content 和 placeholders
// 重要：保留 section.content（原文档中的原文），不覆盖用户可能已编辑过的 content。
// template_content 反映编辑器中 chip/{{key}} 的当前状态。
function syncSectionsFromEditor() {
	if (!editor.value || !store.sections.length) return
	const doc = editor.value.state.doc

	doc.forEach((node) => {
		if (node.type.name !== 'section') return
		const sectionIndex = node.attrs.index as number
		if (sectionIndex < 0 || sectionIndex >= store.sections.length) return

		const parts: string[] = []
		const sectionKeys: string[] = []
		let sectionTitle: string | null = null

		// 遍历 section 节点下的顶层块节点
		node.forEach((block) => {
			// 提取 heading 内容（保留 {{key}} 占位符）
			if (block.type.name === 'heading') {
				const titleParts: string[] = []
				block.descendants((child) => {
					if (child.type.name === 'chip') {
						const key = child.attrs.key || ''
						if (key) titleParts.push(`{{${key}}}`)
						return false
					}
					if (child.isText) titleParts.push(child.text || '')
					return true
				})
				sectionTitle = titleParts.join('')
				return
			}

			if (block.type.name === 'htmlBlock') {
				const chipKey = block.attrs.chipKey || ''
				if (chipKey) {
					parts.push(`{{${chipKey}}}`)
					sectionKeys.push(chipKey)
				} else {
					const encoded = block.attrs.encoded || ''
					if (encoded) {
						try {
							parts.push(decodeURIComponent(atob(encoded)))
						} catch { /* skip */ }
					}
				}
				return
			}

			// paragraph 或其他块：遍历内联子节点
			const blockParts: string[] = []
			block.descendants((child) => {
				if (child.type.name === 'chip') {
					const key = child.attrs.key || ''
					if (key) {
						blockParts.push(`{{${key}}}`)
						sectionKeys.push(key)
					}
					return false
				}
				if (child.isText) {
					blockParts.push(child.text || '')
				}
				return true
			})
			const line = blockParts.join('')
			if (line) parts.push(line)
		})

		const newTemplateContent = parts.join('\n\n')

		// 用占位符 original 还原 {{key}} 得到 content 原文
		const phMap = new Map(store.placeholders.map(p => [p.key, p]))
		const newContent = newTemplateContent.replace(/\{\{([\w]+)\}\}/g, (_, key) => {
			return phMap.get(key)?.original || `{{${key}}}`
		})

		const originalSection = store.sections[sectionIndex]
		const secPlaceholders = sectionKeys
			.map(key => phMap.get(key) || { key, original: key, type: 'TYPE_DESCRIPTION' as const, fill_mode: 'newline' as const, field: null, prompt: null })

		store.sections[sectionIndex] = {
			...originalSection,
			...(sectionTitle !== null ? { title: sectionTitle } : {}),
			template_content: newTemplateContent,
			// 仅当 newContent 与当前 content 不同时才更新（允许用户在 section.content 中做额外编辑）
			content: newContent !== originalSection.content ? newContent : originalSection.content,
			placeholders: secPlaceholders,
		}
	})

	// 重建 template_markdown：各 section 标题 + template_content 拼接
	const mdParts: string[] = []
	for (const sec of store.sections) {
		if (sec.title) {
			mdParts.push(sec.title)
		}
		mdParts.push(sec.template_content || '')
	}
	store.templateMarkdown = mdParts.join('\n\n')
}

function addChipFromSelection() {
	if (!editor.value) return
	const { from, to } = editor.value.state.selection
	if (from === to) return

	const sel = editor.value.state.selection
	const sectionIndex = getSectionIndexFromSelection()
	const sectionNum = sectionIndex // 0-based

	// --- 表格 HtmlBlockNode 特殊处理 ---
	if (sel instanceof NodeSelection && sel.node.type.name === 'htmlBlock') {
		const node = sel.node
		const encoded = node.attrs.encoded || ''
		if (!encoded) return

		let tableHtml = ''
		try {
			tableHtml = decodeURIComponent(atob(encoded))
		} catch { return }

		const autoKey = store.generateKey(sectionNum)

		const inputKey = prompt('请输入占位符 key 名称：', autoKey)
		if (!inputKey) return
		const key = store.normalizePlaceholderKey(inputKey)
		if (!key) return

		// 用 ChipNode 显示原始 HTML 标签文本
		editor.value.chain().focus().deleteSelection().insertChip({
			key,
			original: tableHtml,
			originalHtml: tableHtml,
			type: 'TYPE_DESCRIPTION',
			fill_mode: 'newline',
			field: null,
			prompt: null,
			note: '',
		}).run()

		suppressNextStructuralRebuild = true
		store.addPlaceholder({
			key,
			original: tableHtml,
			originalHtml: tableHtml,
			type: 'TYPE_DESCRIPTION',
			fill_mode: 'newline',
			field: null,
			prompt: null,
		})
		syncSectionsFromEditor()
		store.selectChip(key)
		return
	}

	// --- 普通文本选区 ---
	if (selectionContainsExistingKey(from, to)) {
		alert('选区不能包含已有 key，请重新选择不包含 key 的文本')
		return
	}

	const selectedContent = extractSelectedContent(from, to)
	const selectedHtml = extractSelectedHtml(from, to)
	const autoKey = store.generateKey(sectionNum)

	const inputKey = prompt('请输入占位符 key 名称：', autoKey)
	if (!inputKey) return
	const key = store.normalizePlaceholderKey(inputKey)
	if (!key) return

	editor.value.chain().focus().deleteSelection().insertChip({
		key,
		original: selectedContent,
		originalHtml: selectedHtml || undefined,
		type: 'TYPE_DESCRIPTION',
		fill_mode: 'newline',
		field: null,
		prompt: null,
		note: '',
	}).run()

	suppressNextStructuralRebuild = true
	store.addPlaceholder({
		key,
		original: selectedContent,
		originalHtml: selectedHtml || undefined,
		type: 'TYPE_DESCRIPTION',
		fill_mode: 'newline',
		field: null,
		prompt: null,
	})
	syncSectionsFromEditor()
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
