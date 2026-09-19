// ============================================================
// The locker — the desk's "+". Curiosity, not a catalogue: swipe the whole
// squad like the onboarding carousel, one big companion per page, its loot in
// four boxes underneath (three gear pieces + the pet). Locked is silver, gold
// is golden, and every box says exactly what it takes. Items are 2D art, so a
// tapped box floats the piece next to the companion instead of pinning a plane
// on the body; your own gear can still fly onto you on the desk.
// At most three SCNViews exist (the page on screen and its neighbours) and
// only the one on screen renders.
// ============================================================

import SwiftUI

// MARK: - Rules (pure, unit-tested)

enum LockerState: Equatable {
    case owned
    case firstRead                          // tier 1 at 0 XP: the first full read drops it
    case needsXP(Int)
    case needsLevel(level: Int, xp: Int)    // companion locked: its level first
}

enum LockerLedger {
    static func level(at xp: Int) -> Int {
        companionLevels.last { xp >= $0.minXP }?.number ?? 1
    }

    static func minXP(forLevel level: Int) -> Int {
        companionLevels.first { $0.number == level }?.minXP ?? 0
    }

    /// Your own companion always counts (the Squad rule), the rest by level.
    static func reachable(_ c: Companion, ownId: String?, xp: Int) -> Bool {
        c.id == ownId || level(at: xp) >= c.requiredLevel
    }

    static func items(for c: Companion) -> [CatalogItem] {
        var list = CompanionToolkit.tools(for: c.id).map { CatalogItem.tool($0, c) }
        if let pet = CompanionToolkit.pet(for: c.id) { list.append(.pet(pet, c)) }
        return list
    }

    static func state(_ item: CatalogItem, ownId: String?, xp: Int) -> LockerState {
        let c = item.companion
        guard reachable(c, ownId: ownId, xp: xp) else {
            return .needsLevel(level: c.requiredLevel, xp: max(item.needXP, minXP(forLevel: c.requiredLevel)) - xp)
        }
        if xp >= item.needXP { return .owned }
        if item.needXP == 1 && xp == 0 { return .firstRead }
        return .needsXP(item.needXP - xp)
    }

    /// Yours first, then by unlock level, then roster order.
    static func order(ownId: String?) -> [Companion] {
        let indexed = bobbyCompanions.enumerated().filter { $0.element.id != ownId }
        let rest = indexed.sorted { ($0.element.requiredLevel, $0.offset) < ($1.element.requiredLevel, $1.offset) }.map(\.element)
        guard let own = bobbyCompanions.first(where: { $0.id == ownId }) else { return rest }
        return [own] + rest
    }

    static func ownedIds(ownId: String?, xp: Int) -> [String] {
        bobbyCompanions.flatMap { items(for: $0) }.filter { state($0, ownId: ownId, xp: xp) == .owned }.map(\.id)
    }

    static func count(ownId: String?, xp: Int) -> (owned: Int, total: Int) {
        let all = bobbyCompanions.flatMap { items(for: $0) }
        return (all.filter { state($0, ownId: ownId, xp: xp) == .owned }.count, all.count)
    }

    /// The next drop on a reachable page: the unowned piece closest to you,
    /// and how far along you are since the previous threshold (0…1).
    static func nextUp(_ c: Companion, ownId: String?, xp: Int) -> (id: String, progress: Double)? {
        guard reachable(c, ownId: ownId, xp: xp) else { return nil }
        let pending = items(for: c).filter { xp < $0.needXP }
        guard let next = pending.min(by: { $0.needXP < $1.needXP }) else { return nil }
        let previous = [0, 1, 100, 200].last { $0 < next.needXP } ?? 0
        let progress = Double(xp - previous) / Double(max(1, next.needXP - previous))
        return (next.id, min(1, max(0, progress)))
    }
}

/// What you have already looked at. The first open seeds everything you own,
/// so a veteran never opens a wall of NEW; only later drops show up as new.
enum LockerSeen {
    static let key = "locker.seen.v1"

    static func parse(_ raw: String?) -> Set<String>? {
        raw.map { Set($0.split(separator: ",").map(String.init)) }
    }

    static func seedIfNeeded(ownId: String?, xp: Int, defaults: UserDefaults = .standard) {
        guard defaults.string(forKey: key) == nil else { return }
        defaults.set(LockerLedger.ownedIds(ownId: ownId, xp: xp).sorted().joined(separator: ","), forKey: key)
    }

