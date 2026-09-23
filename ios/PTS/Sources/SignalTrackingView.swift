import SwiftUI

/// Live follow-up of a signal: which published prices the market has traded
/// through since publication, computed from real candles, never from claims.
struct SignalTrackingView: View {
    let signal: SignalListItem
    let signalCase: SignalCase
    let quote: SignalQuote

    private var statuses: [MilestoneStatus] {
        SignalTracking.statuses(signalCase.milestones, candles: quote.daily, since: signal.publishedAt, entryAtPublication: signalCase.entryAtPublication)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle().fill(quote.isLive ? Color.green : Theme.secondary).frame(width: 8, height: 8)
                Text("Seguimiento en vivo").font(.headline)
                Spacer()
                Text(quote.isLive ? "\(SignalTracking.timeLabel(quote.asOf)) NY" : "Cierre \(SignalTracking.dayLabel(quote.asOf))")
                    .font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(quote.price, format: .currency(code: "USD").locale(Locale(identifier: "en_US")))
                    .font(.title3.weight(.semibold)).monospacedDigit()
                if let change = quote.changePct {
                    Text(String(format: "%+.2f %% hoy", change * 100)).font(.caption.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(change >= 0 ? Color.green : Color.red)
                }
            }
            ForEach(statuses, id: \.self) { status in
                HStack(spacing: 10) {
                    Image(systemName: status.reachedOn == nil ? "circle" : (status.milestone.title == "Stop" ? "xmark.circle.fill" : "checkmark.circle.fill"))
                        .foregroundStyle(status.reachedOn == nil ? Theme.secondary : (status.milestone.title == "Stop" ? Color.red : Color.green))
                    Text("\(status.milestone.title) \(status.milestone.price.priceText)").font(.subheadline.monospacedDigit())
                    Spacer()
                    Text(detail(status)).font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
                }
                .accessibilityElement(children: .combine)
            }
            Text("Calculado por PTS con precios de mercado desde la publicación, no con la cuenta de \(signal.authorFirstName). Con velas diarias no se conoce el orden dentro de un mismo día.")
                .font(.caption2).foregroundStyle(Theme.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.07)))
        .accessibilityIdentifier("signal-live-tracking")
    }

    private func detail(_ status: MilestoneStatus) -> String {
        if let day = status.reachedOn {
            if status.milestone.title == "Entrada" && signalCase.entryAtPublication { return "activa al publicar" }
            return "alcanzado · \(SignalTracking.dayLabel(day))"
        }
        if status.milestone.afterEntry, statuses.first(where: { $0.milestone.title == "Entrada" })?.reachedOn == nil { return "tras la entrada" }
        let distance = (status.milestone.price / quote.price - 1) * 100
        return String(format: "a %.1f %%", abs(distance))
    }
}
