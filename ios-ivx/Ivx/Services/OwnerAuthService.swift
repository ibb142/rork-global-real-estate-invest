//
//  OwnerAuthService.swift
//  Ivx
//
//  Manual owner sign-in against the SAME production Supabase Auth project
//  the Android app uses (expo/lib/supabase.ts). The owner types their email
//  and password by hand — there is no automatic, silent, or end-to-end sign-in
//  anywhere in this flow. On success the service returns a real Supabase
//  session (access_token, refresh_token, expires_at) the app keeps in memory.
//

import Foundation

enum OwnerAuthError: LocalizedError {
    case badURL
    case notConfigured
    case httpError(Int, String)
    case invalidCredentials
    case emailNotConfirmed
    case rateLimited
    case networkFailure(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return "Invalid Supabase Auth endpoint URL."
        case .notConfigured: return "Supabase is not configured. Rebuild the app with valid credentials."
        case .httpError(let code, let message): return message.isEmpty ? "Sign-in failed (HTTP \(code))." : message
        case .invalidCredentials: return "Invalid email or password. Please check your credentials and try again."
        case .emailNotConfirmed: return "Your email is not confirmed yet. Confirm your email before signing in."
        case .rateLimited: return "Too many sign-in attempts. Please wait a minute and try again."
        case .networkFailure(let message): return message
        }
    }
}

struct OwnerSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Int
    let expiresAtIso: String
    let userId: String
    let email: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
        case userId = "user_id"
        case email
        case expiresAtIso = "expires_at_iso"
    }

    var isExpired: Bool {
        guard expiresAt > 0 else { return true }
        return Date(timeIntervalSince1970: TimeInterval(expiresAt)).addingTimeInterval(-60) <= Date()
    }
}

struct OwnerAuthService {
    /// Production Supabase project — identical to EXPO_PUBLIC_SUPABASE_URL in the Android app.
    private static let fallbackBaseURL = "https://kvclcdjmjghndxsngfzb.supabase.co"
    /// Public anon key — the same client-side key already shipped in the Android bundle.
    private static let fallbackAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk"

    static var baseURL: String {
        let configured = Config.EXPO_PUBLIC_SUPABASE_URL
        if configured.hasPrefix("https://"), configured.contains(".supabase.co") {
            return configured
        }
        return fallbackBaseURL
    }

    static var anonKey: String {
        let configured = Config.EXPO_PUBLIC_SUPABASE_ANON_KEY
        if configured.hasPrefix("eyJ"), configured.count > 100 {
            return configured
        }
        return fallbackAnonKey
    }

    static var isConfigured: Bool {
        return !baseURL.isEmpty && !anonKey.isEmpty
    }

    /// Manual owner sign-in: the owner types their email and password.
    /// Performs a Supabase Auth password grant and returns a real session.
    static func signIn(email: String, password: String) async throws -> OwnerSession {
        guard isConfigured else {
            throw OwnerAuthError.notConfigured
        }
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedPassword = password
        guard !trimmedEmail.isEmpty, !trimmedPassword.isEmpty else {
            throw OwnerAuthError.invalidCredentials
        }

        guard let url = URL(string: "\(baseURL)/auth/v1/token?grant_type=password") else {
            throw OwnerAuthError.badURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")

        let body: [String: String] = ["email": trimmedEmail, "password": trimmedPassword]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw OwnerAuthError.networkFailure(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw OwnerAuthError.networkFailure("No HTTP response from Supabase Auth.")
        }

        let raw = String(data: data, encoding: .utf8) ?? ""
        guard let parsed = try? JSONDecoder().decode(SupabaseTokenResponse.self, from: data) else {
            if http.statusCode == 400 || http.statusCode == 401 {
                throw OwnerAuthError.invalidCredentials
            }
            if http.statusCode == 429 {
                throw OwnerAuthError.rateLimited
            }
            throw OwnerAuthError.httpError(http.statusCode, raw)
        }

        if http.statusCode == 400 || http.statusCode == 401 {
            let lower = (parsed.errorDescription ?? parsed.error ?? parsed.msg ?? "").lowercased()
            if lower.contains("email") && lower.contains("confirm") {
                throw OwnerAuthError.emailNotConfirmed
            }
            throw OwnerAuthError.invalidCredentials
        }
        if http.statusCode == 429 {
            throw OwnerAuthError.rateLimited
        }
        guard (200...299).contains(http.statusCode),
              let accessToken = parsed.accessToken,
              let refreshToken = parsed.refreshToken,
              let userId = parsed.user?.id,
              let emailValue = parsed.user?.email else {
            throw OwnerAuthError.httpError(http.statusCode, parsed.errorDescription ?? parsed.error ?? "")
        }

        let expiresAt = parsed.expiresAt ?? 0
        return OwnerSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            expiresAtIso: expiresAt > 0
                ? ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: TimeInterval(expiresAt)))
                : ISO8601DateFormatter().string(from: Date()),
            userId: userId,
            email: emailValue
        )
    }
}

private struct SupabaseTokenResponse: Decodable {
    let accessToken: String?
    let refreshToken: String?
    let expiresAt: Int?
    let user: SupabaseUser?
    let error: String?
    let errorDescription: String?
    let msg: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
        case user
        case error
        case errorDescription = "error_description"
        case msg
    }
}

private struct SupabaseUser: Decodable {
    let id: String?
    let email: String?
}
