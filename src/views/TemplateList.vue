<template>
  <div class="template-list-page">
    <div class="page-header">
      <div>
        <h1>模板管理</h1>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          placeholder="搜索模板名称..."
          @keyup.enter="doSearch"
        />
        <button v-if="keyword" class="search-clear" title="清空" aria-label="清空搜索" @click="clearSearch">×</button>
      </div>
      <button class="btn-secondary" @click="doSearch">查询</button>
      <span v-if="activeKeyword" class="search-tag">
        当前筛选：{{ activeKeyword }}
        <button class="tag-clear" aria-label="清除筛选" @click="clearSearch">×</button>
      </span>
      <button class="btn-primary" @click="pickMode = true">
        <span class="plus-icon" aria-hidden="true">＋</span>
        新建模板
      </button>
    </div>

    <div class="list-container">
      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="listError" class="error-state">{{ listError }}</div>
      <div v-else-if="!items.length" class="empty-state">
        {{ activeKeyword ? `没有找到名称包含「${activeKeyword}」的模板` : '暂无模板数据' }}
      </div>
      <table v-else class="template-table">
        <thead>
          <tr>
            <th>模板名称</th>
            <th>模板类型</th>
            <th>来源模板</th>
            <th>描述</th>
            <th>创建时间</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.template_id"
            :class="{ 'is-selected': selectedTemplateId === item.template_id }"
            @click="selectTemplate(item)"
          >
            <td class="name-cell" :title="item.template_name || '未命名'">
              <input
                class="template-radio"
                type="radio"
                name="template-selection"
                :checked="selectedTemplateId === item.template_id"
                :aria-label="`选择模板 ${item.template_name || '未命名'}`"
                @click.stop="selectTemplate(item)"
              />
              <span v-html="highlight(item.template_name || '未命名')" />
            </td>
            <td>
              <span
                v-if="typeMeta(item.template_type)"
                class="type-tag"
                :class="`type-tag--${typeMeta(item.template_type)!.tone}`"
                :title="typeMeta(item.template_type)!.hint || ''"
              >{{ typeMeta(item.template_type)!.label }}</span>
              <span v-else-if="item.template_type" class="type-tag type-tag--unknown" :title="`未定义的类型：${item.template_type}`">{{ item.template_type }}</span>
            </td>
            <td class="source-cell" :title="item.base_template_name || item.base_template_id || ''">
              <span v-if="item.base_template_id" class="derived-tag">{{ item.base_template_name || item.base_template_id }}</span>
            </td>
            <td class="desc-cell" :title="item.template_description || ''">{{ item.template_description || '-' }}</td>
            <td>{{ formatTime(item.created_at) }}</td>
            <td>{{ formatTime(item.updated_at) }}</td>
            <td class="action-cell">
              <button class="btn-link" @click.stop="emit('edit', item.template_id, item.template_type)">编辑</button>
              <button
                v-if="isBase(item)"
                class="btn-link btn-disabled"
                disabled
                title="底版模板不允许删除"
              >删除</button>
              <button v-else class="btn-link btn-danger" @click.stop="askDelete(item)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!loading && total > 0" class="pagination">
        <div class="page-controls">
          <span class="page-total">共 {{ total }} 条</span>
          <button :disabled="page <= 1" @click="changePage(1)">首页</button>
          <button :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
          <button
            v-for="num in pageNumbers"
            :key="num"
            class="page-num"
            :class="{ active: num === page }"
            :disabled="num === page"
            @click="changePage(num)"
          >
            {{ num }}
          </button>
          <button :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
          <button :disabled="page >= totalPages" @click="changePage(totalPages)">末页</button>
          <span class="page-total">第 {{ page }} / {{ totalPages }} 页</span>
        </div>
      </div>
    </div>

    <!-- 删除确认：居中弹窗。原先用浏览器原生 confirm()，它固定贴在窗口顶部，
         与页面样式也不一致。 -->
    <div v-if="pending" class="modal-mask" @click.self="cancelDelete">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="del-title">
        <div class="modal-title" id="del-title">删除模板</div>
        <div class="modal-body">
          确定删除模板<strong>「{{ pending.template_name || '未命名' }}」</strong>？
          <div class="modal-hint">删除后不可恢复。</div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" :disabled="deleting" @click="cancelDelete">取消</button>
          <button class="btn-danger-solid" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中...' : '确定删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 轻提示：取代 alert()，不阻断操作，几秒后自消 -->
    <div v-if="toast" class="toast" :class="`toast--${toast.kind}`">{{ toast.text }}</div>

    <!-- 新建方式选择：上传文档自动解析，或从空白手工搭 -->
    <div v-if="pickMode" class="modal-mask" @click.self="pickMode = false">
      <div class="modal-card modal-card--wide" role="dialog" aria-modal="true" aria-labelledby="pick-title">
        <div class="modal-title" id="pick-title">新建模板</div>
        <div class="mode-list">
          <button class="mode-item" @click="chooseUpload">
            <span class="mode-icon">↑</span>
            <span class="mode-text">
              <strong>上传文档解析</strong>
              <em>选一份 Word，自动抽取正文与待填项，再微调变量映射</em>
            </span>
          </button>
          <button class="mode-item" @click="chooseManual">
            <span class="mode-icon">＋</span>
            <span class="mode-text">
              <strong>手工搭模板</strong>
              <em>从空白开始，自己加章节和变量，不需要文档</em>
            </span>
          </button>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="pickMode = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { deleteTemplate, listTemplates } from '../api/template'
