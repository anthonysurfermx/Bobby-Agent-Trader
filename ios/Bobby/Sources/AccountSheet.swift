// The profile — the Núcleo opens it from the header avatar (full height, with the privacy and
// support links); the classic desk opens it from its menu. It mirrors the web profile drawer
// (src/components/nucleo/NucleoProfile.tsx): your companion large, its name in the light
// display face, the level bar, the gear belt, then quiet rows under mono section labels, and
// the account actions kept deliberately small at the foot (sync, sign out, delete).
// Deletion stays one tap away from the foot on every detent (App Review 5.1.1(v)).
// The reads the server meters (Nucleo/ARCHITECTURE.md §8.5) live behind ONE row, "Credits" (1.8):
// what is left, the gifted reads, Bobby Pro with Manage subscription, redeem a code, invite friends
// and Restore Purchases are all on that screen (V18/Credits/CreditsSheet.swift), reachable signed
// in or not (App Review 3.1.1).
import AuthenticationServices
import StoreKit
import SwiftUI

struct AccountSheet: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var profile: AgentProfile
    /// Pieces the account holds on Trader Land (the desk's island read); nil = read it here.
    var pieces: Int? = nil
    /// Sheet heights; the Núcleo asks for `.large` only so deletion is always on screen.
    var detents: Set<PresentationDetent> = [.medium, .large]
    /// Privacy Policy and Help links under the buttons (the Núcleo has no other menu).
    var showsLinks = false
    /// The voice the squad gallery speaks with when a companion is chosen, and the one the
    /// "Bobby's voice" switch mutes; nil keeps the gallery silent and hides the switch.
    var voice: NeuralVoice? = nil
    /// Called after the voice switch flips (the Núcleo refreshes the page's `session.muted`).
    var onVoiceMutedChange: (() -> Void)? = nil
    /// Stops future external AI requests while keeping account controls available.
    var onAIConsentWithdraw: (() -> Void)? = nil
    /// Opens a 1.8 screen of the Núcleo over the glass (My theses, Reminders); nil hides those rows (the classic desk).
    var onOpenRoute: ((NucleoRoute) -> Void)? = nil
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @ObservedObject private var reads = BobbyAccessCenter.shared
    @ObservedObject private var invites = NucleoLevelCenter.shared
    /// The account's market briefing choices (the row detail); nil until read.
    @ObservedObject private var briefings = BriefingsCenter.shared
    /// The island read when the caller has none (the Núcleo): signed in and past the risk notice only.
    @StateObject private var land = LandPulse()
    @AppStorage(L.preferenceKey) private var languageSelection = "system"
    @State private var manageSubscription = false
    @State private var busy = false
    @State private var showDeleteConfirmation = false
    @State private var accountDeleted = false
    @State private var route: ProfileRoute?
    @State private var heroLoading = true
    @State private var heroFailed = false
    @State private var shareToken = 0
    @State private var emote: CompanionEmoteEvent?
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var companion: Companion { store.companion ?? bobbyCompanions[0] }
    private var level: CompanionLevel { store.level }
    private var shownPieces: Int? { pieces ?? land.pieces }
    private var greetingName: String? {
        account.isSignedIn ? AppleGivenName.name(for: account.session?.appleUserId) : nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topBar
                hero
                statsStrip.padding(.top, 22)
                if store.companion != nil {
                    ToolBelt(companion: companion, store: store,
                             onTap: { route = .tool($0) }, onPet: { route = .pet },
                             onPlus: { route = .locker }, onWorld: { route = .land })
                        .frame(maxWidth: .infinity)
                        .padding(.top, 18)
                }
                section(L.t("Your avatar", "Tu avatar")) { avatarRows }
                section(L.t("Account", "Cuenta")) { accountRows }
                footer.padding(.top, 30)
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .background(backdrop)
        .presentationDetents(detents)
        .presentationDragIndicator(.visible)
        .manageSubscriptionsSheet(isPresented: $manageSubscription)
        .task {
            // R11: nothing reaches the network before the risk notice is accepted.
            guard profile.acceptedRiskNotice else { return }
            await reads.refresh()
            await invites.refresh()
            if pieces == nil, account.isSignedIn { await land.refresh() }
            if account.isSignedIn { await briefings.refresh() }
        }
        .sheet(item: $route, onDismiss: {
            // A thesis closed on the island or a piece planted: bring the pieces up to date.
            if pieces == nil, account.isSignedIn, profile.acceptedRiskNotice { Task { await land.refresh() } }
            // Back from Credits or Bobby Pro (a purchase, a restore, a code or a sign in): the credits line follows.
            if profile.acceptedRiskNotice { Task { await reads.refresh(); await NucleoLevelCenter.shared.refresh() } }
            // Back from the briefing settings (or Bobby Pro): the row detail follows the account's choices.
            if profile.acceptedRiskNotice, account.isSignedIn { Task { await briefings.refresh() } }
        }) { destination in
            sheet(destination)
        }
        .confirmationDialog(
            L.t("Delete your Bobby account?", "¿Borrar tu cuenta de Bobby?"),
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            if activeAppleSubscription {
                // Deleting the account never cancels an App Store subscription: offer Apple's sheet first.
                Button(L.t("Manage subscription", "Administrar suscripción")) {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { manageSubscription = true }
                }
            }
            Button(L.t("Delete account permanently", "Borrar cuenta permanentemente"), role: .destructive) {
                busy = true
                Task {
                    // A cancelled Apple sheet says nothing; a failure shows `lastError` under the buttons.
                    let result = await account.deleteAccount(store: store)
                    busy = false
                    if result == .deleted { accountDeleted = true }
                }
            }
            Button(L.t("Cancel", "Cancelar"), role: .cancel) {}
        } message: {
            Text(AccountDeletionCopy.confirmation(activeAppleSubscription: activeAppleSubscription))
        }
        .alert(L.t("Account deleted", "Cuenta eliminada"), isPresented: $accountDeleted) {
            if account.manualAppleRevocationRequired {
                Button(AccountDeletionCopy.manageAppleButton) {
                    openURL(account.manualRevocationURL)
                    onClose()
                }
            }
            Button("OK", role: .cancel) { onClose() }
        } message: {
            Text(AccountDeletionCopy.deleted(manualAppleSteps: account.manualAppleRevocationRequired))
        }
    }

    // MARK: - Frame

    /// The same violet-blue light as the Núcleo, independent of avatar identity.
    private var backdrop: some View {
        ZStack {
            Theme.bg
            RadialGradient(colors: [Theme.orbViolet.opacity(0.16), Theme.orbBlue.opacity(0.05), .clear],
                           center: UnitPoint(x: 0.5, y: 0.17), startRadius: 10, endRadius: 330)
        }
        .ignoresSafeArea()
    }

    private var topBar: some View {
        HStack {
            Text(L.t("Profile", "Perfil").uppercased()).font(.mono(11, .medium)).tracking(1.6).foregroundStyle(Theme.warmDim)
            Spacer()
            Button(action: onClose) {
                // 30 pt to the eye, 44 pt to the finger (the bar keeps its 30 pt height).
                Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmMuted)
                    .frame(width: 30, height: 30).background(Circle().fill(Theme.warmFill))
                    .frame(width: 44, height: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .padding(.vertical, -7)
            .accessibilityLabel(L.t("Close", "Cerrar"))
            .accessibilityIdentifier("account-close")
        }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(spacing: 0) {
            if let name = greetingName {
                Text(L.t("Hi, \(name)", "Hola, \(name)"))
                    .font(.system(size: 15, weight: .regular, design: .rounded)).foregroundStyle(Theme.warmMuted)
                    .padding(.top, 6)
                    .accessibilityIdentifier("account-greeting")
            }
            heroStage
            Text(companion.name(at: level.number).capitalized)
                .font(.system(size: 32, weight: .light, design: .rounded)).tracking(-0.8)
                .foregroundStyle(Theme.cream)
                .lineLimit(1).minimumScaleFactor(0.7)
                .accessibilityIdentifier("account-display-name")
            Text(companion.role)
                .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                .padding(.top, 4)
            levelBlock.padding(.top, 20)
        }
        .frame(maxWidth: .infinity)
    }

    /// The companion itself, wearing its gear: the bundled portrait until the 3D model is on stage.
    private var heroStage: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [Theme.orbViolet.opacity(0.20), Theme.orbBlue.opacity(0.07), .clear], center: .center, startRadius: 4, endRadius: 120))
                .frame(width: 240, height: 240)
                .blur(radius: 6)
            if heroLoading || heroFailed {
                CompanionPortrait(companion: companion, size: 150)
                    .overlay(Circle().stroke(Theme.nucleoStroke, lineWidth: 1))
                    .transition(.opacity)
            }
            MascotSceneView(
                assetName: companion.id,
                interactive: false,
                emoteEvent: emote,
                onLoading: { loading, failed in
                    withAnimation(.easeOut(duration: 0.35)) { heroLoading = loading; heroFailed = failed }
                },
                gear: store.wornGear(for: companion.id),
                pet: store.wornPet(for: companion.id),
                snapshotToken: shareToken,
                onSnapshot: { route = .share($0) },
                // Another sheet on top (gallery, locker): the hero stops drawing.
                paused: route != nil
            )
            .id(companion.id)
            .opacity(heroLoading || heroFailed ? 0 : 1)
            .scaleEffect(heroLoading && !reduceMotion ? 0.86 : 1)
        }
        .frame(height: 236)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture {
            // A tap says hi: the companion's first emote, the one every level has.
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            emote = CompanionEmoteEvent(emote: .pulse)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L.t("\(companion.label), your avatar", "\(companion.label), tu avatar"))
        .accessibilityIdentifier("account-hero")
    }

    private var levelBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(L.t("Level \(level.number) · \(level.name)", "Nivel \(level.number) · \(level.name)").uppercased())
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 8)
                Text(store.nextLevel.map { "\(store.disciplineXP) XP / \($0.minXP)" } ?? "\(store.disciplineXP) XP")
            }
            .font(.mono(10.5, .medium)).tracking(1.2).foregroundStyle(Theme.warmDim)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.cream.opacity(0.08))
                    Capsule().fill(LinearGradient(colors: [Theme.orbViolet, Theme.orbCyan], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(3, geo.size.width * min(1, max(0, store.levelProgress))))
                        .shadow(color: Theme.orbViolet.opacity(0.25), radius: 4)
                }
            }
            .frame(height: 3)
            .padding(.top, 9)
            Text(L.t("Earned with discipline, never volume.", "Se gana con disciplina, nunca con volumen."))
                .font(.system(size: 12)).foregroundStyle(Theme.warmDim)
                .padding(.top, 8)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("account-level")
    }

    // MARK: - Stats

    private var statsStrip: some View {
        HStack(spacing: 0) {
            stat(L.t("Streak", "Racha"), "\(store.disciplineStreak)", symbol: "flame")
            hairline
            stat(L.t("Aura", "Aura"), "\(store.aura)", symbol: "sparkle")
            hairline
            // Pieces repeat and the island grows: no fixed route to count against.
            stat(L.t("Pieces", "Piezas"), shownPieces.map { "\($0)" } ?? "—", symbol: "square.stack.3d.up")
        }
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.nucleoGlass))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.nucleoStroke, lineWidth: 1))
        .accessibilityIdentifier("account-stats")
    }

    private var hairline: some View { Rectangle().fill(Theme.warmHair).frame(width: 1, height: 26) }

    private func stat(_ label: String, _ value: String, symbol: String) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.system(size: 17, weight: .medium, design: .rounded)).monospacedDigit().foregroundStyle(Theme.cream)
            HStack(spacing: 4) {
                Image(systemName: symbol).font(.system(size: 8.5, weight: .semibold))
                Text(label.uppercased()).font(.mono(9.5, .medium)).tracking(1.1)
            }
            .foregroundStyle(Theme.warmDim)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Rows

    private func section<Rows: View>(_ title: String, @ViewBuilder rows: () -> Rows) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased()).font(.mono(11, .medium)).tracking(1.6).foregroundStyle(Theme.warmDim)
                .padding(.bottom, 8)
            rows()
        }
        .padding(.top, 30)
    }

    @ViewBuilder private var avatarRows: some View {
        // The profile's avatar: the current companion and the way to change it (the squad gallery).
        ProfileRow(label: L.t("Your avatar", "Tu avatar") + (store.companion.map { " · \($0.label.capitalized)" } ?? ""),
                   detail: store.companion == nil ? L.t("Choose who lives in your Bobby", "Elige quién vive en tu Bobby") : companion.personality,
                   trailing: L.t("Change", "Cambiar"),
                   action: { route = .avatar }) {
            if let c = store.companion { CompanionThumb(companion: c) } else { ProfileIcon(symbol: "person.crop.circle") }
        }
        .accessibilityLabel(L.t("Your avatar. Change it", "Tu avatar. Cambiarlo"))
        .accessibilityIdentifier("account-avatar")

        if store.companion != nil {
            ProfileRow(label: L.t("Share my avatar", "Compartir mi avatar"),
                       detail: L.t("A card with your look, level and gear", "Una tarjeta con tu estilo, nivel y equipo"),
                       action: shareAvatar) { ProfileIcon(symbol: "square.and.arrow.up") }
                .accessibilityIdentifier("account-share")
        }

        let gear = LockerLedger.count(ownId: store.companionId, xp: store.disciplineXP)
        ProfileRow(label: L.t("Gear", "Equipo"),
                   detail: L.t("\(gear.owned) of \(gear.total) earned", "\(gear.owned) de \(gear.total) ganados"),
                   action: { route = .locker }) { ProfileIcon(symbol: "square.grid.2x2") }
            .accessibilityIdentifier("account-gear")

        ProfileRow(label: "Trader Land",
                   detail: L.t("Every read plants something", "Cada lectura planta algo"),
                   action: { route = .land }) { ProfileIcon(symbol: "map") }
            .accessibilityIdentifier("account-trader-land")
    }

    @ViewBuilder private var accountRows: some View {
        // Credits (1.8): what is left, gifted reads, Bobby Pro, redeem a code, invite friends and
        // Restore Purchases live on one screen; this row says the balance in one line.
        ProfileRow(label: L.t("Credits", "Créditos"), detail: creditsSummary, detailLineLimit: nil,
                   action: { route = .credits }) { ProfileIcon(symbol: "ticket", tint: Theme.cream) }
            .accessibilityIdentifier("account-credits")
        if let onOpenRoute {
            // The Núcleo's own screens open over the glass once this sheet is gone.
            ProfileRow(label: L.t("My theses", "Mis tesis"),
                       detail: L.t("What you are looking at, and why", "Lo que estás viendo, y por qué"),
                       action: { onOpenRoute(.theses) }) { ProfileIcon(symbol: "text.book.closed") }
                .accessibilityIdentifier("account-theses")
            ProfileRow(label: L.t("Reminders", "Recordatorios"),
                       detail: L.t("Review reminders you set", "Recordatorios de revisión que tú pusiste"),
                       action: { onOpenRoute(.reminders) }) { ProfileIcon(symbol: "bell") }
                .accessibilityIdentifier("account-reminders")
        }
        // Bobby Pro weekly briefing: the account's Monday schedule, its consents and its inbox.
        ProfileRow(label: L.t("Weekly briefing", "Resumen semanal"),
                   detail: BriefingCopy.summary(account.isSignedIn ? briefings.settings : nil),
                   action: { route = .briefings }) { ProfileIcon(symbol: "calendar") }
            .accessibilityIdentifier("account-briefings")
        if let voice {
            VoiceSwitchRow(voice: voice, onChange: onVoiceMutedChange)
            VoiceGenderRow(voice: voice)
        }
        Menu {
            Button(L.t("Follow iPhone language", "Usar el idioma del iPhone")) { L.select("system") }
            ForEach(AppLanguage.allCases, id: \.rawValue) { language in
                Button(language.name) { L.select(language.rawValue) }
            }
        } label: {
            HStack(spacing: 12) {
                ProfileIcon(symbol: "globe")
                VStack(alignment: .leading, spacing: 2) {
                    Text(L.t("Language", "Idioma")).font(.system(size: 15)).foregroundStyle(Theme.cream)
                    Text(L.displayName).font(.system(size: 12)).foregroundStyle(Theme.warmMuted)
                }
                Spacer()
                Text(L.t("Change", "Cambiar")).font(.system(size: 12)).foregroundStyle(Theme.warmMuted)
                Image(systemName: "chevron.down").font(.system(size: 10)).foregroundStyle(Theme.warmMuted)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .accessibilityIdentifier("account-language")
        // What Bobby remembers about this account: see, correct, pause or delete it.
        ProfileRow(label: L.t("Memory", "Memoria"),
                   detail: L.t("What Bobby remembers about your assets and preferences", "Lo que Bobby recuerda de tus activos y preferencias"),
                   action: { route = .memory }) { ProfileIcon(symbol: "brain") }
            .accessibilityIdentifier("account-memory")
        ProfileRow(label: L.t("Risk notice", "Aviso de riesgo"),
                   detail: L.t("What Bobby is and is not", "Lo que Bobby es y lo que no"),
                   action: { route = .risk }) { ProfileIcon(symbol: "exclamationmark.shield") }
            .accessibilityIdentifier("account-risk")
    }

    /// "7 of 10 reads · 3 gifted", from the server's word only; a plain description until it answers.
    private var creditsSummary: String {
        CreditsBalance.make(CreditsSnapshot(access: reads.access ?? invites.quickAccess, meters: invites.meters, referral: invites.referral,
                                            subscription: reads.subscription, signedIn: account.isSignedIn)).summary
            ?? L.t("What you have and how to get more", "Lo que tienes y cómo conseguir más")
    }

    /// An App Store subscription Apple keeps billing until it is cancelled in Settings.
    private var activeAppleSubscription: Bool { reads.subscription?.activeOnApple == true }

    /// Share my avatar: the live 3D pose when the model is on stage, the portrait otherwise.
    private func shareAvatar() {
        if heroLoading || heroFailed {
            if let portrait = UIImage(named: "\(companion.id)_thumb") { route = .share(portrait) }
        } else {
            shareToken += 1
        }
    }

    // MARK: - Footer

    @ViewBuilder private var footer: some View {
        VStack(alignment: .leading, spacing: 14) {
            if account.isSignedIn {
                syncLine
                HStack(spacing: 0) {
                    Button { account.signOut(store: store) } label: {
                        Text(L.t("Sign out", "Cerrar sesión")).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.warmMuted)
                            .frame(minHeight: 32)
                    }
                    .disabled(busy)
                    .accessibilityLabel(L.t("Sign out on this phone", "Cerrar sesión en este teléfono"))
                    .accessibilityIdentifier("account-sign-out")
                    Spacer()
                    Button { showDeleteConfirmation = true } label: {
                        Text(L.t("Delete account", "Borrar cuenta")).font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.down.opacity(0.9))
                            .frame(minHeight: 32)
                    }
                    .disabled(busy)
                    .accessibilityLabel(L.t("Delete account and synced progress", "Borrar cuenta y progreso sincronizado"))
                    .accessibilityIdentifier("account-delete")
                }
            } else {
                signInBlock
            }
            // One line, next to the button that failed, signed in or out.
            if let err = account.lastError {
                Text(err).font(.footnote).foregroundStyle(Theme.down).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("account-error")
            }
            if showsLinks {
                HStack(spacing: 18) {
                    Link(destination: L.site("privacy")) {
                        Text(L.t("Privacy Policy", "Aviso de privacidad"))
                    }
                    .accessibilityIdentifier("account-privacy")
                    Text("·").foregroundStyle(Theme.warmDim.opacity(0.6))
                    Link(destination: L.site("support")) {
                        Text(L.t("Help and support", "Ayuda y soporte"))
                    }
                    .accessibilityIdentifier("account-support")
                }
                .font(.system(size: 12))
                .foregroundStyle(Theme.warmDim)
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
            }
        }
        .padding(.top, 18)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
    }

    /// "Signed in with Apple · synced ✓" and a small round sync button that spins while it works.
    private var syncLine: some View {
        HStack(spacing: 10) {
            Image(systemName: account.session?.provider == "twitter" ? "at" : "apple.logo")
                .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.warmMuted)
            VStack(alignment: .leading, spacing: 2) {
                Text(providerLine).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.cream)
                Text(syncState).font(.mono(10.5)).tracking(0.4).foregroundStyle(Theme.warmDim)
            }
            Spacer()
            Button {
                busy = true
                Task { await ProgressSync.shared.sync(store: store, profile: profile); busy = false }
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.cream)
                    .rotationEffect(.degrees(busy ? 360 : 0))
                    .animation(busy && !reduceMotion ? .linear(duration: 0.9).repeatForever(autoreverses: false) : .default, value: busy)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Theme.warmFill))
                    .overlay(Circle().stroke(Theme.nucleoStroke, lineWidth: 1))
            }
            .disabled(busy)
            .accessibilityLabel(busy ? L.t("Syncing…", "Sincronizando…") : L.t("Sync now", "Sincronizar ahora"))
            .accessibilityIdentifier("account-sync")
        }
        .accessibilityElement(children: .contain)
    }

    private var providerLine: String {
        switch account.session?.provider {
        case "twitter": return L.t("Signed in with X", "Sesión con X")
        case "apple", nil: return L.t("Signed in with Apple", "Sesión con Apple")
        default: return L.t("Signed in", "Sesión iniciada")
        }
    }

    private var syncState: String {
        if busy { return L.t("Syncing…", "Sincronizando…") }
        let waiting = store.pendingAwards.count
        if waiting > 0 { return L.t("\(waiting) award(s) waiting to sync", "\(waiting) premio(s) por sincronizar") }
        return store.syncedAt == nil ? L.t("Not synced yet", "Aún sin sincronizar") : L.t("Synced ✓", "Sincronizado ✓")
    }

    private var signInBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L.t("Sign in with Apple so XP, streak, gear and Trader Land follow you. No keys or email.",
                     "Inicia sesión con Apple y tu XP, racha, equipo y Trader Land te siguen. Sin llaves ni correo."))
                .font(.system(size: 13)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
            SignInWithAppleButton(.signIn) { req in
                account.prepareAppleRequest(req)
            } onCompletion: { result in
                Task {
                    await account.completeApple(result)
                    if account.isSignedIn { await ProgressSync.shared.sync(store: store, profile: profile) }  // sync binds the store to this Apple ID
                }
            }
            .signInWithAppleButtonStyle(.white)
            .frame(height: 48)
            .clipShape(Capsule())
            .accessibilityIdentifier("account-apple-sign-in")
            if !store.pendingAwards.isEmpty {
                Text(L.t("\(store.pendingAwards.count) award(s) waiting to sync", "\(store.pendingAwards.count) premio(s) por sincronizar"))
                    .font(.mono(10.5)).foregroundStyle(Theme.warmDim)
            }
#if DEBUG
            // X is off in production Auth: its button and copy never reach a Release build.
            if SignInMethods.offersX {
                Button {
                    busy = true
                    Task {
                        await account.signInWithX()
                        if account.isSignedIn { await ProgressSync.shared.sync(store: store, profile: profile) }
                        busy = false
                    }
                } label: {
                    HStack(spacing: 8) { Text("𝕏").font(.system(size: 15, weight: .bold)); Text(L.t("Continue with X", "Continuar con X")) }
                        .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.cream)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(Capsule().fill(Theme.warmFill))
                        .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .accessibilityIdentifier("account-x-sign-in")
            }
#endif
        }
    }

    // MARK: - Sheets

    @ViewBuilder private func sheet(_ destination: ProfileRoute) -> some View {
        switch destination {
        case .avatar:
            MascotGalleryView(store: store, voice: voice, voiceId: profile.voiceId)
        case .credits:
            // Credits opens its own sheets (invite, redeem a code, Bobby Pro) over itself.
            CreditsSheet(profile: profile,
                         afterSignIn: { await ProgressSync.shared.sync(store: store, profile: profile) },
                         onRead: { route = nil; onClose() }) { route = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .pro:
            // From the weekly briefing settings only; the profile's own Bobby Pro offer is inside Credits.
            NucleoPaywallSheet(store: BobbyStore.shared, center: BobbyAccessCenter.shared,
                               afterSignIn: { await ProgressSync.shared.sync(store: store, profile: profile) },
                               onOutcome: { _ in }) { route = nil }
        case .locker:
            SquadLockerSheet(store: store)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .land:
            TraderLandGateHarnessView(focus: nil)
                .presentationDetents([.large])
                .presentationBackground(Theme.nucleoSurface)
        case .share(let card):
            SkinShareSheet(card: card, companion: companion, level: level,
                           gear: store.wornGear(for: companion.id), pet: store.wornPet(for: companion.id),
                           xp: store.disciplineXP)
        case .risk:
            RiskNoticeView(profile: profile, readOnly: true,
                           onClose: { route = nil },
                           onWithdraw: onAIConsentWithdraw.map { withdraw in { route = nil; withdraw() } })
        case .tool(let tool):
            ToolDetailSheet(companion: companion, tool: tool, store: store)
                .presentationDetents([.medium, .large])
                .presentationBackground(Theme.nucleoSurface)
        case .pet:
            PetDetailSheet(companion: companion, store: store)
                .presentationDetents([.medium, .large])
                .presentationBackground(Theme.nucleoSurface)
        case .briefings:
            BriefingsSettingsView(riskAccepted: profile.acceptedRiskNotice,
                                  onShowPro: {
                                      // Bobby Pro follows once this sheet is gone (as the invite sheet does).
                                      route = nil
                                      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { route = .pro }
                                  }) { route = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .memory:
            MemoryView(riskAccepted: profile.acceptedRiskNotice) { route = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        }
    }
}

/// Where the profile's rows lead; one sheet at a time over the profile.
enum ProfileRoute: Identifiable {
    case avatar, credits, locker, land, risk, pet, pro, briefings, memory
    case share(UIImage)
    case tool(CompanionTool)

    var id: String {
        switch self {
        case .avatar: return "avatar"
        case .credits: return "credits"
        case .locker: return "locker"
        case .land: return "land"
        case .risk: return "risk"
        case .pet: return "pet"
        case .pro: return "pro"
        case .briefings: return "briefings"
        case .memory: return "memory"
        case .share(let image): return "share-\(ObjectIdentifier(image).hashValue)"
        case .tool(let tool): return "tool-\(tool.id)"
        }
    }
}

// MARK: - Row kit (the web `n-row`)

/// An icon in a small rounded well, the label in cream and a muted detail, a chevron; the hairline
/// above each row is the only separator (no cards).
private struct ProfileRow<Icon: View>: View {
    let label: String
    var detail: String? = nil
    var trailing: String? = nil
    var detailLineLimit: Int? = 2
    let action: () -> Void
    @ViewBuilder let icon: () -> Icon

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: 12) {
                icon()
                    .frame(width: 32, height: 32)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.system(size: 15)).foregroundStyle(Theme.cream).lineLimit(1)
                    if let detail {
                        Text(detail).font(.system(size: 12)).foregroundStyle(Theme.warmDim).lineLimit(detailLineLimit)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                if let trailing {
                    Text(trailing).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.warmMuted)
                }
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmDim)
            }
            .profileRowFrame()
            .contentShape(Rectangle())
        }
        .buttonStyle(ProfileRowButtonStyle())
    }
}

