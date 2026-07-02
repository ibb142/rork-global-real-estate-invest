import SwiftUI

@main
struct IvxApp: App {
    @State private var authVM = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            AuthGateView()
                .environment(authVM)
        }
    }
}