    /// No-op until the locker has been opened once (nothing is seeded yet).
    static func mark(_ ids: [String], defaults: UserDefaults = .standard) {
        guard var seen = parse(defaults.string(forKey: key)), !ids.isEmpty else { return }
        let before = seen.count
        seen.formUnion(ids)
        if seen.count != before { defaults.set(seen.sorted().joined(separator: ","), forKey: key) }
    }

    static func unseen(ownId: String?, xp: Int, raw: String?) -> Set<String> {
        guard let seen = parse(raw) else { return [] }
        return Set(LockerLedger.ownedIds(ownId: ownId, xp: xp)).subtracting(seen)
    }
}

extension CatalogItem {
    var companion: Companion {
        switch self { case .tool(_, let c), .pet(_, let c): return c }
    }
    var tool: CompanionTool? {
        if case .tool(let t, _) = self { return t }
        return nil
    }
    var needXP: Int {
        switch self {
        case .tool(let t, _): return t.unlockXP
        case .pet: return CompanionPet.unlockXP
        }
    }
    var isGolden: Bool { tool?.isGolden ?? false }
    var isPet: Bool { tool == nil }
    var title: String {
        switch self {
        case .tool(let t, _): return t.name
        case .pet(let p, _): return p.name
        }
    }
    var lore: String {
        switch self {
        case .tool(let t, _): return t.lore
        case .pet(let p, _): return p.spins ? L.t("Spins next to you on the desk.", "Gira a tu lado en la mesa.") : L.t("Lives at your companion's feet.", "Vive a los pies de tu amigo.")
        }
    }
    var tierLabel: String { tool?.tierLabel ?? L.t("PET", "MASCOTA") }
    /// Bundled art, or nil (then the SF Symbol / emoji stands in).
    var artName: String? {
        switch self {
        case .tool(let t, _): return t.hasArt ? t.assetName : nil
        case .pet(let p, _): return p.hasArt ? p.assetName : nil
        }
    }
}

// MARK: - Shared bits

private let lockerGold = Color(red: 0.96, green: 0.77, blue: 0.26)

/// The companion's bundled render in a circle — silver when locked. Stands in
/// for the 3D model while it loads and on pages away from the screen.
struct CompanionPortrait: View {
    let companion: Companion
    var silver = false
    var size: CGFloat = 180

    var body: some View {
        CompanionThumb(companion: companion)
            .frame(width: size, height: size)
            .clipShape(Circle())
            .silverLocked(silver)
    }
}

extension View {
    /// Build 29's locked language: silver, fully visible.
    func silverLocked(_ on: Bool) -> some View {
        grayscale(on ? 1 : 0).brightness(on ? 0.10 : 0).contrast(on ? 1.12 : 1)
    }
}

/// The item's art at a size, or its glyph when the art is missing.
private struct ItemArt: View {
    let item: CatalogItem
    let size: CGFloat
    var tint: Color

    var body: some View {
        if let art = item.artName {
            Image(art).resizable().scaledToFit().frame(width: size, height: size)
        } else {
            switch item {
            case .tool(let t, _):
                Image(systemName: t.symbol).font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(tint)
                    .frame(width: size, height: size)
            case .pet(let p, _):
                Text(p.emoji).font(.system(size: size * 0.6)).frame(width: size, height: size)
            }
        }
    }
}

// MARK: - The sheet