/// The row's SF Symbol in the 32 pt well.
private struct ProfileIcon: View {
    let symbol: String
    var tint: Color = Theme.warmMuted

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(tint)
            .frame(width: 32, height: 32)
            .background(Theme.warmFill)
    }
}

private struct ProfileRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Theme.cream.opacity(configuration.isPressed ? 0.04 : 0))
    }
}

private extension View {
    /// 52 pt minimum, a hairline on top: the web `.n-row`.
    func profileRowFrame() -> some View {
        frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .padding(.vertical, 8)
            .padding(.horizontal, 2)
            .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
    }
}

/// The reads line the profile showed through 1.7, from the server's access object (never a number
/// of the app's own). Since 1.8 the profile and the Credits screen read `CreditsBalance`
/// (V18/Credits); this builder and `GiftedReadsRow` stay for the suites that pin their wording.
struct ReadsRow: Equatable {
    let title: String
    let detail: String?
    let pro: Bool
    /// Manage subscription (Apple's sheet): only for an App Store subscription.
    let manage: Bool

    private static func giftDate(_ date: Date, spanish: Bool? = nil) -> String {
        let formatter = DateFormatter()
        formatter.locale = L.formatLocale(spanish: spanish)
        formatter.setLocalizedDateFormatFromTemplate("MMMMdyyyy")
        return formatter.string(from: date)
    }

