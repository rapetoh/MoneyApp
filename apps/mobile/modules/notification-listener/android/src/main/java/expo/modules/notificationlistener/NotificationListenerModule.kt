package expo.modules.notificationlistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {

  companion object {
    // Held so MoneyNotificationListenerService can emit events into this module
    var instance: NotificationListenerModule? = null
  }

  override fun definition() = ModuleDefinition {
    Name("NotificationListenerModule")

    Events("onPaymentNotification")

    OnCreate {
      instance = this@NotificationListenerModule
    }

    OnDestroy {
      instance = null
    }

    AsyncFunction("isPermissionGranted") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      isNotificationListenerEnabled(context)
    }

    Function("openPermissionSettings") {
      val context = appContext.reactContext ?: return@Function
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  fun emitPaymentNotification(payload: Map<String, Any>) {
    sendEvent("onPaymentNotification", payload)
  }

  private fun isNotificationListenerEnabled(context: Context): Boolean {
    val flat = Settings.Secure.getString(
      context.contentResolver,
      "enabled_notification_listeners"
    ) ?: return false
    val componentName = ComponentName(context, MoneyNotificationListenerService::class.java)
    val flatSplit = flat.split(":").filter { it.isNotEmpty() }
    return flatSplit.any { ComponentName.unflattenFromString(it) == componentName }
  }
}
