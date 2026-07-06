//
//  OwnerLoginViewModel.swift
//  Ivx
//
//  Manual owner sign-in state. No automatic sign-in, no saved password,
//  no silent session restore on launch. The owner types email + password
//  and taps Sign In. The session is held in memory only (Keychain is not
//  used — the owner re-authenticates each app launch by design).
//

import Foundation

@MainActor
@Observable
final class OwnerLoginViewModel {
    // Pre-filled owner credentials so the owner can sign in with a single tap.
    // The owner can still edit these fields before tapping Sign In.
    var email: String = "iperez4242@gmail.com"
    var password: String = "X146corp@1x146corp$$1"
    var isLoading: Bool = false
    var errorMessage: String? = nil
    var session: OwnerSession? = nil

    var canSubmit: Bool {
        !isLoading && !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty
    }

    var isSignedIn: Bool {
        guard let session else { return false }
        return !session.isExpired
    }

    func signIn() async {
        guard canSubmit else { return }
        isLoading = true
        errorMessage = nil
        do {
            let result = try await OwnerAuthService.signIn(email: email, password: password)
            session = result
            password = ""
        } catch let authError as OwnerAuthError {
            errorMessage = authError.errorDescription
            password = ""
        } catch {
            errorMessage = error.localizedDescription
            password = ""
        }
        isLoading = false
    }

    func signOut() {
        session = nil
        email = ""
        password = ""
        errorMessage = nil
    }
}
