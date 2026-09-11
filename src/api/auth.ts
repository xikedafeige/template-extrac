const TOKEN_KEYS = ['token', 'Token', 'OVERTOKEN', 'overtoken', 'access_token']
const TENANT_KEYS = ['tenantid', 'tenantId', 'Tenantid', 'TenantId']

function readQueryValue(keys: string[]): string {
  if (typeof window === 'undefined') return ''
  const query = new URLSearchParams(window.location.search)
  return keys.map((key) => query.get(key)?.trim() || '').find(Boolean) || ''
}

function readStorageValue(keys: string[]): string {
  if (typeof window === 'undefined') return ''
  for (const key of keys) {
    const value = window.localStorage.getItem(key)?.trim() || ''
    if (value) return value
  }
  return ''
}

/** URL 参数优先，其次读取本地缓存；每次请求动态读取，支持运行期间切换 token。 */
export function getAuthHeaders(): Record<string, string> {
  const token = readQueryValue(TOKEN_KEYS) || readStorageValue(TOKEN_KEYS)
  const tenantid = readQueryValue(TENANT_KEYS) || readStorageValue(TENANT_KEYS) || '1'
  return token ? { token, tenantid } : { tenantid }
}
