/**
 * Global failure surface for the sync outbox (fix-plan 1.6 point 4). The
 * dead-letter recovery API (`getDeadLetterEntries`/`clearDeadLetterEntry`)
 * has had zero callers until this component — a stuck queue used to be
 * invisible: the app would look fully synced while a write silently sat
 * dead forever. Mounted once, app-wide, in `app/_layout.tsx`; renders
 * nothing when there is nothing dead-lettered.
 *
 * This is the lightweight, always-mounted banner; the fuller "sync health"
 * row in Settings (last_error detail, `synced_at` per device) is a
 * separate surface outside this item's file ownership.
 */
import { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Colors, Typography, Spacing, Radius } from '../theme'
import { syncManager } from '../services/sync/SyncManager'
import { getDeadLetterEntries, clearDeadLetterEntry, retryDeadLetterEntry, type QueueEntry } from '../services/sync/syncQueue'

export function SyncFailureBanner() {
  const insets = useSafeAreaInsets()
  const [deadCount, setDeadCount] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [entries, setEntries] = useState<QueueEntry[]>([])

  const refreshEntries = useCallback(async () => {
    setEntries(await getDeadLetterEntries())
  }, [])

  useEffect(() => {
    return syncManager.addListener((_syncing, _pending, dead) => {
      setDeadCount(dead)
    })
  }, [])

  useEffect(() => {
    if (deadCount > 0) {
      refreshEntries()
    } else {
      setExpanded(false)
      setEntries([])
    }
  }, [deadCount, refreshEntries])

  if (deadCount === 0) return null

  async function handleRetry(id: number) {
    await retryDeadLetterEntry(id)
    await refreshEntries()
    syncManager.drainQueue()
  }

  async function handleRetryAll() {
    await Promise.all(entries.map((entry) => retryDeadLetterEntry(entry.id)))
    await refreshEntries()
    syncManager.drainQueue()
  }

  async function handleDiscard(id: number) {
    await clearDeadLetterEntry(id)
    await refreshEntries()
  }

  return (
    <View style={[styles.container, { top: insets.top }]} pointerEvents="box-none">
      <Pressable
        style={styles.pill}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${deadCount} ${deadCount === 1 ? 'item' : 'items'} failed to sync`}
      >
        <Text style={styles.message}>
          {deadCount === 1 ? "1 item couldn't sync" : `${deadCount} items couldn't sync`}
        </Text>
        <Text style={styles.chevron}>{expanded ? 'Hide' : 'Details'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.panel}>
          <ScrollView style={styles.list} nestedScrollEnabled>
            {entries.map((entry) => (
              <View key={entry.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {entry.operation} · {entry.entity_type}
                  </Text>
                  <Text style={styles.rowError} numberOfLines={2}>
                    {entry.last_error ?? 'Unknown error'}
                  </Text>
                </View>
                <Pressable onPress={() => handleRetry(entry.id)} hitSlop={8} style={styles.action}>
                  <Text style={styles.actionText}>Retry</Text>
                </Pressable>
                <Pressable onPress={() => handleDiscard(entry.id)} hitSlop={8} style={styles.action}>
                  <Text style={styles.discardText}>Discard</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          {entries.length > 1 && (
            <Pressable onPress={handleRetryAll} style={styles.retryAll}>
              <Text style={styles.retryAllText}>Retry all</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.destructive,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  message: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: Typography.size.sm,
  },
  chevron: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    opacity: 0.9,
  },
  panel: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    borderBottomWidth: 1,
    borderColor: Colors.line,
    maxHeight: 280,
  },
  list: {
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: Colors.ink,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: Typography.size.sm,
    textTransform: 'capitalize',
  },
  rowError: {
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  action: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  actionText: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: Typography.size.sm,
  },
  discardText: {
    color: Colors.destructive,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: Typography.size.sm,
  },
  retryAll: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  retryAllText: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: Typography.size.sm,
  },
})
