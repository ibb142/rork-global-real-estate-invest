import Foundation

/// IVX Owner Authentication Service
///
/// Communicates with the IVX backend auth proxy at api.ivxholding.com.
/// The proxy uses the server-side Supabase service role key to authenticate
/// the owner, bypassing the missing anon key on Render production.
///
/// Endpoints:
///   POST /api/ivx/owner-auth/login     — email + password → session
///   POST /api/ivx/owner-auth/refresh   — refresh token → new session
///   POST /api/ivx/owner-auth/recover   — email → reset email
///   POST /api/ivx/owner-auth/repair    — email + newPassword → V7 repair
///   GET  /api/ivx/owner-auth/diagnostic — backend readiness
final class IVXAuthService {
    static let shared = IVXAuthService()

    private let baseURL: String
    private let session: URLSession

    private init() {
        let configuredURL = (Bundle.main.infoDictionary?["IVX_API_BASE_URL"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.baseURL = configuredURL.isEmpty ? "https://api.ivxholding.com" : configuredURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 30
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    // MARK: - Login

    func login(email: String, password: String) async throws -> OwnerSession {
        let body: [String: Any] = [
            "email": email.trimmingCharacters(in: .whitespaces).lowercased(),
            "password": password,
        ]
        let data = try await postJSON("/api/ivx/owner-auth/login", body: body)
        let response = try JSONDecoder().decode(AuthLoginResponse.self, from: data)
        guard response.ok, let session = response.session else {
            throw IVXAuthError.loginFailed(response.error ?? "Authentication failed.")
        }
        return OwnerSession(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresAt: session.expiresAt,
            tokenType: session.tokenType ?? "bearer",
            userId: response.user?.id,
            email: response.user?.email,
            emailConfirmed: response.user?.emailConfirmed,
            role: response.user?.role,
            accountType: response.user?.accountType,
            firstName: response.user?.firstName,
            lastName: response.user?.lastName
        )
    }

    // MARK: - Refresh

    func refreshSession(refreshToken: String) async throws -> OwnerSession {
        let body: [String: Any] = ["refreshToken": refreshToken]
        let data = try await postJSON("/api/ivx/owner-auth/refresh", body: body)
        let response = try JSONDecoder().decode(AuthRefreshResponse.self, from: data)
        guard response.ok, let session = response.session else {
            throw IVXAuthError.refreshFailed(response.error ?? "Token refresh failed.")
        }
        return OwnerSession(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresAt: session.expiresAt,
            tokenType: session.tokenType ?? "bearer",
            userId: nil, email: nil, emailConfirmed: nil,
            role: nil, accountType: nil, firstName: nil, lastName: nil
        )
    }

    // MARK: - Recover (send reset email)

    func sendRecoveryEmail(email: String) async throws {
        let body: [String: Any] = [
            "email": email.trimmingCharacters(in: .whitespaces).lowercased(),
        ]
        let data = try await postJSON("/api/ivx/owner-auth/recover", body: body)
        let response = try JSONDecoder().decode(AuthSimpleResponse.self, from: data)
        guard response.ok else {
            throw IVXAuthError.recoveryFailed(response.error ?? "Could not send reset email.")
        }
    }

    // MARK: - Repair (V7 emergency password reset)

    func repairOwner(email: String, newPassword: String, phone: String? = nil) async throws -> String {
        var body: [String: Any] = [
            "email": email.trimmingCharacters(in: .whitespaces).lowercased(),
            "newPassword": newPassword,
        ]
        if let phone = phone, !phone.isEmpty {
            body["phone"] = phone
        }
        let data = try await postJSON("/api/ivx/owner-auth/repair", body: body)
        let response = try JSONDecoder().decode(AuthRepairResponse.self, from: data)
        guard response.ok else {
            throw IVXAuthError.repairFailed(response.error ?? "Owner repair failed.")
        }
        return response.message ?? "Owner password reset. You can now sign in."
    }

    // MARK: - Diagnostic

    func fetchDiagnostic() async throws -> AuthDiagnostic {
        let url = URL(string: "\(baseURL)/api/ivx/owner-auth/diagnostic")!
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode(AuthDiagnostic.self, from: data)
    }

    // MARK: - Private

    private func postJSON(_ path: String, body: [String: Any]) async throws -> Data {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw IVXAuthError.networkError("No HTTP response from server.")
        }
        // 401/403/400 still return JSON with error info — don't throw on status,
        // let the caller decode the error message.
        _ = httpResponse.statusCode
        return data
    }
}

// MARK: - Errors

enum IVXAuthError: LocalizedError {
    case loginFailed(String)
    case refreshFailed(String)
    case recoveryFailed(String)
    case repairFailed(String)
    case networkError(String)
    case decodeError(String)

    var errorDescription: String? {
        switch self {
        case .loginFailed(let msg): return msg
        case .refreshFailed(let msg): return msg
        case .recoveryFailed(let msg): return msg
        case .repairFailed(let msg): return msg
        case .networkError(let msg): return msg
        case .decodeError(let msg): return msg
        }
    }
}

// MARK: - Response DTOs

struct AuthSessionDTO: Codable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Int?
    let expiresInSeconds: Int?
    let tokenType: String?
}

struct AuthUserDTO: Codable {
    let id: String?
    let email: String?
    let emailConfirmed: Bool?
    let createdAt: String?
    let role: String?
    let accountType: String?
    let firstName: String?
    let lastName: String?
}

struct AuthLoginResponse: Codable {
    let ok: Bool
    let session: AuthSessionDTO?
    let user: AuthUserDTO?
    let error: String?
    let maskedEmail: String?
}

struct AuthRefreshResponse: Codable {
    let ok: Bool
    let session: AuthSessionDTO?
    let error: String?
}

struct AuthSimpleResponse: Codable {
    let ok: Bool
    let error: String?
    let sent: Bool?
    let message: String?
}

struct AuthRepairResponse: Codable {
    let ok: Bool
    let error: String?
    let message: String?
    let action: String?
    let loginReady: Bool?
}

struct AuthDiagnosticBackend: Codable {
    let supabaseUrlPresent: Bool?
    let serviceRoleKeyPresent: Bool?
    let anonKeyPresent: Bool?
    let anonKeyMissing: Bool?
    let authProxyActive: Bool?
    let bypassesAnonKey: Bool?
}

struct AuthDiagnostic: Codable {
    let ok: Bool?
    let backend: AuthDiagnosticBackend?
    let deploymentMarker: String?
}
