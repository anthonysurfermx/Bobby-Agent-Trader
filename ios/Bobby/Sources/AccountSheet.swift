// Account sheet — why to sign in (progress follows you to the web and back)
// and the Apple button. 1.2 offers Sign in with Apple only; the X button is Debug-only.
// The Núcleo opens it from the header avatar, full height and with the privacy and
// support links (the classic desk keeps those in its menu).
// The avatar lives here too: the first run no longer asks who lives in the glass
// (a default starter is assigned), so "Your avatar" opens the squad gallery to change it.
// So do the reads the server meters (Nucleo/ARCHITECTURE.md §8.5): what is left this week,
// or Bobby Pro with Manage subscription (Apple's own sheet).
import AuthenticationServices
import StoreKit
import SwiftUI

struct AccountSheet: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var profile: AgentProfile
    /// Pieces the account holds on Trader Land (the desk's island read); nil = unknown.
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
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @ObservedObject private var reads = BobbyAccessCenter.shared
    @State private var manageSubscription = false
    @State private var busy = false
    @State private var showDeleteConfirmation = false
    @State private var accountDeleted = false
    @State private var showAvatar = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(L.t("PROGRESS", "PROGRESO")).font(.system(size: 11, weight: .bold, design: .monospaced)).tracking(2).foregroundStyle(Theme.muted)
                Spacer()
                Button(action: onClose) { Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.muted) }
            }
            Text(account.isSignedIn ? L.t("Your progress is saved", "Tu progreso está guardado") : L.t("Keep your XP everywhere", "Conserva tu XP en todas partes"))
                .font(.system(size: 22, weight: .heavy)).foregroundStyle(.white)
            Text(account.isSignedIn
                 ? L.t("XP, streak, gear and your Trader Land follow this account on the phone and on bobbyprotocol.xyz. Bobby never holds your money or keys.", "XP, racha, accesorios y tu Trader Land quedan guardados en esta cuenta, en el teléfono y en bobbyprotocol.xyz. Bobby nunca guarda tu dinero ni tus llaves.")
                 : L.t("Sign in with Apple so XP, streak, gear and Trader Land survive a reinstall and follow you across your devices. No keys or email are required.", "Inicia sesión con Apple para que XP, racha, accesorios y Trader Land no se pierdan si reinstalas Bobby y te acompañen en tus dispositivos. No requiere llaves ni correo."))
                .font(.system(size: 14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 14) {
                stat(L.t("XP", "XP"), "\(store.disciplineXP)")
                stat(L.t("Streak", "Racha"), "\(store.disciplineStreak)")
                stat(L.t("Aura", "Aura"), "\(store.aura)")
                // Pieces repeat and the island grows: no fixed route to count against.
                stat(L.t("Pieces", "Piezas"), pieces.map { "\($0)" } ?? "—")
            }
            avatarRow
            if let row = ReadsRow.content(access: reads.access, subscription: reads.subscription, signedIn: account.isSignedIn) {
                readsRow(row)
            }
            if let voice {
                VoiceSwitchRow(voice: voice, onChange: onVoiceMutedChange)
            }
            if !store.pendingAwards.isEmpty {
                Text(L.t("\(store.pendingAwards.count) award(s) waiting to sync", "\(store.pendingAwards.count) premio(s) por sincronizar")).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            if account.isSignedIn {
                Button {
                    busy = true
                    Task { await ProgressSync.shared.sync(store: store, profile: profile); busy = false }
                } label: { Text(busy ? L.t("Syncing…", "Sincronizando…") : L.t("Sync now", "Sincronizar ahora")).frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).tint(Theme.accent).disabled(busy)
                Button { account.signOut(store: store) } label: { Text(L.t("Sign out on this phone", "Cerrar sesión en este teléfono")).frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                    .disabled(busy)
                Button(role: .destructive) { showDeleteConfirmation = true } label: {
                    Text(L.t("Delete account and synced progress", "Borrar cuenta y progreso sincronizado")).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(busy)
            } else {
                SignInWithAppleButton(.signIn) { req in
                    account.prepareAppleRequest(req)
                } onCompletion: { result in
                    Task {
                        await account.completeApple(result)
                        if account.isSignedIn { await ProgressSync.shared.sync(store: store, profile: profile) }  // sync binds the store to this Apple ID
                    }
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 12))
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
                        HStack(spacing: 8) { Text("𝕏").font(.system(size: 17, weight: .bold)); Text(L.t("Continue with X", "Continuar con X")) }
                            .frame(maxWidth: .infinity).frame(height: 50)
                    }
                    .buttonStyle(.bordered)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(busy)
                    .accessibilityIdentifier("account-x-sign-in")
                }
#endif
            }
            // One line, next to the button that failed, signed in or out.
            if let err = account.lastError {
                Text(err).font(.footnote).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("account-error")
            }
            if showsLinks {
                HStack(spacing: 18) {
                    Link(destination: URL(string: "https://bobbyprotocol.xyz/privacy")!) {
                        Label(L.t("Privacy Policy", "Aviso de privacidad"), systemImage: "hand.raised")
                    }
                    .accessibilityIdentifier("account-privacy")
                    Link(destination: URL(string: "https://bobbyprotocol.xyz/support")!) {
                        Label(L.t("Help and support", "Ayuda y soporte"), systemImage: "questionmark.circle")
                    }
                    .accessibilityIdentifier("account-support")
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
            }
        }
        .padding(22)
        .background(Theme.bg.ignoresSafeArea())
        .presentationDetents(detents)
        .manageSubscriptionsSheet(isPresented: $manageSubscription)
        .task {
            // R11: nothing reaches the network before the risk notice is accepted.
            if profile.acceptedRiskNotice { await reads.refresh() }
        }
        .sheet(isPresented: $showAvatar) {
            MascotGalleryView(store: store, voice: voice, voiceId: profile.voiceId)
        }
        .confirmationDialog(
            L.t("Delete your Bobby account?", "¿Borrar tu cuenta de Bobby?"),
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
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
            Text(AccountDeletionCopy.confirmation)
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

    /// The profile's avatar: the current companion and the way to change it (the squad gallery).
    private var avatarRow: some View {
        Button { showAvatar = true } label: {
            HStack(spacing: 12) {
                Group {
                    if let c = store.companion {
                        CompanionThumb(companion: c)
                    } else {
                        Image(systemName: "person.crop.circle").font(.system(size: 22)).foregroundStyle(Theme.muted)
                    }
                }
                .frame(width: 44, height: 44)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L.t("Your avatar", "Tu avatar")).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                    Text(store.companion.map { $0.label.capitalized } ?? L.t("Choose who lives in your Bobby", "Elige quién vive en tu Bobby"))
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Text(L.t("Change", "Cambiar")).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.accent)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.muted)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.card))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L.t("Your avatar. Change it", "Tu avatar. Cambiarlo"))
        .accessibilityIdentifier("account-avatar")
    }

    /// "7 of 10 free reads left this week", or Bobby Pro and Manage subscription. Subtle on purpose.
    private func readsRow(_ row: ReadsRow) -> some View {
        HStack(spacing: 12) {
            Image(systemName: row.pro ? "infinity" : "text.bubble")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(row.pro ? Theme.accent : Theme.muted)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.card))
                .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                if let detail = row.detail {
                    Text(detail).font(.system(size: 12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer()
            if row.manage {
                Button(L.t("Manage", "Administrar")) { manageSubscription = true }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .accessibilityLabel(L.t("Manage subscription", "Administrar suscripción"))
                    .accessibilityIdentifier("account-manage-subscription")
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("account-reads")
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(Theme.muted)
            Text(value).font(.system(size: 20, weight: .heavy, design: .monospaced)).foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
    }
}

/// The account sheet's reads line, from the server's access object (never a number of the app's own).
struct ReadsRow: Equatable {
    let title: String
    let detail: String?
    let pro: Bool
    /// Manage subscription (Apple's sheet): only for an App Store subscription.
    let manage: Bool

    static func content(access: BobbyReadAccess?, subscription: BobbySubscription?, signedIn: Bool, spanish: Bool = L.isSpanish) -> ReadsRow? {
        guard let access else { return nil }
        if access.isPro {
            let end = subscription?.periodEnd.map { BobbyAccessAPI.day($0, spanish: spanish) }
            let canceled = ["canceled", "cancelled", "expired"].contains(subscription?.status ?? "")
            let detail = end.map { canceled ? L.t("Unlimited reads · ends \($0)", "Lecturas ilimitadas · termina el \($0)", spanish: spanish)
                                            : L.t("Unlimited reads · renews \($0)", "Lecturas ilimitadas · se renueva el \($0)", spanish: spanish) }
                ?? L.t("Unlimited reads", "Lecturas ilimitadas", spanish: spanish)
            return ReadsRow(title: "Bobby Pro", detail: detail, pro: true, manage: subscription?.managedByApple ?? true)
        }
        guard let limit = access.limit else { return nil }
        let left = access.remaining ?? max(0, limit - access.used)
        if access.tier == "anon" {
            return ReadsRow(title: L.t("\(left) of \(limit) free reads left", "Te quedan \(left) de \(limit) lecturas gratis", spanish: spanish),
                            detail: signedIn ? nil : L.t("Sign in to keep reading after that.", "Inicia sesión para seguir leyendo después.", spanish: spanish),
                            pro: false, manage: false)
        }
        let reset = access.resetsDate.map { L.t("Resets \(BobbyAccessAPI.day($0, spanish: spanish))", "Se renuevan el \(BobbyAccessAPI.day($0, spanish: spanish))", spanish: spanish) }
        return ReadsRow(title: L.t("\(left) of \(limit) free reads left this week", "Te quedan \(left) de \(limit) lecturas gratis esta semana", spanish: spanish),
                        detail: reset, pro: false, manage: false)
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
                Image(systemName: voice.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(voice.isMuted ? Theme.muted : Theme.accent)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Theme.card))
                    .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L.t("Bobby's voice", "Voz de Bobby")).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                    Text(voice.isMuted ? L.t("Off · Bobby reads in silence", "Apagada · Bobby lee en silencio")
                                       : L.t("On · Bobby speaks his reads", "Encendida · Bobby dice sus lecturas"))
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
        }
        .tint(Theme.accent)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
        .accessibilityIdentifier("account-voice")
    }
}

/// The deletion copy both entry points (this sheet and the desk menu) show.
enum AccountDeletionCopy {
    static var confirmation: String {
        L.t("This deletes your Bobby account and synced XP, streak, gear and Trader Land. Limited security or audit records may remain.",
            "Esto borra tu cuenta de Bobby y tu XP, racha, accesorios y Trader Land sincronizados. Pueden conservarse registros limitados de seguridad o auditoría.")
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
