// The harness (1.8): what comes next. A pure function of the ledger and the clock.
//
// Follow-ups belong to an own question or a contextual yes to follow a Bobby-authored read. That anchor gets the steps of
// the chain, in order, and never more than `maxPerQuestion` of them whatever is answered:
//   1. the asset      how what they asked about moved, when they said they would look again
//   2. the week       the Monday after: the assets they asked about since the Monday before it
// and then silence, until they ask again. The list is always "what happens if they do nothing".
// A tap on a notification changes nothing here. A read Bobby started (the button of a follow-up,
// the question Bobby wrote after a read) is at most an answer: it never starts a chain.
//
// When the first one comes (`wait`), from what the person said, in this order:
//   a thesis they wrote about the asset   weeks → 7 days; months or longer → no asset follow-up
//   the review they chose on the save     72 hours → 3 days; 168 hours → 7 days
//   the horizon their question named      week → 3 days; month → 7 days; long → no asset follow-up
//   otherwise                             the next day
// A horizon only lengthens the wait: nothing ever arrives sooner than the next day. It times the
// first follow-up and nothing else: once a step was shown, what the person says later (a save, a
// thesis) cannot push what follows it further away than the day it was shown allows.
//
// What it learns, all of it readable from the ledger (HarnessProfile):
//  - the hour: follow-ups arrive at the time of day the person asked, and once they have answered
//    a few, at the hour they answer;
//  - when to stop: three follow-ups in a row that nobody answered and Bobby says nothing for two
//    weeks, whatever is asked, and the plan itself never holds what would be a fourth (it is what
//    arrives if they do nothing); a kind whose last two showings went unanswered rests; a sector is
//    not repeated within a week; never more than `maxPerWeek` follow-ups in seven days, never two
//    on the same day, never sooner than 18 hours after the last one.
// Nothing here says the market did anything: a follow-up is a moment in time, the numbers are
// read when the person opens it.
//
// Every rule above is a case in shared/harness/planner-golden.json, which the iPhone suite runs
// (HarnessGoldenTests) and which any other platform's planner must reproduce.
import Foundation

/// One follow-up to hand to iOS.
struct HarnessFollowUp: Codable, Equatable, Identifiable {
    let step: HarnessStep
    let fireAt: Date
    /// `asset`: the asset. `sector`: the asset whose sector it is. `week`: the asset the week names.
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

/// The follow-ups one question gets, in order, and how many of them at most.
struct HarnessChain: Equatable {
    var steps: [HarnessStep]
    var maxPerQuestion: Int

    /// The asset, then the week.
    static let assetThenWeek = HarnessChain(steps: [.asset, .week], maxPerQuestion: 2)
    /// The asset, its sector the day after, then the week. The sector lands on a list of assets
    /// the person did not ask about (HarnessBoard), which is why it does not ship.
    static let withSector = HarnessChain(steps: [.asset, .sector, .week], maxPerQuestion: 3)

    /// THE OWNER'S CHOICE, in one line: `.assetThenWeek` or `.withSector`. Both are tested.
    static let shipped: HarnessChain = .assetThenWeek
}

enum HarnessPlanner {
    static let identifierPrefix = "v18.follow."

    struct Options {
        /// The steps a question gets, each at most once, in this order.
        var chain = HarnessChain.shipped.steps
        /// Follow-ups one question gets at most, whatever the person does with them.
        var maxPerQuestion = HarnessChain.shipped.maxPerQuestion
        /// A paying account with the Monday briefing on already gets its week from the server.
        var weeklyCovered = false
        /// Local hours follow-ups may arrive in.
        var earliestHour = 9
        var latestHour = 21
        /// A follow-up never arrives sooner than this after what it follows.
        var minimumGap: TimeInterval = 18 * 3_600
        /// The plan is only made while the question is this recent.
        var anchorDays = 14.0
        /// A sector is not repeated within these days.
        var sectorFreshDays = 7.0
        /// A week is not repeated within these days.
        var weekFreshDays = 6.0
        /// A week holds the assets asked about since the start of the day this many days before it.
        var weekWindowDays = 7
        var maxPerWeek = 4
        /// This many follow-ups in a row that nobody answered, and Bobby says nothing for `quietDays`,
        /// whatever is asked in the meantime.
        var quietAfter = 3
        var quietDays = 14.0
        var sectorOf: (String) -> String? = { HarnessSectors.sector(of: $0)?.id }

        init() {}

        init(_ chain: HarnessChain) {
            self.chain = chain.steps
            maxPerQuestion = chain.maxPerQuestion
        }
    }

    /// How long a question waits for its first follow-up, and what said so.
    struct Wait: Equatable {
        enum Source: String { case thesis, saved, named, standard }

