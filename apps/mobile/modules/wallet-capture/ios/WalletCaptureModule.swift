// Apple Pay capture — the bridge between the "Log Expense in Murmur" App
// Intent (native/ios/WalletCapture.swift, compiled into the app target)
// and the app's JavaScript (src/components/WalletCaptureDrain.tsx).
//
// Why it exists (Aug 18, 2026): the intent runs *in the app's process*
// (openAppWhenRun = false). When Murmur is suspended in memory, iOS
// resumes the process for the intent — but nothing told the JavaScript
// side to run, so the queued purchase was only saved the next time the
// user opened the app (owner's Aug 18 test: "Saving…" at 1:12 PM, saved
// at 1:32 PM). This module lets the intent (1) poke JS the moment it
// queues an entry and (2) wait for JS to report the save done, so the
// final notification arrives at tap time. The two halves live in
// different targets and share nothing but NotificationCenter names.
import ExpoModulesCore

let walletCaptureDidAppend = Notification.Name("MurmurWalletCaptureDidAppend")
let walletCaptureDone = Notification.Name("MurmurWalletCaptureDone")

public class WalletCaptureModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("WalletCapture")

    Events("onCaptureAppended")

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: walletCaptureDidAppend, object: nil, queue: nil
      ) { [weak self] n in
        self?.sendEvent("onCaptureAppended", ["id": (n.userInfo?["id"] as? String) ?? ""])
      }
    }

    OnStopObserving {
      if let o = self.observer { NotificationCenter.default.removeObserver(o) }
      self.observer = nil
    }

    // JS → intent: "entry <id> is handled (saved, or deliberately dropped)".
    // `dialog` is what Siri should say about it (Sep 20, 2026): the Siri
    // intent waits for this, so the spoken answer is the row the app
    // actually wrote. Empty or nil for a Wallet capture, which speaks
    // through a notification instead.
    Function("reportDone") { (id: String, dialog: String?) in
      var info: [String: Any] = ["id": id]
      if let dialog, !dialog.isEmpty { info["dialog"] = dialog }
      NotificationCenter.default.post(name: walletCaptureDone, object: nil, userInfo: info)
    }
  }
}
