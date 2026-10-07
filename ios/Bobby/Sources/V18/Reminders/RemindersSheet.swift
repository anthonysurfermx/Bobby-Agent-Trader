// Reminders (1.8): the screen. Each active thesis with the reminder the person set for it, or the
// four ways to set one. Everything shown is something the person wrote or chose; the only thing
// this screen can make the phone do is show one generic line on the day they picked.
// `RemindersModel` is pure so tests and the review fixtures pin what the screen shows;
// `RemindersContent` draws it and knows nothing about the stores.
import SwiftUI
import UIKit

// MARK: - What the screen shows (pure)

struct RemindersModel: Equatable {
    struct Row: Equatable, Identifiable {
        let id: String
        let symbol: String
        let name: String
        /// The person's own first line: why they are looking at this.
        let why: String
        /// When the pending reminder fires; nil when there is none.
        let fireAt: Date?
        /// iOS is being asked, or the request is being written.
        let busy: Bool

        /// What the row shows for the step the person is on.
        enum Step: Equatable {
            case busy
            /// No reminder: "Set a reminder".
            case set
            /// A reminder in place: its date with Change and Remove.
            case pending
            /// The three presets and "Pick a day".
            case choosing
            /// The day picker.
            case picking
        }

        func step(openId: String?, pickingId: String?) -> Step {
            if busy { return .busy }
            if pickingId == id { return .picking }
            if openId == id { return .choosing }
            return fireAt == nil ? .set : .pending
        }

        /// A reminder in place is never left behind by "Change": while the other days are on screen
        /// one button goes back to it, and to Remove, without changing anything.
        func offersWayBack(_ step: Step) -> Bool { fireAt != nil && step == .choosing }
    }

    var rows: [Row]
    /// The thesis the screen opens on (a nudge or a tap named it), shown first with its choices open.
    var focusId: String?
    var permission: ReminderPermission
    /// An eligible paying account with the weekly briefing off: one quiet row at the end.
    var showsBriefingRow: Bool
    var riskAccepted: Bool
    /// The Follow-ups switch (V18/Harness): nil hides it.
    var followUps: HarnessMode? = nil
    var followUpsSaving = false
    /// Follow-ups are on and the week has something in it: one row opens it.
    var showsWeekRow = false

    /// The focused thesis first, then the order of the book (most recently touched first).
    static func make(theses: [SavedThesis], pending: [PendingReminder], scheduling: Set<String> = [], focus: String? = nil,
                     permission: ReminderPermission, showsBriefingRow: Bool = false, riskAccepted: Bool = true,
                     followUps: HarnessMode? = nil, followUpsSaving: Bool = false, showsWeekRow: Bool = false) -> RemindersModel {
        let focusId = focus.flatMap { id in theses.first { $0.id.caseInsensitiveCompare(id) == .orderedSame }?.id }
        let ordered = theses.filter { $0.id == focusId } + theses.filter { $0.id != focusId }
        let rows = ordered.map { thesis in
            Row(id: thesis.id, symbol: thesis.symbol, name: thesis.name, why: thesis.hypothesis,
                fireAt: pending.first { $0.thesisId == thesis.id }?.fireAt, busy: scheduling.contains(thesis.id))
        }
        return RemindersModel(rows: rows, focusId: focusId, permission: permission, showsBriefingRow: showsBriefingRow,
                              riskAccepted: riskAccepted, followUps: followUps, followUpsSaving: followUpsSaving,
                              showsWeekRow: showsWeekRow && followUps == .on)
    }

    /// The row whose choices are open when the screen appears: the focused thesis, or the only
    /// thesis when it has no reminder yet.
    var initiallyOpen: String? {
        if let focusId, rows.first(where: { $0.id == focusId })?.fireAt == nil { return focusId }
        if rows.count == 1, rows[0].fireAt == nil { return rows[0].id }
        return nil
    }
}

