// The harness (1.8): what comes next. A pure function of the ledger and the clock.
//
// After a question the person gets, at most:
//   1. the next day      how the asset they asked about moved
//   2. the day after     the sector that asset belongs to
//   3. the next Monday   their week
// and then silence. The list is always "what happens if they ignore everything": opening a
// follow-up (or coming back for it) writes an engagement into the ledger, the plan is computed
// again from that moment, and step 1 lands on the following day. A new question does the same.
//
// What it learns, all of it readable from the ledger (HarnessProfile):
//  - the hour: follow-ups arrive at the time of day the person asked, and once they have answered
//    a few, at the hour they answer;
//  - the asset: after an answered follow-up, the next one is about the asset that matters most to
//    them among the others they asked about;
//  - when to stop: three follow-ups in a row that nobody answered and Bobby says nothing for two
//    weeks, whatever is asked; a kind whose last two showings went unanswered rests; a sector is
//    not repeated within a week; never more than `maxPerWeek` follow-ups in seven days, never two
//    on the same day, never sooner than 18 hours after the last one.
// Nothing here says the market did anything: a follow-up is a moment in time, the numbers are
// read when the person opens it.
import Foundation

/// One follow-up to hand to iOS.
struct HarnessFollowUp: Codable, Equatable, Identifiable {
    let step: HarnessStep
    let fireAt: Date
    /// `asset`: the asset. `sector`: the asset whose sector it is. `week`: the first asset named.
    var symbol: String?
    var name: String?
    var isEquity: Bool?
    /// `sector`: the sector's id (HarnessSectors).
    var sector: String?
    /// `asset`: whole days between the question and this follow-up.
    var days: Int = 1
    /// `week`: how many other assets the week holds.
    var others: Int = 0

    /// One pending notification per step.
    var id: String { HarnessPlanner.identifierPrefix + step.rawValue }
}

/// A follow-up as the phone keeps it between launches: `handed` once iOS accepted the request.
struct HarnessPlanned: Codable, Equatable {
    var followUp: HarnessFollowUp
    var handed: Bool
}

enum HarnessPlanner {
    static let identifierPrefix = "v18.follow."

    struct Options {
        /// A paying account with the Monday briefing on already gets its week from the server.
        var weeklyCovered = false
        /// Local hours follow-ups may arrive in.
        var earliestHour = 9
        var latestHour = 21
        /// A follow-up never arrives sooner than this after what it follows.
        var minimumGap: TimeInterval = 18 * 3_600
        /// The plan is only made while the last question or answer is this recent.
        var anchorDays = 14.0
        /// A sector is not repeated within these days.
        var sectorFreshDays = 7.0
        /// A week is not repeated within these days.
        var weekFreshDays = 6.0
        /// Assets a week looks back for.
        var weekWindowDays = 7.0
        var maxPerWeek = 4
        /// This many follow-ups in a row that nobody answered, and Bobby says nothing for `quietDays`,
        /// whatever is asked in the meantime.
        var quietAfter = 3
        var quietDays = 14.0
        var sectorOf: (String) -> String? = { HarnessSectors.sector(of: $0)?.id }
    }

