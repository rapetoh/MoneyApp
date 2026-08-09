export type SyncOperation = 'create' | 'update' | 'delete'
export type SyncEntityType = 'transaction' | 'category' | 'budget' | 'recurring_rule'
export type ConflictResolution = 'last_write_wins' | 'kept_server' | 'kept_client' | 'merged'

export interface DevicePlatform {
  platform: 'ios' | 'android' | 'web' | 'desktop_mac' | 'desktop_win'
}
