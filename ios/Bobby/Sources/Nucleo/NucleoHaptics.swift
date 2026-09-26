// Haptics for the Núcleo page (`haptic{kind}`). At most one every 40 ms: a burst
// from the choreography must feel like one tap, not a buzz. Extras are dropped.
import UIKit

@MainActor
final class NucleoHaptics {
    static let kinds: Set<String> = ["light", "soft", "medium", "rigid", "heavy", "selection", "success", "warning", "error"]
    static let minimumInterval: CFTimeInterval = 0.040

    private var last: CFTimeInterval = 0
    private lazy var impacts: [UIImpactFeedbackGenerator.FeedbackStyle: UIImpactFeedbackGenerator] = [:]
    private lazy var selection = UISelectionFeedbackGenerator()
    private lazy var notification = UINotificationFeedbackGenerator()

    /// true = played; false = dropped by the rate limit. The kind is validated by the bridge.
    @discardableResult
    func play(_ kind: String, now: CFTimeInterval = CACurrentMediaTime()) -> Bool {
        guard Self.kinds.contains(kind), now - last >= Self.minimumInterval else { return false }
        last = now
        switch kind {
        case "selection":
            selection.selectionChanged()
        case "success":
            notification.notificationOccurred(.success)
        case "warning":
            notification.notificationOccurred(.warning)
        case "error":
            notification.notificationOccurred(.error)
        default:
            let style: UIImpactFeedbackGenerator.FeedbackStyle
            switch kind {
            case "soft": style = .soft
            case "medium": style = .medium
            case "rigid": style = .rigid
            case "heavy": style = .heavy
            default: style = .light
            }
            let generator = impacts[style] ?? UIImpactFeedbackGenerator(style: style)
            impacts[style] = generator
            generator.impactOccurred()
        }
        return true
    }
}
