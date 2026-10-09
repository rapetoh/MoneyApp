import type { useRouter } from 'expo-router'

type Router = ReturnType<typeof useRouter>

/**
 * Back, or Today when there is nothing behind (Oct 9 2026).
 *
 * A screen opened from a widget, a notification or a link can be the only
 * screen in the stack: `router.back()` then does nothing and the person is
 * stuck (owner: Quick entry from the widget's Type button could not be
 * cancelled). Every Cancel / Back / Done that leaves a screen goes through
 * here instead.
 */
export function goBack(router: Router): void {
  if (router.canGoBack()) router.back()
  else router.replace('/(tabs)')
}
