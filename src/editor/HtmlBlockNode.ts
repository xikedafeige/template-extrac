import { Node, mergeAttributes } from '@tiptap/core'

// 用 data-html-encoded 存 base64，完全避免 TipTap 解析内部 HTML
export const HtmlBlockNode = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      encoded: {
        default: '',
        parseHTML: el => el.getAttribute('data-html-encoded') || '',
        renderHTML: attrs => ({ 'data-html-encoded': attrs.encoded || '' }),
      },
      chipType: {
        default: 'TYPE_DESCRIPTION',
        parseHTML: el => el.getAttribute('data-chip-type') || 'TYPE_DESCRIPTION',
        renderHTML: attrs => ({ 'data-chip-type': attrs.chipType || 'TYPE_DESCRIPTION' }),
      },
      chipKey: {
        default: '',
        parseHTML: el => el.getAttribute('data-chip-key') || '',
        renderHTML: attrs => ({ 'data-chip-key': attrs.chipKey || '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-html-block]', priority: 1000 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-html-block': '', draggable: 'false' }, HTMLAttributes)]
  },

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-html-block', '')
      wrapper.setAttribute('draggable', 'false')
      wrapper.classList.add('html-block')

      // node.attrs 可能因 atom 解析问题为空，同时从 HTMLAttributes fallback
      const encoded = node.attrs.encoded || HTMLAttributes['data-html-encoded'] || ''
      const chipType = node.attrs.chipType || HTMLAttributes['data-chip-type'] || 'TYPE_DESCRIPTION'
      const chipKey = node.attrs.chipKey || HTMLAttributes['data-chip-key'] || ''

      if (chipKey) wrapper.setAttribute('data-chip-key', chipKey)
      wrapper.setAttribute('data-chip-type', chipType)

      let html = ''
      if (encoded) {
        try {
          html = decodeURIComponent(atob(encoded))
        } catch (e) {
          html = '<p style="color:red">[表格解码失败]</p>'
        }
      }

      applyWrapperStyle(wrapper, chipType)
      wrapper.innerHTML = html
      wrapper.querySelectorAll('*').forEach((child) => {
        child.setAttribute('draggable', 'false')
      })

      return { dom: wrapper }
    }
  },
})

function applyWrapperStyle(el: HTMLElement, chipType: string) {
  el.style.width = '100%'
  el.style.maxWidth = '100%'
  el.style.border = '2px solid'
  el.style.borderRadius = '8px'
  el.style.padding = '12px'
  el.style.margin = '8px 0'
  el.style.overflowX = 'auto'
  el.style.transition = 'border-color 0.15s, box-shadow 0.15s, background 0.15s'
  if (chipType === 'TYPE_FILL') {
    el.style.borderColor = '#86efac'
    el.style.background = '#f0fdf4'
  } else {
    el.style.borderColor = '#86efac'
    el.style.background = '#f0fdf4'
  }
}
