import SwiftUI

struct PTSNavigationBar: View {
    let symbol: String?
    let identifierPrefix: String
    let onSignals: () -> Void
    let onCopilot: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 8) {
            item("Señales", icon: "chart.xyaxis.line", selected: true, action: onSignals)
                .accessibilityIdentifier("\(identifierPrefix)-signals")
                .accessibilityHint("Volver a todas las señales")
            item("Copiloto", icon: "bubble.left.and.bubble.right", selected: false, action: onCopilot)
                .accessibilityIdentifier(identifierPrefix == "signal" ? "signal-learn" : "\(identifierPrefix)-copilot")
                .accessibilityHint(symbol.map { "Conversar durante un máximo de tres minutos sobre \($0)" } ?? "Abre una señal para conversar sobre su análisis")
                .disabled(symbol == nil)
                .opacity(symbol == nil ? 0.45 : 1)
        }
        .padding(8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(.white.opacity(0.12), lineWidth: 0.5)
        }
        .shadow(color: .black.opacity(0.25), radius: 16, y: 6)
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background {
            LinearGradient(colors: [Theme.bg.opacity(0), Theme.bg, Theme.bg], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func item(_ title: String, icon: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: 6))
                : AnyLayout(HStackLayout(spacing: 10))
            layout {
                Image(systemName: icon)
                    .font(.system(size: 23, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(selected ? Theme.accentSoft : Theme.secondary)
            .frame(maxWidth: .infinity, minHeight: 56)
            .padding(.horizontal, 8)
            .padding(.vertical, typeSize.isAccessibilitySize ? 8 : 0)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 21, style: .continuous)
                        .fill(LinearGradient(colors: [Theme.accent.opacity(0.20), Theme.accent.opacity(0.09)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .overlay {
                            RoundedRectangle(cornerRadius: 21, style: .continuous)
                                .strokeBorder(Theme.accent.opacity(0.28), lineWidth: 0.5)
                        }
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 21, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}
