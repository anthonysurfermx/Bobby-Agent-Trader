// The 1.8 kit: the few pieces every 1.8 sheet is made of, so that Credits, theses, memory,
// reminders and invitations read as one family next to the Núcleo. One light title, rows of
// state, one main action, quiet links. No eyebrow labels, no cards, no paragraphs (V18/DESIGN.md).
// The app's inks only; green and amber belong to a verdict word and to nothing else.
import SwiftUI

/// System type at a size that follows Dynamic Type.
struct QuietFont: ViewModifier {
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
    func quietFont(_ size: CGFloat, _ weight: Font.Weight = .regular, design: Font.Design = .default,
                   relativeTo style: Font.TextStyle = .body) -> some View {
        modifier(QuietFont(size, weight: weight, design: design, relativeTo: style))
    }

    /// Text that wraps instead of truncating.
    func quietWraps() -> some View { fixedSize(horizontal: false, vertical: true) }
}

/// A round 30 pt glyph button inside a 44 pt target (close, details, more).
struct QuietGlyphButton: View {
    let systemImage: String
    let label: String
    let id: String
    let action: () -> Void

    var body: some View {
        Button(action: action) { QuietGlyph(systemImage: systemImage) }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityIdentifier(id)
    }
}

/// The glyph itself, for a `Menu` label.
struct QuietGlyph: View {
    let systemImage: String
    var body: some View {
        Image(systemName: systemImage).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmMuted)
            .frame(width: 30, height: 30).background(Circle().fill(Theme.warmFill))
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
    }
}

/// The frame of every 1.8 sheet: one title (and at most one supporting line), close on the right,
/// optionally details (ⓘ) and a menu (…) before it; the content scrolls; `bottom` stays pinned
/// (the main action and the line that must be read before it).
struct QuietSheet<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    let closeId: String
    let onClose: () -> Void
    /// ⓘ: the detail that used to be a paragraph on the face.
    var onInfo: (() -> Void)? = nil
    /// A `Menu` (or any control) shown before the close button, usually labelled with `QuietGlyph(systemImage: "ellipsis")`.
    var trailing: AnyView? = nil
    var bottom: AnyView? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 0) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(title).quietFont(26, .light, design: .rounded, relativeTo: .title)
                            .foregroundStyle(Theme.cream).quietWraps()
                            .accessibilityAddTraits(.isHeader)
                        if let subtitle {
                            Text(subtitle).quietFont(14, relativeTo: .subheadline).foregroundStyle(Theme.warmMuted).quietWraps()
                        }
                    }
                    .padding(.top, 6)
                    Spacer(minLength: 8)
                    if let onInfo {
                        QuietGlyphButton(systemImage: "info", label: L.t("Details", "Detalles"), id: closeId + "-info", action: onInfo)
                    }
                    if let trailing { trailing }
                    QuietGlyphButton(systemImage: "xmark", label: L.t("Close", "Cerrar"), id: closeId, action: onClose)
                }
                .padding(.trailing, -7)
                content()
            }
            .padding(.horizontal, 24)
            .padding(.top, 14)
            .padding(.bottom, 28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let bottom {
                bottom
                    .padding(.horizontal, 24).padding(.top, 10).padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.nucleoSurface)
            }
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
    }
}

/// One row of state: what it is on the left, its value on the right (digits are monospaced),
/// an optional glyph before the label and a chevron when it leads somewhere. A hairline closes it.
struct QuietRow: View {
    let label: String
    var value: String? = nil
    /// A second, dimmer value (a renewal day, a date).
    var note: String? = nil
    var systemImage: String? = nil
    var chevron = false
    var hairline = true
    /// What VoiceOver reads instead of the glyphs and fractions on the face.
    var spoken: String? = nil
    let id: String
    var action: (() -> Void)? = nil

    var body: some View {
        Group {
            if let action {
                Button(action: action) { face }.buttonStyle(.plain)
            } else {
                face
            }
        }
        .accessibilityElement(children: spoken == nil ? .combine : .ignore)
        .accessibilityLabel(spoken ?? "")
        .accessibilityAddTraits(action == nil ? [] : .isButton)
        .accessibilityIdentifier(id)
    }

