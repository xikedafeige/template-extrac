<template>
  <div class="template-list-page">
    <div class="page-header">
      <h1>模板管理</h1>
      <button class="btn-primary" @click="emit('create')">新建模板</button>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          placeholder="按模板名称搜索，支持部分匹配"
          @keyup.enter="doSearch"
        />
        <button v-if="keyword" class="search-clear" title="清空" @click="clearSearch">×</button>
      </div>
      <button class="btn-secondary" @click="doSearch">查询</button>
      <span v-if="activeKeyword" class="search-tag">
        当前筛选：{{ activeKeyword }}
        <button class="tag-clear" @click="clearSearch">×</button>
      </span>
    </div>

    <div class="list-container">
      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="!items.length" class="empty-state">
        {{ activeKeyword ? `没有找到名称包含「${activeKeyword}」的模板` : '暂无模板数据' }}
      </div>
      <table v-else class="template-table">
        <thead>
          <tr>
            <th>模板名称</th>
            <th>描述</th>
            <th>创建时间</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.template_id">
            <td class="name-cell" :title="item.template_name || '未命名'">
              <span v-html="highlight(item.template_name || '未命名')" />
            </td>
            <td class="desc-cell" :title="item.template_description || ''">{{ item.template_description || '-' }}</td>
            <td>{{ formatTime(item.created_at) }}</td>
            <td>{{ formatTime(item.updated_at) }}</td>
            <td class="action-cell">
              <button class="btn-link" @click="emit('edit', item.template_id)">编辑</button>
              <button class="btn-link btn-danger" @click="handleDelete(item)">删除</button>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { deleteTemplate, listTemplates } from '../api/template'
import type { TemplateListItem } from '../types/template'

const emit = defineEmits<{
  create: []
  edit: [templateId: string]
}>()

const items = ref<TemplateListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
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

async function fetchList() {
  loading.value = true
  try {
    const res = await listTemplates(page.value, pageSize.value, activeKeyword.value)
    if (res.code === 0) {
      items.value = res.data.items || []
      total.value = res.data.total || 0
      // 删除或筛选后当前页可能已越界，回退到最后一页
      if (!items.value.length && total.value > 0 && page.value > totalPages.value) {
        page.value = totalPages.value
        await fetchList()
      }
    }
  } catch (err) {
    console.error('获取列表失败:', err)
  } finally {
    loading.value = false
  }
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

async function handleDelete(item: TemplateListItem) {
  if (!confirm(`确定删除模板「${item.template_name || '未命名'}」？`)) return

  try {
    const res = await deleteTemplate(item.template_id)
    if (res.code === 0) {
      if (items.value.length === 1 && page.value > 1) {
        page.value -= 1
      }
      fetchList()
    } else {
      alert('删除失败: ' + res.message)
    }
  } catch (err: any) {
    alert('删除失败: ' + (err.response?.data?.message || err.message))
  }
}

function formatTime(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

onMounted(fetchList)
</script>

<style scoped>
.template-list-page {
  min-height: 100vh;
  padding: 32px 24px;
  background: #f8fafc;
}

.page-header {
  max-width: 1200px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header h1 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
  font-weight: 700;
}

.btn-primary {
  height: 36px;
  padding: 0 20px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
}

.toolbar {
  max-width: 1200px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.search-box {
  position: relative;
  width: 300px;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 30px 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: #93b4fd;
  box-shadow: 0 0 0 3px #eff6ff;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 8px;
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  transform: translateY(-50%);
}

.search-clear:hover {
  color: #dc2626;
}

.btn-secondary {
  height: 36px;
  padding: 0 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.btn-secondary:hover {
  border-color: #93b4fd;
  color: #2563eb;
}

.search-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px 5px 10px;
  border: 1px solid #bfdbfe;
  border-radius: 99px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
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
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
}

.template-table {
  width: 100%;
  border-collapse: collapse;
}

.template-table th {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
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

.name-cell {
  max-width: 240px;
  overflow: hidden;
  font-weight: 500;
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
</style>
