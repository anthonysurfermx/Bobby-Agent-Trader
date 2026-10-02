// Bobby Pro market briefings — client models (build 53).
// Contract: docs/product/pro-market-briefings-implementation.md §4 and api/_lib/briefings/types.ts
// (BriefSettings, BriefContent, BriefSection). Every API body is parsed leniently with `init?(json:)`
// (no Codable), like BobbyReadAccess: an unknown enum value or a malformed field is dropped, never
// guessed. Nothing here carries server English text to the UI: titles and bodies are report content
// written for the reader's language; error copy is the app's own (BriefingsError).
import Foundation

/// Internal cadence. Legacy reports still decode morning/close; Profile offers only the weekly briefing.
enum BriefingCadence: String, CaseIterable, Identifiable, Sendable {
    case morning, close, weekly
    var id: String { rawValue }

    /// The active product offer; legacy cadences remain readable but cannot be newly enabled.
    static let offeredCadences: [BriefingCadence] = [.weekly]

    /// The settings key that switches this cadence (PATCH /api/briefing-settings).
    var settingsKey: String {
        switch self {
        case .morning: return "openingEnabled"
        case .close: return "closeEnabled"
        case .weekly: return "weeklyEnabled"
        }
    }
}

/// Small lenient readers shared by every briefing model.
enum BriefingJSON {
    /// A JSON boolean (never a number posing as one).
    static func bool(_ v: Any?) -> Bool? {
        guard let n = v as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return nil }
        return n.boolValue
    }

    /// A finite, non-negative JSON number (never a boolean).
    static func int(_ v: Any?) -> Int? { BobbyReadAccess.count(v) }

    static func string(_ v: Any?) -> String? {
        guard let s = v as? String, !s.isEmpty else { return nil }
        return s
    }

    static func strings(_ v: Any?) -> [String] {
        (v as? [Any] ?? []).compactMap { string($0) }
    }

    static func date(_ v: Any?) -> Date? { string(v).flatMap(BobbyAccessAPI.date) }

    /// A lowercase canonical UUID, or nil. Every id the app sends or opens goes through this.
    static func uuid(_ v: Any?) -> String? {
        guard let s = v as? String, s.count == 36, let u = UUID(uuidString: s) else { return nil }
        return u.uuidString.lowercased()
    }
}

/// Account briefing settings as GET/PATCH /api/briefing-settings return them.
struct BriefingSettings: Equatable, Sendable {
    var revision: Int
    var openingEnabled: Bool
    var closeEnabled: Bool
    var weeklyEnabled: Bool
    /// "en" | "es"
    var language: String
    var locale: String? = nil
    var companionId: String?
    var assets: [String]
    var analysisConsentEnabled: Bool
    var analysisConsentVersion: Int?
    var audioConsentEnabled: Bool
    var audioConsentVersion: Int?

    static let languages: Set<String> = ["en", "es", "fr", "pt", "it", "de"]
    static let narrationLanguages = languages.union(["pt-PT", "pt-BR"])

    init(revision: Int = 0, openingEnabled: Bool = false, closeEnabled: Bool = false, weeklyEnabled: Bool = false,
         language: String = "en", companionId: String? = nil, assets: [String] = [],
         analysisConsentEnabled: Bool = false, analysisConsentVersion: Int? = nil,
         audioConsentEnabled: Bool = false, audioConsentVersion: Int? = nil) {
        self.revision = revision; self.openingEnabled = openingEnabled; self.closeEnabled = closeEnabled
        self.weeklyEnabled = weeklyEnabled; self.language = language; self.companionId = companionId; self.assets = assets
        self.analysisConsentEnabled = analysisConsentEnabled; self.analysisConsentVersion = analysisConsentVersion
        self.audioConsentEnabled = audioConsentEnabled; self.audioConsentVersion = audioConsentVersion
    }

