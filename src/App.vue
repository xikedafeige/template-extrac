<template>
  <div class="app" @dragstart.capture.prevent @drop.capture.prevent>
    <TemplateUpload />
    <div class="main">
      <div class="editor-panel">
        <TemplateEditor />
      </div>
      <div class="config-panel">
        <MappingTable />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TemplateUpload from './components/TemplateUpload.vue'
import TemplateEditor from './components/TemplateEditor.vue'
import MappingTable from './components/MappingTable.vue'
</script>

<style>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
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
