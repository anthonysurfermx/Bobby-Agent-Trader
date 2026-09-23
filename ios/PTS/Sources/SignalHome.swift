import SwiftUI

struct SignalHome: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var category: SignalCategory = .options
    @State private var path: [SignalDestination] = []
    @State private var lastOpenedSignal: SignalListItem?
    @State private var positions: [SignalCategory: String] = [:]
    @State private var showSaved = false
    @ObservedObject private var saved = SavedSignals.shared
    @ObservedObject private var summary = CommunitySummary.shared
    @ObservedObject private var market = SignalLiveMarket.shared

    private var visibleSignals: [SignalListItem] {
        SignalListItem.curated.filter { showSaved ? saved.contains($0.id) : $0.category == category }
            .sorted { $0.publishedAt > $1.publishedAt }
    }
    private var copilotSignal: SignalListItem? {
        lastOpenedSignal ?? SignalListItem.curated.max { $0.publishedAt < $1.publishedAt }
    }
    private var scrollPosition: Binding<String?> {
        Binding(get: { positions[category] ?? visibleSignals.first?.id },
                set: { positions[category] = $0 })
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("PTS").font(.title3.weight(.black)).tracking(3)
                    Spacer()
                    Button {
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { showSaved.toggle() }
                    } label: {
                        Label("Guardadas", systemImage: showSaved ? "bookmark.fill" : "bookmark")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(showSaved ? Theme.accentSoft : Theme.secondary)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(showSaved ? [.isSelected] : [])
                    .accessibilityIdentifier("home-saved")
                }
                .padding(.horizontal, 24).frame(minHeight: 44)
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(showSaved ? "Guardadas" : "Señales")
                            .font(.largeTitle.weight(.medium)).tracking(-1)
                            .accessibilityAddTraits(.isHeader)
                            .padding(.horizontal, 24)
                        categoryPicker.padding(.horizontal, 24)
                        if visibleSignals.isEmpty {
                            emptyCategory.padding(.horizontal, 24)
                        } else {
                            timeline
                        }
                        Text("Contenido educativo · PTS no ejecuta operaciones")
                            .font(.caption).foregroundStyle(Theme.secondary)
                            .padding(.horizontal, 24)
                            .frame(maxWidth: .infinity)
                            .accessibilityIdentifier("signal-education-note")
                    }
                    .padding(.top, 8).padding(.bottom, 28)
                }
            }
            .background(Theme.bg)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                PTSNavigationBar(symbol: copilotSignal?.symbol, identifierPrefix: "home") {
                    category = lastOpenedSignal?.category ?? .options
                } onCopilot: {
                    if let signal = copilotSignal { open(signal, copilot: true) }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { market.startPolling(); await summary.refresh() }
            .onChange(of: path) { _, _ in Task { await summary.refresh() } }
            #if DEBUG
            // Device audio diagnostics launch straight into Copiloto.
            .onAppear {
                if ProcessInfo.processInfo.arguments.contains("-PTSOpenCopilot"), path.isEmpty, let signal = copilotSignal {
                    open(signal, copilot: true)
                }
            }
            #endif
            .navigationDestination(for: SignalDestination.self) { destination in
                SignalDesk(signal: destination.signal, opensCopilot: destination.opensCopilot)
            }
        }
        .tint(Theme.accentSoft)
    }

    private var categoryPicker: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: typeSize >= .accessibility4 ? 1 : (typeSize >= .xxLarge ? 2 : 4)), spacing: 8) {
            ForEach(SignalCategory.allCases) { item in
                let count = SignalListItem.curated.filter { $0.category == item }.count
                let active = !showSaved && category == item
                Button {
                    let wasEmpty = visibleSignals.isEmpty
                    let animation: Animation? = reduceMotion || (wasEmpty && count == 0) ? nil : .easeInOut(duration: 0.2)
                    withAnimation(animation) {
                        if category == item { positions[item] = visibleSignals.first?.id }
                        category = item
                        showSaved = false
                    }
                    AccessibilityNotification.Announcement("\(item.title). \(count == 0 ? "Sin señales registradas" : "\(count) señal registrada").").post()
                } label: {
                    Text(item.title).font(.subheadline.weight(active ? .semibold : .medium))
                    .foregroundStyle(active ? Theme.accentSoft : .white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .padding(.vertical, 3)
                    .background(active ? Theme.accent.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(active ? Theme.accent.opacity(0.45) : .white.opacity(0.08)))
                    .contentShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(item.title), \(count) \(count == 1 ? "señal" : "señales")")
                .accessibilityAddTraits(active ? [.isSelected] : [])
                .accessibilityIdentifier("signal-category-\(item.rawValue)")
            }
        }
    }

    private var timeline: some View {
        VStack(alignment: .leading, spacing: 12) {
            if visibleSignals.count > 1 && !typeSize.isAccessibilitySize {
                Text("Cronología · más reciente primero")
                    .font(.caption.monospaced()).textCase(.uppercase)
                    .foregroundStyle(Theme.secondary).padding(.horizontal, 24)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(visibleSignals) { signal in
                            card(signal)
                                .containerRelativeFrame(.horizontal) { width, _ in max(240, width - 64) }
                                .id(signal.id)
                        }
                    }.scrollTargetLayout()
                }
                .contentMargins(.horizontal, 24, for: .scrollContent)
                .scrollTargetBehavior(.viewAligned)
                .scrollBounceBehavior(.basedOnSize)
                .scrollPosition(id: scrollPosition)
                .sensoryFeedback(.selection, trigger: positions[category])
            } else {
                // One real signal needs no carousel; large text uses full-width cards.
                VStack(spacing: 16) {
                    ForEach(visibleSignals) { signal in card(signal) }
                }.padding(.horizontal, 24)
            }
            if visibleSignals.count > 1 {
                let index = visibleSignals.firstIndex { $0.id == scrollPosition.wrappedValue } ?? 0
                Text(typeSize.isAccessibilitySize && visibleSignals.count > 1
                     ? "\(visibleSignals.count) señales registradas"
                     : "\(index + 1) de \(visibleSignals.count)")
                    .font(.footnote).foregroundStyle(Theme.secondary)
                    .padding(.horizontal, 24)
                    .accessibilityIdentifier("signal-position")
            }
        }
    }

    private func card(_ signal: SignalListItem) -> some View {
        Button { open(signal) } label: {
            SignalCard(signal: signal, counts: summary.counts[signal.id], saved: saved.contains(signal.id), quote: market.quotes[signal.symbol]).accessibilityElement(children: .ignore)
        }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel("\(signal.category.title). \(signal.symbol), \(signal.name), subyacente. Publicada el \(signal.publicationDate). Autor: \(signal.author). Reportado por el autor, sin verificar: \(signal.reportedVerdict). \(signal.sourceAvailable ? "Fuente original disponible" : "Fuente original no disponible"). \(signal.contractDocumented ? "Contrato documentado" : "Contrato sin documentar"). Publicaciones: \(signal.publicationCount). \(summary.counts[signal.id]?.likes ?? 0) me gusta, \(summary.counts[signal.id]?.comments ?? 0) comentarios\(saved.contains(signal.id) ? ", guardada" : ""). Abrir señal.")
            .accessibilityValue(market.quotes[signal.symbol].map { "\($0.isLive ? "Precio en vivo" : "Último precio"): \($0.price.priceText) dólares." } ?? SignalMarketSnapshot.forSymbol(signal.symbol)?.accessibilitySummary ?? "")
            .accessibilityIdentifier("signal-card-\(signal.id)")
    }

    private func open(_ signal: SignalListItem, copilot: Bool = false) {
        lastOpenedSignal = signal
        path.append(SignalDestination(signal: signal, opensCopilot: copilot))
    }

    private var emptyIcon: String {
        switch category {
        case .options: return "chart.xyaxis.line"
        case .stocks: return "building.columns"
        case .spot: return "circle.hexagongrid"
        case .scalping: return "bolt"
        }
    }

    private var emptyCategory: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: emptyIcon)
                .font(.system(size: 26, weight: .light)).foregroundStyle(Theme.accent)
                .frame(width: 54, height: 54)
                .background(Theme.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 17))
                .padding(.bottom, 4).accessibilityHidden(true)
            Text(showSaved ? "Aún no guardas señales" : "Sin señales registradas").font(.title2.weight(.medium))
                .accessibilityAddTraits(.isHeader)
            Text(showSaved ? "Toca Guardar dentro de una señal para tenerla aquí." : "Cuando Daniel publique un reporte de \(category.title), aparecerá aquí.")
                .font(.subheadline).foregroundStyle(Theme.secondary).lineSpacing(4)
            if let latest = SignalListItem.curated.max(by: { $0.publishedAt < $1.publishedAt }) {
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { category = latest.category; showSaved = false }
                } label: {
                    Label("Ver la señal de \(latest.symbol)", systemImage: "arrow.left")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accentSoft)
                        .padding(.horizontal, 16).frame(minHeight: 44)
                        .background(Theme.accent.opacity(0.14), in: Capsule())
                }
                .buttonStyle(.plain).padding(.top, 4)
                .accessibilityIdentifier("signal-empty-back")
            }
        }
        .padding(24).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.08)))
        .accessibilityIdentifier("signal-empty")
    }
}

