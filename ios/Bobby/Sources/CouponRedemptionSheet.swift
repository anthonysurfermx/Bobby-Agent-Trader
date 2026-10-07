import AuthenticationServices
import SwiftUI

/// The store restore flow is independent: coupons apply the server's gift immediately.
struct CouponRedemptionSheet: View {
    var afterSignIn: () async -> Void = {}
    let onRead: () -> Void
    let onClose: () -> Void
    @StateObject private var center = CouponRedemptionCenter()
    @ObservedObject private var account = AccountSession.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var code = ""
    @State private var checkingBalance = false
    @State private var balanceNotice: String?
    @State private var checkedBalance: CouponCredits?
    @State private var balanceRequestGeneration = UUID()
    @AppStorage(L.preferenceKey) private var languageSelection = "system"

    private var receipt: CouponRedemptionReceipt? {
        switch center.outcome {
        case .redeemed(let receipt), .alreadyRedeemed(let receipt): return receipt
        default: return nil
        }
    }
    private var isNewGift: Bool {
        if case .redeemed = center.outcome { return true }
        return false
    }
    private var failure: String? {
        guard case .failed(let error) = center.outcome else { return nil }
        switch error {
        case .accountRequired: return CouponCopy.text("accountRequired")
        case .invalidCode: return CouponCopy.text("invalidCode")
        case .expired: return CouponCopy.text("expired")
        case .exhausted: return CouponCopy.text("exhausted")
        case .rateLimited: return CouponCopy.text("rateLimited")
        case .unavailable, .invalidResponse: return CouponCopy.text("unavailable")
        }
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack {
                        Text(CouponCopy.text("title")).font(.title2.weight(.semibold))
                        Spacer()
                        Button(action: onClose) { Image(systemName: "xmark").padding(12) }
                            .accessibilityLabel(CouponCopy.text("done"))
                    }
                    Text(CouponCopy.text("intro")).foregroundStyle(Theme.warmMuted)
                    if account.isSignedIn {
                        Text(CouponCopy.text("code")).font(.headline)
                        TextField(CouponCopy.text("code"), text: $code)
                            .textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .keyboardType(.asciiCapable).textContentType(.oneTimeCode)
                            .padding(16).background(Theme.cream.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                            .accessibilityIdentifier("coupon-code")
                        Button {
                            balanceNotice = nil; checkedBalance = nil
                            let submittedCode = code
                            let submittedOwner = account.session?.userId
                            let submittedGeneration = account.generation
                            Task { _ = await center.redeem(code: submittedCode, expectedUserID: submittedOwner,
                                                           expectedGeneration: submittedGeneration) }
                        } label: {
                            HStack {
                                if center.isRedeeming { ProgressView().tint(Theme.bg) }
                                Text(CouponCopy.text(center.isRedeeming ? "redeeming" : "redeem"))
                            }.frame(maxWidth: .infinity).padding(.vertical, 16)
                        }
                        .buttonStyle(.plain).foregroundStyle(Theme.bg)
                        .background(Theme.orbViolet, in: Capsule())
                        .disabled(center.isRedeeming || checkingBalance || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("coupon-redeem")
                    } else {
                        Text(CouponCopy.text("accountRequired"))
                        SignInWithAppleButton(.signIn) { account.prepareAppleRequest($0) } onCompletion: { result in
                            Task { await account.completeApple(result); if account.isSignedIn { await afterSignIn() } }
                        }.signInWithAppleButtonStyle(.white).frame(height: 48)
                    }
                    if let failure { Text(failure).foregroundStyle(Theme.warmMuted).accessibilityIdentifier("coupon-error") }
                    if let balanceNotice { Text(balanceNotice).foregroundStyle(Theme.warmMuted) }
                    if let checkedBalance { balanceLines(checkedBalance) }
                    if account.isSignedIn {
                        Button(CouponCopy.text("checkBalance"), action: checkBalance)
                            .disabled(center.isRedeeming || checkingBalance)
                            .accessibilityIdentifier("coupon-check-balance")
                    }
                    Text(CouponCopy.text("noRestore")).font(.footnote).foregroundStyle(Theme.warmMuted)
                }.padding(24)
            }.accessibilityHidden(receipt != nil)
            if let receipt {
                CouponSuccessPopup(receipt: receipt, isNewGift: isNewGift, onRead: {
                    if isNewGift { onRead() } else { center.dismissOutcome(); checkBalance() }
                }) {
                    center.dismissOutcome(); code = ""
                }
            }
        }.foregroundStyle(Theme.cream)
            .onReceive(account.$session) { _ in
                center.accountChanged(); balanceNotice = nil; checkedBalance = nil
                balanceRequestGeneration = UUID(); checkingBalance = false
            }
            .onDisappear { center.cancel(); balanceRequestGeneration = UUID(); checkingBalance = false }
    }

    private func balanceLines(_ balance: CouponCredits) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(CouponCopy.text("balance")).font(.headline)
            Text(CouponCopy.text("quickBalance", count: balance.reads))
            Text(CouponCopy.text("deepBalance", count: balance.profundo))
            Text(CouponCopy.text("maxBalance", count: balance.maximo))
        }.accessibilityIdentifier("coupon-balance")
    }

    private func checkBalance() {
        guard !checkingBalance, !center.isRedeeming, let owner = account.session?.userId else { return }
        let generation = account.generation
        let revision = UUID()
        balanceRequestGeneration = revision
        checkingBalance = true
        checkedBalance = nil
        balanceNotice = nil
        Task {
            defer { if balanceRequestGeneration == revision { checkingBalance = false } }
            let fresh = await center.checkBalance(expectedUserID: owner, expectedGeneration: generation)
            guard account.session?.userId == owner, account.generation == generation,
                  balanceRequestGeneration == revision, !Task.isCancelled else { return }
            checkedBalance = fresh
            balanceNotice = fresh == nil ? CouponCopy.text("balanceUnavailable") : nil
        }
    }
}