import type { TemplateListItem } from '../types/template'
import { templateTypeMeta as typeMeta } from '../types/templateType'

const emit = defineEmits<{
  create: []
  createManual: []
  edit: [templateId: string, templateType?: string]
}>()

const pickMode = ref(false)

function chooseUpload() {
  pickMode.value = false
  emit('create')
}

function chooseManual() {
  pickMode.value = false
  emit('createManual')
}

const items = ref<TemplateListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const listError = ref('')
const selectedTemplateId = ref('')
const keyword = ref('')
// activeKeyword 是已生效的查询词，与输入框分开，避免边打字边触发请求
const activeKeyword = ref('')
const totalPages = computed(() => Math.max(Math.ceil(total.value / pageSize.value), 1))

// 页码按钮最多显示 7 个，当前页尽量居中
const pageNumbers = computed(() => {
  const max = 7
  const last = totalPages.value
  if (last <= max) return Array.from({ length: last }, (_, i) => i + 1)
  let start = Math.max(1, page.value - Math.floor(max / 2))
  const end = Math.min(last, start + max - 1)
  start = Math.max(1, end - max + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}

function highlight(name: string) {
  const safe = escapeHtml(name)
  const kw = activeKeyword.value.trim()
  if (!kw) return safe
  const pattern = escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safe.replace(new RegExp(pattern, 'gi'), match => `<mark>${match}</mark>`)
}

async function fetchList(options: { silent?: boolean } = {}) {
  // silent 用于删除后的补数据：不置 loading，避免表格闪一下。
  if (!options.silent) loading.value = true
  try {
    listError.value = ''
    const res = await listTemplates(page.value, pageSize.value, activeKeyword.value)
    if (res.code === 0 || res.code === 200 || Array.isArray(res.data?.items)) {
      items.value = res.data.items || []
      total.value = res.data.total || 0
      // 删除或筛选后当前页可能已越界，回退到最后一页
      if (!items.value.length && total.value > 0 && page.value > totalPages.value) {
        page.value = totalPages.value
        await fetchList(options)
      }
    } else {
      listError.value = res.message || '模板列表加载失败'
    }
  } catch (err) {
    console.error('获取列表失败:', err)
    listError.value = err instanceof Error ? err.message : '模板列表加载失败'
  } finally {
    if (!options.silent) loading.value = false
  }
}

function selectTemplate(item: TemplateListItem) {
  const id = String(item.template_id || '').trim()
  if (!id) return
  selectedTemplateId.value = id
  window.parent.postMessage(
    {
      type: 'template-selected',
      payload: { id, name: item.template_name || id },
    },
    '*',
  )
}

function doSearch() {
  activeKeyword.value = keyword.value.trim()
  page.value = 1
  fetchList()
}

function clearSearch() {
  keyword.value = ''
  activeKeyword.value = ''
  page.value = 1
  fetchList()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  page.value = nextPage
  fetchList()
}

/** 底版：没有 base_template_id 就是底版，不允许删除 */
function isBase(item: TemplateListItem) {
  return !String(item.base_template_id || '').trim()
}

const pending = ref<TemplateListItem | null>(null)
const deleting = ref(false)
const toast = ref<{ text: string; kind: 'ok' | 'err' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(text: string, kind: 'ok' | 'err' = 'ok') {
  toast.value = { text, kind }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, kind === 'err' ? 4000 : 2200)
}

function askDelete(item: TemplateListItem) {
  if (isBase(item)) return
  pending.value = item
}

function cancelDelete() {
  if (deleting.value) return
  pending.value = null
}

async function confirmDelete() {
  const item = pending.value
  if (!item || deleting.value) return
  deleting.value = true
  try {
    const res = await deleteTemplate(item.template_id)
    if (res.code === 0) {
      // 局部移除而不重拉：fetchList() 会把 loading 置 true，表格整体被
      // “加载中...”替掉再画回来，看起来就像整页刷新。
      items.value = items.value.filter(row => row.template_id !== item.template_id)
      total.value = Math.max(total.value - 1, 0)
      pending.value = null
      showToast(`已删除「${item.template_name || '未命名'}」`)
      // 本页被删空且不是第一页：静默回退一页，补上内容。
      if (!items.value.length && page.value > 1) {
        page.value -= 1
        await fetchList({ silent: true })
      } else if (!items.value.length && total.value > 0) {
        await fetchList({ silent: true })
      }
    } else {
      showToast(res.message || '删除失败', 'err')
      pending.value = null
    }
  } catch (err: any) {
    showToast(err.response?.data?.message || err.message || '删除失败', 'err')
    pending.value = null
  } finally {
    deleting.value = false
  }
}

function formatTime(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

onMounted(fetchList)

// 弹窗开着时支持 Esc 关闭，并锁住页面滚动（避免遮罩后面还能滚）。
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && pending.value && !deleting.value) cancelDelete()
}

watch(pending, value => {
  document.body.style.overflow = value ? 'hidden' : ''
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (toastTimer) clearTimeout(toastTimer)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.template-list-page {
  box-sizing: border-box;
  height: 100%;
  min-height: 100vh;
  padding: 24px 24px 32px;
  overflow-y: auto;
  background: linear-gradient(180deg, #f8fbff 0%, #f4f7fb 100%);
}

.page-header {
  max-width: 1200px;
  margin: 0 auto 16px;
}

.page-header h1 {
  margin: 0;
  color: #172033;
  font-size: 26px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 42px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.2);
  color: #ffffff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
  transform: translateY(-1px);
}

.plus-icon {
  font-size: 19px;
  font-weight: 400;
  line-height: 1;
}

.toolbar {
  max-width: 1200px;
  min-height: 58px;
  margin: 0 auto 18px;
  padding: 8px;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  border: 1px solid #e3eaf4;
  border-radius: 14px;
  background: rgba(255, 255, 255, .88);
  box-shadow: 0 8px 24px rgba(30, 64, 110, .06);
}

.search-box {
  position: relative;
  flex: 1 1 360px;
  min-width: 180px;
}

.search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  z-index: 1;
  color: #94a3b8;
  font-size: 22px;
  line-height: 1;
  transform: translateY(-54%) rotate(-20deg);
}

.search-input {
  box-sizing: border-box;
  width: 100%;
  height: 42px;
  padding: 0 38px 0 42px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: #f5f8fc;
  color: #263247;
  font-size: 14px;
  outline: none;
  transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
}

.search-input::placeholder {
  color: #9aa6b8;
}

.search-input:focus {
  border-color: #93b4fd;
  background: #ffffff;
  box-shadow: 0 0 0 3px #eff6ff;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 12px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  cursor: pointer;
  font-size: 16px;
  line-height: 19px;
  transform: translateY(-50%);
}

.search-clear:hover {
  background: #cbd5e1;
  color: #334155;
}

.btn-secondary {
  flex: 0 0 auto;
  height: 42px;
  padding: 0 22px;
  border: 1px solid #d6dfed;
  border-radius: 9px;
  background: #ffffff;
  color: #355173;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: border-color .18s ease, color .18s ease, background .18s ease, transform .18s ease;
}

.btn-secondary:hover {
  border-color: #93b4fd;
  background: #f5f8ff;
  color: #2563eb;
  transform: translateY(-1px);
}

.search-tag {
  flex: 0 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 240px;
  padding: 8px 10px 8px 12px;
  overflow: hidden;
  border: 1px solid #cfe0ff;
  border-radius: 9px;
  background: #f1f6ff;
  color: #3568c8;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tag-clear {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.list-container {
  max-width: 1200px;
  margin: 0 auto;
  overflow: auto;
  border: 1px solid #e1e8f2;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(30, 64, 110, .07);
}

.template-table {
  width: 100%;
  border-collapse: collapse;
}

.template-table th {
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f6f9fd;
  color: #66758b;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .02em;
  text-align: left;
}

.template-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  font-size: 14px;
}

.template-table tr:last-child td {
  border-bottom: none;
}

.template-table tr:hover td {
  background: #f8fafc;
}

.template-table tr.is-selected td {
  background: #eff6ff;
}

.template-radio {
  width: 16px;
  height: 16px;
  margin-right: 10px;
  accent-color: #2563eb;
  vertical-align: -3px;
}

.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 24px;
  color: #b91c1c;
  font-size: 14px;
}

