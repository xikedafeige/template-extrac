import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: true, breaks: true, linkify: false })
const INLINE_MARKDOWN_PATTERN = /(\*\*|__).+?\1/
const SKIP_MARKDOWN_SELECTOR = 'table, pre, code, script, style, [data-chip], [data-html-block]'

function stripParagraphWrapper(html: string): string {
  const trimmed = html.trim()
  if (typeof document !== 'undefined') {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = trimmed
    if (
      wrapper.childElementCount === 1 &&
      wrapper.firstElementChild?.tagName.toLowerCase() === 'p'
    ) {
      return wrapper.firstElementChild.innerHTML
    }
    return trimmed
  }
  const matched = trimmed.match(/^<p>([\s\S]*)<\/p>$/)
  return matched ? matched[1] : trimmed
}

export function renderOriginalMarkdown(value?: string | null): string {
  if (!value) return ''
  return stripParagraphWrapper(renderMixedMarkdownHtml(value))
}

export function renderMixedMarkdownHtml(value: string): string {
  return normalizeMarkdownInHtml(md.render(value))
}

export function renderInlineMarkdownInHtml(html: string): string {
  return normalizeMarkdownInHtml(html)
}

function normalizeMarkdownInHtml(html: string): string {
  if (!html.includes('**') && !html.includes('__')) return html
  if (typeof document === 'undefined') return html

  const wrapper = document.createElement('div')
  wrapper.innerHTML = html

  renderSplitStrongParagraphs(wrapper)
  renderInlineMarkdownTextNodes(wrapper)

  return wrapper.innerHTML
}

function renderSplitStrongParagraphs(root: HTMLElement) {
  const parents = new Set<Element>()
  root.querySelectorAll('p').forEach((paragraph) => {
    if (paragraph.parentElement && !paragraph.closest(SKIP_MARKDOWN_SELECTOR)) {
      parents.add(paragraph.parentElement)
    }
  })

  parents.forEach((parent) => {
    const children = Array.from(parent.children)
    let marker: '**' | '__' | null = null
    let start: HTMLParagraphElement | null = null
    let content: Element[] = []

    children.forEach((child) => {
      if (!(child instanceof HTMLParagraphElement)) {
        return
      }

      const currentMarker = getMarkerOnlyParagraph(child)
      if (currentMarker && !marker) {
        marker = currentMarker
        start = child
        content = []
        return
      }

      if (currentMarker && marker === currentMarker && start && content.length) {
        wrapElementsWithStrong(content)
        start.remove()
        child.remove()
        marker = null
        start = null
        content = []
        return
      }

      if (marker && !child.closest(SKIP_MARKDOWN_SELECTOR)) {
        content.push(child)
      }
    })
  })
}

function getMarkerOnlyParagraph(paragraph: HTMLParagraphElement): '**' | '__' | null {
  if (paragraph.closest(SKIP_MARKDOWN_SELECTOR)) return null
  const text = paragraph.textContent?.trim()
  if (text === '**') return '**'
  if (text === '__') return '__'
  return null
}

function wrapElementsWithStrong(elements: Element[]) {
  elements.forEach((element) => {
    if (!element.childNodes.length) return
    const strong = document.createElement('strong')
    Array.from(element.childNodes).forEach(node => strong.appendChild(node))
    element.appendChild(strong)
  })
}

function renderInlineMarkdownTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let current = walker.nextNode()

  while (current) {
    const node = current as Text
    if (shouldRenderInlineMarkdown(node)) {
      textNodes.push(node)
    }
    current = walker.nextNode()
  }

  textNodes.forEach((node) => {
    const rendered = md.renderInline(node.data)
    if (rendered === node.data) return

    const fragmentWrapper = document.createElement('span')
    fragmentWrapper.innerHTML = rendered
    const fragment = document.createDocumentFragment()
    Array.from(fragmentWrapper.childNodes).forEach(child => fragment.appendChild(child))
    node.replaceWith(fragment)
  })
}

function shouldRenderInlineMarkdown(node: Text): boolean {
  if (!INLINE_MARKDOWN_PATTERN.test(node.data)) return false

  const parent = node.parentElement
  if (!parent) return false
  return !parent.closest(SKIP_MARKDOWN_SELECTOR)
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeAttr(value: string): string {
  return escapeHtml(value)
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '&#10;')
}