private struct SignalDestination: Hashable {
    let signal: SignalListItem
    let opensCopilot: Bool
}

private struct SignalCard: View {
    let signal: SignalListItem
    let counts: CommunitySummary.Counts?
    let saved: Bool
    let quote: SignalQuote?

    private var trackingHeadline: String? {
        guard let quote else { return nil }
        let signalCase = SignalCase.forSignal(signal)
        return signalCase.trackingHeadline(SignalTracking.statuses(signalCase.milestones, candles: quote.daily, since: signal.publishedAt, entryAtPublication: signalCase.entryAtPublication))
    }
    private var priceChip: String { quote == nil ? "Histórico" : (quote!.isLive ? "En vivo" : "Último cierre") }
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            let identityLayout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                : AnyLayout(HStackLayout(spacing: 12))
            identityLayout {
                assetLogo
                VStack(alignment: .leading, spacing: 2) {
                    Text(signal.symbol).font(.title.weight(.semibold)).tracking(-0.8)
                    Text(signal.name).font(.subheadline).foregroundStyle(Theme.secondary)
                }
                if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            }

            if let quote {
                SignalMarketPreview(snapshot: SignalMarketSnapshot(symbol: signal.symbol, candles: quote.daily.suffix(21).map { .init(ts: $0.ts, close: $0.close) }), quote: quote)
            } else if let snapshot = SignalMarketSnapshot.forSymbol(signal.symbol) {
                SignalMarketPreview(snapshot: snapshot)
            }

