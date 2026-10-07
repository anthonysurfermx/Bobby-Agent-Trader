// Theses (1.8): the small pieces the three thesis screens share. Quiet and compact, on the
// Núcleo surface, with the app's inks only; green and amber appear on a verdict word and
// nowhere else. Type scales with Dynamic Type and nothing has a fixed height, so text never clips.
import SwiftUI

/// The app's system type at a size that follows Dynamic Type.
struct ThesisFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight
    private let design: Font.Design

    init(_ size: CGFloat, weight: Font.Weight, design: Font.Design, relativeTo style: Font.TextStyle) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: style)
        self.weight = weight
        self.design = design
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: design))
    }
}

extension View {
    func thesisFont(_ size: CGFloat, _ weight: Font.Weight = .regular, design: Font.Design = .default,
                    relativeTo style: Font.TextStyle = .body) -> some View {
        modifier(ThesisFont(size, weight: weight, design: design, relativeTo: style))
    }

    /// A paragraph that wraps instead of truncating.
    func thesisWraps() -> some View { fixedSize(horizontal: false, vertical: true) }
}

/// The frame of every thesis screen: a small mono title, a close button, the content in a scroll.
struct ThesisScreen<Content: View>: View {
    let title: String
    let closeId: String
    let onClose: () -> Void
    /// Pinned under the scroll (the editor's Save and the line that is always visible above it).
    var bottom: AnyView? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(title.uppercased()).thesisFont(11, .medium, design: .monospaced, relativeTo: .caption)
                        .tracking(1.6).foregroundStyle(Theme.warmDim)
                        .accessibilityAddTraits(.isHeader)
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
                    .accessibilityIdentifier(closeId)
                }
                .frame(minHeight: 30)
                content()
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let bottom {
                bottom
                    .padding(.horizontal, 22).padding(.top, 10).padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.nucleoSurface)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
            }
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
    }
}

/// The light display title of a screen.
struct ThesisTitle: View {
    let text: String
    var body: some View {
        Text(text).thesisFont(26, .light, design: .rounded, relativeTo: .title)
            .foregroundStyle(Theme.cream).thesisWraps()
            .padding(.top, 14)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A mono section label.
struct ThesisLabel: View {
    let text: String
    var top: CGFloat = 24
    var body: some View {
        Text(text.uppercased()).thesisFont(11, .medium, design: .monospaced, relativeTo: .caption)
            .tracking(1.4).foregroundStyle(Theme.warmDim).thesisWraps()
            .padding(.top, top).padding(.bottom, 6)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A capsule button, 44 pt tall at least. `prominent` is the one main action of a screen.
struct ThesisButton: View {
    let title: String
    var prominent = false
    var wide = false
    var systemImage: String? = nil
    var busy = false
    let id: String
    let action: () -> Void
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().controlSize(.small).tint(prominent ? Theme.bg : Theme.warmMuted) }
                if let systemImage { Image(systemName: systemImage).font(.system(size: 14, weight: .medium)) }
                Text(title).thesisFont(14, .medium, relativeTo: .callout).multilineTextAlignment(.center)
            }
            .foregroundStyle(prominent ? Theme.bg : Theme.cream)
            .padding(.horizontal, 16).padding(.vertical, 8)
            .frame(maxWidth: wide ? .infinity : nil, minHeight: 44)
            .background(Capsule().fill(prominent ? Theme.cream : Theme.warmFill))
            .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: prominent ? 0 : 1))
            .opacity(enabled ? 1 : 0.45)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

/// A quiet text action (Archive, Delete, Reopen), still 44 pt tall.
struct ThesisLink: View {
    let title: String
    var tint: Color = Theme.warmMuted
    let id: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).thesisFont(13, .medium, relativeTo: .footnote).foregroundStyle(tint)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .frame(minHeight: 32)
                .background(Capsule().fill(Theme.warmFill))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

/// A plain note on the glass tint (a line the person should not miss, without a heavy card).
struct ThesisNote: View {
    let text: String
    var body: some View {
        Text(text).thesisFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).thesisWraps()
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.nucleoGlass))
    }
}

/// The person's own words under their three headings. Empty parts are left out.
struct ThesisWordsView: View {
    let thesis: SavedThesis

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            part(L.t("Why I am looking at this", "Por qué lo estoy mirando"), thesis.hypothesis, top: 18)
            if !thesis.worry.isEmpty { part(L.t("What worries me", "Lo que me preocupa"), thesis.worry) }
            if !thesis.changeMind.isEmpty { part(L.t("What would change my mind", "Lo que me haría cambiar de opinión"), thesis.changeMind) }
            if let horizon = thesis.horizon {
                part(L.t("Horizon", "Horizonte"), ThesisCopy.horizon(horizon))
            }
        }
    }

    private func part(_ label: String, _ text: String, top: CGFloat = 16) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ThesisLabel(text: label, top: top)
            Text(text).thesisFont(15).foregroundStyle(Theme.cream).lineSpacing(3).thesisWraps()
        }
        .accessibilityElement(children: .combine)
    }
}

/// Wait / Review in the verdict's own colour (amber / green), exactly as a read shows it.
struct ThesisVerdictWord: View {
    let verdict: String
    var size: CGFloat = 15

    var body: some View {
        if let word = ThesisCopy.verdictWord(verdict) {
            Text(word).thesisFont(size, .semibold).foregroundStyle(verdict == "review" ? Theme.up : Theme.cio)
        }
    }
}
