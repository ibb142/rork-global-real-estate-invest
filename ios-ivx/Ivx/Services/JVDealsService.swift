//
//  JVDealsService.swift
//  Ivx
//
//  Reads published deals from the SAME production Supabase table
//  (`jv_deals`) that the Android app renders (expo/lib/jv-storage.ts),
//  so both apps show identical live data end to end.
//

import Foundation

enum JVDealsServiceError: LocalizedError {
    case badURL
    case httpError(Int)

    var errorDescription: String? {
        switch self {
        case .badURL: return "Invalid deals endpoint URL."
        case .httpError(let code): return "Deals request failed (HTTP \(code))."
        }
    }
}

struct JVDealsService {
    /// Production Supabase project — identical to EXPO_PUBLIC_SUPABASE_URL in the Android app.
    private static let fallbackBaseURL = "https://kvclcdjmjghndxsngfzb.supabase.co"
    /// Public anon key — the same client-side key already shipped inside the Android bundle.
    private static let fallbackAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk"

    private static var baseURL: String {
        let configured = Config.EXPO_PUBLIC_SUPABASE_URL
        if configured.hasPrefix("https://"), configured.contains(".supabase.co") {
            return configured
        }
        return fallbackBaseURL
    }

    private static var anonKey: String {
        let configured = Config.EXPO_PUBLIC_SUPABASE_ANON_KEY
        if configured.hasPrefix("eyJ"), configured.count > 100 {
            return configured
        }
        return fallbackAnonKey
    }

    /// Fetches all published JV deals, newest first — same query the Android app runs.
    static func fetchPublishedDeals() async throws -> [JVDeal] {
        let select = "id,title,project_name,type,status,min_investment,expected_roi,profit_split,city,state,property_address,first_photo:photos-%3E0"
        let urlString = "\(baseURL)/rest/v1/jv_deals?select=\(select)&published=eq.true&order=created_at.desc&limit=50"
        guard let url = URL(string: urlString) else {
            throw JVDealsServiceError.badURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw JVDealsServiceError.httpError(http.statusCode)
        }
        return try JSONDecoder().decode([JVDeal].self, from: data)
    }
}
