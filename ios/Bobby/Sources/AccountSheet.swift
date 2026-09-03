// Account sheet — why to sign in (progress follows you to the web and back)
// and the Apple button. No wallet, no keys, no email required.
import AuthenticationServices
import SwiftUI

struct AccountSheet: View {
    @ObservedObject var store: CompanionStore
    @ObservedObject var profile: AgentProfile
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @State private var busy = false
    @State private var linkCode = ""
    @State private var issuedCode: String?
    @State private var linkMessage: String?

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
                 ? L.t("XP, streak, gear and your Trader Land follow this account on the phone and on bobbyprotocol.xyz. Bobby still never touches your money.", "XP, racha, equipo y tu Trader Land siguen a esta cuenta en el teléfono y en bobbyprotocol.xyz. Bobby sigue sin tocar tu dinero.")
                 : L.t("Sign in with Apple so XP, streak, gear and your Trader Land survive a reinstall and show up on bobbyprotocol.xyz. No wallet, no keys, no email needed.", "Inicia sesión con Apple para que XP, racha, equipo y tu Trader Land sobrevivan a una reinstalación y aparezcan en bobbyprotocol.xyz. Sin wallet, sin llaves, sin correo."))
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
                VStack(alignment: .leading, spacing: 8) {
                    Text(L.t("LINK THE WEB DESK", "VINCULAR EL DESK WEB")).font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(2).foregroundStyle(Theme.muted)
                    Text(L.t("Same XP here and on bobbyprotocol.xyz with your wallet: enter the code the desk shows, or generate one here.", "El mismo XP aquí y en bobbyprotocol.xyz con tu wallet: escribe el código que muestra el desk, o genera uno aquí."))
                        .font(.system(size: 12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        TextField(L.t("Code from the desk", "Código del desk"), text: $linkCode)
                            .textInputAutocapitalization(.characters).autocorrectionDisabled().font(.system(size: 16, weight: .bold, design: .monospaced))
                            .padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Theme.card)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))
                            .onChange(of: linkCode) { _, v in linkCode = String(v.uppercased().prefix(6)) }
                        Button(L.t("Link", "Vincular")) {
                            busy = true
                            Task { let r = await account.link(action: "claim", code: linkCode); linkMessage = r.message; if r.ok { linkCode = ""; await ProgressSync.shared.sync(store: store, profile: profile) }; busy = false }
                        }.buttonStyle(.borderedProminent).tint(Theme.accent).disabled(linkCode.count != 6 || busy)
                    }
                    if let issuedCode {
                        Text(issuedCode).font(.system(size: 28, weight: .heavy, design: .monospaced)).tracking(8).foregroundStyle(Theme.accentSoft).frame(maxWidth: .infinity)
                    } else {
                        Button(L.t("Generate a code for the desk", "Generar un código para el desk")) {
                            busy = true
                            Task { let r = await account.link(action: "issue"); issuedCode = r.code; linkMessage = r.message; busy = false }
                        }.buttonStyle(.bordered).disabled(busy)
                    }
                    if let linkMessage { Text(linkMessage).font(.system(size: 12)).foregroundStyle(Theme.muted) }
                }
                Button(role: .destructive) { account.signOut(store: store) } label: { Text(L.t("Sign out on this phone", "Cerrar sesión en este teléfono")).frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
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
