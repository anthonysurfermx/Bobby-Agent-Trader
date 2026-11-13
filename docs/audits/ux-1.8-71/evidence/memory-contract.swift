import Foundation

enum L {
    static var language = "en"
    static func site(_ path: String) -> URL { URL(string: "https://example.invalid/" + path)! }
}
enum CompanionPilot {
    struct Capability {
        let enabled: Bool
        let context: Bool
        let catalog: Int
        let notices: [String]
    }
}

@main struct Contract {
    @MainActor static func main() {
        let cap = CompanionPilot.Capability(enabled: true, context: true, catalog: 1, notices: ["memory-1"])
        var bytes: Data?
        var failing = false
        let store = CompanionContextStore(read: { bytes }, write: { data in
            if failing { return false }
            bytes = data
            return true
        })
        precondition(CompanionCatalog.questions.count == 8)
        store.choose(true)
        store.answered()
        store.answer("interest", value: "crypto")
        precondition(store.accepted && store.state.notes.count == 1)
        precondition(store.wire(capability: cap) != nil)
        precondition(store.correct("interest", value: "companies"))
        precondition(store.state.notes[0].value == "companies")
        precondition(store.delete("interest"))
        precondition(store.state.notes.isEmpty)
        store.answer("interest", value: "crypto")
        store.deleteAll()
        precondition(store.state.notes.isEmpty && store.accepted)
        store.answer("interest", value: "crypto")
        _ = store.bindOwner("account-a")
        precondition(store.accepted)
        precondition(store.bindOwner("account-b"))
        precondition(!store.accepted && store.state.notes.isEmpty && store.wire(capability: cap) == nil)
        store.choose(true)
        store.answered()
        store.answer("interest", value: "crypto")
        failing = true
        store.choose(false)
        print("MEMORY_OFF_WRITE_FAILURE accepted=\(store.accepted) storageError=\(store.storageError) noteCount=\(store.state.notes.count) wireContainsNotes=\(store.wire(capability: cap) != nil)")
        precondition(store.storageError && store.accepted && store.state.notes.count == 1 && store.wire(capability: cap) != nil)
        failing = false
        store.choose(false)
        precondition(!store.accepted && store.state.notes.isEmpty && store.wire(capability: cap) == nil)
        print("PASS happy-path: opt-in, correction, delete-one, delete-all, different-account clearing, successful memory-off")
    }
}
