import Foundation
@testable import Bobby

/// The planner as it shipped in the first 1.8 build (commit 2eaa5f55), copied rule for rule and kept
/// only as a yardstick: HarnessPlannerTests checks that today's shipped asset→week chain never
/// plans more than this one would have. Optional sectors have their own full cap suite; their
/// subject population now differs from the all-ask history. A tap on a notification was an answer, any answer started the chain
/// again from the next day, the chain was asset → sector → week, and nothing the person said about
/// their horizon was read. Do not "fix" it: it is the past.
enum HarnessLegacyRules {
    /// Keep the first build's all-ask asset set independent of today's own-question-only reader.
    /// This is the historical ledger projection, not a change to the old planner's rules.
    private static func assets(_ ledger: HarnessLedger, since: Date, now: Date) -> [HarnessAsset] {
        var bySymbol: [String: [HarnessEvent]] = [:]
        for event in ledger.events where event.kind == .ask && event.at >= since && event.at <= now {
            guard let symbol = event.symbol else { continue }
            bySymbol[symbol, default: []].append(event)
        }
        return bySymbol.compactMap { symbol, asks in
            guard let first = asks.first, let last = asks.last else { return nil }
            return HarnessAsset(symbol: symbol, name: last.name ?? symbol, isEquity: last.isEquity ?? false,
                                firstAskedAt: first.at, lastAskedAt: last.at, lastPrice: last.price,
                                firstPrice: asks.first { $0.price != nil }?.price, asks: asks.count)
        }.sorted { $0.lastAskedAt > $1.lastAskedAt }
    }
    struct Profile {
        var interest: [String: Double] = [:]
        var hour: Int?
        var ignored: [HarnessStep: Int] = [:]

        static let weights: [HarnessEvent.Kind: Double] = [.ask: 1, .saved: 1, .picked: 1, .opened: 1.5, .returned: 0.5]

        static func make(_ ledger: HarnessLedger, now: Date, calendar: Calendar) -> Profile {
            var profile = Profile()
            var hours: [Int: (count: Int, latest: Date)] = [:]
            let statsFrom = now.addingTimeInterval(-30 * 86_400)
            for event in ledger.events where event.at <= now {
                if let symbol = event.symbol, let weight = weights[event.kind] {
                    let ageDays = now.timeIntervalSince(event.at) / 86_400
                    profile.interest[symbol, default: 0] += weight * pow(0.5, ageDays / 7)
                }
                guard event.at >= statsFrom, let step = event.step else { continue }
                if event.kind == .sent { profile.ignored[step, default: 0] += 1 }
                if isEngagement(event) {
                    profile.ignored[step] = 0
                    let hour = calendar.component(.hour, from: event.at)
                    let seen = hours[hour]
                    hours[hour] = ((seen?.count ?? 0) + 1, max(seen?.latest ?? event.at, event.at))
                }
            }
            let samples = hours.values.reduce(0) { $0 + $1.count }
            let best = hours.max { a, b in a.value.count == b.value.count ? a.value.latest < b.value.latest : a.value.count < b.value.count }
            profile.hour = samples >= 3 ? best?.key : nil
            return profile
        }

        func rests(_ step: HarnessStep) -> Bool { (ignored[step] ?? 0) >= 2 }

        func favourite(among symbols: [String]) -> String? {
            var best: (symbol: String, score: Double)?
            for symbol in symbols {
                let score = interest[symbol] ?? 0
                if best == nil || score > best!.score { best = (symbol, score) }
            }
            return best?.symbol
        }
    }

    static func isEngagement(_ event: HarnessEvent) -> Bool { event.kind == .opened || event.kind == .returned }

    static func unansweredStreak(_ ledger: HarnessLedger, before now: Date) -> (count: Int, last: Date?) {
        let lastAnswer = ledger.events.last { $0.at <= now && isEngagement($0) }?.at
        let shown = ledger.events.filter { event in event.kind == .sent && event.at <= now && (lastAnswer.map { event.at > $0 } ?? true) }
        return (shown.count, shown.last?.at)
    }

    static func anchor(_ ledger: HarnessLedger, before now: Date) -> HarnessEvent? {
        ledger.events.last { $0.at <= now && ($0.kind == .ask || isEngagement($0)) }
    }

