// Bobby Pro market briefings — "Your briefings" (build 53): the account's ready reports, newest first.
// The entry that still works when a notification was missed. Invariants:
//  - Everything listed comes from GET /api/briefings through BriefingsCenter (owner-scoped, Pro): no
//    report is ever kept on the phone, and an account change empties the list at once (the center).
//  - A period whose report is not there says so honestly ("Today's briefing isn't available"), from the
//    server's `latest` state; a dependency failure is an error with retry, never an empty inbox.
//  - Opening a row fetches the report again (the server re-authorizes owner + Pro); nothing is generated.
import SwiftUI

struct BriefingInboxView: View {
    @ObservedObject var center: BriefingsCenter = .shared
    let onShowPro: () -> Void
    @State private var loadingMore = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                notices
                content
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .navigationTitle(L.t("Your briefings", "Tus resúmenes"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.nucleoSurface, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await center.refreshInbox() }
        .refreshable { await center.refreshInbox() }
    }

    /// Periods that are being prepared or could not be prepared (newest state per enabled cadence).
    @ViewBuilder private var notices: some View {
        ForEach(center.latest.compactMap { latest in BriefingCopy.latestNotice(latest).map { (latest, $0) } }, id: \.0.cadence) { latest, line in
            HStack(spacing: 10) {
                Image(systemName: latest.state == .unavailable ? "exclamationmark.circle" : "hourglass")
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(latest.state == .unavailable ? Theme.cio : Theme.warmMuted)
                Text(line).font(.system(size: 13)).foregroundStyle(Theme.cream).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.nucleoGlass))
            .padding(.top, 10)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("briefings-latest-\(latest.cadence.rawValue)")
        }
    }

    @ViewBuilder private var content: some View {
        if let error = center.inboxError, center.inbox.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(error.message).font(.system(size: 13)).foregroundStyle(error == .subscriptionRequired ? Theme.cream : Theme.down)
                    .fixedSize(horizontal: false, vertical: true)
                if error == .subscriptionRequired {
                    BriefingPillButton(title: L.t("See Bobby Pro", "Ver Bobby Pro"), prominent: true, action: onShowPro)
                        .accessibilityIdentifier("briefings-inbox-pro")
                } else {
                    BriefingPillButton(title: L.t("Try again", "Reintentar")) { Task { await center.refreshInbox() } }
                        .accessibilityIdentifier("briefings-inbox-retry")
                }
            }
            .padding(.top, 24)
        } else if !center.inboxLoaded {
            ProgressView().tint(Theme.warmMuted).frame(maxWidth: .infinity).padding(.top, 40)
        } else if center.inbox.isEmpty {
            Text(L.t("No briefings yet. When one is ready, it shows up here.",
                     "Todavía no hay resúmenes. Cuando uno esté listo, aparece aquí."))
                .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                .padding(.top, 24)
                .accessibilityIdentifier("briefings-inbox-empty")
        } else {
            ForEach(center.inbox) { item in
                NavigationLink(value: BriefingsPath.report(item.id)) { row(item) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("briefings-inbox-row-\(item.id)")
            }
            if center.nextCursor != nil {
                Button {
                    guard !loadingMore else { return }
                    loadingMore = true
                    Task { await center.loadMoreInbox(); loadingMore = false }
                } label: {
                    Group {
                        if loadingMore { ProgressView().tint(Theme.warmMuted) } else { Text(L.t("Show older", "Ver anteriores")) }
                    }
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.warmMuted)
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("briefings-inbox-more")
            }
            if let error = center.inboxError {
                Text(error.message).font(.system(size: 12)).foregroundStyle(Theme.down).padding(.top, 8)
            }
        }
    }

    private func row(_ item: BriefingInboxItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: item.cadence == .weekly ? "calendar" : item.cadence == .close ? "sunset" : "sun.horizon")
                .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.warmMuted)
                .frame(width: 32, height: 32).background(Theme.warmFill)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(BriefingCopy.cadence(item.cadence)).font(.system(size: 15)).foregroundStyle(Theme.cream)
                if let date = item.scheduledAt ?? item.periodEnd ?? item.periodStart {
                    Text(BriefingFormat.inboxDate(date)).font(.mono(10.5)).foregroundStyle(Theme.warmDim)
                }
            }
            Spacer(minLength: 8)
            if let badge = BriefingCopy.quality(item.quality) { BriefingBadge(text: badge, tint: Theme.cio) }
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.warmDim)
        }
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .padding(.vertical, 6)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        .contentShape(Rectangle())
    }
}
