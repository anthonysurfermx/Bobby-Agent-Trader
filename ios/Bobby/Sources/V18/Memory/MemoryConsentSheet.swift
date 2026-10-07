// The memory consent sheet (1.8): the one place where memory is turned on for iPhone questions.
// It opens from the offer on the glass ("How it works") and from Memory › "Turn on".
//
// It is the consent, so it says everything before asking: what is kept, what is not, where and for
// how long, who receives it, and how to undo it. Two buttons of equal weight, nothing pre-selected.
// Closing the sheet is "not now" without recording anything; only the "Not now" button records a
// decline (MemoryConsent). Nothing reaches the network until "Remember" is tapped.
import SwiftUI

struct MemoryConsentSheet: View {
    @StateObject private var model: MemoryConsentModel
    let onClose: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AppStorage(L.preferenceKey) private var languageSelection = "system"

    init(center: MemoryCenter = .shared, consent: MemoryConsent = MemoryConsent(), onClose: @escaping () -> Void) {
        _model = StateObject(wrappedValue: MemoryConsentModel(center: center, consent: consent))
        self.onClose = onClose
    }

    /// Review fixtures hand over a model already in the state they show.
    init(model: MemoryConsentModel, onClose: @escaping () -> Void) {
        _model = StateObject(wrappedValue: model)
        self.onClose = onClose
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                Text(L.t("Should I remember what you ask about?", "¿Quieres que recuerde lo que me preguntas?"))
                    .font(.system(size: 26, weight: .light, design: .rounded)).foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("memory-consent-title")
                MemoryExplanation(retentionDays: model.retentionDays)
                    .padding(.top, 6)
                Link(destination: L.site("privacy")) {
                    Text(L.t("Privacy Policy", "Política de privacidad"))
                        .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.cream).underline()
                        .frame(minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("memory-consent-privacy")
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            .padding(.bottom, 12)
        }
        .scrollIndicators(.visible)
        // The two answers stay in reach at the medium detent while the explanation scrolls above them.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) { answer }
                .padding(.horizontal, 22)
                .padding(.bottom, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.nucleoSurface)
                .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
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

    static var doneLine: String {
        L.t("Done. From your next question on, I will remember.", "Listo. A partir de tu próxima pregunta, voy a recordar.")
    }

    static var failedLine: String {
        L.t("I could not turn memory on. Try again.", "No pude activar la memoria. Inténtalo de nuevo.")
    }

    private var topBar: some View {
        HStack {
            Text(L.t("Memory", "Memoria").uppercased()).font(.mono(11, .medium)).tracking(1.6).foregroundStyle(Theme.warmDim)
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmMuted)
                    .frame(width: 30, height: 30).background(Circle().fill(Theme.warmFill))
                    .frame(width: 44, height: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, -7)
            .accessibilityLabel(L.t("Close", "Cerrar"))
            .accessibilityIdentifier("memory-consent-close")
        }
        .frame(minHeight: 30)
    }

    @ViewBuilder private var answer: some View {
        if !model.signedIn {
            Text(MemoryError.signedOut.message).font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
                .accessibilityIdentifier("memory-consent-signed-out")
        } else if model.phase == .done {
            Text(Self.doneLine).font(.system(size: 15)).foregroundStyle(Theme.cream)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .padding(.top, 10)
                .accessibilityIdentifier("memory-consent-done")
        } else {
            if model.phase == .failed {
                Text(Self.failedLine).font(.system(size: 13)).foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                    .accessibilityIdentifier("memory-consent-error")
            }
            // Side by side, or stacked at the large accessibility sizes: the same button twice.
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                choice(L.t("Not now", "Ahora no"), id: "memory-consent-decline") {
                    model.decline()
                    onClose()
                }
                choice(L.t("Remember", "Recordar"), id: "memory-consent-accept", busy: model.phase == .working) {
                    Task { await model.remember() }
                }
            }
            .disabled(model.phase == .working)
            .padding(.top, 12)
        }
    }

    /// Both answers share one style on purpose: neither is the highlighted one.
    private func choice(_ title: String, id: String, busy: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().controlSize(.small).tint(Theme.cream) }
                Text(title).font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.cream)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Capsule().fill(Theme.warmFill))
            .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

/// What memory is, in five short answers. The consent sheet shows all of it; the memory screen
/// shows the same words when memory is off, so there is one explanation and one consent.
struct MemoryExplanation: View {
    let retentionDays: Int
    /// The memory screen's compact form leaves out who receives it and where control lives:
    /// "Turn on" opens the sheet, which says all five.
    var compact = false

    struct Item: Identifiable, Equatable {
        let id: String
        let label: String
        let text: String
    }

    static func items(retentionDays: Int, compact: Bool = false) -> [Item] {
        var all = [
            Item(id: "keep", label: L.t("What I keep", "Lo que guardo"),
                 text: L.t("The asset, the date, the time frame you mention and its price that day.",
                           "El activo, la fecha, el plazo que mencionas y su precio de ese día.")),
            Item(id: "never", label: L.t("What I do not keep", "Lo que no guardo"),
                 text: L.t("Never your full question, never your name, nothing about your money.",
                           "Nunca tu pregunta completa, nunca tu nombre, nada sobre tu dinero.")),
            Item(id: "where", label: L.t("Where and how long", "Dónde y por cuánto tiempo"),
                 text: L.t("On Bobby's servers, linked to your account, for \(retentionDays) days after you last ask about it.",
                           "En los servidores de Bobby, vinculado a tu cuenta, durante \(retentionDays) días desde la última vez que preguntas por él.")),
        ]
        guard !compact else { return all }
        all.append(Item(id: "who", label: L.t("Who receives it", "Quién lo recibe"),
                        text: L.t("A short summary (for example: third time this week, up 4% since) reaches the AI provider that writes Bobby's answer, so the answer can pick up where you left off.",
                                  "Un resumen breve (por ejemplo: tercera vez esta semana, subió 4% desde entonces) llega al proveedor de IA que escribe la respuesta de Bobby, para que retome donde lo dejaste.")))
        all.append(Item(id: "control", label: L.t("Your control", "Tu control"),
                        text: L.t("See it, correct it, pause it or delete it any time in Memory.",
                                  "Míralo, corrígelo, ponlo en pausa o bórralo cuando quieras en Memoria.")))
        return all
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Self.items(retentionDays: retentionDays, compact: compact)) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.label.uppercased()).font(.mono(10.5, .medium)).tracking(1.2).foregroundStyle(Theme.warmDim)
                    Text(item.text).font(.system(size: 14)).foregroundStyle(Theme.warmMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 14)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("memory-explain-\(item.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