    static func plan(ledger: HarnessLedger, now: Date, calendar: Calendar, weeklyCovered: Bool = false,
                     sectorOf: (String) -> String? = { HarnessSectors.sector(of: $0)?.id }) -> [HarnessFollowUp] {
        let minimumGap: TimeInterval = 18 * 3_600, anchorDays = 14.0, sectorFreshDays = 7.0, weekFreshDays = 6.0, weekWindowDays = 7.0
        let maxPerWeek = 4, quietAfter = 3, quietDays = 14.0
        guard let anchor = anchor(ledger, before: now), now.timeIntervalSince(anchor.at) <= anchorDays * 86_400 else { return [] }
        let streak = unansweredStreak(ledger, before: now)
        if streak.count >= quietAfter, let last = streak.last, now.timeIntervalSince(last) < quietDays * 86_400 { return [] }
        let profile = Profile.make(ledger, now: now, calendar: calendar)
        let sentSince = ledger.events(.sent, since: anchor.at)
        let done = Set(sentSince.compactMap(\.step))
        let known = assets(ledger, since: now.addingTimeInterval(-anchorDays * 86_400), now: now)

        let subject: HarnessAsset? = {
            if anchor.kind == .ask, let symbol = anchor.symbol { return known.first { $0.symbol == symbol } }
            let others = known.filter { $0.symbol != anchor.symbol }.map(\.symbol)
            let symbol = profile.favourite(among: others) ?? anchor.symbol ?? profile.favourite(among: known.map(\.symbol))
            return known.first { $0.symbol == symbol }
        }()
        let followed = sentSince.last { $0.step == .asset }?.symbol
        let sectorSubject = followed.flatMap { symbol in known.first { $0.symbol == symbol } } ?? subject
        let sectorId = sectorSubject.flatMap { sectorOf($0.symbol) }

        let time = timeOfDay(anchor: anchor, profile: profile, calendar: calendar)
        var day = firstDay(after: anchor.at, time: time, calendar: calendar, minimumGap: minimumGap)
        var result: [HarnessFollowUp] = []
        var lastSlot: Date?

        let assetWanted = subject != nil && !profile.rests(.asset)
        if done.contains(.asset) || assetWanted {
            if !done.contains(.asset), let subject, let fireAt = HarnessPlanner.moment(on: day, time: time, calendar: calendar) {
                let days = max(1, calendar.dateComponents([.day], from: calendar.startOfDay(for: subject.lastAskedAt), to: calendar.startOfDay(for: fireAt)).day ?? 1)
                result.append(HarnessFollowUp(step: .asset, fireAt: fireAt, symbol: subject.symbol, name: subject.name,
                                              isEquity: subject.isEquity, days: days))
            }
            lastSlot = day
            day = calendar.date(byAdding: .day, value: 1, to: day) ?? day.addingTimeInterval(86_400)
        }

        let sectorFresh: (Date) -> Bool = { fireAt in
            guard let sectorId else { return false }
            return !ledger.events(.sent).contains { $0.step == .sector && $0.sector == sectorId
                && fireAt.timeIntervalSince($0.at) < sectorFreshDays * 86_400 }
        }
        if done.contains(.sector) {
            lastSlot = day
        } else if let sectorId, let sectorSubject, !profile.rests(.sector),
                  let fireAt = HarnessPlanner.moment(on: day, time: time, calendar: calendar), sectorFresh(fireAt) {
            result.append(HarnessFollowUp(step: .sector, fireAt: fireAt, symbol: sectorSubject.symbol, name: sectorSubject.name,
                                          isEquity: sectorSubject.isEquity, sector: sectorId))
            lastSlot = day
        }

        if !done.contains(.week), !weeklyCovered, !profile.rests(.week) {
            let from = lastSlot ?? calendar.startOfDay(for: anchor.at)
            if let monday = HarnessPlanner.nextMonday(after: from, calendar: calendar),
               let fireAt = HarnessPlanner.moment(on: monday, time: time, calendar: calendar) {
                let weekAssets = assets(ledger, since: now.addingTimeInterval(-weekWindowDays * 86_400), now: now)
                let repeated = ledger.events(.sent).contains { $0.step == .week && fireAt.timeIntervalSince($0.at) < weekFreshDays * 86_400 }
                if let first = weekAssets.first, !repeated {
                    result.append(HarnessFollowUp(step: .week, fireAt: fireAt, symbol: first.symbol, name: first.name,
                                                  isEquity: first.isEquity, others: weekAssets.count - 1))
                }
            }
        }

        var previous = ledger.events(.sent).last?.at
        var kept: [HarnessFollowUp] = []
        for candidate in result.sorted(by: { $0.fireAt < $1.fireAt }) where candidate.fireAt > now {
            var fireAt = candidate.fireAt
            let tooClose: (Date) -> Bool = { date in
                if date.timeIntervalSince(anchor.at) < minimumGap { return true }
                guard let previous else { return false }
                return date.timeIntervalSince(previous) < minimumGap || calendar.isDate(date, inSameDayAs: previous)
            }
            var tries = 0
            while tooClose(fireAt), tries < 8 {
                fireAt = calendar.date(byAdding: .day, value: candidate.step == .week ? 7 : 1, to: fireAt) ?? fireAt.addingTimeInterval(86_400)
                tries += 1
            }
            guard !tooClose(fireAt) else { continue }
            let weekBefore = fireAt.addingTimeInterval(-7 * 86_400)
            let shown = ledger.events(.sent, since: weekBefore).count + kept.filter { $0.fireAt > weekBefore }.count
            guard shown < maxPerWeek else { continue }
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

    static func timeOfDay(anchor: HarnessEvent, profile: Profile, calendar: Calendar) -> (hour: Int, minute: Int) {
        if let hour = profile.hour { return (min(max(hour, 9), 21), 0) }
        let parts = calendar.dateComponents([.hour, .minute], from: anchor.at)
        let hour = parts.hour ?? 18, minute = parts.minute ?? 0
        if hour < 9 { return (9, 0) }
        if hour >= 21 { return (21, 0) }
        return (hour, minute)
    }

    static func firstDay(after date: Date, time: (hour: Int, minute: Int), calendar: Calendar, minimumGap: TimeInterval) -> Date {
        let start = calendar.startOfDay(for: date)
        for offset in 1...3 {
            guard let day = calendar.date(byAdding: .day, value: offset, to: start),
                  let fireAt = HarnessPlanner.moment(on: day, time: time, calendar: calendar) else { continue }
            if fireAt.timeIntervalSince(date) >= minimumGap { return day }
        }
        return calendar.date(byAdding: .day, value: 2, to: start) ?? start.addingTimeInterval(2 * 86_400)
    }
}
