import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: true, breaks: false, linkify: false })

function stripParagraphWrapper(html: string): string {
  const trimmed = html.trim()
  const matched = trimmed.match(/^<p>([\s\S]*)<\/p>$/)
  return matched ? matched[1] : trimmed
}

export function renderOriginalMarkdown(value?: string | null): string {
  if (!value) return ''
  return stripParagraphWrapper(md.render(value))
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