/// What the screen can ask for. The review fixtures pass closures that do nothing.
struct RemindersActions {
    var preset: (RemindersModel.Row, ReminderPreset) async -> ReminderCenter.Outcome
    var pick: (RemindersModel.Row, Date) async -> ReminderCenter.Outcome
    var remove: (RemindersModel.Row) async -> Void
    var openSettings: () -> Void
    var openBriefing: () -> Void
    var close: () -> Void
    /// The Follow-ups switch; true may make iOS ask for permission. False when the risk notice is missing.
    var followUps: (Bool) async -> Bool = { _ in true }
    var openWeek: () -> Void = {}
}

// MARK: - The sheet (route `.reminders`)

struct RemindersSheet: View {
    @ObservedObject var session: NucleoSession
    let onClose: () -> Void
    @ObservedObject private var center = ReminderCenter.shared
    @ObservedObject private var briefings = BriefingsCenter.shared
    @ObservedObject private var account = AccountSession.shared
    @ObservedObject private var harness = HarnessCenter.shared
    @State private var theses: [SavedThesis] = []
    @State private var focus: String?
    @State private var ready = false

    private var owner: String? { session.signedIn ? account.session?.userId : nil }

    private var model: RemindersModel {
        .make(theses: theses, pending: center.pending, scheduling: center.scheduling, focus: focus, permission: center.status,
              showsBriefingRow: session.signedIn && ReminderNudges.BriefingOffer.current(briefings).shouldOffer,
              riskAccepted: session.profile.acceptedRiskNotice,
              followUps: session.harness == nil ? nil : harness.mode, followUpsSaving: harness.saving,
              showsWeekRow: !harness.ledger.assets(since: Date().addingTimeInterval(-7 * 86_400), now: Date()).isEmpty)
    }

    var body: some View {
        Group {
            if ready {
                RemindersContent(model: model, actions: RemindersActions(
                    preset: { row, preset in await center.schedule(thesisId: row.id, symbol: row.symbol, preset: preset) },
                    pick: { row, date in await center.schedule(thesisId: row.id, symbol: row.symbol, at: date) },
                    remove: { row in await center.cancel(thesisId: row.id) },
                    openSettings: { BriefingsCenter.shared.openSystemSettings() },
                    openBriefing: { session.switchSheet(to: .briefingSettings) },
                    close: onClose,
                    followUps: { on in
                        if on { return await harness.accept() != .consentRequired }
                        await harness.turnOff()
                        return true
                    },
                    openWeek: {
                        HarnessBoardFocus.pending = nil
                        session.switchSheet(to: .followUp)
                    }))
            } else {
                Theme.nucleoSurface.ignoresSafeArea()
            }
        }
        .onAppear {
            guard !ready else { return }
            focus = V18Focus.takeThesisId()
            reload()
            ready = true
        }
        // A local read of the permission and of what is still pending: no prompt, no network.
        .task { await center.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: ThesisBook.didChange).receive(on: DispatchQueue.main)) { _ in reload() }
        .onReceive(account.$session) { _ in DispatchQueue.main.async { reload() } }
    }

    private func reload() {
        theses = ThesisBook.shared.active(owner: owner)
    }
}

// MARK: - The content

struct RemindersContent: View {
    let model: RemindersModel
    let actions: RemindersActions
    /// A row that opens on the day picker (the review fixtures show that state).
    var startsPicking: String? = nil
    /// A row that opens on its choices although it has a reminder ("Change" was tapped).
    var startsChanging: String? = nil
    /// The row showing its choices.
    @State private var openId: String?
    /// The row showing the day picker.
    @State private var pickingId: String?
    @State private var picked = Date()
    @State private var failedId: String?
    @State private var consentMissing = false
    @State private var appeared = false

