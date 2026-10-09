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
import CryptoKit

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
                    act: { nudge, session in
                        guard let read = NudgeCenter.shared.lastRead, nudge.id == offerId(for: read.requestId) else { return }
                        let outcome = await harness.accept(following: read.requestId)
                        if outcome == .on || outcome == .denied { session.haptic("success") }
                    })
    }

    static func offer(_ moment: NudgeMoment, mode: HarnessMode) -> NucleoNudge? {
        guard mode == .undecided, let read = moment.lastRead, moment.now >= read.at,
              moment.now.timeIntervalSince(read.at) < freshWindow else { return nil }
        return NucleoNudge(id: offerId(for: read.requestId), text: HarnessCopy.offerLine(symbol: read.symbol), cta: HarnessCopy.offerButton,
                          refreshAt: read.at.addingTimeInterval(freshWindow))
    }

    static func offerId(for requestId: String) -> String {
        let digest = SHA256.hash(data: Data(requestId.utf8)).prefix(10).map { String(format: "%02x", $0) }.joined()
        return offerId + "." + digest
    }

    // MARK: The move

    static func moveSource(_ harness: HarnessCenter) -> NudgeSource {
        NudgeSource(key: moveKey, priority: NudgePriority.followUp,
                    candidate: { moment in harness.move.map { nudge($0, asks: harness.readsOpen, now: moment.now) } },
                    act: { nudge, session in
                        if let move = harness.move, moveId(move) == nudge.id, let readID = move.savedReadID {
                            if session.openSavedRead(requestId: readID) { harness.noteOpenedSavedRead(requestId: readID) }
                            return
                        }
                        // Decided again at the tap: what was drawn may be older than the last receipt.
                        guard let move = harness.move, moveId(move) == nudge.id, harness.readsOpen else { return }
                        // The line leaves the glass at the tap; the tap is written when the page asks the question.
                        let tapped = harness.noteTapped(symbol: move.symbol)
                        session.startRead(symbol: move.symbol, name: move.name, isEquity: move.isEquity,
                                          question: !move.askedByPerson || move.opportunity?.hasNewMarketEvidence(at: harness.now()) == false
                                            ? HarnessCopy.lookQuestion(symbol: move.symbol) : HarnessCopy.changedQuestion(symbol: move.symbol),
                                          taken: { harness.notePicked(symbol: move.symbol, at: tapped) })
                    })
    }

    /// `asks`: the next read would be answered. Without it the line is the same and its button asks nothing.
    static func nudge(_ move: HarnessMove, asks: Bool = true, now: Date? = nil) -> NucleoNudge {
        let current = move.opportunity.map { opportunity in now.map { opportunity.hasNewMarketEvidence(at: $0) } ?? opportunity.hasNewMarketEvidence }
        return NucleoNudge(id: moveId(move),
                    text: move.savedReadID != nil ? L.t("Your saved read of \(move.symbol)", "Tu lectura guardada de \(move.symbol)")
                        : (!move.askedByPerson ? L.t("Let's revisit \(move.symbol)", "Retomemos \(move.symbol)")
                            : HarnessCopy.moveLine(symbol: move.symbol, pct: current == false ? nil : move.pct, days: move.days)),
                    cta: move.savedReadID != nil ? L.t("Open saved read", "Abrir lectura guardada")
                        : (asks ? (current == false ? L.t("Review together", "Revisemos") : HarnessCopy.moveButton) : HarnessCopy.moveSeen),
                    refreshAt: current == true ? move.opportunity?.expiresAt : nil)
    }

    /// `harness.move.<symbol>.<day asked>`: one line per asset per question, however often it is drawn.
    static func moveId(_ move: HarnessMove) -> String {
        if let id = move.savedReadID { return movePrefix(move.symbol) + String(id.replacingOccurrences(of: "-", with: "").prefix(12)) }
        return movePrefix(move.symbol) + dayStamp(move.askedAt)
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
