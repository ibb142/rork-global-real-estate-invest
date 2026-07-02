import Foundation

/// Owner session data returned by the IVX auth proxy.
struct OwnerSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Int?
    let tokenType: String
    let userId: String?
    let email: String?
    let emailConfirmed: Bool?
    let role: String?
    let accountType: String?
    let firstName: String?
    let lastName: String?

    var isExpired: Bool {
        guard let expiresAt = expiresAt else { return false }
        return Date(timeIntervalSince1970: TimeInterval(expiresAt)) <= Date()
    }

    var displayName: String {
        if let firstName = firstName, !firstName.isEmpty {
            return lastName?.isEmpty == false ? "\(firstName) \(lastName ?? "")" : firstName
        }
        return email ?? "Owner"
    }
}

/// Auth state machine.
enum AuthState: Equatable {
    case loading
    case unauthenticated
    case authenticated(OwnerSession)
    case error(String)
}

/// Result of a non-login auth action (recovery, repair).
struct AuthActionResult: Equatable {
    let success: Bool
    let message: String
}
