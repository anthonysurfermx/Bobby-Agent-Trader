// Credits (1.8): ONE model of what a person has, built only from what the server said
// (`/api/bobby-access`: access, levels, referral, subscription). The profile row, the Credits
// screen and the restore explanation all read it, so the same account is never described three
// ways. Pure: no network, no clock of its own, no UI. A value the server did not send is left
// out; it is never shown as zero.
//
// What the server's numbers mean (map `purchases-credits`, §2):
//   · Quick reads   guest 3 per install; a free account's weekly reads while the weekly cap is on;
//                   unlimited on Bobby Pro or while the cap is off.
//   · Deep / Max    the plan's allowance per window (7 days free, 30 days Pro), from the level meters.
//   · Gifted reads  a separate balance per level. Spent only after the plan's reads run out; a Pro
//                   account never spends gifted Quick reads.
//   · Bobby Pro     an App Store plan, a card plan from the web, or gifted days (invitations or Bobby).
import Foundation

/// Everything the Credits surfaces may look at, in one value (live from the centres, or a fixture).
struct CreditsSnapshot: Equatable {
    var access: BobbyReadAccess?
    var meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [:]
    var referral: NucleoReferral? = nil
    var subscription: BobbySubscription? = nil
    /// Bobby Pro can be bought in this build (`BobbyStore.proPurchasable`): the gate for every Pro promise.
    var proPurchasable = false
    var signedIn = false
    /// `plans.freeReadsPerWeek`: what a free account gets, for the guest's line. nil = not known (or no cap).
    var freeReadsPerWeek: Int? = nil
    /// `plans.referral`, before the account has a referral of its own.
    var rewardDays: Int? = nil
    var maxFriends: Int? = nil
}

/// Why the account is on Bobby Pro, if it is.
struct CreditsProStatus: Equatable {
    enum Plan: Equatable {
        case none
        /// An App Store subscription: managed from the phone, restorable.
        case appStore
        /// A card plan bought on the web.
        case card
        /// Gifted days only (invitations, or a gift from Bobby).
        case gifted
        /// The server says Pro and the reason did not reach the app.
        case active
    }

    enum GiftSource: Equatable { case invitations, bobby }

    var plan: Plan = .none
    /// The paid period's end.
    var periodEnd: Date? = nil
    /// False once the plan is cancelled and only runs to `periodEnd`.
    var renews = true
    /// Gifted days that are still ahead (also set next to a paid plan: they start after it).
    var giftUntil: Date? = nil
    var giftSource: GiftSource? = nil

    var isPro: Bool { plan != .none }
    /// A plan the person pays for.
    var pays: Bool { plan == .appStore || plan == .card }
    /// The Bobby Pro offer has a place: the account has no plan, or only gifted days. An account
    /// the server calls Pro is not offered it while the reason has not reached the app.
    var offersPro: Bool { plan == .none || plan == .gifted }

    static func make(_ snapshot: CreditsSnapshot, now: Date = .now) -> CreditsProStatus {
        guard let access = snapshot.access, access.isPro else { return CreditsProStatus() }
        let subscription = snapshot.subscription
        let status = subscription?.status ?? ""
        let end = subscription?.periodEnd
        let live = ["active", "trialing"].contains(status) && (end.map { $0 > now } ?? true)
        let ending = ["canceled", "cancelled"].contains(status) && (end.map { $0 > now } ?? false)
        let source: GiftSource?
        switch snapshot.referral?.proSource {
        case "referral": source = .invitations
        case "admin": source = .bobby
        default: source = nil
        }
        let grantEnd = snapshot.referral?.proUntil.flatMap(BobbyAccessAPI.date)
        let gift = source != nil && (grantEnd ?? .distantPast) > now ? grantEnd : nil

        var out = CreditsProStatus(giftUntil: gift, giftSource: gift == nil ? nil : source)
        if live || ending {
            out.plan = subscription?.managedByApple == true ? .appStore : .card
            out.periodEnd = end
            out.renews = live
        } else if gift != nil {
            out.plan = .gifted
        } else {
            out.plan = .active
        }
        return out
    }
}

struct CreditsBalance: Equatable {
    struct Line: Equatable, Identifiable {
        enum Kind: String { case quick, deep, max, giftQuick, giftDeep, giftMax, pro }

