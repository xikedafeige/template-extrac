import axios from 'axios'
import type {
  ApplyResponse,
  AssistantRequest,
  AssistantResponse,
  SaveResponse,
  TemplateDraft,
  WorkbenchResponse,
} from '../types/workbench'

const api = axios.create({
  baseURL: import.meta.env.PROD ? '/performance-api' : '',
})

export async function getWorkbenchTemplate(templateId: string): Promise<WorkbenchResponse> {
  const { data } = await api.get<WorkbenchResponse>(`/api/template/workbench/${encodeURIComponent(templateId)}`)
  return data
}

export async function askWorkbenchAssistant(req: AssistantRequest): Promise<AssistantResponse> {
  const { data } = await api.post<AssistantResponse>('/api/template/workbench/assistant', req)
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
    draft,
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
): Promise<SaveResponse> {
  const { data } = await api.post<SaveResponse>('/api/template/workbench/save', {
    template_id: templateId,
    draft,
    draft_version: draftVersion,
  })
  return data
}
