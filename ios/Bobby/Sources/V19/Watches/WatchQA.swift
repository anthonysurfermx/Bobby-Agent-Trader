// Watches: DEBUG review fixtures. Recorded answers, no network, no account.
//   `-qa-v18 watches-list`   the list: one watch looking, one met with its note and the thesis reading
//   `-qa-v18 watches-start`  the list opened on an asset to watch
//   `-nucleo-fixtures -qa-watches`  the glass with a scripted server: say "tell me if Nvidia falls 5%"
// Nothing here exists in a Release build.
#if DEBUG
import SwiftUI

@MainActor
enum WatchQA {
    static let activeId = "watch_0123456789abcdef0123456789abcdef"
    static let metId = "watch_fedcba9876543210fedcba9876543210"
    private static func q(_ en: String, _ es: String) -> String { L.isSpanish ? es : en }

    private static func rows(started: Bool) -> [[String: Any]] {
        var rows: [[String: Any]] = []
        if started {
            rows.append(["id": activeId, "symbol": "NVDA", "name": "NVIDIA", "direction": "falls", "percent": 5, "days": 7, "state": "active", "seen": false,
                         "label": q("NVIDIA · closes 5% lower · until November 21", "NVIDIA · cierra 5 % abajo · hasta el 21 de noviembre")])
        }
        rows.append(["id": metId, "symbol": "BTC", "name": "Bitcoin", "direction": "falls", "percent": 5, "days": 7, "state": "met", "seen": false,
                     "label": q("Bitcoin · closes 5% lower · until November 14", "Bitcoin · cierra 5 % abajo · hasta el 14 de noviembre"),
                     "result": ["gist": q("Bitcoin: −6.2% from the close I started watching at.", "Bitcoin: −6,2 % desde el cierre en que empecé a vigilar."),
                                "text": q("Bitcoin: −6.2% from the close I started watching at. Close of November 12 against the close of November 6.",
                                          "Bitcoin: −6,2 % desde el cierre en que empecé a vigilar. Cierre del 12 de noviembre frente al del 6 de noviembre."),
                                "note": ["found": true,
                                         "why": q("Sample: Reuters reported outflows from the largest spot funds during the week. CoinDesk added that a large holder moved coins to exchanges.",
                                                  "Ejemplo: Reuters informó de salidas en los mayores fondos al contado durante la semana. CoinDesk añadió que un gran tenedor movió monedas a plataformas."),
                                         "sources": [["title": "Sample headline", "url": "https://www.reuters.com/", "host": "reuters.com"],
                                                     ["title": "Sample headline", "url": "https://www.coindesk.com/", "host": "coindesk.com"]]]]])
        return rows
    }

    private static func body(started: Bool) -> [String: Any] {
        ["version": 1, "watches": rows(started: started), "limit": 3,
         "options": ["symbols": Array(WatchIntent.names.keys), "directions": ["falls", "rises", "moves"], "percents": [3, 5, 10], "days": [7, 30]]]
    }

    /// A centre whose server is this file: the list at first, the new watch once one is started.
    static func center(started: Bool) -> WatchCenter {
        final class Box: @unchecked Sendable { var started: Bool; init(_ s: Bool) { started = s } }
        let box = Box(started)
        // Recorded up front, in the language of the launch: the transport only picks one.
        let with = body(started: true), without = body(started: false)
        let reading = q("Sample: this touches what you wrote would change your mind, “if the large funds start leaving”.",
                        "Ejemplo: esto toca lo que escribiste que te haría cambiar de opinión, «si los grandes fondos empiezan a salir».")
        let transport = BriefingsTransport(json: { _, _, body, _, _ in
            if body?["op"] as? String == "create" { box.started = true }
            if body?["op"] as? String == "cancel" { box.started = false }
            if body?["op"] as? String == "thesis" { return BriefingsReply(json: ["version": 1, "watchId": metId, "paragraph": reading], status: 200, headers: [:]) }
            return BriefingsReply(json: box.started ? with : without, status: 200, headers: [:])
        }, bytes: { _ in .unavailable })
        return WatchCenter(deps: .init(api: { WatchAPI(transport: transport, auth: .none) }, riskAccepted: { true }, signedIn: { true },
                                       allowNotifications: { true }, delivery: {},
                                       thesis: { _ in WatchThesisWords(hypothesis: "Sample", changeMind: "Sample") }))
    }

    /// One centre per fixture for the whole launch: the screen is rebuilt, its state is not.
    private static var centers: [String: WatchCenter] = [:]
    private static func kept(_ name: String, started: Bool) -> WatchCenter {
        if let center = centers[name] { return center }
        let made = center(started: started)
        centers[name] = made
        return made
    }

    static var fixtures: [String: () -> AnyView] {
        [
            "watches-list": { screen(kept("list", started: true), entry: WatchFocus.Entry(openId: metId)) },
            "watches-start": { screen(kept("start", started: false), entry: WatchFocus.Entry(draft: WatchDraft(symbol: "NVDA", name: "NVIDIA", direction: .falls, percent: 5, days: 7))) },
        ]
    }

    private static func screen(_ center: WatchCenter, entry: WatchFocus.Entry) -> AnyView {
        AnyView(WatchesSheet(center: center, entry: entry) {})
    }

    /// `-qa-watches`: the glass talks to this file instead of the server.
    static func installOnGlass() {
        let scripted = center(started: false)
        WatchCenter.shared = scripted
        Task { await scripted.refresh() }
    }
}
#endif
