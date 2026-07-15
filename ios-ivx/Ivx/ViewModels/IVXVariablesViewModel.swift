//
//  IVXVariablesViewModel.swift
//  Ivx
//
//  Owns the live, masked credential/variable presence state for the
//  Variables/Credentials screen. Loads from the public-safe backend endpoint
//  (no secrets, no auth) and exposes grouped, sortable rows for the UI.
//

import Foundation
import Observation

@Observable
@MainActor
final class IVXVariablesViewModel {
    private(set) var report: IVXVariablesPresenceReport?
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?

    /// Provider display order matching the Android app.
    static let providerOrder: [String] = [
        "github", "render", "supabase", "aws", "ai_gateway",
        "storage", "security", "owner_token", "format_only",
    ]

    var variables: [IVXVariablePresence] {
        (report?.variables ?? []).sorted { lhs, rhs in
            let lIdx = Self.providerOrder.firstIndex(of: lhs.provider) ?? Int.max
            let rIdx = Self.providerOrder.firstIndex(of: rhs.provider) ?? Int.max
            if lIdx != rIdx { return lIdx < rIdx }
            return lhs.name < rhs.name
        }
    }

    var presentCount: Int { report?.present ?? 0 }
    var missingCount: Int { report?.missing ?? 0 }
    var totalCount: Int { report?.total ?? 0 }

    var groupedByProvider: [(provider: String, items: [IVXVariablePresence])] {
        let groups = Dictionary(grouping: variables, by: { $0.provider })
        return Self.providerOrder.compactMap { provider in
            guard let items = groups[provider], !items.isEmpty else { return nil }
            return (provider, items)
        }
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        do {
            let result = try await IVXVariablesPresenceService.fetchPresence()
            report = result
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

extension IVXVariablePresence {
    /// Human-readable provider label matching the Android app.
    var providerLabel: String {
        switch provider {
        case "github": return "GitHub"
        case "render": return "Render"
        case "supabase_anon", "supabase_service", "supabase": return "Supabase"
        case "aws": return "AWS / Amazon"
        case "ai_gateway", "ai": return "AI Gateway"
        case "storage": return "Storage/CDN"
        case "security": return "Security"
        case "owner_token": return "Owner Token"
        case "format_only": return "Format Check"
        default: return provider.capitalized
        }
    }

    /// SF Symbol for the provider.
    var providerIcon: String {
        switch provider {
        case "github": return "network"
        case "render": return "server.rack"
        case "supabase_anon", "supabase_service", "supabase": return "cylinder.split.1x2"
        case "aws", "storage": return "cloud"
        case "ai_gateway", "ai": return "sparkles"
        case "owner_token": return "person.badge.key"
        case "security": return "lock.shield"
        default: return "key.horizontal"
        }
    }

    /// One-line status label for the row.
    var statusLabel: String {
        if !present {
            return "missing"
        }
        switch status {
        case .verified: return "verified"
        case .presentInRuntime: return "present · runtime"
        case .presentButInvalid: return "present · invalid"
        case .presentButUnauthorized: return "present · unauthorized"
        case .presentInRorkNotInjected: return "present not readable"
        case .missingFromRork: return "missing"
        }
    }

    /// Required action for the owner.
    var requiredAction: String {
        if present && status == .verified { return "No action — verified" }
        if present && status == .presentInRuntime { return "Runtime readable — run Test to verify" }
        if present && status == .presentButInvalid { return "Value format invalid — replace" }
        if present && status == .presentButUnauthorized { return "Value rejected by provider — rotate" }
        if present && status == .presentInRorkNotInjected { return "PRESENT_NOT_READABLE — inject into Render env" }
        return "Add credential in owner portal"
    }
}