            Label {
                Text(signal.reportedVerdict.replacingOccurrences(of: "Segundo", with: "2.º"))
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "scope").foregroundStyle(Theme.accent)
            }
            .font(.subheadline.weight(.semibold))

            if let trackingHeadline {
                Label {
                    Text(trackingHeadline).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Circle().fill(Color.green).frame(width: 7, height: 7)
                }
                .font(.caption.weight(.semibold)).foregroundStyle(Theme.accentSoft)
                .accessibilityIdentifier("signal-tracking")
            }

            // Evidence status stays on the card, compact enough to read at a glance.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) { trustChips }
                // Narrow carousel cards keep the three states on one line.
                Text("\(priceChip) · Sin verificar · Sin operaciones")
                    .font(.caption2.weight(.medium)).foregroundStyle(Theme.secondary).lineLimit(1)
                VStack(alignment: .leading, spacing: 6) { trustChips }
            }

            Divider().overlay(.white.opacity(0.06))
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(signal.author).font(.subheadline.weight(.medium))
                    Text(signal.publicationDate).font(.caption).foregroundStyle(Theme.secondary)
                }
                Spacer(minLength: 0)
                HStack(spacing: 10) {
                    if saved { Image(systemName: "bookmark.fill").foregroundStyle(Theme.accent) }
                    Label("\(counts?.likes ?? 0)", systemImage: "heart")
                    Label("\(counts?.comments ?? 0)", systemImage: "bubble.left")
                }
                .font(.caption.weight(.medium)).monospacedDigit().foregroundStyle(Theme.secondary)
                .labelStyle(CompactLabel())
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.accentSoft)
                    .frame(width: 44, height: 44)
                    .background(Theme.accent.opacity(0.14), in: Circle())
                    .overlay(Circle().strokeBorder(Theme.accent.opacity(0.30), lineWidth: 0.5))
            }
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.08)))
    }

    @ViewBuilder private var trustChips: some View {
        chip(priceChip)
        chip("Sin verificar")
        chip("Sin operaciones")
    }

    private func chip(_ title: String) -> some View {
        Text(title)
            .font(.caption2.weight(.medium)).lineLimit(1)
            .foregroundStyle(Theme.secondary)
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(.white.opacity(0.05), in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(0.08)))
    }

    private var assetLogo: some View { SignalLogo(symbol: signal.symbol, size: 54) }
}