    static func content(access: BobbyReadAccess?, subscription: BobbySubscription?, signedIn: Bool,
                        grantUntil: String? = nil, grantSource: String? = nil, spanish: Bool? = nil) -> ReadsRow? {
        guard let access else { return nil }
        if access.isPro {
            let paid = ["active", "trialing"].contains(subscription?.status ?? "")
                && (subscription?.periodEnd.map { $0 > .now } ?? true)
            let grantEnd = grantUntil.flatMap(BobbyAccessAPI.date)
            let activeGrant = ["admin", "referral"].contains(grantSource ?? "") && (grantEnd ?? .distantPast) > .now
            let gifted = !paid && activeGrant
            let end = paid ? subscription?.periodEnd.map { BobbyAccessAPI.day($0, spanish: spanish) } : nil
            let canceled = ["canceled", "cancelled", "expired"].contains(subscription?.status ?? "")
            let paidDetail = end.map { canceled ? L.t(" · ends \($0)", " · termina el \($0)", spanish: spanish)
                                                : L.t(" · renews \($0)", " · se renueva el \($0)", spanish: spanish) } ?? ""
            let grantDetail = activeGrant ? grantEnd.map { L.t(" · gifted Pro until \(giftDate($0, spanish: spanish))", " · Pro regalado hasta el \(giftDate($0, spanish: spanish))", spanish: spanish) } ?? "" : ""
            let detail = BobbyStore.Copy.benefits(spanish: spanish) + paidDetail + grantDetail
            return ReadsRow(title: gifted ? L.t("Bobby Pro · Gifted", "Bobby Pro · Regalado", spanish: spanish)
                                          : L.t("Bobby Pro · Active", "Bobby Pro · Activo", spanish: spanish), detail: detail, pro: true,
                            manage: paid && (subscription?.managedByApple ?? false))
        }
        guard let limit = access.limit else { return nil }
        let left = access.remaining ?? max(0, limit - access.used)
        let gift = access.bonus > 0 ? " + " + BobbyReadAccess.giftLabel(access.bonus, spanish: spanish) : ""
        if access.tier == "anon" {
            return ReadsRow(title: L.t("\(left) of \(limit) free reads left", "Te quedan \(left) de \(limit) lecturas gratis", spanish: spanish) + gift,
                            detail: signedIn ? nil : L.t("Sign in to keep reading after that.", "Inicia sesión para seguir leyendo después.", spanish: spanish),
                            pro: false, manage: false)
        }
        let reset = access.resetsDate.map { L.t("Resets \(BobbyAccessAPI.day($0, spanish: spanish))", "Se renuevan el \(BobbyAccessAPI.day($0, spanish: spanish))", spanish: spanish) }
        return ReadsRow(title: L.t("\(left) of \(limit) free reads left this week", "Te quedan \(left) de \(limit) lecturas gratis esta semana", spanish: spanish) + gift,
                        detail: reset, pro: false, manage: false)
    }
}