    /// Lenient: the revision is the only required field (without it nothing can be saved safely).
    /// The body is flat (contract §Settings); a `settings` wrapper is accepted too.
    init?(json: Any?) {
        guard var o = json as? [String: Any] else { return nil }
        if let inner = o["settings"] as? [String: Any] { o = inner }
        guard let revision = BriefingJSON.int(o["revision"]) else { return nil }
        self.revision = revision
        openingEnabled = BriefingJSON.bool(o["openingEnabled"]) ?? false
        closeEnabled = BriefingJSON.bool(o["closeEnabled"]) ?? false
        weeklyEnabled = BriefingJSON.bool(o["weeklyEnabled"]) ?? false
        let lang = o["language"] as? String ?? "en"
        let base = lang.split(separator: "-").first.map(String.init) ?? lang
        language = Self.languages.contains(base) ? base : "en"
        let rawLocale = (o["locale"] as? String) ?? (lang.contains("-") ? lang : nil)
        if let rawLocale {
            locale = LanguageResolution.resolve(selection: language, preferredLanguages: [rawLocale], region: nil).localeIdentifier
        }
        companionId = BriefingJSON.string(o["companionId"])
        assets = BriefingJSON.strings(o["assets"])
        analysisConsentEnabled = BriefingJSON.bool(o["analysisConsentEnabled"]) ?? false
        analysisConsentVersion = BriefingJSON.int(o["analysisConsentVersion"])
        audioConsentEnabled = BriefingJSON.bool(o["audioConsentEnabled"]) ?? false
        audioConsentVersion = BriefingJSON.int(o["audioConsentVersion"])
    }

    func isOn(_ cadence: BriefingCadence) -> Bool {
        switch cadence {
        case .morning: return openingEnabled
        case .close: return closeEnabled
        case .weekly: return weeklyEnabled
        }
    }

    var anyCadenceOn: Bool { openingEnabled || closeEnabled || weeklyEnabled }
}

/// One cadence's effective schedule. `configured:false` = the policy is not adopted yet ("schedule pending").
struct BriefingSchedule: Equatable, Sendable {
    let configured: Bool
    /// New York local time, "08:00".
    let localTime: String?
    /// "Monday" (weekly only).
    let weekday: String?
    /// Close only: minutes after the official close.
    let delayMinutes: Int?
    let nextAt: Date?

    init(configured: Bool, localTime: String? = nil, weekday: String? = nil, delayMinutes: Int? = nil, nextAt: Date? = nil) {
        self.configured = configured; self.localTime = localTime; self.weekday = weekday
        self.delayMinutes = delayMinutes; self.nextAt = nextAt
    }

    init?(json: Any?) {
        guard let o = json as? [String: Any] else { return nil }
        // An older server omits `configured`: a schedule with a next instant is configured.
        let next = BriefingJSON.date(o["nextAt"])
        configured = BriefingJSON.bool(o["configured"]) ?? (next != nil)
        localTime = BriefingJSON.string(o["localTime"])
        weekday = BriefingJSON.string(o["weekday"])
        delayMinutes = BriefingJSON.int(o["delayMinutes"])
        nextAt = next
    }
}

struct BriefingSchedules: Equatable, Sendable {
    let timezone: String
    let policyVersion: String?
    let opening: BriefingSchedule?
    let close: BriefingSchedule?
    let weekly: BriefingSchedule?

    init?(json: Any?) {
        guard let o = json as? [String: Any] else { return nil }
        timezone = BriefingJSON.string(o["timezone"]) ?? "America/New_York"
        policyVersion = BriefingJSON.string(o["policyVersion"])
        opening = BriefingSchedule(json: o["opening"])
        close = BriefingSchedule(json: o["close"])
        weekly = BriefingSchedule(json: o["weekly"])
    }

    func schedule(for cadence: BriefingCadence) -> BriefingSchedule? {
        switch cadence {
        case .morning: return opening
        case .close: return close
        case .weekly: return weekly
        }
    }
}

/// Server-published choices: the supported asset universe, the companion allowlist, consent versions.
struct BriefingOptions: Equatable, Sendable {
    let assets: [String]
    let companions: [String]
    let analysisConsentVersion: Int?
    let audioConsentVersion: Int?

    init(assets: [String] = [], companions: [String] = [], analysisConsentVersion: Int? = nil, audioConsentVersion: Int? = nil) {
        self.assets = assets; self.companions = companions
        self.analysisConsentVersion = analysisConsentVersion; self.audioConsentVersion = audioConsentVersion
    }

    init?(json: Any?) {
        guard let o = json as? [String: Any] else { return nil }
        assets = BriefingJSON.strings(o["assets"])
        // Companions may be published as ids or as {id, voice} objects.
        companions = (o["companions"] as? [Any] ?? []).compactMap { item in
            BriefingJSON.string(item) ?? BriefingJSON.string((item as? [String: Any])?["id"])
        }
        let versions = o["consentVersions"] as? [String: Any]
        analysisConsentVersion = BriefingJSON.int(versions?["analysis"])
        audioConsentVersion = BriefingJSON.int(versions?["audio"])
    }
}

