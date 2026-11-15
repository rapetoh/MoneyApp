import UserNotifications

/// Attaches the merchant's logo to a server notification before iOS shows it.
///
/// The sweep sends bill notifications with `mutable-content` and the logo URL
/// in the Expo data payload (`image`). Expo delivers that payload under the
/// `body` key of `userInfo`. No image, a failed or non-image download, or a
/// slow network: the notification is shown as sent, never late and never
/// with a placeholder (the app icon is already on the left).
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?
  private var task: URLSessionDataTask?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    lock.lock()
    self.contentHandler = contentHandler
    self.content = content
    lock.unlock()

    guard let url = Self.imageURL(in: content.userInfo) else {
      finish()
      return
    }
    let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 8)
    task = URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
      guard let self = self else { return }
      if let data = data, !data.isEmpty,
         let http = response as? HTTPURLResponse, http.statusCode == 200,
         let kind = Self.imageKind(http.mimeType),
         let attachment = Self.attachment(data: data, kind: kind) {
        self.lock.lock()
        self.content?.attachments = [attachment]
        self.lock.unlock()
      }
      self.finish()
    }
    task?.resume()
  }

  /// iOS is about to give up on the extension: show what we have.
  override func serviceExtensionTimeWillExpire() {
    task?.cancel()
    finish()
  }

  /// Delivers exactly once, whichever of the download or the deadline
  /// comes first.
  private func finish() {
    lock.lock()
    let handler = contentHandler
    let content = self.content
    contentHandler = nil
    lock.unlock()
    if let handler = handler, let content = content { handler(content) }
  }

  private static func imageURL(in userInfo: [AnyHashable: Any]) -> URL? {
    let body = userInfo["body"] as? [String: Any]
    let raw = (body?["image"] as? String) ?? (userInfo["image"] as? String)
    guard let raw = raw, let url = URL(string: raw), url.scheme == "https" else { return nil }
    return url
  }

  /// The formats a notification attachment accepts, with their type hints.
  private static func imageKind(_ mime: String?) -> (ext: String, uti: String)? {
    switch mime?.lowercased() {
    case "image/png": return ("png", "public.png")
    case "image/jpeg", "image/jpg": return ("jpg", "public.jpeg")
    case "image/gif": return ("gif", "com.compuserve.gif")
    default: return nil
    }
  }

  /// iOS moves the file into its own store, so each one gets a unique name.
  private static func attachment(data: Data, kind: (ext: String, uti: String)) -> UNNotificationAttachment? {
    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension(kind.ext)
    do {
      try data.write(to: file)
      return try UNNotificationAttachment(
        identifier: "logo",
        url: file,
        options: [UNNotificationAttachmentOptionsTypeHintKey: kind.uti]
      )
    } catch {
      return nil
    }
  }
}
