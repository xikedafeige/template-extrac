import axios from 'axios'
import type { WorklogResponse } from '../types/worklog'
import type { TemplateDraft } from '../types/workbench'
import { toDraftPayload } from '../types/workbench'
import { getAuthHeaders } from './auth'

const api = axios.create({
  baseURL: import.meta.env.PROD ? '/performance-api' : '',
})

api.interceptors.request.use((config) => {
  Object.assign(config.headers, getAuthHeaders())
  return config
})

export async function getWorklogTemplate(templateId: string): Promise<WorklogResponse> {
  const { data } = await api.get<WorklogResponse>(
    `/api/template/worklog/${encodeURIComponent(templateId)}`,
  )
  return data
}

/** 用未保存的草稿重算版式预览，让 AI 修改立刻可见 */
export async function previewWorklogTemplate(
  templateId: string,
  draft: TemplateDraft,
): Promise<WorklogResponse> {
  const { data } = await api.post<WorklogResponse>(
    `/api/template/worklog/${encodeURIComponent(templateId)}/preview`,
    { draft: toDraftPayload(draft) },
  )
  return data
}