struct SquadLockerSheet: View {
    @ObservedObject var store: CompanionStore
    /// Your own gear, replayed on the desk: the sheet closes, then it flies on.
    var onSeeItWorn: ((CompanionTool) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(LockerSeen.key) private var seenRaw: String?

    /// Frozen at open, so picking a friend elsewhere never reshuffles the pager.
    @State private var order: [Companion]
    @State private var pageId: String
    @State private var focus: String?
    @State private var pulses: [String: Int] = [:]
    /// Memory warning: only the page on screen keeps a live model.
    @State private var lean = false
    @State private var appeared = false

    init(store: CompanionStore, initialFocus: String? = nil, onSeeItWorn: ((CompanionTool) -> Void)? = nil) {
        self.store = store
        self.onSeeItWorn = onSeeItWorn
        let order = LockerLedger.order(ownId: store.companionId)
        _order = State(initialValue: order)
        // A focused item opens on its companion's page (QA); otherwise on yours.
        let focusPage = initialFocus.flatMap { id in order.first { c in LockerLedger.items(for: c).contains { $0.id == id } } }
        _pageId = State(initialValue: focusPage?.id ?? order.first?.id ?? bobbyCompanions[0].id)
        _focus = State(initialValue: focusPage == nil ? nil : initialFocus)
    }

    private var xp: Int { store.disciplineXP }
    private var ownId: String? { store.companionId }
    private var index: Int { order.firstIndex { $0.id == pageId } ?? 0 }
    private var current: Companion { order[index] }
    private var unseen: Set<String> { LockerSeen.unseen(ownId: ownId, xp: xp, raw: seenRaw) }

    var body: some View {
        let reachable = LockerLedger.reachable(current, ownId: ownId, xp: xp)
        ZStack {
            Theme.bg.ignoresSafeArea()
            RadialGradient(colors: [(reachable ? current.tint : Color.white).opacity(reachable ? 0.16 : 0.07), .clear],
                           center: UnitPoint(x: 0.5, y: 0.34), startRadius: 30, endRadius: 380)
                .ignoresSafeArea()
                .animation(reduceMotion ? nil : .easeOut(duration: 0.6), value: pageId)
                .accessibilityHidden(true)

            VStack(spacing: 0) {
                header
                pager
                LockerStrip(order: order, pageId: pageId, ownId: ownId, xp: xp, unseen: unseen) { id in
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if reduceMotion { pageId = id } else { withAnimation(.spring(duration: 0.45)) { pageId = id } }
                }
                .padding(.top, 8)
                .padding(.bottom, 12)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            LockerSeen.seedIfNeeded(ownId: ownId, xp: xp)
            windowCache()
            appeared = true
            revealGoldenNew()
        }
        .onDisappear {
            LockerSeen.mark(ownedIds(on: current))
            MascotAssetCache.purge()
        }
        .onChange(of: pageId) { old, _ in
            focus = nil
            if let left = order.first(where: { $0.id == old }) { LockerSeen.mark(ownedIds(on: left)) }
            UISelectionFeedbackGenerator().selectionChanged()
            windowCache()
            revealGoldenNew()
            if UIAccessibility.isVoiceOverRunning {
                AccessibilityNotification.Announcement(current.label).post()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            lean = true
            MascotAssetCache.keep(only: [pageId])
        }
    }

    private func ownedIds(on c: Companion) -> [String] {
        LockerLedger.items(for: c).filter { LockerLedger.state($0, ownId: ownId, xp: xp) == .owned }.map(\.id)
    }

    /// Parsed models for the page and two on each side; the rest are dropped.
    private func windowCache() {
        let lo = max(0, index - 2), hi = min(order.count - 1, index + 2)
        let ids = order[lo...hi].map(\.id)
        MascotAssetCache.keep(only: Set(ids))
        MascotAssetCache.preload(ids)
    }

    /// A golden piece that dropped since you last looked opens itself.
    private func revealGoldenNew() {
        // Under VoiceOver the showcase would steal the element being read;
        // the NEW badge and the strip dot already say it.
        guard !UIAccessibility.isVoiceOverRunning else { return }
        let golden = LockerLedger.items(for: current).first { $0.isGolden && unseen.contains($0.id) }
        guard let golden else { return }
        let page = pageId
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            guard pageId == page, focus == nil else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            withAnimation(reduceMotion ? nil : .spring(duration: 0.35, bounce: 0.3)) { focus = golden.id }
        }
    }

    // MARK: header

    private var header: some View {
        let count = LockerLedger.count(ownId: ownId, xp: xp)
        let complete = count.owned == count.total
        return HStack(spacing: 10) {
            Circle().fill(current.tint).frame(width: 7, height: 7).shadow(color: current.tint, radius: 6)
                .accessibilityHidden(true)
            Text(L.t("BOBBY // LOCKER", "BOBBY // VITRINA"))
                .font(.mono(11, .bold)).kerning(1.9)
                .foregroundStyle(Theme.text.opacity(0.78))
                .accessibilityAddTraits(.isHeader)
            Spacer()
            HStack(spacing: 4) {
                if complete { Image(systemName: "star.fill").font(.system(size: 9, weight: .bold)) }
                Text("\(count.owned)/\(count.total)")
                    .font(.mono(11, .bold))
                    .contentTransition(.numericText())
            }
            .foregroundStyle(complete ? lockerGold : Theme.text.opacity(0.7))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(L.t("\(count.owned) of \(count.total) earned", "\(count.owned) de \(count.total) ganados"))
            .accessibilityIdentifier("locker-counter")
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.text.opacity(0.8))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Theme.card))
                    .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L.t("Close", "Cerrar"))
            .accessibilityIdentifier("locker-close")
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .padding(.top, 14)
    }

    // MARK: pager

    private var pager: some View {
        TabView(selection: $pageId) {
            ForEach(Array(order.enumerated()), id: \.element.id) { i, c in
                LockerPage(
                    companion: c,
                    isOwn: c.id == ownId,
                    xp: xp,
                    ownId: ownId,
                    live: abs(i - index) <= (lean ? 0 : 1),
                    active: i == index && scenePhase == .active,
                    focus: i == index ? $focus : .constant(nil),
                    unseen: unseen,
                    pendingIds: Set(store.pendingToolUnlocks.map(\.id)),
                    pulseToken: pulses[c.id, default: 0],
                    appeared: appeared,
                    onPulse: { pulses[c.id, default: 0] += 1 },
                    onStep: step,
                    onSeeItWorn: { tool in
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        LockerSeen.mark(ownedIds(on: c))
                        dismiss()
                        onSeeItWorn?(tool)
                    }
                )
                .tag(c.id)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .overlay(alignment: .leading) { pageArrow(-1) }
        .overlay(alignment: .trailing) { pageArrow(1) }
    }

    private func step(_ direction: Int) {
        let target = index + direction
        guard order.indices.contains(target) else { return }
        if reduceMotion { pageId = order[target].id } else { withAnimation(.spring(duration: 0.45)) { pageId = order[target].id } }
    }

    private func pageArrow(_ direction: Int) -> some View {
        let exists = order.indices.contains(index + direction) && focus == nil
        return Button { step(direction) } label: {
            Image(systemName: direction < 0 ? "chevron.left" : "chevron.right")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.text.opacity(0.4))
                .frame(width: 44, height: 96)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(exists ? 1 : 0)
        .disabled(!exists)
        .padding(.bottom, 170)   // centred on the stage, clear of the boxes
        .accessibilityLabel(direction < 0 ? L.t("Previous friend", "Amigo anterior") : L.t("Next friend", "Siguiente amigo"))
        .accessibilityIdentifier(direction < 0 ? "locker-prev" : "locker-next")
    }
}

// MARK: - One companion

private struct LockerPage: View {
    let companion: Companion
    let isOwn: Bool
    let xp: Int
    let ownId: String?
    let live: Bool
    let active: Bool
    @Binding var focus: String?
    let unseen: Set<String>
    let pendingIds: Set<String>
    let pulseToken: Int
    let appeared: Bool
    let onPulse: () -> Void
    let onStep: (Int) -> Void
    let onSeeItWorn: (CompanionTool) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stageState = "loading"

    private var reachable: Bool { LockerLedger.reachable(companion, ownId: ownId, xp: xp) }
    private var items: [CatalogItem] { LockerLedger.items(for: companion) }
    private var focused: CatalogItem? { items.first { $0.id == focus } }
    private var ownedCount: Int { items.filter { LockerLedger.state($0, ownId: ownId, xp: xp) == .owned }.count }

    var body: some View {
        VStack(spacing: 0) {
            chip
                .padding(.top, 10)
            stage
                .frame(maxHeight: .infinity)
            nameBlock
                .padding(.horizontal, 18)
            boxes
                .padding(.horizontal, 18)
                .padding(.top, 12)
        }
        .onChange(of: live) { _, isLive in if !isLive { stageState = "loading" } }
    }

    // MARK: chip

    @ViewBuilder
    private var chip: some View {
        if isOwn {
            lockerChip(icon: "checkmark", text: L.t("WITH YOU", "CONTIGO"), color: companion.tint, stroke: companion.tint.opacity(0.45))
                .accessibilityIdentifier("locker-own-chip")
        } else if !reachable {
            let need = max(0, LockerLedger.minXP(forLevel: companion.requiredLevel) - xp)
            lockerChip(icon: "lock.fill", text: L.t("LEVEL \(companion.requiredLevel) · +\(need) XP", "NIVEL \(companion.requiredLevel) · +\(need) XP"),
                       color: Theme.text.opacity(0.82), stroke: Color.white.opacity(0.16))
                .accessibilityIdentifier("locker-lock-chip")
        } else {
            // Same height, nothing to say: keeps every page aligned.
            lockerChip(icon: "checkmark", text: " ", color: .clear, stroke: .clear).hidden()
        }
    }

    private func lockerChip(icon: String, text: String, color: Color, stroke: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 9, weight: .bold))
            Text(text).font(.mono(9, .bold)).kerning(1.4).lineLimit(1).minimumScaleFactor(0.7)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(Theme.bg.opacity(0.72)))
        .overlay(Capsule().stroke(stroke, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    // MARK: stage

    private var stage: some View {
        let isFocused = focused != nil
        return ZStack {
            Group {
                if live {
                    CompanionStagePage(companion: companion, active: active, speaking: false, voiceLevel: 0,
                                       pulseToken: pulseToken, statue: !reachable, portraitUntilReady: true) { loaded in
                        stageState = loaded ? "ready" : "failed"
                    }
                } else {
                    CompanionPortrait(companion: companion, silver: !reachable)
                }
            }
            .offset(x: isFocused ? -64 : 0)
            .scaleEffect(isFocused ? 0.88 : 1)
            .contentShape(Rectangle())
            .onTapGesture {
                if isFocused {
                    withAnimation(reduceMotion ? nil : .spring(duration: 0.35, bounce: 0.3)) { focus = nil }
                } else {
                    if reachable { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
                    else { UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.5) }
                    onPulse()
                }
            }
            .accessibilityElement()
            .accessibilityLabel(stageLabel)
            .accessibilityHint(isFocused
                ? L.t("Double-tap to close the piece", "Toca dos veces para cerrar la pieza")
                : L.t("Swipe up or down to change friend", "Desliza arriba o abajo para cambiar de amigo"))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: onStep(1)
                case .decrement: onStep(-1)
                @unknown default: break
                }
            }
            .accessibilityIdentifier("locker-page-\(companion.id)")

            HStack {
                Spacer()
                ZStack {
                    if let item = focused {
                        LockerShowcase(item: item,
                                       state: LockerLedger.state(item, ownId: ownId, xp: xp),
                                       canWear: isOwn && item.tool != nil && !pendingIds.contains(item.id),
                                       onSeeItWorn: { if let t = item.tool { onSeeItWorn(t) } })
                            .id(item.id)
                            .transition(reduceMotion ? .opacity : .scale(scale: 0.5, anchor: .bottom).combined(with: .opacity))
                    }
                }
            }
            .padding(.trailing, 16)

#if DEBUG
            if live {
                Text(stageState)
                    .font(.system(size: 1))
                    .opacity(0.01)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("locker-stage-\(companion.id)-\(stageState)")
            }
#endif
        }
    }

    private var stageLabel: String {
        if reachable {
            let base = "\(companion.label), \(companion.role)."
            return isOwn ? base + L.t(" With you. \(ownedCount) of 4 earned.", " Contigo. \(ownedCount) de 4 ganados.")
                         : base + L.t(" \(ownedCount) of 4 earned.", " \(ownedCount) de 4 ganados.")
        }
        let need = max(0, LockerLedger.minXP(forLevel: companion.requiredLevel) - xp)
        return L.t("\(companion.label), locked until level \(companion.requiredLevel), \(need) XP to go.",
                   "\(companion.label), se desbloquea en el nivel \(companion.requiredLevel), faltan \(need) XP.")
    }

    // MARK: name block

    private var nameBlock: some View {
        VStack(spacing: 4) {
            if let item = focused {
                let state = LockerLedger.state(item, ownId: ownId, xp: xp)
                Text(item.title)
                    .font(.rounded(22, .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(statusLine(item, state))
                    .font(.mono(10, .bold)).kerning(1.4)
                    .foregroundStyle(item.isGolden ? lockerGold : (reachable ? companion.tint : Theme.text.opacity(0.7)))
                if state != .owned {
                    Text(L.t("Earned by reading and coming back. Never bought.", "Se gana leyendo y volviendo. Nunca se compra."))
                        .font(.mono(9, .medium))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
            } else {
                Text(isOwn ? companion.name(at: LockerLedger.level(at: xp)) : companion.label)
                    .font(.mono(26, .black)).kerning(3)
                    .foregroundStyle(reachable ? companion.tint : Theme.text.opacity(0.72))
                    .lineLimit(1).minimumScaleFactor(0.6)
                Text(ownedCount == 4 ? L.t("SET COMPLETE", "SET COMPLETO") : companion.role)
                    .font(.mono(10, .bold)).kerning(1.6)
                    .foregroundStyle(ownedCount == 4 ? lockerGold : Theme.muted)
            }
        }
        .frame(height: 64)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: focus)
    }

    private func statusLine(_ item: CatalogItem, _ state: LockerState) -> String {
        switch state {
        case .owned:
            return item.isPet ? L.t("PET · YOURS", "MASCOTA · TUYA") : L.t("\(item.tierLabel) · YOURS", "\(item.tierLabel) · TUYO")
        case .firstRead:
            return L.t("\(item.tierLabel) · YOUR FIRST READ", "\(item.tierLabel) · TU PRIMERA LECTURA")
        case .needsXP(let n), .needsLevel(_, let n):
            return "\(item.tierLabel) · +\(n) XP"
        }
    }

    // MARK: boxes

    private var boxes: some View {
        let next = LockerLedger.nextUp(companion, ownId: ownId, xp: xp)
        return HStack(spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                LockerBox(item: item,
                          state: LockerLedger.state(item, ownId: ownId, xp: xp),
                          tint: companion.tint,
                          isNew: unseen.contains(item.id),
                          focused: focus == item.id,
                          nextProgress: next?.id == item.id ? next?.progress : nil,
                          delay: Double(i) * 0.04,
                          appeared: appeared) {
                    let state = LockerLedger.state(item, ownId: ownId, xp: xp)
                    if state == .owned {
                        UIImpactFeedbackGenerator(style: item.isGolden ? .medium : .light).impactOccurred()
                    } else {
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.7)
                    }
                    withAnimation(reduceMotion ? nil : .spring(duration: 0.35, bounce: 0.3)) {
                        focus = focus == item.id ? nil : item.id
                    }
                }
            }
        }
    }
}

