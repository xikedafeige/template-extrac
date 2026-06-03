import { Node, mergeAttributes } from '@tiptap/core'

export const SectionNode = Node.create({
  name: 'section',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      index: {
        default: 0,
        parseHTML: el => parseInt(el.getAttribute('data-section-index') || '0', 10),
        renderHTML: attrs => ({ 'data-section-index': String(attrs.index) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-section-index]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-section-index': String(HTMLAttributes.index) }, HTMLAttributes), 0]
  },
})