/// Gift balances are independent of the subscription. Free Quick gifts already appear in ReadsRow;
/// Pro Quick gifts and either account's premium gifts need their own visible line.
struct GiftedReadsRow: Equatable {
    let title: String
    let detail: String

    static func content(access: BobbyReadAccess?, meters: [NucleoAnalysisLevel: NucleoLevelMeter],
                        spanish: Bool? = nil) -> GiftedReadsRow? {
        guard let access else { return nil }
        var parts: [String] = []
        if access.isPro, access.bonus > 0 {
            parts.append(L.t("Quick: \(access.bonus)", "Rápido: \(access.bonus)", spanish: spanish))
        }
        for level in [NucleoAnalysisLevel.profundo, .maximo] {
            guard let bonus = meters[level]?.bonus, bonus > 0 else { continue }
            let label = level == .profundo ? L.t("Deep", "Profundo", spanish: spanish) : L.t("Max", "Máximo", spanish: spanish)
            parts.append("\(label): \(bonus)")
        }
        guard !parts.isEmpty else { return nil }
        return GiftedReadsRow(title: L.t("Gifted reads", "Lecturas de regalo", spanish: spanish),
                              detail: parts.joined(separator: " · "))
    }
}

/// "Bobby's voice": the one device mute (`NeuralVoice.isMuted`) the desk, the gallery and the Núcleo share.
private struct VoiceSwitchRow: View {
    @ObservedObject var voice: NeuralVoice
    let onChange: (() -> Void)?