// MARK: - A loot box

private struct LockerBox: View {
    let item: CatalogItem
    let state: LockerState
    let tint: Color
    let isNew: Bool
    let focused: Bool
    let nextProgress: Double?
    let delay: Double
    let appeared: Bool
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    @State private var fill: Double = 0

    private var owned: Bool { state == .owned }
    private var accent: Color { item.isGolden ? lockerGold : tint }
    /// One rule for the bar and the chip above it, so they never drift apart.
    private var showsBar: Bool {
        guard let p = nextProgress else { return false }
        return p > 0 && p < 1
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(owned ? accent.opacity(item.isGolden ? 0.14 : 0.12) : Theme.card)
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(focused ? accent : (owned ? accent.opacity(item.isGolden ? 0.85 : 0.6) : (item.isGolden ? lockerGold.opacity(0.35) : Theme.stroke)),
                            lineWidth: focused ? 2 : (owned && item.isGolden ? 1.5 : 1))
                ItemArt(item: item, size: 60, tint: owned ? accent : Theme.muted)
                    .silverLocked(!owned)
                    .padding(8)
                if owned && item.isGolden && !reduceMotion {
                    GoldenShimmer().clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous)).allowsHitTesting(false)
                }
                badges
                if showsBar, let nextProgress {
                    VStack {
                        Spacer()
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.08))
                                Capsule().fill(accent).frame(width: geo.size.width * fill)
                            }
                        }
                        .frame(height: 3)
                        .padding(.horizontal, 10)
                        .padding(.bottom, 5)
                    }
                    .onAppear {
                        if reduceMotion { fill = nextProgress } else { withAnimation(.easeOut(duration: 0.6)) { fill = nextProgress } }
                    }
                    .onChange(of: nextProgress) { _, p in fill = p }
                    .accessibilityHidden(true)
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: 82)
            .scaleEffect(focused ? 1.04 : 1)
            .shadow(color: owned && item.isGolden ? lockerGold.opacity(0.35) : .clear, radius: 10)
        }
        .buttonStyle(.plain)
        .scaleEffect(shown || reduceMotion ? 1 : 0.85)
        .opacity(shown ? 1 : 0)
        .onAppear {
            guard !shown else { return }
            if reduceMotion { withAnimation(.easeOut(duration: 0.2)) { shown = true } }
            else { withAnimation(.spring(duration: 0.35, bounce: 0.3).delay(delay)) { shown = true } }
        }
        .accessibilityLabel("\(item.title), \(item.tierLabel)")
        .accessibilityValue(accessibilityValue)
        .accessibilityHint(L.t("Shows it next to \(item.companion.label)", "Lo muestra junto a \(item.companion.label)"))
        .accessibilityAddTraits(focused ? [.isSelected] : [])
        .accessibilityIdentifier("locker-box-\(item.id)")
    }

    private var accessibilityValue: String {
        if isNew { return item.isPet ? L.t("new", "nueva") : L.t("new", "nuevo") }
        switch state {
        case .owned: return item.isPet ? L.t("yours", "tuya") : L.t("yours", "tuyo")
        case .firstRead: return L.t("your first read", "tu primera lectura")
        case .needsXP(let n): return L.t("\(n) XP to go", "faltan \(n) XP")
        case .needsLevel(let level, let n): return L.t("level \(level) first, \(n) XP to go", "primero nivel \(level), faltan \(n) XP")
        }
    }

    @ViewBuilder
    private var badges: some View {
        // Top-left: what kind of box it is. Top-right: lock or NEW. Bottom: the price.
        VStack {
            HStack(alignment: .top) {
                if item.isPet {
                    Image(systemName: "pawprint.fill").font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.text.opacity(0.55))
                } else if item.isGolden {
                    Image(systemName: "star.fill").font(.system(size: 9, weight: .bold)).foregroundStyle(lockerGold.opacity(owned ? 1 : 0.6))
                }
                Spacer()
                if isNew {
                    Text(L.t("NEW", "NUEVO"))
                        .font(.mono(7.5, .black))
                        .foregroundStyle(Theme.bg)
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(Capsule().fill(accent))
                        .scaleEffect(shown || reduceMotion ? 1 : 0.6)
                } else if !owned {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(Theme.text.opacity(0.85))
                        .frame(width: 16, height: 16)
                        .background(Circle().fill(Theme.bg.opacity(0.8)))
                }
            }
            Spacer()
            if let chip = priceChip {
                Text(chip)
                    .font(.mono(9, .bold))
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .foregroundStyle(item.isGolden ? lockerGold : Theme.text.opacity(0.9))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Capsule().fill(Theme.bg.opacity(0.85)))
                    .padding(.bottom, showsBar ? 8 : 0)
            }
        }
        .padding(6)
        .accessibilityHidden(true)
    }

    private var priceChip: String? {
        switch state {
        case .owned: return nil
        case .firstRead: return L.t("1ST READ", "1ª LECTURA")
        case .needsXP(let n), .needsLevel(_, let n): return "+\(n)"
        }
    }
}