.name-cell {
  max-width: 240px;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-tag {
  padding: 1px 6px;
  border-radius: 9px;
  background: #e8f2ff;
  color: #1868c0;
  font-size: 11px;
  font-weight: 400;
}

/* 每类模板一个色调，列表里一眼能分清。色值全部取低饱和度，
   与页面整体的淡色调一致，不抢模板名称的注意力。 */
.type-tag--blue {
  background: #e8f2ff;
  color: #1868c0;
}

.type-tag--green {
  background: #e6f6ed;
  color: #1a7f45;
}

.type-tag--amber {
  background: #fdf1de;
  color: #96601a;
}

.type-tag--violet {
  background: #f0ebfd;
  color: #5b3ec0;
}

/* 数据库里出现了未定义的 code：用中性灰并直接回显原值，
   方便发现脏数据，而不是默默不显示。 */
.type-tag--unknown {
  background: #f0f1f3;
  color: #6b7280;
}

/* 派生标识用中性灰，不和蓝色的类型标签抢注意力 */
.derived-tag {
  padding: 1px 6px;
  border-radius: 9px;
  background: #f0f2f6;
  color: #626b7a;
  font-size: 11px;
  font-weight: 400;
  max-width: 180px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.source-cell {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-cell :deep(mark) {
  padding: 0 1px;
  border-radius: 2px;
  background: #fef08a;
  color: #0f172a;
}

.desc-cell {
  max-width: 300px;
  overflow: hidden;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-cell {
  white-space: nowrap;
}

.btn-link {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 13px;
}

.btn-link:hover {
  background: #eff6ff;
}

.btn-danger {
  color: #dc2626;
}

.btn-danger:hover {
  background: #fef2f2;
}

/* 底版的删除按钮：置灰不可点，但仍然占位，避免行间按钮位置跳动 */
.btn-disabled {
  color: #b6bcc7;
  cursor: not-allowed;
}

.btn-disabled:hover {
  background: transparent;
}

/* ---- 居中确认弹窗 ---- */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(17, 24, 39, 0.42);
  animation: mask-in .16s ease;
}

.modal-card {
  width: 100%;
  max-width: 380px;
  padding: 22px 24px 18px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.22);
  animation: card-in .18s ease;
}

.modal-card--wide { max-width: 440px; }

/* 新建方式二选一 */
.mode-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.mode-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid #e2e8f2;
  border-radius: 11px;
  background: #ffffff;
  cursor: pointer;
  text-align: left;
  transition: border-color .16s ease, background .16s ease;
}

.mode-item:hover {
  border-color: #2563eb;
  background: #f7faff;
}

.mode-icon {
  flex: 0 0 30px;
  height: 30px;
  border-radius: 8px;
  background: #eff5ff;
  color: #1d4ed8;
  text-align: center;
  font-size: 15px;
  line-height: 30px;
}

.mode-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.mode-text strong {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}

.mode-text em {
  color: #8b93a3;
  font-size: 12px;
  font-style: normal;
  line-height: 1.5;
}

.modal-title {
  margin-bottom: 10px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  color: #47536b;
  font-size: 14px;
  line-height: 1.7;
}

.modal-body strong {
  color: #1f2937;
  font-weight: 600;
}

.modal-hint {
  margin-top: 4px;
  color: #8b93a3;
  font-size: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.modal-actions .btn-secondary {
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
}

.btn-danger-solid {
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 9px;
  background: #dc2626;
  color: #ffffff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: background .18s ease;
}

.btn-danger-solid:hover:not(:disabled) {
  background: #b91c1c;
}

.btn-danger-solid:disabled,
.modal-actions .btn-secondary:disabled {
  opacity: .6;
  cursor: not-allowed;
}

@keyframes mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(-6px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ---- 轻提示 ---- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  z-index: 70;
  padding: 10px 18px;
  border-radius: 10px;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.18);
  color: #ffffff;
  font-size: 13px;
  transform: translateX(-50%);
  animation: toast-in .2s ease;
}

.toast--ok {
  background: #16a34a;
}

.toast--err {
  background: #dc2626;
}

@keyframes toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid #e2e8f0;
}

.page-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.page-controls .page-total:first-child {
  margin-right: 6px;
}

.page-controls .page-total:last-child {
  margin-left: 6px;
}

.pagination button {
  min-width: 30px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font-size: 13px;
}

.pagination button:hover:not(:disabled) {
  border-color: #93b4fd;
  color: #2563eb;
}

.pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.page-num.active {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
  cursor: default;
  opacity: 1;
}

.page-total {
  color: #64748b;
  font-size: 13px;
}

.loading-state,
.empty-state {
  padding: 60px;
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
}
@media (max-width: 720px) {
  .template-list-page {
    padding: 24px 14px 32px;
  }

  .toolbar {
    flex-wrap: wrap;
  }

  .search-box {
    flex-basis: calc(100% - 98px);
  }

  .btn-primary {
    width: 100%;
  }
}
</style>