        let kind: Kind
        let title: String
        let value: String
        let detail: String?

        var id: String { kind.rawValue }
        var isGift: Bool { [.giftQuick, .giftDeep, .giftMax].contains(kind) }
        /// What VoiceOver reads for the whole line.
        var spoken: String { [title + ": " + value, detail].compactMap { $0 }.joined(separator: ". ") }
    }

    /// Top to bottom: the plan's reads, the gifted reads, Bobby Pro. Empty until the server answered.
    let lines: [Line]
    /// One line for the profile row ("7 of 10 reads · 3 gifted"); nil until the server answered.
    let summary: String?
    let pro: CreditsProStatus
    /// Gifted reads across the three levels.
    let giftTotal: Int

    /// Apple's own sheet applies: an App Store plan is active.
    var manage: Bool { pro.plan == .appStore }
    var isKnown: Bool { !lines.isEmpty }

    func line(_ kind: Line.Kind) -> Line? { lines.first { $0.kind == kind } }

    static func make(_ snapshot: CreditsSnapshot, now: Date = .now, spanish: Bool? = nil,
                     timeZone: TimeZone = .current) -> CreditsBalance {
        let pro = CreditsProStatus.make(snapshot, now: now)
        guard let access = snapshot.access else {
            return CreditsBalance(lines: [], summary: nil, pro: pro, giftTotal: 0)
        }
        let copy = Copy(now: now, spanish: spanish, timeZone: timeZone)
        var lines: [Line] = []
        var summary: [String] = []

        // Quick reads.
        let unlimited = access.isPro || (access.tier == "free" && !access.paywall)
        if unlimited {
            lines.append(Line(kind: .quick, title: copy.title(.rapido), value: L.t("Unlimited", "Ilimitadas", spanish: spanish),
                              detail: access.isPro ? L.t("With Bobby Pro, within fair use.", "Con Bobby Pro, dentro del uso justo.", spanish: spanish) : nil))
            if !access.isPro { summary.append(L.t("Unlimited reads", "Lecturas ilimitadas", spanish: spanish)) }
        } else if let limit = access.limit {
            let left = access.remaining ?? max(0, limit - access.used)
            if access.tier == "anon" {
                let detail: String? = snapshot.signedIn ? nil
                    : snapshot.freeReadsPerWeek.map { L.t("Create your free account to get \($0) every week", "Crea tu cuenta gratis para tener \($0) cada semana", spanish: spanish) }
                        ?? L.t("Create your free account to keep reading", "Crea tu cuenta gratis para seguir leyendo", spanish: spanish)
                lines.append(Line(kind: .quick, title: copy.title(.rapido), value: copy.left(left, of: limit, weekly: false), detail: detail))
            } else {
                lines.append(Line(kind: .quick, title: copy.title(.rapido), value: copy.left(left, of: limit, weekly: true),
                                  detail: copy.resets(access.resetsDate)))
            }
            summary.append(L.t("\(left) of \(limit) reads", "\(left) de \(limit) lecturas", spanish: spanish))
        }

        // Deep and Max: the plan's allowance in its own window.
        for level in [NucleoAnalysisLevel.profundo, .maximo] {
            guard let meter = snapshot.meters[level], let limit = meter.limit else { continue }
            let kind: Line.Kind = level == .profundo ? .deep : .max
            if limit == 0 {
                // A guest has no Max reads: say where they are, never "0 of 0".
                if access.tier == "anon" {
                    lines.append(Line(kind: kind, title: copy.title(level),
                                      value: L.t("With your free account", "Con tu cuenta gratis", spanish: spanish), detail: nil))
                }
                continue
            }
            let left = meter.remaining ?? max(0, limit - meter.used)
            let weekly = (meter.windowDays ?? 7) == 7
            lines.append(Line(kind: kind, title: copy.title(level), value: copy.left(left, of: limit, weekly: weekly),
                              detail: weekly ? copy.resets(meter.resetsDate) : copy.window(meter.windowDays, resets: meter.resetsDate)))
        }

        // Gifted reads: per level, only what exists.
        var gifts = 0
        if access.bonus > 0 {
            gifts += access.bonus
            let when = access.isPro
                ? L.t("Kept for when you are not on Bobby Pro.", "Se guardan para cuando no tengas Bobby Pro.", spanish: spanish)
                : unlimited
                    ? L.t("Kept for when Quick reads have a weekly limit.", "Se guardan para cuando las lecturas Rápidas tengan límite semanal.", spanish: spanish)
                    : copy.afterPlan
            lines.append(Line(kind: .giftQuick, title: copy.giftTitle(.rapido), value: "\(access.bonus)", detail: when))
        }
        for level in [NucleoAnalysisLevel.profundo, .maximo] {
            guard let bonus = snapshot.meters[level]?.bonus, bonus > 0 else { continue }
            gifts += bonus
            lines.append(Line(kind: level == .profundo ? .giftDeep : .giftMax, title: copy.giftTitle(level), value: "\(bonus)", detail: copy.afterPlan))
        }
        if gifts > 0 {
            summary.append(gifts == 1 ? L.t("1 gifted", "1 de regalo", spanish: spanish) : L.t("\(gifts) gifted", "\(gifts) de regalo", spanish: spanish))
        }

        // Bobby Pro. A guest has no account for it to belong to, so the line waits for one.
        if pro.isPro || access.tier == "free" {
            lines.append(Line(kind: .pro, title: "Bobby Pro", value: copy.proValue(pro), detail: copy.proDetail(pro)))
        }
        if pro.isPro {
            let until = pro.plan == .gifted ? pro.giftUntil : (pro.pays && !pro.renews ? pro.periodEnd : nil)
            let part = until.map { L.t("Bobby Pro until \(copy.short($0))", "Bobby Pro hasta el \(copy.short($0))", spanish: spanish) }
                ?? L.t("Bobby Pro active", "Bobby Pro activo", spanish: spanish)
            // The plan leads: "Bobby Pro active · 3 gifted".
            summary.insert(part, at: 0)
        }

        return CreditsBalance(lines: lines, summary: summary.isEmpty ? nil : summary.joined(separator: " · "), pro: pro, giftTotal: gifts)
    }

