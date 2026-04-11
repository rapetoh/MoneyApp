/**
 * Lightweight event bus for cross-screen data sync.
 *
 * Problem: each screen mounts its own hook instance with independent state.
 * When RecordScreen saves a transaction, only that hook instance's state updates.
 * HomeScreen, ExpensesScreen, etc. don't know until Supabase realtime fires
 * (which requires the sync queue to drain first — can be seconds later).
 *
 * Solution: any hook that writes local data emits an event here.
 * All other mounted hook instances subscribe and re-read from SQLite immediately.
 * This gives instant cross-screen updates with zero network dependency.
 */
import { DeviceEventEmitter } from 'react-native'

export const DataEvents = {
  TRANSACTIONS_CHANGED: 've:transactions:changed',
  BUDGET_CHANGED: 've:budget:changed',
  PROFILE_CHANGED: 've:profile:changed',

  emitTransactions: (userId: string) =>
    DeviceEventEmitter.emit(DataEvents.TRANSACTIONS_CHANGED, userId),

  emitBudget: (userId: string) =>
    DeviceEventEmitter.emit(DataEvents.BUDGET_CHANGED, userId),

  emitProfile: (userId: string) =>
    DeviceEventEmitter.emit(DataEvents.PROFILE_CHANGED, userId),

  onTransactions: (userId: string, handler: () => void) => {
    const sub = DeviceEventEmitter.addListener(
      DataEvents.TRANSACTIONS_CHANGED,
      (uid: string) => { if (uid === userId) handler() },
    )
    return () => sub.remove()
  },

  onBudget: (userId: string, handler: () => void) => {
    const sub = DeviceEventEmitter.addListener(
      DataEvents.BUDGET_CHANGED,
      (uid: string) => { if (uid === userId) handler() },
    )
    return () => sub.remove()
  },

  onProfile: (userId: string, handler: () => void) => {
    const sub = DeviceEventEmitter.addListener(
      DataEvents.PROFILE_CHANGED,
      (uid: string) => { if (uid === userId) handler() },
    )
    return () => sub.remove()
  },
}
