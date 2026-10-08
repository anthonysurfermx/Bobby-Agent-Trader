// The harness on the glass (1.8). Two lines, both written here and drawn by the page:
//  - the offer, once a read has been delivered and the person has not decided yet:
//    "Shall I keep you posted on NVDA?" · "Yes, tell me". The tap is the person's own request, so
//    it is the one place (with the Follow-ups switch) where iOS may be asked for permission;
//  - the move, when they come back (on their own or through a follow-up) to an asset they asked
//    about at least a day ago: "NVDA +2.3% since you asked" · "What changed?". The number costs
//    nothing; the button asks Bobby, which is a read. So the button is only there when the phone
//    knows that read is answered (HarnessWall): otherwise the same line carries "Got it", which
//    asks nothing, and Bobby never walks anyone into a sign-in or a paywall.
import Foundation

@MainActor
enum HarnessNudges {
    static let offerKey = "harness.offer"
    static let moveKey = "harness.move"
    static let offerId = "harness.offer.v1"
    /// How long after a read the offer makes sense.
    static let freshWindow: TimeInterval = 30 * 60

    static func register(_ center: NudgeCenter, harness: HarnessCenter = .shared) {
        // The Núcleo is starting: the harness keeps itself true from here. The unit-test host only
        // gets the sources (its suites drive their own centre and their own notification fake).
        if !BobbyApp.isUnitTestHost { harness.start() }
        center.register(moveSource(harness))
        center.register(offerSource(harness))
    }

    // MARK: The offer

    static func offerSource(_ harness: HarnessCenter) -> NudgeSource {
        NudgeSource(key: offerKey, priority: NudgePriority.followUpOffer,
                    candidate: { moment in offer(moment, mode: harness.mode) },
                    act: { _, session in
                        if await harness.accept() != .consentRequired { session.haptic("success") }
                    })
    }

    static func offer(_ moment: NudgeMoment, mode: HarnessMode) -> NucleoNudge? {
        guard mode == .undecided, let read = moment.lastRead, moment.now.timeIntervalSince(read.at) <= freshWindow else { return nil }
        return NucleoNudge(id: offerId, text: HarnessCopy.offerLine(symbol: read.symbol), cta: HarnessCopy.offerButton)
    }

    // MARK: The move

    static func moveSource(_ harness: HarnessCenter) -> NudgeSource {
        NudgeSource(key: moveKey, priority: NudgePriority.followUp,
                    candidate: { _ in harness.move.map { nudge($0, asks: harness.readsOpen) } },
                    act: { nudge, session in
                        // Decided again at the tap: what was drawn may be older than the last receipt.
                        guard let move = harness.move, moveId(move) == nudge.id, harness.readsOpen else { return }
                        // The line leaves the glass at the tap; the tap is written when the page asks the question.
                        let tapped = harness.noteTapped(symbol: move.symbol)
                        session.startRead(symbol: move.symbol, name: move.name, isEquity: move.isEquity,
                                          question: HarnessCopy.changedQuestion(symbol: move.symbol),
                                          taken: { harness.notePicked(symbol: move.symbol, at: tapped) })
                    })
    }

    /// `asks`: the next read would be answered. Without it the line is the same and its button asks nothing.
    static func nudge(_ move: HarnessMove, asks: Bool = true) -> NucleoNudge {
        NucleoNudge(id: moveId(move), text: HarnessCopy.moveLine(symbol: move.symbol, pct: move.pct, days: move.days),
                    cta: asks ? HarnessCopy.moveButton : HarnessCopy.moveSeen)
    }

    /// `harness.move.<symbol>.<day asked>`: one line per asset per question, however often it is drawn.
    static func moveId(_ move: HarnessMove) -> String {
        movePrefix(move.symbol) + dayStamp(move.askedAt)
    }

    /// `harness.move.` for every line, `harness.move.<symbol>.` for one asset's.
    static func movePrefix(_ symbol: String? = nil) -> String {
        guard let symbol else { return "harness.move." }
        let safe = symbol.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "." || $0 == "-") }
        return "harness.move.\(safe)."
    }

    private static func dayStamp(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d%02d%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