        /// Whole days after the question. Nil: nothing about the asset, the week only.
        var days: Int?
        var source: Source
    }

    /// What the person said about when to look again, strongest first. A save left at 24 hours says
    /// nothing (it is where the picker starts), so it never shortens what the question named.
    static func wait(for question: HarnessEvent, in ledger: HarnessLedger, now: Date) -> Wait {
        guard let symbol = question.symbol else { return Wait(days: 1, source: .standard) }
        let thesis = ledger.events(.thesis).last { $0.symbol == symbol && $0.at <= now }
        if let horizon = thesis?.horizon { return Wait(days: horizon.waitDays, source: .thesis) }
        let saved = ledger.events(.saved).last { $0.symbol == symbol && $0.at >= question.followUpAnchorAt && $0.at <= now && ($0.horizonHours ?? 0) > 24 }
        if let hours = saved?.horizonHours { return Wait(days: max(1, hours / 24), source: .saved) }
        if question.isQuestion, let horizon = question.horizon { return Wait(days: horizon.waitDays, source: .named) }
        return Wait(days: 1, source: .standard)
    }

    /// The follow-ups still to come, earliest first. Empty when there is nothing to come back to.
    static func plan(ledger whole: HarnessLedger, now: Date, calendar: Calendar, options: Options = Options()) -> [HarnessFollowUp] {
        let ledger = whole.upTo(now)
        guard let question = ledger.followUpAnchor(before: now), let symbol = question.symbol,
              now.timeIntervalSince(question.followUpAnchorAt) <= options.anchorDays * 86_400 else { return [] }
        let streak = ledger.unansweredStreak(before: now)
        if streak.count >= options.quietAfter, let last = streak.last, now.timeIntervalSince(last) < options.quietDays * 86_400 { return [] }
        // What this question already got. Answered or not, it counts.
        let sentSince = ledger.events(.sent, since: question.followUpAnchorAt)
        let room = options.maxPerQuestion - sentSince.count
        let known = ledger.followUpAssets(since: now.addingTimeInterval(-options.anchorDays * 86_400), now: now)
        guard room > 0, let subject = known.first(where: { $0.symbol == symbol }) else { return [] }
        let done = Set(sentSince.compactMap(\.step))
        let profile = HarnessProfile.make(ledger, now: now, calendar: calendar)
        let time = timeOfDay(question: question, profile: profile, calendar: calendar, options: options)
        let wait = wait(for: question, in: ledger, now: now)

        // The day the next asset or sector lands on. Nil: the person is looking far ahead, and gets
        // neither. A step that is skipped leaves its day to the next one.
        var day = wait.days.map { firstDay(after: question.followUpAnchorAt, wait: $0, time: time, calendar: calendar, options: options) }
        var lastSlot: Date?
        var result: [HarnessFollowUp] = []
        var walked = Set<HarnessStep>()
        for step in options.chain where walked.insert(step).inserted {
            switch step {
            case .asset, .sector:
                guard var slot = day else { continue }
                if done.contains(step) {
                    // Already shown for this question. What follows is counted from the day it was
                    // shown whenever that is earlier than where the wait would put it today: what the
                    // person says after seeing it (a save "to review in a week", a thesis of weeks)
                    // times nothing any more, and never pushes the week past the question it belongs to.
                    if let shown = sentSince.last(where: { $0.step == step }) { slot = min(slot, calendar.startOfDay(for: shown.at)) }
                } else {
                    guard !profile.rests(step), let fireAt = moment(on: slot, time: time, calendar: calendar) else { continue }
                    if step == .asset {
                        result.append(HarnessFollowUp(step: .asset, fireAt: fireAt, symbol: subject.symbol, name: subject.name, isEquity: subject.isEquity))
                    } else {
                        guard let sectorId = options.sectorOf(subject.symbol),
                              !ledger.events(.sent).contains(where: { $0.step == .sector && $0.sector == sectorId
                                  && fireAt.timeIntervalSince($0.at) < options.sectorFreshDays * 86_400 }) else { continue }
                        result.append(HarnessFollowUp(step: .sector, fireAt: fireAt, symbol: subject.symbol, name: subject.name,
                                                      isEquity: subject.isEquity, sector: sectorId))
                    }
                }
                lastSlot = slot
                day = calendar.date(byAdding: .day, value: 1, to: slot) ?? slot.addingTimeInterval(86_400)
            case .week:
                guard !done.contains(.week), !options.weeklyCovered, !profile.rests(.week),
                      let monday = nextMonday(after: lastSlot ?? calendar.startOfDay(for: question.followUpAnchorAt), calendar: calendar),
                      let fireAt = moment(on: monday, time: time, calendar: calendar) else { continue }
                // Which assets it holds is decided below, once its Monday is final.
                result.append(HarnessFollowUp(step: .week, fireAt: fireAt))
                lastSlot = monday
            }
        }

        // Never in the past; never the same local day as, or sooner than `minimumGap` after, what the
        // person was really shown before (the clock, the time zone or the plan may have moved since);
        // never too many in a week, nor for one question; and never what would be one more unanswered
        // in a row than `quietAfter` inside the quiet that follows it. The plan is what arrives if they
        // do nothing, so each follow-up it keeps counts as unanswered for the ones behind it.
        var previous = ledger.events(.sent).last?.at
        var unanswered = streak.count, lastUnanswered = streak.last
        var kept: [HarnessFollowUp] = []
        for candidate in result.sorted(by: { $0.fireAt < $1.fireAt }) where candidate.fireAt > now {
            guard kept.count < room else { break }
            var fireAt = candidate.fireAt
            let tooClose: (Date) -> Bool = { date in
                if date.timeIntervalSince(question.followUpAnchorAt) < options.minimumGap { return true }
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
            if unanswered >= options.quietAfter, let last = lastUnanswered, fireAt.timeIntervalSince(last) < options.quietDays * 86_400 { continue }
            var followUp = HarnessFollowUp(step: candidate.step, fireAt: fireAt, symbol: candidate.symbol, name: candidate.name,
                                           isEquity: candidate.isEquity, sector: candidate.sector)
            switch candidate.step {
            case .asset:
                followUp.days = max(1, calendar.dateComponents([.day], from: calendar.startOfDay(for: question.followUpAnchorAt), to: calendar.startOfDay(for: fireAt)).day ?? 1)
            case .sector:
                break
            case .week:
                // A week is about what they asked since the Monday before it: an older question has
                // none. It names the asset that matters most to them among those, the latest one on a tie.
                let assets = ledger.followUpAssets(since: weekStart(of: fireAt, calendar: calendar, days: options.weekWindowDays), now: now)
                let repeated = ledger.events(.sent).contains { $0.step == .week && fireAt.timeIntervalSince($0.at) < options.weekFreshDays * 86_400 }
                guard !repeated, let favourite = profile.favourite(among: assets.map(\.symbol)),
                      let named = assets.first(where: { $0.symbol == favourite }) else { continue }
                followUp.symbol = named.symbol
                followUp.name = named.name
                followUp.isEquity = named.isEquity
                followUp.others = assets.count - 1
            }
            kept.append(followUp)
            previous = fireAt
            unanswered += 1
            lastUnanswered = fireAt
        }
        return kept
    }

    // MARK: Dates

    /// The time of day follow-ups arrive at: the hour the person answers at once that is known,
    /// otherwise the time of their question, inside the allowed hours.
    static func timeOfDay(question: HarnessEvent, profile: HarnessProfile, calendar: Calendar, options: Options) -> (hour: Int, minute: Int) {
        if let hour = profile.hour { return (min(max(hour, options.earliestHour), options.latestHour), 0) }
        let parts = calendar.dateComponents([.hour, .minute], from: question.followUpAnchorAt)
        let hour = parts.hour ?? 18, minute = parts.minute ?? 0
        if hour < options.earliestHour { return (options.earliestHour, 0) }
        if hour >= options.latestHour { return (options.latestHour, 0) }
        return (hour, minute)
    }

    /// The first day, `wait` days after `date` or later, whose moment is at least `minimumGap` after
    /// it. Never the day of the question itself, whatever `wait` says.
    static func firstDay(after date: Date, wait: Int = 1, time: (hour: Int, minute: Int), calendar: Calendar, options: Options) -> Date {
        let start = calendar.startOfDay(for: date)
        let wait = max(1, wait)
        for offset in wait...(wait + 2) {
            guard let day = calendar.date(byAdding: .day, value: offset, to: start),
                  let fireAt = moment(on: day, time: time, calendar: calendar) else { continue }
            if fireAt.timeIntervalSince(date) >= options.minimumGap { return day }
        }
        return calendar.date(byAdding: .day, value: wait + 1, to: start) ?? start.addingTimeInterval(Double(wait + 1) * 86_400)
    }

    static func moment(on day: Date, time: (hour: Int, minute: Int), calendar: Calendar) -> Date? {
        calendar.date(bySettingHour: time.hour, minute: time.minute, second: 0, of: calendar.startOfDay(for: day))
    }

    /// Where the week that arrives at `moment` begins: the start of the day `days` days before it.
    /// The board a week follow-up opens reads the same window (HarnessBoard).
    static func weekStart(of moment: Date, calendar: Calendar, days: Int = Options().weekWindowDays) -> Date {
        let day = calendar.startOfDay(for: moment)
        return calendar.date(byAdding: .day, value: -days, to: day) ?? day.addingTimeInterval(-Double(days) * 86_400)
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
