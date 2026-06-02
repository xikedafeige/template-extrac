# 项目指引

## 工作区

- 当前项目目录：`C:\Users\BBG\Desktop\四川财经数字人\王炜对接\frontend`
- 这不是 Git 仓库，修改前后需要用文件内容和构建结果确认变更。
- 常规开发时忽略 `node_modules/` 和 `dist/`，不要手动编辑构建产物。

## 技术栈

- Vue 3 + TypeScript + Vite
- 状态管理：Pinia
- 富文本编辑：Tiptap / ProseMirror
- Markdown 渲染：markdown-it
- HTTP 请求：axios

## 常用命令

- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 类型检查并构建：`npm run build`
- 预览构建产物：`npm run preview`

## 项目结构

- `src/main.ts`：创建 Vue 应用并注册 Pinia。
- `src/App.vue`：页面主布局，上传区在顶部，上传模板后显示左侧编辑器和右侧映射表。
- `src/api/template.ts`：模板上传和提交接口，默认后端地址为 `http://localhost:8200`。
- `src/stores/template.ts`：模板 Markdown、占位符、章节、选中状态、本地持久化和提交数据组装逻辑。
- `src/components/TemplateUpload.vue`：上传 `.docx` 模板并写入 store。
- `src/components/TemplateEditor.vue`：Tiptap 编辑器，将 Markdown 和占位符渲染为可交互 chip。
- `src/components/MappingTable.vue`：右侧占位符映射、类型切换、字段绑定、prompt 编辑和提交。
- `src/editor/ChipNode.ts`：Tiptap inline atom 节点，用于占位符 chip。
- `src/editor/HtmlBlockNode.ts`：Tiptap block atom 节点，用于保留并展示 HTML 表格块。
- `src/types/template.ts`：接口请求、响应、章节和占位符类型定义。

## 后端接口约定

- `POST /api/template/upload`
  - 请求：`multipart/form-data`，字段名 `file`
  - 响应：`template_markdown`、`placeholders`、`sections`
- `POST /api/template/submit`
  - 请求：`template_markdown`、`sections`、`template_name`、可选 `template_description`、`custom_id`
  - 响应：`template_id`、`template_word_url`

## 关键业务逻辑

- 上传成功后调用 `store.setUploadResult()`，将后端解析出的 Markdown、占位符和章节写入全局状态。
- 编辑器把 `{{key}}` 渲染为 chip；普通 Markdown 走 `markdown-it`，HTML 表格块由 `HtmlBlockNode` 以 base64 编码保留原始 HTML。
- 右侧映射表可以修改占位符 key、切换 `TYPE_FILL` / `TYPE_DESCRIPTION`、绑定字段或填写 prompt。
- `store.buildSubmitSections()` 会按每个 section 的 `template_content` 中实际出现的 `{{key}}` 重建提交用占位符列表。
- store 会把模板内容、占位符、章节、模板名称和业务 ID 持久化到 `localStorage` 的 `template_store_data`。

## 开发注意事项

- 保持 Vue SFC 的 `<script setup lang="ts">` 写法。
- 修改占位符 key 时，要同步更新 `templateMarkdown` 和 `sections[].template_content`。
- 与编辑器同步相关的改动要注意 `skipNextSync`、`editorReady`、`selectedChipKey`，避免重复 setContent 或选中状态丢失。
- Tiptap 自定义节点的 DOM 属性是左右侧联动的基础，修改 `data-key`、`data-type`、`data-chip-key` 等属性时要同步检查编辑器和映射表。
- 当前源码中的中文显示为乱码，后续如需修复文案，应先确认文件真实编码和浏览器实际显示效果，避免把编码问题扩大到无关逻辑。
- 新增功能后优先运行 `npm run build` 验证类型检查和 Vite 构建。