/// The whole GET (and PATCH) answer of /api/briefing-settings.
struct BriefingSettingsSnapshot: Equatable, Sendable {
    let settings: BriefingSettings
    /// nil = the server did not say (never read as Pro).
    let eligiblePro: Bool?
    let schedules: BriefingSchedules?
    let options: BriefingOptions?

    init(settings: BriefingSettings, eligiblePro: Bool?, schedules: BriefingSchedules?, options: BriefingOptions?) {
        self.settings = settings; self.eligiblePro = eligiblePro; self.schedules = schedules; self.options = options
    }

    init?(json: Any?) {
        guard let o = json as? [String: Any], let settings = BriefingSettings(json: o) else { return nil }
        self.settings = settings
        eligiblePro = BriefingJSON.bool(o["eligiblePro"])
        schedules = BriefingSchedules(json: o["schedules"])
        options = BriefingOptions(json: o["options"])
    }
}

/// One ready report in the inbox.
struct BriefingInboxItem: Equatable, Identifiable, Sendable {
    let id: String
    let cadence: BriefingCadence
    let periodStart: Date?
    let periodEnd: Date?
    let scheduledAt: Date?
    let dataAsOf: Date?
    let calendarVersion: String?
    let contentVersion: Int
    /// "full" | "partial" | "facts_only"
    let quality: String?
    let audioState: String?

    init?(json: Any?) {
        guard let o = json as? [String: Any], let id = BriefingJSON.uuid(o["id"]),
              let cadence = (o["cadence"] as? String).flatMap(BriefingCadence.init(rawValue:)) else { return nil }
        self.id = id
        self.cadence = cadence
        periodStart = BriefingJSON.date(o["periodStart"])
        periodEnd = BriefingJSON.date(o["periodEnd"])
        scheduledAt = BriefingJSON.date(o["scheduledAt"])
        dataAsOf = BriefingJSON.date(o["dataAsOf"])
        calendarVersion = BriefingJSON.string(o["calendarVersion"])
        contentVersion = BriefingJSON.int(o["contentVersion"]) ?? 1
        quality = BriefingJSON.string(o["quality"])
        audioState = BriefingJSON.string(o["audioState"])
    }
}

/// The newest period state per enabled cadence ("ready" | "preparing" | "unavailable").
struct BriefingLatest: Equatable, Sendable {
    enum State: String, Sendable { case ready, preparing, unavailable }
    let cadence: BriefingCadence
    let periodKey: String?
    let scheduledAt: Date?
    let state: State

    init?(json: Any?) {
        guard let o = json as? [String: Any],
              let cadence = (o["cadence"] as? String).flatMap(BriefingCadence.init(rawValue:)),
              let state = (o["state"] as? String).flatMap(State.init(rawValue:)) else { return nil }
        self.cadence = cadence
        self.state = state
        periodKey = BriefingJSON.string(o["periodKey"])
        scheduledAt = BriefingJSON.date(o["scheduledAt"])
    }
}

struct BriefingInboxPage: Equatable, Sendable {
    let items: [BriefingInboxItem]
    let nextCursor: String?
    let latest: [BriefingLatest]

    init?(json: Any?) {
        guard let o = json as? [String: Any], let rawItems = o["items"] as? [Any] else { return nil }
        items = rawItems.compactMap(BriefingInboxItem.init(json:))
        nextCursor = BriefingJSON.string(o["nextCursor"])
        latest = (o["latest"] as? [Any] ?? []).compactMap(BriefingLatest.init(json:))
    }
}

/// One fact shown next to a section's text (copied from evidence on the server, never from the model).
struct BriefingFact: Equatable, Sendable {
    let label: String
    let value: String
}

struct BriefingSection: Equatable, Sendable {
    /// "market" | "asset" | "risks" | "agenda" | "week"
    let kind: String
    let title: String
    let body: String
    let symbol: String?
    let asOf: Date?
    /// Freshness: "live" | "delayed" | "closed" | "stale" | "missing" | "24_7" | "partial"
    let status: String
    let facts: [BriefingFact]
    let explainer: String?

    static let kinds: Set<String> = ["market", "asset", "risks", "agenda", "week"]

    init?(json: Any?) {
        guard let o = json as? [String: Any], let kind = o["kind"] as? String, Self.kinds.contains(kind),
              let title = o["title"] as? String, let body = o["body"] as? String else { return nil }
        self.kind = kind
        self.title = title
        self.body = body
        symbol = BriefingJSON.string(o["symbol"])
        asOf = BriefingJSON.date(o["asOf"])
        status = BriefingJSON.string(o["status"]) ?? "missing"
        facts = (o["facts"] as? [Any] ?? []).compactMap { raw in
            guard let f = raw as? [String: Any], let label = BriefingJSON.string(f["label"]),
                  let value = BriefingJSON.string(f["value"]) else { return nil }
            return BriefingFact(label: label, value: value)
        }
        explainer = BriefingJSON.string(o["explainer"])
    }
}