    /// V18-DESIGN.md, "Reminders": one line of scope, then a row per thesis: its date, or the way
    /// to set one. Only the row being set unfolds its four choices.
    var body: some View {
        QuietSheet(title: ReminderCopy.title, subtitle: ReminderCopy.intro, closeId: "reminders-close", onClose: actions.close) {
            VStack(alignment: .leading, spacing: 0) {
                if model.rows.isEmpty {
                    Text(ReminderCopy.empty).quietFont(16).foregroundStyle(Theme.cream).quietWraps()
                        .padding(.top, 8)
                        .accessibilityIdentifier("reminders-empty")
                } else {
                    ForEach(model.rows) { row in thesisRow(row) }
                }
                if let followUps = model.followUps {
                    QuietToggle(label: HarnessCopy.switchLabel, detail: HarnessCopy.switchDetail, isOn: followUps == .on,
                                saving: model.followUpsSaving, enabled: !model.followUpsSaving, id: "reminders-follow-ups") { on in
                        Task { @MainActor in if await !actions.followUps(on) { consentMissing = true } }
                    }
                    .padding(.top, model.rows.isEmpty ? 14 : 0)
                    if model.showsWeekRow {
                        QuietRow(label: HarnessCopy.weekTitle, chevron: true, hairline: true, id: "reminders-week", action: actions.openWeek)
                    }
                }
                if !model.riskAccepted || consentMissing {
                    QuietNote(text: CreditsRestoreNotice.beforeRiskNotice(), id: "reminders-risk-required").padding(.top, 14)
                }
                if model.permission == .denied { deniedFoot }
                if model.showsBriefingRow {
                    QuietRow(label: ReminderCopy.briefingRow, chevron: true, hairline: false, spoken: ReminderCopy.briefingRow + ". " + ReminderCopy.briefingRowDetail,
                             id: "reminders-briefing", action: actions.openBriefing)
                        .padding(.top, 8)
                }
            }
            .padding(.top, 12)
        }
        .environment(\.locale, L.locale)
        .onAppear {
            guard !appeared else { return }
            appeared = true
            openId = startsChanging ?? model.initiallyOpen
            if let startsPicking {
                picked = ReminderSchedule.defaultPick(now: Date(), calendar: .autoupdatingCurrent)
                pickingId = startsPicking
            }
        }
    }

    // MARK: A thesis

