// The memory consent sheet (1.8): the one place where memory is turned on for iPhone questions.
// It opens from the offer on the glass ("How it works") and from Memory › "Turn on".
//
// It is the consent, so it says everything before asking, and only what the code does: what is
// kept, what is sent to the AI provider when Bobby answers (the server's reader context: first
// name, the asset's history, the preferences, the assets asked about most), for how long it is
// used, and how to undo it. Two buttons of equal weight, nothing pre-selected.
// Closing the sheet is "not now" without recording anything; only the "Not now" button records a
// decline (MemoryConsent). Nothing reaches the network until "Remember" is tapped.
import SwiftUI

struct MemoryConsentSheet: View {
    @StateObject private var model: MemoryConsentModel
    let onClose: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(center: MemoryCenter = .shared, onClose: @escaping () -> Void) {
        _model = StateObject(wrappedValue: MemoryConsentModel(center: center))
        self.onClose = onClose
    }

    /// Review fixtures hand over a model already in the state they show.
    init(model: MemoryConsentModel, onClose: @escaping () -> Void) {
        _model = StateObject(wrappedValue: model)
        self.onClose = onClose
    }

    var body: some View {
        // Everything a person agrees to is in front of them before the two answers, which follow the
        // last line in the scroll: they are never pinned above something still unread.
        QuietSheet(title: L.t("Remember this?", "¿Lo recuerdo?"), closeId: "memory-consent-close", onClose: onClose) {
            VStack(alignment: .leading, spacing: 0) {
                MemoryExplanation(retentionDays: model.retentionDays)
                    .padding(.top, 8)
                Link(destination: L.site("privacy")) {
                    Text(L.t("Privacy Policy", "Política de privacidad"))
                        .quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).underline()
                        .frame(minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("memory-consent-privacy")
                answer
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: AccountSession.didChange)) { _ in model.accountChanged() }
        .onChange(of: model.phase) { _, phase in
            guard phase == .done || phase == .failed, UIAccessibility.isVoiceOverRunning else { return }
            UIAccessibility.post(notification: .announcement, argument: phase == .done ? Self.doneLine : Self.failedLine)
        }
        .task(id: model.phase) {
            // One confirmation line, long enough to read, then the sheet steps aside. The wait ends
            // with the view, so a sheet the person already closed is never closed twice.
            guard model.phase == .done else { return }
            try? await Task.sleep(nanoseconds: Self.doneLingerNanoseconds)
            guard !Task.isCancelled else { return }
            onClose()
        }
    }

    static let doneLingerNanoseconds: UInt64 = 1_800_000_000

    static var doneLine: String { L.t("On from your next question.", "Activa desde tu próxima pregunta.") }

    static var failedLine: String { L.t("Could not enable memory.", "No se pudo activar la memoria.") }

    @ViewBuilder private var answer: some View {
        if !model.signedIn {
            QuietNote(text: MemoryError.signedOut.message, id: "memory-consent-signed-out").padding(.top, 6)
        } else if model.phase == .done {
            Text(Self.doneLine).quietFont(16).foregroundStyle(Theme.cream).quietWraps()
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .padding(.top, 6)
                .accessibilityIdentifier("memory-consent-done")
        } else {
            if model.phase == .failed {
                QuietNote(text: Self.failedLine, id: "memory-consent-error").padding(.top, 6)
            }
            // Side by side, or stacked at the large accessibility sizes: the same button twice,
            // neither of them the highlighted one.
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                QuietChip(title: L.t("Not now", "Ahora no"), wide: true, id: "memory-consent-decline") {
                    model.decline()
                    onClose()
                }
                QuietChip(title: L.t("Remember", "Recordar"), wide: true, id: "memory-consent-accept") {
                    Task { await model.remember() }
                }
            }
            .disabled(model.phase == .working)
            .padding(.top, 8)
        }
    }
}

/// What memory is: two inventories and the end of use. The consent sheet shows all of it; the
/// memory screen shows the same words, so there is one explanation and one consent.
///
/// The "sent" inventory mirrors `readerContext` in api/_lib/user-memory.ts, which hands the model
/// that writes the answer: the first name, the three preferences, this asset's count, dates, time
/// frame, price and price change, and up to five other assets asked about often. If that function
/// sends something new, this text changes with it and `MemoryConsent.currentVersion` goes up.
/// Nothing here is folded, replaced by a glyph or called "a summary" (App Review 5.1.2(i)).
struct MemoryExplanation: View {
    let retentionDays: Int
    /// The memory screen's compact form leaves out only where control lives (it is that screen).
    /// What is sent to the AI provider is said in both.
    var compact = false

    struct Item: Identifiable, Equatable {
        let id: String
        /// A small label above the text; nil for the closing lines.
        let label: String?
        let text: String
        /// A boundary that belongs with the inventory ("Your question text is not kept.").
        var note: String? = nil
    }

    static func items(retentionDays: Int, compact: Bool = false) -> [Item] {
        var all = [
            Item(id: "keep", label: L.t("Kept by Bobby", "Bobby guarda"),
                 text: L.t("Asset · date · stated time frame · price that day", "Activo · fecha · plazo indicado · precio de ese día"),
                 note: L.t("Your question text is not kept.", "Tu pregunta no se guarda como texto.")),
            Item(id: "sent", label: L.t("Sent to the AI that answers", "Se envía a la IA que responde"),
                 text: L.t("Your first name · how often and when you asked about this asset · the time frame you named · its price that day and the change since · your preferences · your most-asked assets",
                           "Tu nombre de pila · cuántas veces y cuándo preguntaste por este activo · el plazo que mencionaste · su precio aquel día y el cambio desde entonces · tus preferencias · los activos por los que más preguntas")),
            // What the code guarantees (the server stops reading the row), not a deletion date.
            Item(id: "howlong", label: nil,
                 text: L.t("Unused after \(retentionDays) days without a question.", "Deja de usarse a los \(retentionDays) días sin preguntar.")),
        ]
        guard !compact else { return all }
        all.append(Item(id: "control", label: nil, text: L.t("Edit or delete in Memory.", "Edita o borra en Memoria.")))
        return all
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Self.items(retentionDays: retentionDays, compact: compact)) { item in
                VStack(alignment: .leading, spacing: 4) {
                    if let label = item.label {
                        Text(label).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmDim)
                        Text(item.text).quietFont(15).foregroundStyle(Theme.cream).lineSpacing(4).quietWraps()
                        if let note = item.note {
                            Text(note).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).quietWraps()
                        }
                    } else {
                        Text(item.text).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).quietWraps()
                    }
                }
                .padding(.top, item.label == nil ? 6 : 16)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("memory-explain-\(item.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