    var body: some View {
        Toggle(isOn: Binding(
            get: { !voice.isMuted },
            set: { on in
                voice.isMuted = !on
                onChange?()
            })) {
            HStack(spacing: 12) {
                ProfileIcon(symbol: voice.isMuted ? "speaker.slash" : "speaker.wave.2",
                            tint: voice.isMuted ? Theme.warmDim : Theme.cream)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L.t("Bobby's voice", "Voz de Bobby")).font(.system(size: 15)).foregroundStyle(Theme.cream)
                    Text(voice.isMuted ? L.t("Off · Bobby reads in silence", "Apagada · Bobby lee en silencio")
                                       : L.t("On · Bobby speaks his reads", "Encendida · Bobby dice sus lecturas"))
                        .font(.system(size: 12)).foregroundStyle(Theme.warmDim)
                }
            }
        }
        .tint(Theme.orbViolet)
        .profileRowFrame()
        .accessibilityIdentifier("account-voice")
    }
}

/// Whose voice Bobby speaks with (`NeuralVoice.voiceGender`): the companion's own, feminine or masculine.
/// The same menu as the language picker below it; choosing stops the current line.
private struct VoiceGenderRow: View {
    @ObservedObject var voice: NeuralVoice

    private func name(_ gender: NeuralVoice.VoiceGender) -> String {
        switch gender {
        case .companion: return L.t("Companion's voice", "Voz de tu amigo")
        case .female: return L.t("Feminine", "Femenina")
        case .male: return L.t("Masculine", "Masculina")
        }
    }

