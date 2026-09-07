import axios from 'axios'
import type {
  DeleteResponse,
  DetailResponse,
  EditSubmitRequest,
  ListResponse,
  UploadResponse,
  SubmitRequest,
  SubmitResponse,
  GeneratePromptRequest,
  GeneratePromptResponse,
  V2CreateRequest,
} from '../types/template'

const FIXED_AUTH_HEADERS = {
  token: 'feb9ff10-508d-4f32-8050-10bfea07b2e1',
  tenantid: '1',
}

const api = axios.create({
  baseURL: import.meta.env.PROD ? '/performance-api' : '',
  headers: FIXED_AUTH_HEADERS,
})

export async function uploadTemplate(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<UploadResponse>(
    '/api/template/upload',
    formData,
  )
  return data
}

/** 手工建模：不上传文档，直接提交章节/变量结构 */
export async function createTemplateV2(
  payload: V2CreateRequest,
): Promise<SubmitResponse> {
  const { data } = await api.post<SubmitResponse>(
    '/api/template/v2/create',
    payload,
  )
  return data
}

/**
 * 上传 Word 并直接建好模板，返回 template_id 供工作台接手。
 *
 * 后端把原来 /upload + /submit 两步合成一个接口；/upload 本身保留不动。
 * 解析要逐章调大模型，超时放到 5 分钟。
 */
export async function uploadTemplateToWorkbench(
  file: File,
): Promise<SubmitResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<SubmitResponse>(
    '/api/template/upload-to-workbench',
    formData,
    { timeout: 300000 },
  )
  return data
}

export async function submitTemplate(
  req: SubmitRequest,
): Promise<SubmitResponse> {
  const { data } = await api.post<SubmitResponse>('/api/template/submit', req)
  return data
}

export async function editTemplate(
  req: EditSubmitRequest,
): Promise<SubmitResponse> {
  const { data } = await api.put<SubmitResponse>('/api/template/edit', req)
  return data
}

export async function getTemplateDetail(templateId: string): Promise<DetailResponse> {
  const { data } = await api.get<DetailResponse>(`/api/template/detail/${templateId}`)
  return data
}

export async function listTemplates(
  page = 1,
  pageSize = 20,
  templateName = '',
): Promise<ListResponse> {
  const { data } = await api.get<ListResponse>('/api/template/list', {
    params: {
      page,
      page_size: pageSize,
      ...(templateName.trim() ? { template_name: templateName.trim() } : {}),
    },
  })
  return data
}

export async function deleteTemplate(templateId: string): Promise<DeleteResponse> {
  const { data } = await api.delete<DeleteResponse>(`/api/template/delete/${templateId}`)
  return data
}

export async function generatePlaceholderPrompt(
  req: GeneratePromptRequest,
): Promise<GeneratePromptResponse> {
  const { data } = await api.post<GeneratePromptResponse>(
    '/api/template/generate-prompt',
    req,
  )
  return data
}
