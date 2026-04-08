import React, { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native'
import type { Category } from '@voice-expense/shared'
import { Colors, Typography, Spacing, Radius } from '../theme'
import { merchantColor } from '@voice-expense/shared'

interface Props {
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreateCategory: (name: string) => Promise<Category | null>
}

function CategoryChip({ category, selected, onPress }: {
  category: Category
  selected: boolean
  onPress: () => void
}) {
  const color = category.color ?? merchantColor(category.name)
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: color + '22', borderColor: color }]}
    >
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={[styles.chipLabel, selected && { color, fontFamily: Typography.fontFamily.sansSemiBold }]}>
        {category.name}
      </Text>
    </Pressable>
  )
}

export function CategoryPicker({ categories, selectedId, onSelect, onCreateCategory }: Props) {
  const [modalVisible, setModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const selected = categories.find((c) => c.id === selectedId)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const created = await onCreateCategory(name)
    setCreating(false)
    if (created) {
      onSelect(created.id)
      setNewName('')
      setModalVisible(false)
    } else {
      Alert.alert('Error', 'Could not create category. It may already exist.')
    }
  }

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => setModalVisible(true)}
      >
        {selected ? (
          <>
            <View style={[styles.triggerDot, { backgroundColor: selected.color ?? merchantColor(selected.name) }]} />
            <Text style={styles.triggerSelected}>{selected.name}</Text>
          </>
        ) : (
          <Text style={styles.triggerPlaceholder}>Select category…</Text>
        )}
        <Text style={styles.triggerChevron}>›</Text>
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Category</Text>
            <Pressable onPress={() => setModalVisible(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>

          {/* None option */}
          <Pressable
            style={[styles.listRow, !selectedId && styles.listRowSelected]}
            onPress={() => { onSelect(null); setModalVisible(false) }}
          >
            <Text style={styles.listRowLabel}>None</Text>
            {!selectedId && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>

          <FlatList
            data={categories}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.listRow, selectedId === item.id && styles.listRowSelected]}
                onPress={() => { onSelect(item.id); setModalVisible(false) }}
              >
                <View style={[styles.listDot, { backgroundColor: item.color ?? merchantColor(item.name) }]} />
                <Text style={styles.listRowLabel}>{item.name}</Text>
                {selectedId === item.id && <Text style={styles.checkmark}>✓</Text>}
              </Pressable>
            )}
            ListFooterComponent={
              <View style={styles.createSection}>
                <Text style={styles.createLabel}>New category</Text>
                <View style={styles.createRow}>
                  <TextInput
                    style={styles.createInput}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Category name"
                    placeholderTextColor={Colors.textMuted}
                    onSubmitEditing={handleCreate}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={[styles.createButton, (!newName.trim() || creating) && styles.createButtonDisabled]}
                    onPress={handleCreate}
                    disabled={!newName.trim() || creating}
                  >
                    <Text style={styles.createButtonText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            }
          />
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  triggerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  triggerSelected: {
    flex: 1,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  triggerPlaceholder: {
    flex: 1,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textMuted,
  },
  triggerChevron: {
    fontSize: 20,
    color: Colors.textMuted,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  modal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.text,
  },
  modalClose: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  listRowSelected: {
    backgroundColor: Colors.primaryLight,
  },
  listDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  listRowLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  checkmark: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
  },
  createSection: {
    padding: Spacing.base,
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  createLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  createRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  createInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  createButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.sm,
    color: Colors.white,
  },
})
