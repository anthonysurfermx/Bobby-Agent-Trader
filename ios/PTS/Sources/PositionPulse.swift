import SwiftUI

private struct TrackingResponse: Decodable {
    let candles: [TrackingPoint]
}

private struct TrackingPoint: Decodable, Identifiable {
    let ts: Double
    let close: Double
    var id: Double { ts }
    var date: Date { Date(timeIntervalSince1970: ts / 1000) }
}

struct PositionPulse: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var points: [TrackingPoint] = []
    @State private var selectedDate: Date?
    @State private var checked: Date?
    @State private var dataAsOf: Date?
    @State private var failed = false
    @State private var remoteLoaded = false

    private var selectedPoint: TrackingPoint? {
        guard let date = selectedDate else { return points.last }
        return points.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
    }

    private var bounds: ClosedRange<Double> {
        let lo = points.map(\.close).min() ?? 0
        let hi = points.map(\.close).max() ?? 1
        let pad = max((hi - lo) * 0.15, 0.5)
        return (lo - pad)...(hi + pad)
    }

    private var canPulse: Bool { remoteLoaded && !failed }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("COIN · SEGUIMIENTO").font(.system(size: 10, weight: .semibold)).tracking(1.5)
                Spacer()
                Text("Actualiza cada 5 min").font(.system(size: 10))
            }.foregroundStyle(Theme.accent)

            if let point = selectedPoint, let first = points.first {
                Text(point.close, format: .currency(code: "USD"))
                    .font(.system(size: 38, weight: .medium)).monospacedDigit().contentTransition(.numericText())
                GeometryReader { geometry in
                    let width = max(geometry.size.width - 62, 1)
                    let height: CGFloat = 150
                    let start = first.ts
                    let span = max((points.last?.ts ?? start) - start, 1)
                    let ySpan = bounds.upperBound - bounds.lowerBound
                    ZStack(alignment: .topLeading) {
                        ForEach(0..<4) { tick in
                            let y = height * CGFloat(tick) / 3
                            let price = bounds.upperBound - ySpan * Double(tick) / 3
                            Path { path in
                                path.move(to: CGPoint(x: 0, y: y))
                                path.addLine(to: CGPoint(x: width, y: y))
                            }.stroke(.white.opacity(0.1), lineWidth: 1)
                            Text(String(format: "$%.0f", price))
                                .font(.system(size: 9)).foregroundStyle(.gray)
                                .position(x: width + 28, y: y)
                        }
                        Path { path in
                            for (index, sample) in points.enumerated() {
                                let location = CGPoint(
                                    x: width * (sample.ts - start) / span,
                                    y: height * (bounds.upperBound - sample.close) / ySpan
                                )
                                let previous = index > 0 ? points[index - 1] : nil
                                let marketGap = previous.map { sample.ts - $0.ts > 5_400_000 } ?? true
                                if index == 0 || marketGap { path.move(to: location) } else { path.addLine(to: location) }
                            }
                        }.stroke(Theme.accent, style: StrokeStyle(lineWidth: 2.5, lineJoin: .round))
                        let x = width * (point.ts - start) / span
                        let y = height * (bounds.upperBound - point.close) / ySpan
                        if selectedDate != nil {
                            Path { path in
                                path.move(to: CGPoint(x: x, y: 0))
                                path.addLine(to: CGPoint(x: x, y: height))
                            }.stroke(Theme.accent.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        }
                        Circle().fill(Theme.accent).frame(width: 7, height: 7).position(x: x, y: y)
                        if canPulse {
                            PulseDot().position(x: x, y: y).allowsHitTesting(false)
                        } else {
                            Circle().stroke(Theme.accent.opacity(0.65), lineWidth: 2)
                                .frame(width: 22, height: 22).position(x: x, y: y)
                        }
                        HStack {
                            Text(first.date, format: .dateTime.day().month().hour().minute())
                            Spacer()
                            Text(points.last!.date, format: .dateTime.day().month().hour().minute())
                        }.font(.system(size: 8)).foregroundStyle(.gray).frame(width: width).offset(y: height + 12)
                    }.contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                            let fraction = min(max(value.location.x / width, 0), 1)
                            selectedDate = Date(timeIntervalSince1970: (start + span * fraction) / 1000)
                        }.onEnded { _ in selectedDate = nil })
                }.frame(height: 180)
                HStack {
                    Text(selectedDate == nil ? "Último dato" : "Punto seleccionado")
                    Spacer()
                    Text(point.date, format: .dateTime.day().month().hour().minute())
                }.font(.system(size: 10)).foregroundStyle(.gray)
                Text("Precio de la acción · velas de 1 h · no representa P&L de la opción")
                    .font(.system(size: 10, weight: .medium)).foregroundStyle(Theme.accent.opacity(0.85))
            } else {
                ProgressView().tint(Theme.accent)
            }

            Text("Para reconstruir el resultado faltan el contrato, la entrada y la ejecución. Esta curva es solo el subyacente histórico.")
                .font(.system(size: 11)).foregroundStyle(.gray).lineSpacing(3)

            HStack(spacing: 6) {
                Image(systemName: failed ? "wifi.slash" : remoteLoaded ? "arrow.triangle.2.circlepath" : "archivebox")
                Text(failed ? "Sin conexión · último dato guardado" : remoteLoaded ? "Dato remoto" : "Snapshot incluido")
                Spacer()
                if let dataAsOf {
                    Text("Dato")
                    Text(dataAsOf, format: .dateTime.day().month().hour().minute())
                }
            }.font(.system(size: 9)).foregroundStyle(failed ? .orange : .gray)

            if let checked {
                HStack {
                    Text("Última consulta")
                    Text(checked, format: .dateTime.hour().minute())
                    Spacer()
                    Text("Fuente: mercado · 1 h")
                }.font(.system(size: 9)).foregroundStyle(.gray)
            }
        }.padding(18).background(.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 20))
            .task {
                if let url = Bundle.main.url(forResource: "coin-tracking", withExtension: "json"),
                   let data = try? Data(contentsOf: url) { load(data, remote: false) }
                while !Task.isCancelled {
                    await refresh()
                    do { try await Task.sleep(for: .seconds(300)) } catch { break }
                }
            }
    }

    private func load(_ data: Data, remote: Bool) {
        guard let response = try? JSONDecoder().decode(TrackingResponse.self, from: data) else { return }
        let valid = response.candles.filter { $0.close.isFinite && $0.close > 0 }.sorted { $0.ts < $1.ts }
        guard !valid.isEmpty else { return }
        points = Array(valid.suffix(21))
        dataAsOf = valid.last?.date
        if remote {
            remoteLoaded = true
            failed = false
        }
    }

    private func refresh() async {
        do {
            var request = URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/stock-candles?symbol=COIN&range=7d&interval=1h")!)
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let parsed = try? JSONDecoder().decode(TrackingResponse.self, from: data),
                  !parsed.candles.isEmpty else { throw URLError(.badServerResponse) }
            load(data, remote: true)
            checked = Date()
        } catch {
            failed = true
            checked = Date()
        }
    }
}

private struct PulseDot: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animate = false

    var body: some View {
        Circle().stroke(Theme.accent.opacity(animate ? 0.05 : 0.65), lineWidth: 2)
            .frame(width: 24, height: 24).scaleEffect(animate ? 1 : 0.4)
            .onAppear {
                if !reduceMotion {
                    withAnimation(.easeOut(duration: 1.5).repeatForever(autoreverses: false)) { animate = true }
                }
            }
    }
}
