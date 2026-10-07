// Reminders on the glass (1.8): the value-first moment. Right after a person writes or reviews a
// thesis (they have just seen what a review gives them) Bobby offers, once, to remind them to come
// back to it. A quieter second line tells an eligible paying account that its Monday briefing is
// included and still off. The nudge only opens a screen: iOS permission is asked later, by the
// reminder button the person taps there, and never from here.
import Combine
import Foundation

@MainActor
enum ReminderNudges {
    static let key = "reminders"
    static let briefingId = "reminders.briefing.v1"
    /// How long after writing or reviewing a thesis the offer makes sense.
    static let freshWindow: TimeInterval = 30 * 60
    static let thesisSaved = Notification.Name("V18.thesisSaved")
    static let thesisReviewed = Notification.Name("V18.thesisReviewed")

    /// What the candidates read. Production reads the shared stores; tests replace single pieces.
    @MainActor
    struct Sources {
        var owner: () -> String? = { AccountSession.shared.session?.userId }
        var activeTheses: (String?) -> [SavedThesis] = { ThesisBook.shared.active(owner: $0) }
        var hasReminder: (String) -> Bool = { ReminderCenter.shared.hasReminder(for: $0) }
        var briefing: () -> BriefingOffer = { .current() }
    }

    /// What the briefing centre already holds about the weekly briefing (nothing is fetched here).
    struct BriefingOffer: Equatable {
        var eligiblePro: Bool?
        /// nil until the account's settings are known.
        var weeklyOn: Bool?
        /// The server has adopted the Monday schedule (otherwise the switch cannot be turned on).
        var configured: Bool
        /// The switch is being saved right now.
        var saving: Bool

        /// Only for an account that may have it, has it off and could turn it on now.
        var shouldOffer: Bool { eligiblePro == true && weeklyOn == false && configured && !saving }

        @MainActor
        static func current() -> BriefingOffer { current(BriefingsCenter.shared) }

        @MainActor
        static func current(_ center: BriefingsCenter) -> BriefingOffer {
            BriefingOffer(eligiblePro: center.eligiblePro, weeklyOn: center.settings?.weeklyEnabled,
                          configured: center.schedules?.schedule(for: .weekly)?.configured ?? false,
                          saving: center.pendingCadences[.weekly] != nil)
        }
    }

    /// Theses the app was told were just saved or reviewed (`V18.thesisSaved`, `V18.thesisReviewed`).
    /// In memory only: a relaunch falls back to the book's own dates.
    @MainActor
    final class Recent {
        private(set) var noted: [String: Date] = [:]
        private var cancellables = Set<AnyCancellable>()

        func note(_ thesisId: String, at date: Date) { noted[thesisId.uppercased()] = date }
        func date(for thesisId: String) -> Date? { noted[thesisId.uppercased()] }
        func clear() { noted = [:] }

        func listen(now: @escaping () -> Date = { Date() }) {
            cancellables.removeAll()
            for name in [ReminderNudges.thesisSaved, ReminderNudges.thesisReviewed] {
                NotificationCenter.default.publisher(for: name)
                    .compactMap { $0.userInfo?["thesisId"] as? String }
                    .filter { !$0.isEmpty }
                    .receive(on: DispatchQueue.main)
                    .sink { [weak self] id in MainActor.assumeIsolated { self?.note(id, at: now()) } }
                    .store(in: &cancellables)
            }
            // Another reader: what the previous one just wrote is not theirs to be reminded of.
            NotificationCenter.default.publisher(for: AccountSession.didChange)
                .receive(on: DispatchQueue.main)
                .sink { [weak self] _ in MainActor.assumeIsolated { self?.clear() } }
                .store(in: &cancellables)
        }
    }

    static let recent = Recent()

    static func register(_ center: NudgeCenter) {
        // The Núcleo is starting: reminders keep themselves true from here. The unit-test host only
        // gets the source (its suites drive their own centre and their own notification fake).
        if !BobbyApp.isUnitTestHost {
            ReminderCenter.shared.start()
            recent.listen()
        }
        center.register(source(Sources(), recent: recent))
    }

    static func source(_ sources: Sources, recent: Recent) -> NudgeSource {
        NudgeSource(key: key, priority: NudgePriority.reminders,
                    candidate: { moment in candidate(moment, sources: sources, recent: recent) },
                    act: { nudge, session in act(nudge, session: session, sources: sources) })
    }

    // MARK: Candidates

    static func candidate(_ moment: NudgeMoment, sources: Sources, recent: Recent) -> NucleoNudge? {
        if let thesis = freshThesis(now: moment.now, sources: sources, recent: recent) {
            return NucleoNudge(id: offerId(thesis.id), text: ReminderCopy.offerLine, cta: ReminderCopy.offerButton)
        }
        if moment.signedIn, sources.briefing().shouldOffer {
            return NucleoNudge(id: briefingId, text: ReminderCopy.briefingLine, cta: ReminderCopy.briefingButton)
        }
        return nil
    }

    /// The active thesis written or reviewed most recently within the window, without a reminder yet.
    static func freshThesis(now: Date, sources: Sources, recent: Recent) -> SavedThesis? {
        let touched: (SavedThesis) -> Date = { thesis in
            [recent.date(for: thesis.id), thesis.lastReviewedAt, thesis.createdAt].compactMap { $0 }.filter { $0 <= now }.max() ?? .distantPast
        }
        return sources.activeTheses(sources.owner())
            .filter { now.timeIntervalSince(touched($0)) <= freshWindow && !sources.hasReminder($0.id) }
            .max { touched($0) < touched($1) }
    }

    /// `reminders.offer.<first 8 of the thesis id>`: one offer per thesis, ever.
    static func offerId(_ thesisId: String) -> String {
        "reminders.offer." + String(thesisId.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(8))
    }

    // MARK: The tap

    static func act(_ nudge: NucleoNudge, session: NucleoSession, sources: Sources) {
        if nudge.id == briefingId {
            session.present(.briefingSettings)
            return
        }
        // The thesis the offer was about opens first; when it is gone the screen shows what is left.
        V18Focus.thesisId = sources.activeTheses(sources.owner()).first { offerId($0.id) == nudge.id }?.id
        session.present(.reminders)
    }
}
