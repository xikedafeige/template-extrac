function readQueryValue(keys: string[]): string {
  if (typeof window === 'undefined') return ''
  const query = new URLSearchParams(window.location.search)
  return keys.map((key) => query.get(key)?.trim() || '').find(Boolean) || ''
}

/** 从 URL 读取业务上下文；每次调用动态读，支持运行期切换。 */
export function getUrlContext(): { type: string; commissionTaskId: string } {
  return {
    type: readQueryValue(['type']),
    commissionTaskId: readQueryValue(['commission_task_id', 'commissionTaskId']),
  }
}
