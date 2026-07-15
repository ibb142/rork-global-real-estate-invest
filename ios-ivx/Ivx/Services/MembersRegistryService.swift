//
//  MembersRegistryService.swift
//  Ivx
//
//  Fetches the canonical members registry from the production IVX backend.
//  No direct database access — all reads go through the backend API, which
//  serves one deduped row per landing registration.
//

import Foundation

nonisolated enum MembersRegistryError: LocalizedError {
    case invalidURL
    case httpError(Int)
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The registry endpoint URL is invalid."
        case .httpError(let code):
            return "The registry API returned HTTP \(code)."
        case .decodingFailed:
            return "The registry response could not be read."
        }
    }
}

nonisolated struct MembersRegistryService {
    static let apiBaseURL = "https://api.ivxholding.com"
    static let registryPath = "/api/ivx/members/registry"
    static let countPath = "/api/ivx/members/count"
    static let dealsPath = "/api/ivx/jv-deals"

    static func fetchRegistry(limit: Int = 1000) async throws -> MembersRegistryResponse {
        guard var components = URLComponents(string: apiBaseURL + registryPath) else {
            throw MembersRegistryError.invalidURL
        }
        components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        guard let url = components.url else {
            throw MembersRegistryError.invalidURL
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw MembersRegistryError.httpError(http.statusCode)
        }

        do {
            return try JSONDecoder().decode(MembersRegistryResponse.self, from: data)
        } catch {
            throw MembersRegistryError.decodingFailed
        }
    }

    static func fetchCounts() async throws -> MembersCountsResponse {
        guard let url = URL(string: apiBaseURL + countPath) else {
            throw MembersRegistryError.invalidURL
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw MembersRegistryError.httpError(http.statusCode)
        }

        let counts = try JSONDecoder().decode(MembersCountsResponse.self, from: data)
        let deals = try await fetchLiveDealCount()
        return MembersCountsResponse(
            ok: counts.ok,
            members: counts.members,
            waitlist: counts.waitlist,
            investors: counts.investors,
            buyers: counts.buyers,
            total: counts.total,
            liveDeals: deals
        )
    }

    static func fetchLiveDealCount() async throws -> Int {
        guard let url = URL(string: apiBaseURL + dealsPath) else {
            throw MembersRegistryError.invalidURL
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw MembersRegistryError.httpError(http.statusCode)
        }

        do {
            let payload = try JSONDecoder().decode(JVDealsCountResponse.self, from: data)
            return payload.count ?? payload.deals.count
        } catch {
            throw MembersRegistryError.decodingFailed
        }
    }
}
