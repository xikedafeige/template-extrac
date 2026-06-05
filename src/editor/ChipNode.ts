import { Node, mergeAttributes } from '@tiptap/core'
import { renderOriginalMarkdown } from '../utils/markdownOriginal'

export interface ChipAttrs {
  key: string
  original: string
  originalHtml?: string
  type: 'TYPE_FILL' | 'TYPE_DESCRIPTION'
  fill_mode: 'inline' | 'newline'
  field: string | null
  prompt: string | null
  note: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chip: {
      insertChip: (attrs: ChipAttrs) => ReturnType
    }
  }
}

const TYPE_CLASSES: Record<string, string> = {
  TYPE_FILL: 'chip--TYPE_FILL',
  TYPE_DESCRIPTION: 'chip--TYPE_DESCRIPTION',
}

const ALL_TYPE_CLASSES = Object.values(TYPE_CLASSES).join(' ')

function applyTypeClass(el: HTMLElement, type: string) {
  el.classList.remove(...ALL_TYPE_CLASSES.split(' '))
  const cls = TYPE_CLASSES[type]
  if (cls) el.classList.add(cls)
}

function scanAndObserveChips(editorDom: HTMLElement) {
  editorDom.querySelectorAll('span[data-chip]:not([data-observed])').forEach((chip) => {
    chip.setAttribute('data-observed', 'true')
    observeChipElement(chip as HTMLElement)
  })
}

// 节点创建后立即注入 MutationObserver，监听 data-type 变化并实时切换颜色
function observeChipElement(dom: HTMLElement) {
  applyTypeClass(dom, dom.getAttribute('data-type') || 'TYPE_FILL')

  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === 'attributes' && mut.attributeName === 'data-type') {
        applyTypeClass(dom, dom.getAttribute('data-type') || 'TYPE_FILL')
      }
    }
  })
  observer.observe(dom, { attributes: true })
}

export const ChipNode = Node.create({
  name: 'chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      key:       { default: '', parseHTML: el => el.getAttribute('data-key') || '' },
      original:  { default: '', parseHTML: el => el.getAttribute('data-original') || '' },
      originalHtml: { default: '', parseHTML: el => el.getAttribute('data-original-html') || '' },
      type:      { default: 'TYPE_FILL', parseHTML: el => el.getAttribute('data-type') || 'TYPE_FILL' },
      fill_mode: { default: 'inline', parseHTML: el => el.getAttribute('data-fill_mode') || 'inline' },
      field:     { default: null, parseHTML: el => el.getAttribute('data-field') || null },
      prompt:    { default: null, parseHTML: el => el.getAttribute('data-prompt') || null },
      note:      { default: '', parseHTML: el => el.getAttribute('data-note') || '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-chip]' }]
  },

  // parseHTML 正确读取 data-original，使得 ChipNode 节点实例持有原始文本属性，
  // 与 data-* DOM 属性保持一致。这样在用户手动编辑 chip 周围文本后，
  // TipTap 序列化节点时能拿到准确的 original 值，而不是依赖全局 phMap 回退。
  // 配合 TemplateEditor 中 reindex 的两阶段临时 key 方案，
  // 即使其他节点 key 变化，已编辑 chip 的 original 内容也不会受影响。

  renderHTML({ HTMLAttributes }) {
    const typeClass = (TYPE_CLASSES as Record<string, string>)[HTMLAttributes.type] || ''
    return [
      'span',
      mergeAttributes({
        'data-chip': '',
        'data-key': HTMLAttributes.key,
        'data-original': HTMLAttributes.original,
        'data-original-html': HTMLAttributes.originalHtml || '',
        'data-type': HTMLAttributes.type,
        'data-fill_mode': HTMLAttributes.fill_mode,
        'data-field': HTMLAttributes.field || '',
        'data-prompt': HTMLAttributes.prompt || '',
        'data-note': HTMLAttributes.note || '',
        class: `chip ${typeClass}`,
        title: `key: ${HTMLAttributes.key}`,
        draggable: 'false',
      }),
      HTMLAttributes.original || `{{${HTMLAttributes.key}}}`,
    ]
  },

  addCommands() {
    return {
      insertChip:
        (attrs: ChipAttrs) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs })
        },
    }
  },

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement('span')
      const type = node.attrs.type || HTMLAttributes['data-type'] || 'TYPE_FILL'
      const key = node.attrs.key || HTMLAttributes['data-key'] || ''
      const original = node.attrs.original || HTMLAttributes['data-original'] || ''
      const originalHtml = node.attrs.originalHtml || HTMLAttributes['data-original-html'] || ''

      Object.entries(HTMLAttributes).forEach(([name, value]) => {
        if (value === null || value === undefined) return
        dom.setAttribute(name, String(value))
      })

      dom.setAttribute('data-chip', '')
      dom.setAttribute('data-key', key)
      dom.setAttribute('data-original', original)
      dom.setAttribute('data-original-html', originalHtml)
      dom.setAttribute('data-type', type)
      dom.setAttribute('data-fill_mode', node.attrs.fill_mode || HTMLAttributes['data-fill_mode'] || 'inline')
      dom.setAttribute('data-field', node.attrs.field || HTMLAttributes['data-field'] || '')
      dom.setAttribute('data-prompt', node.attrs.prompt || HTMLAttributes['data-prompt'] || '')
      dom.setAttribute('data-note', node.attrs.note || HTMLAttributes['data-note'] || '')
      dom.setAttribute('draggable', 'false')
      dom.classList.add('chip')
      applyTypeClass(dom, type)
      dom.title = `key: ${key}`
      dom.innerHTML = renderOriginalMarkdown(originalHtml || original) || original || `{{${key}}}`

      return { dom }
    }
  },

  onCreate() {
    // setContent 后立即扫描所有 chip，注入 observer 并应用颜色类
    setTimeout(() => {
      scanAndObserveChips(this.editor.view.dom as HTMLElement)
    }, 0)
  },

  // 编辑器 DOM 更新后，对新增的 chip 元素注入 MutationObserver
  onUpdate() {
    scanAndObserveChips(this.editor.view.dom as HTMLElement)
  },
})
