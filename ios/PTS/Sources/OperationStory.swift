import SwiftUI

struct OperationStory: View {
    @Environment(\.dismiss) private var dismiss
    @State private var stage = 1
    @State private var source = false
    @State private var videos = false
    let explain: () -> Void
    private let labels = ["Nivel 1", "Nivel 2", "Nivel 5"]
    private let levels = [160.07, 171.75, 190.59]
    private let notes = [
        "Este nivel aparece en la publicación, pero su función no está confirmada. La acción y el contrato son piezas distintas.",
        "Este nivel aparece en la publicación, pero no sabemos si representa una entrada, un límite o una referencia de análisis.",
        "Daniel reporta el segundo objetivo superado. La app conserva ese reporte, pero no asigna roles a los niveles ni calcula la opción."
    ]
    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    Text("COIN · CASO HISTÓRICO").font(.system(size: 10, weight: .semibold)).tracking(2).foregroundStyle(Theme.accent)
                    Text("El movimiento,\npunto a punto.").font(.system(size: 32, weight: .medium)).tracking(-1)
                    PositionPulse()
                    VStack(alignment: .leading, spacing: 10) {
                        HStack { Text("REPORTE DEL AUTOR · SIN VERIFICAR").tracking(1.2); Spacer(); Image(systemName: "quote.bubble") }.font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.accent)
                        Text("Más de $1,000 reportados").font(.system(size: 28, weight: .medium)).monospacedDigit()
                        Text("Contrato de opciones · posición abierta al publicar").font(.system(size: 12)).foregroundStyle(.gray)
                        Text("Es una afirmación de PTS, no un cálculo de la app ni una ganancia verificada de tu cuenta.").font(.system(size: 11)).foregroundStyle(.gray).lineSpacing(3)
                        Button("Ver publicación de referencia") { source = true }.font(.system(size: 12)).foregroundStyle(Theme.accent)
                    }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(Theme.accent.opacity(0.07), in: RoundedRectangle(cornerRadius: 20))
                    Text("Explora el plan").font(.system(size: 19, weight: .medium))
                    HStack(spacing: 8) {
                        ForEach(0..<3) { index in
                            Button { withAnimation { stage = index } } label: {
                                Text(labels[index]).font(.system(size: 12, weight: .medium)).frame(maxWidth: .infinity).padding(.vertical, 11)
                                    .foregroundStyle(stage == index ? Theme.bg : .gray)
                                    .background(stage == index ? Theme.accent : .white.opacity(0.04), in: Capsule())
                            }.accessibilityIdentifier("story-stage-\(index)")
                        }
                    }
                    TradingChart(signalCase: .coin, selected: levels[stage]) { _ in }.frame(height: 220)
                    Text(notes[stage]).font(.system(size: 14)).lineSpacing(4).id(stage)
                    Text("Colores = zonas visuales de la demo; no asignan roles operativos. Velas históricas de COIN; no son precios de la opción.").font(.system(size: 10)).foregroundStyle(.gray)
                    Button(action: explain) {
                        Label("Entenderlo con el copiloto", systemImage: "sparkles").font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity).padding(16).foregroundStyle(Theme.bg).background(Theme.accent, in: Capsule())
                    }.accessibilityIdentifier("story-explain")
                    Button { videos = true } label: {
                        HStack { Image(systemName: "play.rectangle"); Text("Daniel explica este setup"); Spacer(); Image(systemName: "arrow.up.right") }.font(.system(size: 13)).foregroundStyle(Theme.accent)
                    }
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Para reconstruir el resultado").font(.system(size: 13, weight: .medium))
                        Text("Faltan tipo de opción, strike, vencimiento, primas, cantidad y comisiones. El cálculo se habilitará cuando tengamos estos datos.").font(.system(size: 12)).foregroundStyle(.gray).lineSpacing(3)
                    }
                }.padding(24)
            }.background(Theme.bg).navigationTitle("La operación").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Listo") { dismiss() } }
                .sheet(isPresented: $videos) { SignalJourney() }
                .sheet(isPresented: $source) {
                    NavigationStack {
                        VStack(alignment: .leading, spacing: 20) {
                            Text("Comentario fijado de PTS").font(.title2)
                            Text("La captura compartida muestra un comentario de @ProTradingSkills que reporta una operación rápida de Coinbase, con más de 1,000 de ganancia en el contrato y menos de 24 horas abierta.")
                            Text("Es una actualización promocional del autor. No incluye el contrato completo ni confirma un cierre. La cifra se conserva como reporte de la fuente, no como cálculo de la app.").foregroundStyle(.gray)
                            Spacer()
                        }.padding(24).background(Theme.bg).toolbar { Button("Listo") { source = false } }
                    }.tint(Theme.accent)
                }
        }.tint(Theme.accent)
    }
}