    /// "Invite friends": who gets what, from the server's own terms. The Bobby Pro reward is promised
    /// only where Bobby Pro can be had in this build (as the invite sheet does).
    static func inviteDetail(_ snapshot: CreditsSnapshot, spanish: Bool? = nil) -> String {
        guard snapshot.proPurchasable else {
            return L.t("Share Bobby with someone you know.", "Comparte Bobby con alguien que conoces.", spanish: spanish)
        }
        let days = snapshot.referral?.rewardDays ?? snapshot.rewardDays
        let friends = snapshot.referral?.max ?? snapshot.maxFriends
        if let days, let friends, friends > 0 {
            return L.t("You get \(days) days of Bobby Pro for each friend who joins with your link, up to \(friends) friends.",
                       "Recibes \(days) días de Bobby Pro por cada amigo que se una con tu link, hasta \(friends) amigos.", spanish: spanish)
        }
        return days.map { L.t("\($0) days of Bobby Pro for each friend who joins", "\($0) días de Bobby Pro por cada amigo que se una", spanish: spanish) }
            ?? L.t("Bobby Pro for each friend who joins", "Bobby Pro por cada amigo que se una", spanish: spanish)
    }

    // MARK: - Copy

    /// The sentences, with the clock and the language they are written for.
    struct Copy {
        let now: Date
        let spanish: Bool?
        let timeZone: TimeZone

        func title(_ level: NucleoAnalysisLevel) -> String {
            switch level {
            case .rapido: return L.t("Quick reads", "Lecturas Rápidas", spanish: spanish)
            case .profundo: return L.t("Deep reads", "Lecturas Profundas", spanish: spanish)
            case .maximo: return L.t("Max reads", "Lecturas Máximas", spanish: spanish)
            }
        }

        func giftTitle(_ level: NucleoAnalysisLevel) -> String {
            switch level {
            case .rapido: return L.t("Gifted Quick reads", "Lecturas Rápidas de regalo", spanish: spanish)
            case .profundo: return L.t("Gifted Deep reads", "Lecturas Profundas de regalo", spanish: spanish)
            case .maximo: return L.t("Gifted Max reads", "Lecturas Máximas de regalo", spanish: spanish)
            }
        }

        var afterPlan: String {
            L.t("Used after your plan's reads run out.", "Se usan cuando se acaban las lecturas de tu plan.", spanish: spanish)
        }

