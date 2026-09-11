// The confirm-then-delete flow behind every "Delete account" row.
//
// One destructive-style Alert is the confirmation gate; deletion happens
// only on the second tap. The copy names what goes (every table the user
// owns) and what does not (an App Store subscription is Apple's to
// cancel), which is what App Store review expects next to the action.
import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import { t, type Locale } from '@voice-expense/shared'
import { deleteAccount } from '../services/deleteAccount'

export function useDeleteAccount(userId: string | undefined, locale: Locale) {
  const [deleting, setDeleting] = useState(false)

  const requestDeleteAccount = useCallback(() => {
    if (deleting || !userId) return
    Alert.alert(t('privacy.delete_all_title', locale), t('privacy.delete_all_body', locale), [
      { text: t('common.cancel', locale), style: 'cancel' },
      {
        text: t('privacy.delete_all_confirm', locale),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          try {
            await deleteAccount(userId)
            // Success signs the user out; the screen unmounts with the
            // session, so there is nothing to reset here.
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            Alert.alert(t('privacy.delete_all_failed', locale), message)
            setDeleting(false)
          }
        },
      },
    ])
  }, [deleting, userId, locale])

  return { deleting, requestDeleteAccount }
}