/// A confirmed, account-bound receipt. Both production and offline UI tests render this view.
struct CouponSuccessPopup: View {
    let receipt: CouponRedemptionReceipt
    let isNewGift: Bool
    let onRead: () -> Void
    let onDone: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        CouponCelebration(reduceMotion: reduceMotion || !isNewGift)
                        Text(CouponCopy.text(isNewGift ? "applied" : "already"))
                            .font(.title2.weight(.semibold)).accessibilityAddTraits(.isHeader)
                        if let gift = receipt.granted {
                            if gift.reads > 0 {
                                Text(CouponCopy.text(gift.reads == 1 ? "oneRead" : "manyReads", count: gift.reads))
                                    .font(.title3.weight(.semibold)).foregroundStyle(Theme.orbViolet)
                            }
                            if gift.profundo > 0 { Text(CouponCopy.text("profundoAdded", count: gift.profundo)) }
                            if gift.maximo > 0 { Text(CouponCopy.text("maximoAdded", count: gift.maximo)) }
                        }
                        if let bonus = receipt.bonus {
                            Text(CouponCopy.text("balance")).font(.headline)
                            Text([CouponCopy.text("quickBalance", count: bonus.reads),
                                  CouponCopy.text("deepBalance", count: bonus.profundo),
                                  CouponCopy.text("maxBalance", count: bonus.maximo)].joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(Theme.warmMuted)
                        } else if isNewGift {
                            Text(CouponCopy.text("pending")).font(.subheadline)
                        }
                        Text(CouponCopy.text(isNewGift ? "next" : "alreadyNext")).multilineTextAlignment(.center)
                        Text(CouponCopy.text("noRestore")).font(.footnote).foregroundStyle(Theme.warmMuted)
                        Button(action: onRead) {
                            Text(CouponCopy.text(isNewGift ? "read" : "checkBalance")).fontWeight(.semibold)
                                .frame(maxWidth: .infinity).padding(.vertical, 16)
                        }.foregroundStyle(Theme.bg).background(Theme.orbViolet, in: Capsule())
                            .accessibilityIdentifier("coupon-start-read")
                        Button(CouponCopy.text("done"), action: onDone)
                            .padding(.vertical, 8).accessibilityIdentifier("coupon-done")
                    }.padding(24).frame(maxWidth: 420)
                        .background(Theme.nucleoSurface, in: RoundedRectangle(cornerRadius: 28))
                        .padding(24).frame(maxWidth: .infinity)
                }.accessibilityIdentifier("coupon-success")
                    .onAppear {
                        if isNewGift { UINotificationFeedbackGenerator().notificationOccurred(.success) }
                        if UIAccessibility.isVoiceOverRunning {
                            UIAccessibility.post(notification: .announcement,
                                                 argument: CouponCopy.announcement(receipt: receipt, isNewGift: isNewGift))
                        }
                    }
        }.foregroundStyle(Theme.cream)
    }
}

#if DEBUG
/// No account, store, network request or actual redemption exists in this visual fixture.
struct CouponCelebrationQAFixture: View {
    let alreadyRedeemed: Bool
    @State private var visible = true
    private var receipt: CouponRedemptionReceipt {
        let credits = CouponCredits(json: ["reads": 10, "profundo": 2, "maximo": 1])!
        return CouponRedemptionReceipt(granted: alreadyRedeemed ? nil : credits, bonus: credits)
    }
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            Text("Bobby").foregroundStyle(Theme.cream).accessibilityIdentifier("coupon-returned-to-bobby")
            if visible {
                CouponSuccessPopup(receipt: receipt, isNewGift: !alreadyRedeemed,
                                   onRead: { visible = false }, onDone: { visible = false })
            }
        }
    }
}
#endif
