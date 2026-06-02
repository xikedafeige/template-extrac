import axios from 'axios'
import type {
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
