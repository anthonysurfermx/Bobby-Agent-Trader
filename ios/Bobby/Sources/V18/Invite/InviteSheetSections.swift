// Invitations (1.8): the two parts the invite sheet gained (Nucleo/NucleoLevels.swift places them).
//   InviteOwnCode        the person's own eight characters, large, with "Copy code"
//   InviteAcceptSection  "Did a friend invite you?": the code field, Apply, the result in words
import AuthenticationServices
import SwiftUI
import UIKit

/// Which of the sheet's two copy buttons was last used.
enum InviteCopied: Equatable {
    case link, code
}

/// The reward sentence and the share text, from the server's own numbers.
enum InviteCopy {
    /// Who gets what. The friend who sends the invitation is the one rewarded.
    static func reward(days: Int, max: Int) -> String {
        L.t("You get \(days) days of Bobby Pro for each friend who creates an account with your invitation, up to \(max) friends.",
            "Recibes \(days) días de Bobby Pro por cada amigo que crea su cuenta con tu invitación, hasta \(max) amigos.")
    }

    /// The text that travels with the link: a friend who installs the app can type the code.
    static func shareMessage(code: String?) -> String {
        let pitch = L.t("Bobby: three AI agents debate any stock or crypto before you decide.",
                        "Bobby: tres agentes de IA debaten cualquier acción o cripto antes de que decidas.")
        guard let code else { return pitch }
        return pitch + "\n" + L.t("My invitation code: \(code)", "Mi código de invitación: \(code)")
    }

    /// The server's numbers, or nil while the app does not have them (never a guessed figure).
    static func rewardTerms(referral: NucleoReferral?, planDays: Int?, planMax: Int) -> (days: Int, max: Int)? {
        if let referral, let days = referral.rewardDays, days > 0, referral.max > 0 { return (days, referral.max) }
        if let planDays, planDays > 0, planMax > 0 { return (planDays, planMax) }
        return nil
    }
}

struct InviteOwnCode: View {
    let code: String
    @Binding var copied: InviteCopied?

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(L.t("YOUR CODE", "TU CÓDIGO"))
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(Theme.warmDim)
                    .accessibilityHidden(true)
                Text(code)
                    .font(.system(size: 28, weight: .medium, design: .monospaced))
                    .tracking(3)
                    .foregroundStyle(Theme.cream)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .textSelection(.enabled)
                    .accessibilityLabel(L.t("Your invitation code", "Tu código de invitación"))
                    .accessibilityValue(code.map(String.init).joined(separator: " "))
                    .accessibilityIdentifier("invite-own-code")
            }
            Spacer(minLength: 8)
            Button {
                UIPasteboard.general.string = code
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                copied = .code
            } label: {
                Text(copied == .code ? L.t("Copied", "Copiado") : L.t("Copy code", "Copiar código"))
                    .font(.system(size: 14, weight: .medium))
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .foregroundStyle(Theme.cream)
                    .background(Capsule().stroke(Theme.nucleoStroke))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("invite-copy-code")
        }
    }
}

struct InviteAcceptSection: View {
    @ObservedObject var invites: InviteLinkCenter
    /// Runs after a Sign in with Apple that started here succeeded (the host binds the progress).
    var afterSignIn: (() async -> Void)?
    @ObservedObject private var account = AccountSession.shared
    @State private var code = ""
    @FocusState private var focused: Bool

    private var signedIn: Bool { invites.isSignedIn }

    /// The result in words. "Sign in…" is already the section's own line while signed out.
    private var result: String? {
        guard let notice = invites.notice, !(notice == .signInNeeded && !signedIn) else { return nil }
        return notice.text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L.t("DID A FRIEND INVITE YOU?", "¿TE INVITÓ UN AMIGO?"))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .tracking(1.2)
                .foregroundStyle(Theme.warmDim)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 10) {
                TextField(L.t("Invitation code", "Código de invitación"), text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .keyboardType(.asciiCapable)
                    .textContentType(.oneTimeCode)
                    .submitLabel(.done)
                    .focused($focused)
                    .font(.system(size: 17, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.cream)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 48)
                    .background(Theme.cream.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .onChange(of: code) { _, typed in
                        let tidy = Self.tidy(typed)
                        if tidy != typed { code = tidy }
                    }
                    .onSubmit(apply)
                    .accessibilityLabel(L.t("Invitation code", "Código de invitación"))
                    .accessibilityIdentifier("invite-code-field")
                Button(action: apply) {
                    HStack(spacing: 6) {
                        if invites.isClaiming { ProgressView().controlSize(.small).tint(Theme.cream) }
                        Text(invites.isClaiming ? L.t("Applying…", "Aplicando…") : L.t("Apply", "Aplicar"))
                    }
                    .font(.system(size: 15, weight: .medium))
                    .padding(.horizontal, 16)
                    .frame(minWidth: 88, minHeight: 48)
                    .foregroundStyle(Theme.cream)
                    .background(Capsule().stroke(Theme.nucleoStroke))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(invites.isClaiming || code.isEmpty)
                .opacity(code.isEmpty ? 0.5 : 1)
                .accessibilityIdentifier("invite-apply")
            }
            if let result {
                Text(result)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("invite-result")
            }
            if let saved = invites.pendingCode {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(L.t("Invitation \(saved) is saved on this phone.", "La invitación \(saved) está guardada en este teléfono."))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.warmMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("invite-saved")
                    Spacer(minLength: 4)
                    Button {
                        invites.forget()
                        code = ""
                    } label: {
                        Text(L.t("Remove", "Quitar"))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.warmMuted)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L.t("Remove the saved invitation", "Quitar la invitación guardada"))
                    .accessibilityIdentifier("invite-forget")
                }
            }
            if !signedIn {
                Text(InviteNotice.signInNeeded.text)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if invites.riskAccepted() {
                    SignInWithAppleButton(.signIn) { account.prepareAppleRequest($0) } onCompletion: { result in
                        Task {
                            await account.completeApple(result)
                            if account.isSignedIn { await afterSignIn?() }
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 48)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("invite-apple-sign-in")
                }
            }
        }
        .onAppear { if code.isEmpty, let saved = invites.pendingCode { code = saved } }
        .onChange(of: invites.pending) { _, pending in
            // An invitation link arrived while the sheet was open, or the code was settled.
            if let pending, !focused { code = pending.code } else if pending == nil, invites.notice == .accepted { code = "" }
        }
    }

    /// Capitals and eight characters at most; a pasted invitation link becomes its code.
    static func tidy(_ typed: String) -> String {
        if typed.count > InviteLink.codeLength, let pasted = InviteLink.code(fromEntry: typed) { return pasted }
        let kept = typed.uppercased().unicodeScalars.filter { $0.isASCII && CharacterSet.alphanumerics.contains($0) }
        return String(String(String.UnicodeScalarView(kept)).prefix(InviteLink.codeLength))
    }

    private func apply() {
        guard !invites.isClaiming, !code.isEmpty else { return }
        focused = false
        let typed = code
        Task { await invites.submit(code: typed) }
    }
}
