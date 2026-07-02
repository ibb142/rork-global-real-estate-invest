import SwiftUI

/// Auth Gate — determines whether to show login or the main app.
///
/// Shows a loading state while restoring the session, then routes
/// to LoginView or MainTabView based on authentication state.
struct AuthGateView: View {
    @Environment(AuthViewModel.self) private var authVM

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.09)
                .ignoresSafeArea()

            switch authVM.state {
            case .loading:
                loadingView
            case .unauthenticated:
                LoginView()
            case .authenticated(let session):
                MainTabView(session: session)
            case .error:
                LoginView()
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 20) {
            Image(systemName: "building.2.fill")
                .font(.system(size: 48))
                .foregroundStyle(.white.opacity(0.6))
                .symbolEffect(.pulse)

            Text("IVX Holdings")
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(.white)

            ProgressView()
                .tint(.white.opacity(0.6))
        }
    }
}
