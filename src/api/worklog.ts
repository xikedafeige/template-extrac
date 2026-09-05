import axios from 'axios'
import type { WorklogResponse } from '../types/worklog'
import type { TemplateDraft } from '../types/workbench'
import { toDraftPayload } from '../types/workbench'

const FIXED_AUTH_HEADERS = {
  token: 'feb9ff10-508d-4f32-8050-10bfea07b2e1',
  tenantid: '1',
}

const api = axios.create({
  baseURL: import.meta.env.PROD ? '/performance-api' : '',
  headers: FIXED_AUTH_HEADERS,
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
