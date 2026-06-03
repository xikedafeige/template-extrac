<template>
  <div class="template-list-page">
    <div class="page-header">
      <h1>模板管理</h1>
      <button class="btn-primary" @click="emit('create')">新建模板</button>
    </div>

    <div class="list-container">
      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="!items.length" class="empty-state">暂无模板数据</div>
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
            <td class="name-cell">{{ item.template_name || '未命名' }}</td>
            <td class="desc-cell">{{ item.template_description || '-' }}</td>
            <td>{{ formatTime(item.created_at) }}</td>
            <td>{{ formatTime(item.updated_at) }}</td>
            <td class="action-cell">
              <button class="btn-link" @click="emit('edit', item.template_id)">编辑</button>
              <button class="btn-link btn-danger" @click="handleDelete(item)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="total > pageSize" class="pagination">
        <button :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ totalPages }} 页（{{ total }} 条）</span>
        <button :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
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
const pageSize = 20
const loading = ref(false)
const totalPages = computed(() => Math.max(Math.ceil(total.value / pageSize), 1))

async function fetchList() {
  loading.value = true
  try {
    const res = await listTemplates(page.value, pageSize)
    if (res.code === 0) {
      items.value = res.data.items || []
      total.value = res.data.total || 0
    }
  } catch (err) {
    console.error('获取列表失败:', err)
  } finally {
    loading.value = false
  }
}

function changePage(nextPage: number) {
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
  margin: 0 auto 24px;
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
  max-width: 200px;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid #e2e8f0;
}

.pagination button {
  height: 30px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  font-size: 13px;
}

.pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.pagination span {
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
