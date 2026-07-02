import SwiftUI

/// ContentView is no longer the entry point — AuthGateView handles routing.
/// This file is kept for backwards compatibility with the Xcode project.
struct ContentView: View {
    @Environment(AuthViewModel.self) private var authVM

    var body: some View {
        AuthGateView()
            .environment(authVM)
    }
}
