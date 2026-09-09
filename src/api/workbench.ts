import axios from 'axios'
import type {
  ApplyResponse,
  AssistantRequest,
  AssistantResponse,
  SaveResponse,
  TemplateDraft,
  WorkbenchResponse,
} from '../types/workbench'
import { toDraftPayload } from '../types/workbench'
import { getAuthHeaders } from './auth'

const api = axios.create({
  baseURL: import.meta.env.PROD ? '/performance-api' : '',
})

api.interceptors.request.use((config) => {
  Object.assign(config.headers, getAuthHeaders())
  return config
})

export async function getWorkbenchTemplate(templateId: string): Promise<WorkbenchResponse> {
  const { data } = await api.get<WorkbenchResponse>(`/api/template/workbench/${encodeURIComponent(templateId)}`)
  return data
}

export async function askWorkbenchAssistant(req: AssistantRequest): Promise<AssistantResponse> {
  const { data } = await api.post<AssistantResponse>('/api/template/workbench/assistant', {
    ...req,
    draft: toDraftPayload(req.draft),
  })
  return data
}

export async function applyWorkbenchPatch(
  templateId: string,
  draft: TemplateDraft,
  patch: AssistantResponse['data']['patch'],
  draftVersion: number,
  selected: Record<string, unknown>,
): Promise<ApplyResponse> {
  const { data } = await api.post<ApplyResponse>('/api/template/workbench/draft/apply', {
    template_id: templateId,
    draft: toDraftPayload(draft),
    patch,
    draft_version: draftVersion,
    selected,
  })
  return data
}

export async function saveWorkbenchTemplate(
  templateId: string,
  draft: TemplateDraft,
  draftVersion: number,
  templateName?: string,
): Promise<SaveResponse> {
  const { data } = await api.post<SaveResponse>('/api/template/workbench/save', {
    template_id: templateId,
    draft: toDraftPayload(draft),
    draft_version: draftVersion,
    // 每次保存都是派生新模板，名字由用户在弹窗里输入。
    template_name: templateName || '',
  })
  return data
}
