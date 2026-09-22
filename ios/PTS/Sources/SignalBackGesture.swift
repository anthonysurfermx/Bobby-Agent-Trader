import SwiftUI

// Keep UIKit's interactive edge-back gesture with the explicit text navigation bar.
struct SignalBackGesture: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ controller: Controller, context: Context) {}

    final class Controller: UIViewController, UIGestureRecognizerDelegate {
        private weak var gesture: UIGestureRecognizer?
        private weak var originalDelegate: UIGestureRecognizerDelegate?

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard let recognizer = navigationController?.interactivePopGestureRecognizer else { return }
            gesture = recognizer
            if recognizer.delegate !== self {
                originalDelegate = recognizer.delegate
                recognizer.delegate = self
            }
            recognizer.isEnabled = true
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            if gesture?.delegate === self { gesture?.delegate = originalDelegate }
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let navigationController else { return false }
            return navigationController.viewControllers.count > 1 && navigationController.transitionCoordinator == nil
        }
    }
}