    /// The follow-ups still to come, earliest first. Empty when there is nothing to come back to.
    static func plan(ledger: HarnessLedger, now: Date, calendar: Calendar, options: Options = Options()) -> [HarnessFollowUp] {
        guard let anchor = ledger.anchor(before: now),
              now.timeIntervalSince(anchor.at) <= options.anchorDays * 86_400 else { return [] }
        let streak = ledger.unansweredStreak(before: now)
        if streak.count >= options.quietAfter, let last = streak.last, now.timeIntervalSince(last) < options.quietDays * 86_400 { return [] }
        let profile = HarnessProfile.make(ledger, now: now, calendar: calendar)
        let sentSince = ledger.events(.sent, since: anchor.at)
        let done = Set(sentSince.compactMap(\.step))
        let window = now.addingTimeInterval(-options.anchorDays * 86_400)
        let known = ledger.assets(since: window, now: now)

        // Which asset this chain is about: the one just asked about; after an answered follow-up, the
        // one that matters most among the others (the same one again when it is the only one).
        let subject: HarnessAsset? = {
            if anchor.kind == .ask, let symbol = anchor.symbol { return known.first { $0.symbol == symbol } }
            let others = known.filter { $0.symbol != anchor.symbol }.map(\.symbol)
            let symbol = profile.favourite(among: others) ?? anchor.symbol ?? profile.favourite(among: known.map(\.symbol))
            return known.first { $0.symbol == symbol }
        }()
        // Once this chain's asset follow-up has gone out, its sector is that asset's.
        let followed = sentSince.last { $0.step == .asset }?.symbol
        let sectorSubject = followed.flatMap { symbol in known.first { $0.symbol == symbol } } ?? subject
        let sectorId = sectorSubject.flatMap { options.sectorOf($0.symbol) }

        let time = timeOfDay(anchor: anchor, profile: profile, calendar: calendar, options: options)
        var day = firstDay(after: anchor.at, time: time, calendar: calendar, options: options)
        var result: [HarnessFollowUp] = []
        var lastSlot: Date?

        // 1. The asset, the next day.
        let assetWanted = subject != nil && !profile.rests(.asset)
        if done.contains(.asset) || assetWanted {
            if !done.contains(.asset), let subject, let fireAt = moment(on: day, time: time, calendar: calendar) {
                let days = max(1, calendar.dateComponents([.day], from: calendar.startOfDay(for: subject.lastAskedAt), to: calendar.startOfDay(for: fireAt)).day ?? 1)
                result.append(HarnessFollowUp(step: .asset, fireAt: fireAt, symbol: subject.symbol, name: subject.name,
                                              isEquity: subject.isEquity, days: days))
            }
            lastSlot = day
            day = calendar.date(byAdding: .day, value: 1, to: day) ?? day.addingTimeInterval(86_400)
        }

        // 2. Its sector, the day after.
        let sectorFresh: (Date) -> Bool = { fireAt in
            guard let sectorId else { return false }
            return !ledger.events(.sent).contains { $0.step == .sector && $0.sector == sectorId
                && fireAt.timeIntervalSince($0.at) < options.sectorFreshDays * 86_400 }
        }
        if done.contains(.sector) {
            lastSlot = day
        } else if let sectorId, let sectorSubject, !profile.rests(.sector),
                  let fireAt = moment(on: day, time: time, calendar: calendar), sectorFresh(fireAt) {
            result.append(HarnessFollowUp(step: .sector, fireAt: fireAt, symbol: sectorSubject.symbol, name: sectorSubject.name,
                                          isEquity: sectorSubject.isEquity, sector: sectorId))
            lastSlot = day
        }

        // 3. Their week, the Monday after.
        if !done.contains(.week), !options.weeklyCovered, !profile.rests(.week) {
            let from = lastSlot ?? calendar.startOfDay(for: anchor.at)
            if let monday = nextMonday(after: from, calendar: calendar), let fireAt = moment(on: monday, time: time, calendar: calendar) {
                let weekAssets = ledger.assets(since: now.addingTimeInterval(-options.weekWindowDays * 86_400), now: now)
                let repeated = ledger.events(.sent).contains { $0.step == .week && fireAt.timeIntervalSince($0.at) < options.weekFreshDays * 86_400 }
                if let first = weekAssets.first, !repeated {
                    result.append(HarnessFollowUp(step: .week, fireAt: fireAt, symbol: first.symbol, name: first.name,
                                                  isEquity: first.isEquity, others: weekAssets.count - 1))
                }
            }
        }

        // Never in the past; never the same local day as, or sooner than `minimumGap` after, what the
        // person was really shown before (the clock, the time zone or the plan may have moved since);
        // never too many in a week.
        var previous = ledger.events(.sent).last?.at
        var kept: [HarnessFollowUp] = []
        for candidate in result.sorted(by: { $0.fireAt < $1.fireAt }) where candidate.fireAt > now {
            var fireAt = candidate.fireAt
            let tooClose: (Date) -> Bool = { date in
                if date.timeIntervalSince(anchor.at) < options.minimumGap { return true }
                guard let previous else { return false }
                return date.timeIntervalSince(previous) < options.minimumGap || calendar.isDate(date, inSameDayAs: previous)
            }
            var tries = 0
            // An asset or a sector moves to the next day; the week stays a Monday.
            while tooClose(fireAt), tries < 8 {
                fireAt = calendar.date(byAdding: .day, value: candidate.step == .week ? 7 : 1, to: fireAt) ?? fireAt.addingTimeInterval(86_400)
                tries += 1
            }
            guard !tooClose(fireAt) else { continue }
            let weekBefore = fireAt.addingTimeInterval(-7 * 86_400)
            let shown = ledger.events(.sent, since: weekBefore).count + kept.filter { $0.fireAt > weekBefore }.count
            guard shown < options.maxPerWeek else { continue }
            var followUp = candidate
            if fireAt != candidate.fireAt {
                followUp = HarnessFollowUp(step: candidate.step, fireAt: fireAt, symbol: candidate.symbol, name: candidate.name,
                                           isEquity: candidate.isEquity, sector: candidate.sector, days: candidate.days, others: candidate.others)
            }
            kept.append(followUp)
            previous = fireAt
        }
        return kept
    }

    // MARK: Dates

    /// The time of day follow-ups arrive at: the hour the person answers at once that is known,
    /// otherwise the time of what the chain starts from, inside the allowed hours.
    static func timeOfDay(anchor: HarnessEvent, profile: HarnessProfile, calendar: Calendar, options: Options) -> (hour: Int, minute: Int) {
        if let hour = profile.hour { return (min(max(hour, options.earliestHour), options.latestHour), 0) }
        let parts = calendar.dateComponents([.hour, .minute], from: anchor.at)
        let hour = parts.hour ?? 18, minute = parts.minute ?? 0
        if hour < options.earliestHour { return (options.earliestHour, 0) }
        if hour >= options.latestHour { return (options.latestHour, 0) }
        return (hour, minute)
    }

    /// The first day whose moment is at least `minimumGap` after `date`: the next day, or the one after.
    static func firstDay(after date: Date, time: (hour: Int, minute: Int), calendar: Calendar, options: Options) -> Date {
        let start = calendar.startOfDay(for: date)
        for offset in 1...3 {
            guard let day = calendar.date(byAdding: .day, value: offset, to: start),
                  let fireAt = moment(on: day, time: time, calendar: calendar) else { continue }
            if fireAt.timeIntervalSince(date) >= options.minimumGap { return day }
        }
        return calendar.date(byAdding: .day, value: 2, to: start) ?? start.addingTimeInterval(2 * 86_400)
    }

    static func moment(on day: Date, time: (hour: Int, minute: Int), calendar: Calendar) -> Date? {
        calendar.date(bySettingHour: time.hour, minute: time.minute, second: 0, of: calendar.startOfDay(for: day))
    }

    /// The first Monday strictly after `day`.
    static func nextMonday(after day: Date, calendar: Calendar) -> Date? {
        let start = calendar.startOfDay(for: day)
        for offset in 1...7 {
            guard let candidate = calendar.date(byAdding: .day, value: offset, to: start) else { continue }
            if calendar.component(.weekday, from: candidate) == 2 { return candidate }
        }
        return nil
    }
}
