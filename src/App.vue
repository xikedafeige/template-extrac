<template>
  <TemplateList
    v-if="view === 'list'"
    @create="openCreate"
    @create-manual="openManualCreate"
    @edit="openEdit"
  />
  <div v-else-if="view === 'manual'" class="workbench-host">
    <TemplateManualCreate
      :key="workbenchVersion"
      @back="backToList"
      @created="onManualCreated"
    />
  </div>
  <div v-else-if="view === 'create'" class="workbench-host">
    <TemplateUploadCreate
      :key="workbenchVersion"
      @back="backToList"
      @created="onUploadCreated"
    />
  </div>
  <div v-else-if="view === 'workbench'" class="workbench-host">
    <TemplateWorkbench
      :template-id="workbenchTemplateId"
      @back="backToList"
    />
  </div>
  <div v-else-if="view === 'worklog'" class="workbench-host">
    <WorklogWorkbench
      :template-id="workbenchTemplateId"
      @back="backToList"
    />
  </div>
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
import TemplateUpload from './components/TemplateUpload.vue'
import TemplateEditor from './components/TemplateEditor.vue'
import MappingTable from './components/MappingTable.vue'
import TemplateList from './views/TemplateList.vue'
import TemplateWorkbench from './views/TemplateWorkbench.vue'
import WorklogWorkbench from './views/WorklogWorkbench.vue'
import TemplateManualCreate from './views/TemplateManualCreate.vue'
import TemplateUploadCreate from './views/TemplateUploadCreate.vue'
import { useTemplateStore } from './stores/template'
import { templateEditorFor } from './types/templateType'

type AppView = 'list' | 'create' | 'edit' | 'workbench' | 'worklog' | 'manual'

const store = useTemplateStore()
const view = ref<AppView>('list')
const detailLoading = ref(false)
const workbenchVersion = ref(0)
const workbenchTemplateId = ref('')

function openCreate() {
  workbenchVersion.value += 1
  view.value = 'create'
}

// 上传解析完成并落库后直接进工作台。旧的左右分栏页（TemplateEditor +
// MappingTable）不再路由过去；组件暂时保留，确认新流程稳了再清。
function onUploadCreated(templateId: string) {
  if (!templateId) {
    backToList()
    return
  }
  workbenchTemplateId.value = templateId
  view.value = 'workbench'
}

function openManualCreate() {
  workbenchVersion.value += 1
  view.value = 'manual'
}

// 手工建模存盘后直接进工作台继续细调，比回列表再点编辑少两步。
function onManualCreated(templateId: string, templateType: string) {
  if (!templateId) {
    backToList()
    return
  }
  workbenchTemplateId.value = templateId
  view.value = templateEditorFor(templateType)
}

function openEdit(templateId: string, templateType?: string) {
  workbenchTemplateId.value = templateId
  // 路由由类型表决定（src/types/templateType.ts）：工作记录表这类表单型
  // 模板走还原版式的独立页，其余（含未定义类型）走通用工作台。
  view.value = templateEditorFor(templateType)
}

function backToList() {
  store.resetForCreate()
  workbenchTemplateId.value = ''
  view.value = 'list'
}

function refreshWorkbench() {
  workbenchVersion.value += 1
}
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
}

.workbench-host {
  height: 100vh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

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