    var body: some View {
        Menu {
            ForEach(NeuralVoice.VoiceGender.allCases, id: \.rawValue) { gender in
                Button(name(gender)) { voice.voiceGender = gender }
            }
        } label: {
            HStack(spacing: 12) {
                ProfileIcon(symbol: "person.wave.2")
                VStack(alignment: .leading, spacing: 2) {
                    Text(L.t("Voice type", "Tipo de voz")).font(.system(size: 15)).foregroundStyle(Theme.cream)
                    Text(name(voice.voiceGender)).font(.system(size: 12)).foregroundStyle(Theme.warmMuted)
                }
                Spacer()
                Text(L.t("Change", "Cambiar")).font(.system(size: 12)).foregroundStyle(Theme.warmMuted)
                Image(systemName: "chevron.down").font(.system(size: 10)).foregroundStyle(Theme.warmMuted)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .accessibilityIdentifier("account-voice-gender")
    }
}

/// The deletion copy both entry points (this sheet and the desk menu) show.
enum AccountDeletionCopy {
    static var confirmation: String {
        L.t("This deletes your Bobby account and synced XP, streak, gear and Trader Land. Limited security or audit records may remain.",
            "Esto borra tu cuenta de Bobby y tu XP, racha, accesorios y Trader Land sincronizados. Pueden conservarse registros limitados de seguridad o auditoría.")
    }

    /// An active App Store subscription outlives the account: say so before the delete button.
    static var subscriptionWarning: String {
        L.t("Deleting your account doesn’t cancel Bobby Pro. Apple keeps billing until you cancel it in Settings › Apple Account › Subscriptions.",
            "Borrar tu cuenta no cancela Bobby Pro. Apple seguirá cobrándolo hasta que lo canceles en Configuración › Cuenta de Apple › Suscripciones.")
    }

    static func confirmation(activeAppleSubscription: Bool) -> String {
        activeAppleSubscription ? confirmation + "\n\n" + subscriptionWarning : confirmation
    }

    static var manageAppleButton: String { L.t("Open Apple's steps", "Ver los pasos de Apple") }

    /// With `manualAppleSteps`, the server could not revoke Apple access itself: say how to finish.
    @MainActor static func deleted(manualAppleSteps: Bool) -> String {
        manualAppleSteps
            ? L.t("Your Bobby account and synced progress were deleted.", "Se borraron tu cuenta de Bobby y su progreso sincronizado.")
                + " " + AccountSession.manualRevocationSteps
            : L.t("Your account and synced progress were deleted. Bobby keeps working on this phone without an account.",
                  "Se borraron tu cuenta y su progreso sincronizado. Bobby sigue funcionando en este teléfono sin cuenta.")
    }
}

#if DEBUG
/// Backend-free profile for QA screenshots: `-qa-profile signed-out|signed-in`, progress via
/// `-companion.disciplineXP <n> -companion.disciplineStreak <n> -companion.aura <n> -companion.id <id>`,
/// `-qa-pieces <n>` for the island count, `-qa-given-name <name>` for the greeting. The signed-in
/// session lives in memory only (never the Keychain). AccountSession and BobbyAccessAPI refuse
/// its authenticated transport even with accepted consent; RevenueCat Test Store offerings stay
/// available for the separate paywall capture, which never purchases or restores.
struct ProfileQAFixtureView: View {
    @StateObject private var store = CompanionStore()
    @StateObject private var profile = AgentProfile()
    @StateObject private var voice = NeuralVoice()
    private let pieces: Int?

    private static func value(after flag: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: flag), args.indices.contains(i + 1) else { return nil }
        return args[i + 1]
    }

    /// Once per launch: SwiftUI may build this struct more than once.
    @MainActor private static let prepared: Void = {
        if value(after: "-qa-profile") == "signed-in" {
            let appleID = "qa-apple-user"
            AppleGivenName.forget()
            AppleGivenName.remember(value(after: "-qa-given-name"), appleUserId: appleID)
            AccountSession.shared.acceptQAFixture(userId: "qa-user", appleUserId: appleID)
        } else {
            AccountSession.shared.signOut()
        }
    }()

    init() {
        pieces = Self.value(after: "-qa-pieces").flatMap(Int.init)
        _ = Self.prepared
    }

    var body: some View {
        Color.black.ignoresSafeArea()
            .sheet(isPresented: .constant(true)) {
                AccountSheet(store: store, profile: profile, pieces: pieces, detents: [.large], showsLinks: true, voice: voice) {}
                    .interactiveDismissDisabled()
            }
    }
}
#endif