    private var face: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 14, weight: .regular)).foregroundStyle(Theme.warmMuted)
                        .frame(width: 20).accessibilityHidden(true)
                }
                Text(label).quietFont(16).foregroundStyle(Theme.cream).quietWraps()
                Spacer(minLength: 12)
                if let note {
                    Text(note).quietFont(13, relativeTo: .footnote).monospacedDigit().foregroundStyle(Theme.warmDim)
                }
                if let value {
                    Text(value).quietFont(16).monospacedDigit().foregroundStyle(Theme.warmMuted).multilineTextAlignment(.trailing)
                }
                if chevron {
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.warmDim)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
            if hairline { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        }
    }
}

/// The one main action of a sheet: a cream capsule across the width.
struct QuietPrimary: View {
    let title: String
    var busy = false
    let id: String
    let action: () -> Void
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().controlSize(.small).tint(Theme.bg) }
                Text(title).quietFont(15, .medium, relativeTo: .callout).multilineTextAlignment(.center)
            }
            .foregroundStyle(Theme.bg)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Capsule().fill(Theme.cream))
            .opacity(enabled ? 1 : 0.45)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

/// A quiet capsule: a second choice of equal weight (Not now / Remember), a preset, an option.
struct QuietChip: View {
    let title: String
    var selected = false
    var wide = false
    let id: String
    let action: () -> Void
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        Button(action: action) {
            Text(title).quietFont(14, .medium, relativeTo: .callout).multilineTextAlignment(.center)
                .foregroundStyle(selected ? Theme.bg : Theme.cream)
                .padding(.horizontal, 16).padding(.vertical, 8)
                .frame(maxWidth: wide ? .infinity : nil, minHeight: 44)
                .background(Capsule().fill(selected ? Theme.cream : Theme.warmFill))
                .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: selected ? 0 : 1))
                .opacity(enabled ? 1 : 0.45)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier(id)
    }
}

/// A plain text action, for everything that is not the main one. 44 pt tall, no background.
struct QuietLink: View {
    let title: String
    var systemImage: String? = nil
    let id: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage).font(.system(size: 12, weight: .medium)).accessibilityHidden(true) }
                Text(title).quietFont(14, relativeTo: .callout)
            }
            .foregroundStyle(Theme.warmMuted)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

/// One muted line: a scope, a boundary, a result. Never a paragraph, never a card.
struct QuietNote: View {
    let text: String
    var systemImage: String? = nil
    var id: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let systemImage {
                Image(systemName: systemImage).font(.system(size: 12, weight: .regular)).foregroundStyle(Theme.warmDim).accessibilityHidden(true)
            }
            Text(text).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).lineSpacing(2).quietWraps()
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(id ?? "")
    }
}

/// A row that unfolds: a label and a count, closed by default. What is inside was text on the face before.
struct QuietDisclosure<Content: View>: View {
    let label: String
    var count: Int? = nil
    let id: String
    @State private var open: Bool
    @ViewBuilder let content: () -> Content

    init(label: String, count: Int? = nil, open: Bool = false, id: String, @ViewBuilder content: @escaping () -> Content) {
        self.label = label
        self.count = count
        self.id = id
        _open = State(initialValue: open)
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { open.toggle() }
            } label: {
                HStack(spacing: 10) {
                    Text(label).quietFont(16).foregroundStyle(Theme.cream)
                    if let count {
                        Text("\(count)").quietFont(14, relativeTo: .callout).monospacedDigit().foregroundStyle(Theme.warmDim)
                    }
                    Spacer(minLength: 12)
                    Image(systemName: open ? "chevron.up" : "chevron.down").font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.warmDim).accessibilityHidden(true)
                }
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(open ? L.t("Expanded", "Abierto") : L.t("Collapsed", "Cerrado"))
            .accessibilityIdentifier(id)
            if open { content().padding(.bottom, 12) }
            Rectangle().fill(Theme.warmHair).frame(height: 1)
        }
    }
}