    @ViewBuilder
    private func thesisRow(_ row: RemindersModel.Row) -> some View {
        let step = row.step(openId: openId, pickingId: pickingId)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 8) {
                Text(row.symbol).quietFont(17).foregroundStyle(Theme.cream)
                    .accessibilityIdentifier("reminders-thesis-\(row.symbol)")
                Spacer(minLength: 12)
                switch step {
                case .busy:
                    ProgressView().controlSize(.small).tint(Theme.warmMuted)
                case .set:
                    QuietLink(title: ReminderCopy.setReminder, id: "reminders-set-\(row.symbol)") { open(row) }
                case .pending:
                    if let fireAt = row.fireAt {
                        // The date is the control: a tap changes it. Removing it is in the menu.
                        Button { open(row) } label: { whenLabel(fireAt, ink: Theme.cream).frame(minHeight: 44).contentShape(Rectangle()) }
                            .buttonStyle(.plain)
                            .accessibilityHint(ReminderCopy.change)
                            .accessibilityIdentifier("reminders-change-\(row.symbol)")
                        Menu {
                            Button(ReminderCopy.remove, role: .destructive) {
                                failedId = nil
                                Task { await actions.remove(row) }
                            }
                        } label: {
                            QuietGlyph(systemImage: "ellipsis")
                        }
                        .accessibilityLabel(L.t("More options", "Más opciones") + ", " + row.symbol)
                        .accessibilityIdentifier("reminders-remove-\(row.symbol)")
                    }
                case .choosing, .picking:
                    // The reminder in place stays in view until a new day is confirmed.
                    if let fireAt = row.fireAt { whenLabel(fireAt, ink: Theme.warmMuted) }
                }
            }
            .frame(minHeight: 56)
            .padding(.trailing, step == .pending ? -7 : 0)
            if step == .choosing {
                choices(row)
                if row.offersWayBack(step) {
                    QuietLink(title: ReminderCopy.keepDay, id: "reminders-keep-\(row.symbol)") {
                        failedId = nil
                        pickingId = nil
                        openId = nil
                    }
                }
            }
            if step == .picking { picker(row) }
            if failedId == row.id {
                QuietNote(text: ReminderCopy.failed, id: "reminders-failed").padding(.bottom, 8)
            }
            Rectangle().fill(Theme.warmHair).frame(height: 1)
        }
    }

    private func whenLabel(_ fireAt: Date, ink: Color) -> some View {
        let when = ReminderCopy.when(fireAt)
        return HStack(spacing: 7) {
            Image(systemName: "bell").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.warmDim)
            Text(when).quietFont(15, relativeTo: .callout).monospacedDigit().foregroundStyle(ink).quietWraps()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ReminderCopy.reminderOn(when))
        .accessibilityIdentifier("reminders-when")
    }

    /// The three presets and "Choose date": one line when it fits, two when it does not, a column
    /// for the largest text sizes.
    private func choices(_ row: RemindersModel.Row) -> some View {
        let presets = ReminderPreset.allCases
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                ForEach(presets) { presetChip($0, row) }
                pickChip(row)
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) { ForEach(presets.prefix(2)) { presetChip($0, row) } }
                HStack(spacing: 8) { ForEach(presets.dropFirst(2)) { presetChip($0, row) }; pickChip(row) }
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(presets) { presetChip($0, row) }
                pickChip(row)
            }
        }
        .padding(.bottom, 10)
    }

    private func presetChip(_ preset: ReminderPreset, _ row: RemindersModel.Row) -> some View {
        QuietChip(title: ReminderCopy.preset(preset), id: "reminders-\(preset.rawValue)-\(row.symbol)") {
            run(row) { await actions.preset(row, preset) }
        }
    }

    private func pickChip(_ row: RemindersModel.Row) -> some View {
        QuietChip(title: ReminderCopy.pickDay, id: "reminders-pick-\(row.symbol)") {
            failedId = nil
            picked = ReminderSchedule.defaultPick(now: Date(), calendar: .autoupdatingCurrent)
            pickingId = row.id
        }
    }

    private func picker(_ row: RemindersModel.Row) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            DatePicker(ReminderCopy.dayAndTime, selection: $picked,
                       in: ReminderSchedule.pickRange(now: Date(), calendar: .autoupdatingCurrent),
                       displayedComponents: [.date, .hourAndMinute])
                .datePickerStyle(.compact)
                .labelsHidden()
                .tint(Theme.orbViolet)
                .frame(minHeight: 44)
                .accessibilityLabel(ReminderCopy.dayAndTime)
                .accessibilityIdentifier("reminders-date-\(row.symbol)")
            HStack(spacing: 8) {
                QuietChip(title: ReminderCopy.confirmPick, selected: true, id: "reminders-confirm-\(row.symbol)") {
                    let date = picked
                    run(row) { await actions.pick(row, date) }
                }
                QuietChip(title: ReminderCopy.cancel, id: "reminders-cancel-\(row.symbol)") { pickingId = nil }
            }
        }
        .padding(.bottom, 10)
    }

    private var deniedFoot: some View {
        HStack(alignment: .center, spacing: 10) {
            QuietNote(text: ReminderCopy.denied, systemImage: "bell.slash")
            Spacer(minLength: 8)
            QuietLink(title: ReminderCopy.openSettings, id: "reminders-open-settings", action: actions.openSettings)
        }
        .padding(.top, 10)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("reminders-denied")
    }

    // MARK: Taps

    private func open(_ row: RemindersModel.Row) {
        failedId = nil
        pickingId = nil
        openId = row.id
    }

    private func run(_ row: RemindersModel.Row, _ action: @escaping () async -> ReminderCenter.Outcome) {
        failedId = nil
        Task { @MainActor in
            switch await action() {
            case .scheduled(let date):
                openId = nil
                pickingId = nil
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                if UIAccessibility.isVoiceOverRunning {
                    UIAccessibility.post(notification: .announcement, argument: ReminderCopy.reminderOn(ReminderCopy.when(date)))
                }
            case .denied:
                // The foot of the screen says why and where to change it.
                pickingId = nil
            case .consentRequired:
                consentMissing = true
            case .unknownThesis, .failed:
                failedId = row.id
            }
        }
    }
}

/// A capsule button of the profile's family with a full 44 pt tap height.
struct ReminderPill: View {
    let title: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 13, weight: .medium))
                .foregroundStyle(prominent ? Theme.bg : Theme.cream)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14).frame(minHeight: 34)
                .background(Capsule().fill(prominent ? Theme.cream : Theme.warmFill))
                .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: prominent ? 0 : 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