/// A diagonal glint across an owned golden box every few seconds.
private struct GoldenShimmer: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4.5)
            let x = t < 0.9 ? t / 0.9 : 1.4
            GeometryReader { geo in
                LinearGradient(colors: [.clear, Color.white.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: geo.size.width * 0.45)
                    .rotationEffect(.degrees(20))
                    .offset(x: geo.size.width * (CGFloat(x) * 1.6 - 0.5))
            }
        }
        .blendMode(.plusLighter)
    }
}

// MARK: - The focused piece, next to the companion

private struct LockerShowcase: View {
    let item: CatalogItem
    let state: LockerState
    let canWear: Bool
    let onSeeItWorn: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bob = false
    /// Locked pieces open in full colour, then cool to silver: the peek.
    @State private var peek = true
    @State private var held = false
    @AccessibilityFocusState private var voiceOverFocus: Bool

    private var owned: Bool { state == .owned }
    private var accent: Color { item.isGolden ? lockerGold : item.companion.tint }

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [accent.opacity(item.isGolden ? 0.45 : 0.30), .clear], center: .center, startRadius: 4, endRadius: 90))
                    .frame(width: 170, height: 170)
                    .accessibilityHidden(true)
                ItemArt(item: item, size: 136, tint: accent)
                    .silverLocked(!owned && !peek && !held)
                    .offset(y: bob ? -4 : 4)
                    .accessibilityElement()
                    .accessibilityLabel(item.title)
                    .accessibilityAddTraits(.isImage)
                    .accessibilityFocused($voiceOverFocus)
                    .onLongPressGesture(minimumDuration: .infinity, maximumDistance: 12, perform: {}, onPressingChanged: { pressing in
                        guard !owned else { return }
                        if pressing { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
                        withAnimation(.easeOut(duration: 0.2)) { held = pressing }
                    })
            }
            Text(item.lore)
                .font(.rounded(12, .medium))
                .foregroundStyle(Theme.text.opacity(0.7))
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .frame(width: 150)
            if canWear && owned {
                Button(action: onSeeItWorn) {
                    Text(L.t("SEE IT WORN ›", "VERLO PUESTO ›"))
                        .font(.mono(9, .bold)).kerning(1.2)
                        .foregroundStyle(accent)
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(Capsule().stroke(accent.opacity(0.6), lineWidth: 1))
                        .frame(height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("locker-see-worn")
            }
        }
        .frame(width: 150)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("locker-showcase")
        .onAppear {
            // After the insertion transition, so the element is in the tree.
            if UIAccessibility.isVoiceOverRunning {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { voiceOverFocus = true }
            }
            if !reduceMotion {
                withAnimation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true)) { bob = true }
            }
            guard !owned else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                withAnimation(.easeInOut(duration: 0.8)) { peek = false }
            }
        }
    }
}

