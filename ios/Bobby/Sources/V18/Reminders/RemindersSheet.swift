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
    }

    var rows: [Row]
    /// The thesis the screen opens on (a nudge or a tap named it), shown first with its choices open.
    var focusId: String?
    var permission: ReminderPermission
    /// An eligible paying account with the weekly briefing off: one quiet row at the end.
    var showsBriefingRow: Bool
    var riskAccepted: Bool

    /// The focused thesis first, then the order of the book (most recently touched first).
    static func make(theses: [SavedThesis], pending: [PendingReminder], scheduling: Set<String> = [], focus: String? = nil,
                     permission: ReminderPermission, showsBriefingRow: Bool = false, riskAccepted: Bool = true) -> RemindersModel {
        let focusId = focus.flatMap { id in theses.first { $0.id.caseInsensitiveCompare(id) == .orderedSame }?.id }
        let ordered = theses.filter { $0.id == focusId } + theses.filter { $0.id != focusId }
        let rows = ordered.map { thesis in
            Row(id: thesis.id, symbol: thesis.symbol, name: thesis.name, why: thesis.hypothesis,
                fireAt: pending.first { $0.thesisId == thesis.id }?.fireAt, busy: scheduling.contains(thesis.id))
        }
        return RemindersModel(rows: rows, focusId: focusId, permission: permission, showsBriefingRow: showsBriefingRow,
                              riskAccepted: riskAccepted)
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
}

// MARK: - The sheet (route `.reminders`)

struct RemindersSheet: View {
    @ObservedObject var session: NucleoSession
    let onClose: () -> Void
    @ObservedObject private var center = ReminderCenter.shared
    @ObservedObject private var briefings = BriefingsCenter.shared
    @ObservedObject private var account = AccountSession.shared
    @State private var theses: [SavedThesis] = []
    @State private var focus: String?
    @State private var ready = false

    private var owner: String? { session.signedIn ? account.session?.userId : nil }

