import axios from 'axios'
import type {
  DeleteResponse,
  DetailResponse,
  EditSubmitRequest,
  ListResponse,
  UploadResponse,
  SubmitRequest,
  SubmitResponse,
} from '../types/template'

const api = axios.create()

export async function uploadTemplate(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<UploadResponse>(
    '/api/template/upload',
    formData,
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

export async function listTemplates(page = 1, pageSize = 20): Promise<ListResponse> {
  const { data } = await api.get<ListResponse>('/api/template/list', {
    params: { page, page_size: pageSize },
  })
  return data
}

export async function deleteTemplate(templateId: string): Promise<DeleteResponse> {
  const { data } = await api.delete<DeleteResponse>(`/api/template/delete/${templateId}`)
  return data
}
