import Foundation
import SwiftUI

/// Auth ViewModel — manages owner session state, persistence, and login/recovery flows.
@Observable
final class AuthViewModel {
    var state: AuthState = .loading
    var diagnostic: AuthDiagnostic?
    var isLoading: Bool = false

    private let service = IVXAuthService.shared
    private let sessionKey = "ivx_owner_session"

    init() {
        restoreSession()
    }

    // MARK: - Session Persistence

    private func restoreSession() {
        guard let data = UserDefaults.standard.data(forKey: sessionKey) else {
            state = .unauthenticated
            return
        }
        do {
            let session = try JSONDecoder().decode(OwnerSession.self, from: data)
            if session.isExpired {
                Task { await refreshSession(session) }
            } else {
                state = .authenticated(session)
            }
        } catch {
            state = .unauthenticated
        }
    }

    private func saveSession(_ session: OwnerSession) {
        do {
            let data = try JSONEncoder().encode(session)
            UserDefaults.standard.set(data, forKey: sessionKey)
        } catch {
            // Non-fatal — session still works in memory
        }
    }

    private func clearSession() {
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }

    // MARK: - Login

    func login(email: String, password: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let session = try await service.login(email: email, password: password)
            saveSession(session)
            state = .authenticated(session)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    // MARK: - Refresh

    private func refreshSession(_ oldSession: OwnerSession) async {
        guard let refreshToken = oldSession.refreshToken else {
            state = .unauthenticated
            return
        }
        do {
            let newSession = try await service.refreshSession(refreshToken: refreshToken)
            let merged = OwnerSession(
                accessToken: newSession.accessToken,
                refreshToken: newSession.refreshToken ?? oldSession.refreshToken,
                expiresAt: newSession.expiresAt,
                tokenType: newSession.tokenType,
                userId: oldSession.userId,
                email: oldSession.email,
                emailConfirmed: oldSession.emailConfirmed,
                role: oldSession.role,
                accountType: oldSession.accountType,
                firstName: oldSession.firstName,
                lastName: oldSession.lastName
            )
            saveSession(merged)
            state = .authenticated(merged)
        } catch {
            clearSession()
            state = .unauthenticated
        }
    }

    // MARK: - Recovery

    func sendRecoveryEmail(email: String) async -> AuthActionResult {
        isLoading = true
        defer { isLoading = false }
        do {
            try await service.sendRecoveryEmail(email: email)
            return AuthActionResult(success: true, message: "Reset email sent.")
        } catch {
            return AuthActionResult(success: false, message: error.localizedDescription)
        }
    }

    // MARK: - Repair (V7 emergency)

    func repairOwner(email: String, newPassword: String) async -> AuthActionResult {
        isLoading = true
        defer { isLoading = false }
        do {
            let message = try await service.repairOwner(email: email, newPassword: newPassword)
            return AuthActionResult(success: true, message: message)
        } catch {
            return AuthActionResult(success: false, message: error.localizedDescription)
        }
    }

    // MARK: - Diagnostic

    func fetchDiagnostic() async {
        do {
            diagnostic = try await service.fetchDiagnostic()
        } catch {
            diagnostic = nil
        }
    }

    // MARK: - Logout

    func logout() {
        clearSession()
        state = .unauthenticated
    }

    // MARK: - Clear Error

    func clearError() {
        if case .error = state {
            state = .unauthenticated
        }
    }
}