    private var model: RemindersModel {
        .make(theses: theses, pending: center.pending, scheduling: center.scheduling, focus: focus, permission: center.status,
              showsBriefingRow: session.signedIn && ReminderNudges.BriefingOffer.current(briefings).shouldOffer,
              riskAccepted: session.profile.acceptedRiskNotice)
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
                    close: onClose))
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
    /// The row showing its choices.
    @State private var openId: String?
    /// The row showing the day picker.
    @State private var pickingId: String?
    @State private var picked = Date()
    @State private var failedId: String?
    @State private var consentMissing = false
    @State private var appeared = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                Text(ReminderCopy.intro)
                    .font(.system(size: 13)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                    .accessibilityIdentifier("reminders-intro")
                if model.rows.isEmpty {
                    Text(ReminderCopy.empty)
                        .font(.system(size: 14)).foregroundStyle(Theme.cream).fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 22)
                        .accessibilityIdentifier("reminders-empty")
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(model.rows) { row in thesisRow(row) }
                    }
                    .padding(.top, 14)
                }
                if !model.riskAccepted || consentMissing {
                    BriefingNote(text: L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                                           "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores."))
                        .accessibilityIdentifier("reminders-risk-required")
                }
                if model.permission == .denied { deniedFoot }
                if model.showsBriefingRow {
                    BriefingLinkRow(symbol: "calendar", label: ReminderCopy.briefingRow, detail: ReminderCopy.briefingRowDetail,
                                    action: actions.openBriefing)
                        .padding(.top, 18)
                        .accessibilityIdentifier("reminders-briefing")
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .environment(\.locale, L.locale)
        .onAppear {
            guard !appeared else { return }
            appeared = true
            openId = model.initiallyOpen
            if let startsPicking {
                picked = ReminderSchedule.defaultPick(now: Date(), calendar: .autoupdatingCurrent)
                pickingId = startsPicking
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            Text(ReminderCopy.title)
                .font(.system(size: 26, weight: .light, design: .rounded)).foregroundStyle(Theme.cream)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("reminders-title")
            Spacer(minLength: 12)
            Button(action: actions.close) {
                Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmMuted)
                    .frame(width: 30, height: 30).background(Circle().fill(Theme.warmFill))
                    .frame(width: 44, height: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ReminderCopy.close)
            .accessibilityIdentifier("reminders-close")
        }
    }

    // MARK: A thesis

    @ViewBuilder
    private func thesisRow(_ row: RemindersModel.Row) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(row.symbol).font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.cream)
                    if !row.name.isEmpty, row.name.caseInsensitiveCompare(row.symbol) != .orderedSame {
                        Text(row.name).font(.system(size: 13)).foregroundStyle(Theme.warmDim).lineLimit(1)
                    }
                }
                Text(row.why).font(.system(size: 13)).foregroundStyle(Theme.warmMuted).lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("reminders-thesis-\(row.symbol)")

            if row.busy {
                ProgressView().controlSize(.small).tint(Theme.warmMuted).frame(minHeight: 44)
            } else {
                let choosing = openId == row.id || pickingId == row.id
                // The reminder in place stays in view while the person looks at other days.
                if let fireAt = row.fireAt {
                    if choosing { whenLabel(fireAt).frame(minHeight: 34) } else { pendingLine(row, fireAt: fireAt) }
                }
                if pickingId == row.id {
                    picker(row)
                } else if openId == row.id {
                    choices(row)
                } else if row.fireAt == nil {
                    ReminderPill(title: ReminderCopy.setReminder) { open(row) }
                        .accessibilityIdentifier("reminders-set-\(row.symbol)")
                }
            }
            if failedId == row.id {
                Text(ReminderCopy.failed).font(.system(size: 12)).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true).padding(.bottom, 6)
                    .accessibilityIdentifier("reminders-failed")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 12)
        .padding(.bottom, 6)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
    }

    private func pendingLine(_ row: RemindersModel.Row, fireAt: Date) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                whenLabel(fireAt)
                Spacer(minLength: 8)
                pendingButtons(row)
            }
            VStack(alignment: .leading, spacing: 0) {
                whenLabel(fireAt).frame(minHeight: 34)
                HStack(spacing: 8) { pendingButtons(row) }
            }
        }
    }

    private func whenLabel(_ fireAt: Date) -> some View {
        let when = ReminderCopy.when(fireAt)
        return HStack(spacing: 7) {
            Image(systemName: "bell").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.warmDim)
            Text(when).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.cream)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ReminderCopy.reminderOn(when))
        .accessibilityIdentifier("reminders-when")
    }

    @ViewBuilder
    private func pendingButtons(_ row: RemindersModel.Row) -> some View {
        ReminderPill(title: ReminderCopy.change) { open(row) }
            .accessibilityIdentifier("reminders-change-\(row.symbol)")
        ReminderPill(title: ReminderCopy.remove) {
            failedId = nil
            Task { await actions.remove(row) }
        }
        .accessibilityIdentifier("reminders-remove-\(row.symbol)")
    }

    /// The three presets and "Pick a day": one line when it fits, two when it does not, a column
    /// for the largest text sizes.
    private func choices(_ row: RemindersModel.Row) -> some View {
        let presets = ReminderPreset.allCases
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                ForEach(presets) { presetPill($0, row) }
                pickPill(row)
            }
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) { ForEach(presets.prefix(2)) { presetPill($0, row) } }
                HStack(spacing: 8) { ForEach(presets.dropFirst(2)) { presetPill($0, row) }; pickPill(row) }
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(presets) { presetPill($0, row) }
                pickPill(row)
            }
        }
    }

    private func presetPill(_ preset: ReminderPreset, _ row: RemindersModel.Row) -> some View {
        ReminderPill(title: ReminderCopy.preset(preset)) {
            run(row) { await actions.preset(row, preset) }
        }
        .accessibilityIdentifier("reminders-\(preset.rawValue)-\(row.symbol)")
    }

    private func pickPill(_ row: RemindersModel.Row) -> some View {
        ReminderPill(title: ReminderCopy.pickDay) {
            failedId = nil
            picked = ReminderSchedule.defaultPick(now: Date(), calendar: .autoupdatingCurrent)
            pickingId = row.id
        }
        .accessibilityIdentifier("reminders-pick-\(row.symbol)")
    }

    private func picker(_ row: RemindersModel.Row) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            DatePicker(ReminderCopy.dayAndTime, selection: $picked,
                       in: ReminderSchedule.pickRange(now: Date(), calendar: .autoupdatingCurrent),
                       displayedComponents: [.date, .hourAndMinute])
                .datePickerStyle(.compact)
                .font(.system(size: 14)).foregroundStyle(Theme.cream)
                .tint(Theme.orbViolet)
                .frame(minHeight: 44)
                .accessibilityIdentifier("reminders-date-\(row.symbol)")
            HStack(spacing: 8) {
                ReminderPill(title: ReminderCopy.confirmPick, prominent: true) {
                    let date = picked
                    run(row) { await actions.pick(row, date) }
                }
                .accessibilityIdentifier("reminders-confirm-\(row.symbol)")
                ReminderPill(title: ReminderCopy.cancel) { pickingId = nil }
                    .accessibilityIdentifier("reminders-cancel-\(row.symbol)")
            }
        }
        .padding(.top, 4)
    }

    private var deniedFoot: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "bell.slash").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.warmDim)
                Text(ReminderCopy.denied).font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ReminderPill(title: ReminderCopy.openSettings, action: actions.openSettings)
                .accessibilityIdentifier("reminders-open-settings")
        }
        .padding(.top, 18)
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