// MARK: - The strip: every friend's face, with its loot as dots

private struct LockerStrip: View {
    let order: [Companion]
    let pageId: String
    let ownId: String?
    let xp: Int
    let unseen: Set<String>
    let onPick: (String) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                // Eighteen small faces: an eager stack keeps scrollTo exact.
                HStack(spacing: 10) {
                    ForEach(order) { c in
                        portrait(c).id(c.id)
                    }
                }
                .padding(.horizontal, 18)
            }
            .frame(height: 70)
            .onAppear { proxy.scrollTo(pageId, anchor: .center) }
            .onChange(of: pageId) { _, id in
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) { proxy.scrollTo(id, anchor: .center) }
            }
        }
    }

    private func portrait(_ c: Companion) -> some View {
        let reachable = LockerLedger.reachable(c, ownId: ownId, xp: xp)
        let items = LockerLedger.items(for: c)
        let hasNew = items.contains { unseen.contains($0.id) }
        let owned = items.filter { LockerLedger.state($0, ownId: ownId, xp: xp) == .owned }.count
        return Button { onPick(c.id) } label: {
            VStack(spacing: 6) {
                ZStack {
                    CompanionThumb(companion: c)
                        .scaleEffect(1.5, anchor: UnitPoint(x: 0.5, y: 0.22))
                        .frame(width: 52, height: 52)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .silverLocked(!reachable)
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(c.id == pageId ? c.tint : Theme.stroke, lineWidth: c.id == pageId ? 2 : 1)
                }
                .frame(width: 52, height: 52)
                .overlay(alignment: .topTrailing) {
                    if hasNew {
                        Circle().fill(c.tint).frame(width: 8, height: 8).offset(x: 2, y: -2)
                    } else if !reachable {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 7, weight: .bold))
                            .foregroundStyle(Theme.text.opacity(0.9))
                            .frame(width: 16, height: 16)
                            .background(Circle().fill(Theme.bg.opacity(0.85)))
                            .offset(x: 3, y: -3)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if c.id == ownId {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(c.tint)
                            .background(Circle().fill(Theme.bg))
                            .offset(x: 4, y: 4)
                    }
                }
                HStack(spacing: 3) {
                    ForEach(items) { item in
                        let has = LockerLedger.state(item, ownId: ownId, xp: xp) == .owned
                        Circle()
                            .fill(has ? (item.isGolden ? lockerGold : c.tint) : Color.clear)
                            .overlay(Circle().stroke(has ? Color.clear : Theme.muted.opacity(0.5), lineWidth: 0.75))
                            .frame(width: 4, height: 4)
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(c.label)
        .accessibilityValue(reachable
            ? L.t("\(owned) of 4 earned\(hasNew ? ", new" : "")", "\(owned) de 4 ganados\(hasNew ? ", nuevo" : "")")
            : L.t("locked, level \(c.requiredLevel)", "se desbloquea en el nivel \(c.requiredLevel)"))
        .accessibilityAddTraits(c.id == pageId ? [.isSelected] : [])
        .accessibilityIdentifier("locker-strip-\(c.id)")
    }
}

#if DEBUG
/// Backend-free locker for QA and UI tests: `-qa-locker`, level via
/// `-companion.disciplineXP <n>`, owner via `-companion.id <id>`,
/// `-qa-locker-fresh` forgets what was seen.
struct LockerQAFixtureView: View {
    @StateObject private var store = CompanionStore()
    /// Once per launch: SwiftUI may build this struct more than once.
    private static let freshStart: Void = {
        if ProcessInfo.processInfo.arguments.contains("-qa-locker-fresh") {
            UserDefaults.standard.removeObject(forKey: LockerSeen.key)
        }
    }()

    init() { _ = Self.freshStart }

    private let focus: String? = {
        let args = ProcessInfo.processInfo.arguments
        return args.firstIndex(of: "-qa-focus").flatMap { args.indices.contains($0 + 1) ? args[$0 + 1] : nil }
    }()

    var body: some View {
        SquadLockerSheet(store: store, initialFocus: focus)
            .overlay(alignment: .bottomLeading) {
                TimelineView(.periodic(from: .now, by: 0.5)) { _ in
                    Text("\(FloatingMascotView.liveViews)")
                        .font(.system(size: 1))
                        .opacity(0.01)
                        .accessibilityIdentifier("locker-live-\(FloatingMascotView.liveViews)")
                }
            }
    }
}
#endif