struct BriefingSource: Equatable, Sendable {
    let name: String
    let ok: Bool
    let freshness: String
}

/// The equity session label of a report (never imply a live session when it is closed).
struct BriefingEquitySession: Equatable, Sendable {
    let date: String?
    /// "open" | "pre_market" | "after_close" | "closed_weekend" | "closed_holiday" | "unknown"
    let state: String
    let lastSessionDate: String?
    let closeAt: Date?
    let earlyClose: Bool
    let holidayName: String?

    init?(json: Any?) {
        guard let o = json as? [String: Any] else { return nil }
        date = BriefingJSON.string(o["date"])
        state = BriefingJSON.string(o["state"]) ?? "unknown"
        lastSessionDate = BriefingJSON.string(o["lastSessionDate"])
        closeAt = BriefingJSON.date(o["closeAt"])
        earlyClose = BriefingJSON.bool(o["earlyClose"]) ?? false
        holidayName = BriefingJSON.string(o["holidayName"])
    }
}

/// How the personal retrospective was selected; never evidence of asset ownership.
enum BriefingPersonalBasis: String, Sendable {
    case askedAssets = "asked_assets"
    case explicitInterests = "explicit_interests"
    case general
}

/// GET /api/briefing?id= — an immutable, owner-scoped report.
struct BriefingReport: Equatable, Identifiable, Sendable {
    let id: String
    let cadence: BriefingCadence
    let contentVersion: Int
    let periodStart: Date?
    let periodEnd: Date?
    let scheduledAt: Date?
    let dataAsOf: Date?
    let calendarVersion: String?
    let quality: String?
    let title: String
    let opening: String
    let sections: [BriefingSection]
    /// Optional on legacy reports; absent or unknown must not be presented as consented question history.
    let personalBasis: BriefingPersonalBasis?
    /// ≤ 4 spoken segments, each ≤ 800 characters (server-validated; re-checked here).
    let narrationSegments: [String]
    let sources: [BriefingSource]
    let equitySession: BriefingEquitySession?
    /// The frozen companion voice and language of this report (voice requests must match them).
    let voice: String?
    let language: String

    static let maxSegments = 4
    static let maxSegmentChars = 800

    init?(json: Any?) {
        guard let o = json as? [String: Any], let id = BriefingJSON.uuid(o["id"]),
              let cadence = (o["cadence"] as? String).flatMap(BriefingCadence.init(rawValue:)),
              let contentVersion = BriefingJSON.int(o["contentVersion"]) else { return nil }
        self.id = id
        self.cadence = cadence
        self.contentVersion = contentVersion
        periodStart = BriefingJSON.date(o["periodStart"])
        periodEnd = BriefingJSON.date(o["periodEnd"])
        scheduledAt = BriefingJSON.date(o["scheduledAt"])
        dataAsOf = BriefingJSON.date(o["dataAsOf"])
        calendarVersion = BriefingJSON.string(o["calendarVersion"])
        quality = BriefingJSON.string(o["quality"])
        title = o["title"] as? String ?? ""
        opening = o["opening"] as? String ?? ""
        sections = (o["sections"] as? [Any] ?? []).compactMap(BriefingSection.init(json:))
        personalBasis = (o["personalBasis"] as? String).flatMap(BriefingPersonalBasis.init(rawValue:))
        // Out-of-bounds segments are dropped rather than trimmed: a cut sentence would be spoken wrong.
        narrationSegments = Array((o["narrationSegments"] as? [Any] ?? []).compactMap { raw -> String? in
            guard let s = raw as? String, !s.isEmpty, s.count <= Self.maxSegmentChars else { return nil }
            return s
        }.prefix(Self.maxSegments))
        sources = (o["sources"] as? [Any] ?? []).compactMap { raw in
            guard let s = raw as? [String: Any], let name = BriefingJSON.string(s["name"]) else { return nil }
            return BriefingSource(name: name, ok: BriefingJSON.bool(s["ok"]) ?? false,
                                  freshness: BriefingJSON.string(s["freshness"]) ?? "missing")
        }
        equitySession = BriefingEquitySession(json: o["equitySession"])
        voice = BriefingJSON.string(o["voice"])
        let lang = o["language"] as? String ?? "en"
        language = BriefingSettings.narrationLanguages.contains(lang) ? lang : "en"
    }
}

