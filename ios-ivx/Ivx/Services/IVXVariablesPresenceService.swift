//
//  IVXVariablesPresenceService.swift
//  Ivx
//
//  Fetches the public-safe masked variable presence report from the production
//  IVX backend. No auth required — the endpoint returns only name/provider/
//  present/masked/source/status per variable. Raw secrets are never returned.
//

import Foundation

nonisolated enum IVXVariablesPresenceError: LocalizedError {
    case invalidURL
    case httpError(Int)
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The variables presence endpoint URL is invalid."
        case .httpError(let code):
            return "The variables presence API returned HTTP \(code)."
        case .decodingFailed:
            return "The variables presence response could not be read."
        }
    }
}

nonisolated struct IVXVariablesPresenceService {
    static let apiBaseURL = "https://api.ivxholding.com"
    static let presencePath = "/api/ivx/variables-presence"

    static func fetchPresence() async throws -> IVXVariablesPresenceReport {
        guard let url = URL(string: apiBaseURL + presencePath) else {
            throw IVXVariablesPresenceError.invalidURL
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw IVXVariablesPresenceError.httpError(http.statusCode)
        }
        do {
            return try JSONDecoder().decode(IVXVariablesPresenceReport.self, from: data)
        } catch {
            throw IVXVariablesPresenceError.decodingFailed
        }
    }
}
