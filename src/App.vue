<template>
  <TemplateList
    v-if="view === 'list'"
    @create="openCreate"
    @edit="openEdit"
  />
  <div v-else class="app" @dragstart.capture.prevent @drop.capture.prevent>
    <TemplateUpload
      :mode="view === 'edit' ? 'edit' : 'create'"
      @back-list="backToList"
      @uploaded="refreshWorkbench"
    />
    <div v-if="detailLoading" class="workbench-loading">加载模板数据中...</div>
    <div v-else class="main">
      <div class="editor-panel">
        <TemplateEditor :key="workbenchVersion" />
      </div>
      <div class="config-panel">
        <MappingTable
          :key="workbenchVersion"
          :is-edit-mode="view === 'edit'"
          @submit="backToList"
          @edit="backToList"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getTemplateDetail } from './api/template'
import TemplateUpload from './components/TemplateUpload.vue'
import TemplateEditor from './components/TemplateEditor.vue'
import MappingTable from './components/MappingTable.vue'
import TemplateList from './views/TemplateList.vue'
import { useTemplateStore } from './stores/template'

type AppView = 'list' | 'create' | 'edit'

const store = useTemplateStore()
const view = ref<AppView>('list')
const detailLoading = ref(false)
const workbenchVersion = ref(0)

function openCreate() {
  store.resetForCreate()
  workbenchVersion.value += 1
  view.value = 'create'
}

async function openEdit(templateId: string) {
  view.value = 'edit'
  detailLoading.value = true
  try {
    const res = await getTemplateDetail(templateId)
    if (res.code === 0 && res.data) {
      store.loadFromDetail(res.data)
      refreshWorkbench()
    } else {
      alert('获取模板详情失败')
      backToList()
    }
  } catch (err: any) {
    alert('获取模板详情失败: ' + (err.response?.data?.message || err.message))
    backToList()
  } finally {
    detailLoading.value = false
  }
}

function backToList() {
  store.resetForCreate()
  view.value = 'list'
}

function refreshWorkbench() {
  workbenchVersion.value += 1
}
</script>

<style>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.workbench-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 14px;
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-panel {
  flex: 1;
  min-width: 0;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.config-panel {
  width: 420px;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.96)),
    radial-gradient(circle at top right, rgba(191, 219, 254, 0.35), transparent 28%);
}
</style>