/// POST /api/briefing-device answer: `201`/`200 {registrationId, bindingRevision, installationCredential}`.
struct BriefingDeviceReceipt: Equatable, Sendable {
    let registrationId: String
    let bindingRevision: Int
    /// Present on a first registration and on every rebind (the credential rotates).
    let installationCredential: String?

    init?(json: Any?) {
        guard let o = json as? [String: Any], let registrationId = BriefingJSON.uuid(o["registrationId"]),
              let bindingRevision = BriefingJSON.int(o["bindingRevision"]) else { return nil }
        self.registrationId = registrationId
        self.bindingRevision = bindingRevision
        installationCredential = BriefingJSON.string(o["installationCredential"])
    }
}

/// POST /api/briefing-voice answer: ready (200) or queued/processing (202).
struct BriefingVoiceState: Equatable, Sendable {
    enum State: String, Sendable { case ready, queued, processing, failed }
    let state: State
    let audioId: String
    let mediaType: String?
    let retryAfterSeconds: Double?

    init(state: State, audioId: String, mediaType: String? = nil, retryAfterSeconds: Double? = nil) {
        self.state = state; self.audioId = audioId; self.mediaType = mediaType; self.retryAfterSeconds = retryAfterSeconds
    }

    init?(json: Any?) {
        guard let o = json as? [String: Any], let audioId = BriefingJSON.uuid(o["audioId"]),
              let state = (o["state"] as? String).flatMap(State.init(rawValue:)) else { return nil }
        self.state = state
        self.audioId = audioId
        mediaType = BriefingJSON.string(o["mediaType"])
        retryAfterSeconds = (o["retryAfterSeconds"] as? NSNumber).flatMap { n in
            CFGetTypeID(n) == CFBooleanGetTypeID() ? nil : n.doubleValue
        }.flatMap { $0.isFinite && $0 >= 0 ? min($0, 30) : nil }
    }
}

/// GET /api/briefing-audio outcome.
enum BriefingAudio: Equatable, Sendable {
    case ready(Data)
    case pending(retryAfter: TimeInterval)
    case notFound
    case forbidden
    case unavailable
}

/// What a briefing call came to when it did not succeed. Carries machine codes only: the server's
/// English text is never shown (the app speaks its own localized copy).
enum BriefingsError: Error, Equatable, Sendable {
    /// Nobody is signed in, or the session is over (401).
    case signedOut
    /// A verified account without current Pro where Pro is required (403 subscription_required).
    case subscriptionRequired
    /// Missing or another account's object (404).
    case notFound
    /// A stale revision (409); carries the server's current revision when it said so.
    case conflict(revision: Int?)
    /// Enabling a consent without accepting its current version, or audio without audio consent.
    case consentRequired
    /// Offline, timeout, 408/429/5xx, the account changed mid-request, or the feature is off.
    case unavailable
    /// A definitive refusal; the machine code only.
    case rejected(code: String?)

    /// Localized copy for the settings/report screens (never the server's text).
    var message: String {
        switch self {
        case .signedOut: return L.t("Sign in to manage your briefings", "Inicia sesión para administrar tus resúmenes")
        case .subscriptionRequired: return L.t("Market briefings are part of Bobby Pro", "Los resúmenes de mercado son parte de Bobby Pro")
        case .notFound: return L.t("This briefing is no longer available", "Este resumen ya no está disponible")
        case .conflict: return L.t("Your settings changed on another device — here is the latest", "Tu configuración cambió en otro dispositivo — esta es la más reciente")
        case .consentRequired: return L.t("Accept the current consent first", "Primero acepta el consentimiento vigente")
        case .unavailable: return L.t("Could not reach Bobby — try again in a moment", "No se pudo conectar con Bobby — inténtalo en un momento")
        case .rejected: return L.t("Bobby could not save that — try again", "Bobby no pudo guardar eso — inténtalo de nuevo")
        }
    }
}

/// Mirror of UNAuthorizationStatus, in the server's vocabulary where one exists.
enum PushPermission: String, Equatable, Sendable {
    case notDetermined, denied, authorized, provisional, ephemeral

    /// The client-reported OS state the device endpoint accepts (ephemeral is App Clip only: provisional).
    var serverValue: String { self == .ephemeral ? PushPermission.provisional.rawValue : rawValue }
    /// Whether iOS will show a notification.
    var allowsDelivery: Bool { self == .authorized || self == .provisional || self == .ephemeral }
}
