// Account sheet — why to sign in (progress follows you to the web and back)
// and the Apple button. This account is separate from the optional wallet.
import AuthenticationServices
import SwiftUI

struct AccountSheet: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var profile: AgentProfile
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @State private var busy = false
    @State private var showDeleteConfirmation = false

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
                 ? L.t("XP, streak, gear and your Trader Land follow this account on the phone and on bobbyprotocol.xyz. Bobby never takes custody or signs wallet transactions.", "XP, racha, equipo y tu Trader Land siguen a esta cuenta en el teléfono y en bobbyprotocol.xyz. Bobby nunca toma custodia ni firma transacciones de wallet.")
                 : L.t("Sign in with Apple so XP, streak, gear and Trader Land survive a reinstall and follow you across your Apple devices. This account is separate from the optional wallet connection; no keys or email are required.", "Inicia sesión con Apple para que XP, racha, equipo y Trader Land sobrevivan a una reinstalación y te sigan entre tus dispositivos Apple. Esta cuenta es distinta de la conexión opcional de wallet; no requiere llaves ni correo."))
                .font(.system(size: 14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 14) {
                stat(L.t("XP", "XP"), "\(store.disciplineXP)")
                stat(L.t("Streak", "Racha"), "\(store.disciplineStreak)")
                stat(L.t("Aura", "Aura"), "\(store.aura)")
                stat(L.t("Route", "Ruta"), "\(store.routeIndex)/8")
            }
            if !store.pendingAwards.isEmpty {
                Text(L.t("\(store.pendingAwards.count) award(s) waiting to sync", "\(store.pendingAwards.count) premio(s) por sincronizar")).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
            }
            if let err = account.lastError { Text(err).font(.system(size: 12)).foregroundStyle(.red) }
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
                    let deleted = await account.deleteAccount(store: store)
                    busy = false
                    if deleted { onClose() }
                }
            }
            Button(L.t("Cancel", "Cancelar"), role: .cancel) {}
        } message: {
            Text(L.t(
                "This deletes your Apple-backed account and synced XP, streak, gear and Trader Land. Public blockchain transactions cannot be erased and limited security or audit records may remain.",
                "Esto borra tu cuenta vinculada a Apple y el XP, racha, equipo y Trader Land sincronizados. Las transacciones públicas de blockchain no se pueden borrar y pueden conservarse registros limitados de seguridad o auditoría."
            ))
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
