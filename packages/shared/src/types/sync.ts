export type SyncOperation = 'create' | 'update' | 'delete'
export type SyncEntityType = 'transaction' | 'category' | 'budget' | 'recurring_rule'
export type ConflictResolution = 'last_write_wins' | 'kept_server' | 'kept_client' | 'merged'

export interface SyncQueueItem {
  id: string
  operation: SyncOperation
  entity_type: SyncEntityType
  entity_id: string
  payload: string // JSON serialized
  client_timestamp: string
  retry_count: number
  last_error: string | null
  is_pending_ai: boolean
}

export interface DevicePlatform {
  platform: 'ios' | 'android' | 'web' | 'desktop_mac' | 'desktop_win'
}