/// Identity mark per signal: the issuer's own logo, as with Coinbase.
struct SignalLogo: View {
    let symbol: String
    var size: CGFloat = 54

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.31, style: .continuous)
        Group {
            switch symbol {
            case "COIN":
                Image("coinbase-mark").resizable().scaledToFit().frame(width: size * 0.56, height: size * 0.56)
                    .frame(width: size, height: size).background(SignalBrand.tile("COIN"), in: shape)
            case "ASTS":
                // AST SpaceMobile wordmark, white on its orange.
                Image("logo-asts").resizable().scaledToFit().frame(width: size * 0.74)
                    .frame(width: size, height: size).background(SignalBrand.tile("ASTS"), in: shape)
            case "BTC":
                // Bitcoin's public-domain mark: white ₿ tilted on its orange.
                Image(systemName: "bitcoinsign").font(.system(size: size * 0.46, weight: .bold)).foregroundStyle(.white)
                    .rotationEffect(.degrees(14))
                    .frame(width: size, height: size).background(SignalBrand.tile("BTC"), in: shape)
            case "XLY", "DRAM":
                // Full official tiles: SPDR sector badge and Roundhill mark.
                Image(symbol == "XLY" ? "logo-xly" : "logo-dram").resizable().interpolation(.high).scaledToFill()
                    .frame(width: size, height: size).clipShape(shape)
            default:
                Image(systemName: "building.2").font(.title2).foregroundStyle(Theme.accent)
                    .frame(width: size, height: size).background(.white.opacity(0.06), in: shape)
            }
        }
        .overlay(shape.stroke(.white.opacity(0.08), lineWidth: 0.5))
        .accessibilityHidden(true)
    }
}

/// Brand colors sampled from each issuer logo; charts use a lighter tint so
/// the line stays readable on black.
enum SignalBrand {
    static func tile(_ symbol: String) -> Color {
        switch symbol {
        case "COIN": return Color(red: 0, green: 82 / 255, blue: 1)
        case "ASTS": return Color(red: 248 / 255, green: 168 / 255, blue: 40 / 255)
        case "XLY": return Color(red: 72 / 255, green: 184 / 255, blue: 56 / 255)
        case "DRAM": return Color(red: 88 / 255, green: 88 / 255, blue: 248 / 255)
        case "BTC": return Color(red: 247 / 255, green: 147 / 255, blue: 26 / 255)
        default: return Theme.accent
        }
    }

    static func chart(_ symbol: String) -> Color {
        switch symbol {
        case "COIN": return Color(red: 0.34, green: 0.54, blue: 1)
        case "ASTS": return Color(red: 0.98, green: 0.69, blue: 0.24)
        case "XLY": return Color(red: 0.38, green: 0.80, blue: 0.33)
        case "DRAM": return Color(red: 0.48, green: 0.49, blue: 1)
        case "BTC": return Color(red: 0.98, green: 0.65, blue: 0.25)
        default: return Theme.accent
        }
    }
}

private struct CompactLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) { configuration.icon; configuration.title }
    }
}
