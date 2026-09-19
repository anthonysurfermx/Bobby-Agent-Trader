// Account sheet — why to sign in (progress follows you to the web and back)
// and the Apple button. 1.2 offers Sign in with Apple only; the X button is Debug-only.
import AuthenticationServices
import SwiftUI

struct AccountSheet: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var profile: AgentProfile
    /// Pieces the account holds on Trader Land (the desk's island read); nil = unknown.
    var pieces: Int? = nil
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @State private var busy = false
    @State private var showDeleteConfirmation = false
    @State private var accountDeleted = false
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
        }
        .padding(22)
        .background(Theme.bg.ignoresSafeArea())
        .presentationDetents([.medium, .large])
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
