// Theses: DEBUG review fixtures (`-qa-v18 <name>`). Placeholder until the feature lands.
#if DEBUG
import SwiftUI

@MainActor
enum ThesesQA {
    static var fixtures: [String: () -> AnyView] { [:] }
}
#endif