        func left(_ left: Int, of limit: Int, weekly: Bool) -> String {
            weekly ? L.t("\(left) of \(limit) left this week", "Te quedan \(left) de \(limit) esta semana", spanish: spanish)
                   : L.t("\(left) of \(limit) left", "Te quedan \(left) de \(limit)", spanish: spanish)
        }

        /// "Resets on Friday" inside the coming week, the date beyond it; nil when there is nothing to wait for.
        func resets(_ date: Date?) -> String? {
            guard let date, date > now else { return nil }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = timeZone
            if calendar.isDate(date, inSameDayAs: now) { return L.t("Resets today", "Se renuevan hoy", spanish: spanish) }
            if date.timeIntervalSince(now) < 6 * 86_400 {
                let weekday = Self.format(date, "EEEE", spanish: spanish, timeZone: timeZone, template: false)
                return L.t("Resets on \(weekday)", "Se renuevan el \(weekday)", spanish: spanish)
            }
            let day = self.day(date)
            return L.t("Resets \(day)", "Se renuevan el \(day)", spanish: spanish)
        }

        /// "Every 30 days · resets November 2" for a window that is not a week.
        func window(_ days: Int?, resets date: Date?) -> String? {
            guard let days, days > 0 else { return resets(date) }
            guard let date, date > now else { return L.t("Every \(days) days", "Cada \(days) días", spanish: spanish) }
            let day = self.day(date)
            return L.t("Every \(days) days · resets \(day)", "Cada \(days) días · se renuevan el \(day)", spanish: spanish)
        }

        func proValue(_ pro: CreditsProStatus) -> String {
            switch pro.plan {
            case .none:
                return L.t("Not active", "No activo", spanish: spanish)
            case .gifted:
                guard let until = pro.giftUntil else { return L.t("Active", "Activo", spanish: spanish) }
                return L.t("Gifted until \(day(until))", "Regalado hasta el \(day(until))", spanish: spanish)
            case .appStore, .card, .active:
                guard let end = pro.periodEnd else { return L.t("Active", "Activo", spanish: spanish) }
                return pro.renews ? L.t("Active · renews \(day(end))", "Activo · se renueva el \(day(end))", spanish: spanish)
                                  : L.t("Active · ends \(day(end))", "Activo · termina el \(day(end))", spanish: spanish)
            }
        }

        func proDetail(_ pro: CreditsProStatus) -> String? {
            var parts: [String] = []
            if pro.plan == .card { parts.append(L.t("Managed on the web.", "Se administra en la web.", spanish: spanish)) }
            if pro.plan == .gifted, let source = pro.giftSource {
                parts.append(source == .invitations ? L.t("From your invitations.", "Por tus invitaciones.", spanish: spanish)
                                                    : L.t("A gift from Bobby.", "Un regalo de Bobby.", spanish: spanish))
            } else if pro.isPro, let until = pro.giftUntil {
                // Gifted days wait behind a paid period: they are not lost.
                parts.append(L.t("Your gifted days run until \(day(until)).", "Tus días de regalo llegan hasta el \(day(until)).", spanish: spanish))
            }
            return parts.isEmpty ? nil : parts.joined(separator: " ")
        }

        /// "October 27", with the year when it is not this one.
        func day(_ date: Date) -> String { Self.format(date, sameYear(date) ? "MMMMd" : "MMMMdyyyy", spanish: spanish, timeZone: timeZone) }

        /// "Oct 27" for the profile row and the restore sentence.
        func short(_ date: Date) -> String { Self.format(date, sameYear(date) ? "MMMd" : "MMMdyyyy", spanish: spanish, timeZone: timeZone) }

        private func sameYear(_ date: Date) -> Bool {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = timeZone
            return calendar.component(.year, from: date) == calendar.component(.year, from: now)
        }

        private static func format(_ date: Date, _ pattern: String, spanish: Bool?, timeZone: TimeZone, template: Bool = true) -> String {
            let formatter = DateFormatter()
            formatter.locale = L.formatLocale(spanish: spanish)
            formatter.timeZone = timeZone
            if template { formatter.setLocalizedDateFormatFromTemplate(pattern) } else { formatter.dateFormat = pattern }
            return formatter.string(from: date)
        }
    }
}
