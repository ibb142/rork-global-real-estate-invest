//
//  RestoreCenterService.swift
//  Ivx
//
//  Calls the IVX Restore Center API (api.ivxholding.com/api/ivx/restore-center/*)
//  — the unified zero-data-loss admin surface. All endpoints are owner-only.
//

import Foundation
import Combine

nonisolated enum RestoreCenterError: LocalizedError {
    case invalidURL
    case httpError(Int)
    case decodingFailed
    case missingOwnerToken

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "The restore center endpoint URL is invalid."
        case .httpError(let code): return "The restore center API returned HTTP \(code)."
        case .decodingFailed: return "The restore center response could not be read."
        case .missingOwnerToken: return "Owner token is required for restore center access."
        }
    }
}

@MainActor
final class RestoreCenterService: ObservableObject {
    static let apiBaseURL = "https://api.ivxholding.com"
    static let basePath = "/api/ivx/restore-center"

    private let ownerToken: String

    init(ownerToken: String) {
        self.ownerToken = ownerToken
    }

    // MARK: - Overview

    struct OverviewResponse: Decodable {
        let ok: Bool
        let overview: Overview?

        struct Overview: Decodable {
            let marker: String?
            let generatedAt: String?
            let fileVault: FileVault?
            let pitr: PitrStatus?
            let twoPersonApprovals: TwoPersonSummary?
            let guardAudit: GuardAuditSummary?
            let protectedTables: [String]?
            let protectedTableCount: Int?
        }

        struct FileVault: Decodable {
            let enabled: Bool?
            let totalSnapshots: Int?
            let lastSnapshotAt: String?
            let lastSnapshotId: String?
            let nextScheduledRun: String?
            let intervalMs: Int?
        }

        struct PitrStatus: Decodable {
            let supabaseReachable: Bool?
            let pitrAlert: String?
            let restoreWindowNote: String?
            let newestWriteAt: String?
            let fileVaultSnapshots: Int?
            let recommendation: String?
        }

        struct TwoPersonSummary: Decodable {
            let pendingCount: Int?
        }

        struct GuardAuditSummary: Decodable {
            let totalLogged: Int?
        }
    }

    func fetchOverview() async throws -> OverviewResponse {
        try await get("/overview", decode: OverviewResponse.self)
    }

    // MARK: - Recovery Drill

    struct DrillResponse: Decodable {
        let ok: Bool
        let report: DrillReport?

        struct DrillReport: Decodable {
            let overallPassed: Bool
            let durationMs: Int
            let summary: Summary
            let steps: [Step]

            struct Summary: Decodable {
                let passed: Int
                let failed: Int
                let total: Int
            }

            struct Step: Decodable {
                let step: String
                let passed: Bool
                let detail: String
            }
        }
    }

    func runDrill() async throws -> DrillResponse {
        try await post("/drill", body: [:], decode: DrillResponse.self)
    }

    // MARK: - Daily Report

    struct ReportResponse: Decodable {
        let ok: Bool
        let report: Report?

        struct Report: Decodable {
            let generatedAt: String
            let date: String
            let backupStatus: BackupStatus
            let rowCounts: [TableCount]
            let vaultSizeNote: String
            let recoveryRisk: String
            let recommendation: String
            let softDeletedCounts: [SoftDeletedCount]?

            struct BackupStatus: Decodable {
                let fileVaultEnabled: Bool
                let fileVaultLastSnapshotAt: String?
                let fileVaultTotalSnapshots: Int
                let supabaseReachable: Bool
            }

            struct TableCount: Decodable {
                let table: String
                let count: Int?
                let exists: Bool
            }

            struct SoftDeletedCount: Decodable {
                let table: String
                let count: Int
            }
        }
    }

    func fetchReport() async throws -> ReportResponse {
        try await get("/report", decode: ReportResponse.self)
    }

    // MARK: - Emergency Export (snapshot now)

    struct ExportResponse: Decodable {
        let ok: Bool
        let export: ExportSummary?

        struct ExportSummary: Decodable {
            let snapshotId: String
            let timestamp: String
            let tables: Int
            let totalRows: Int
            let message: String
        }
    }

    func runEmergencyExport() async throws -> ExportResponse {
        try await post("/export", body: [:], decode: ExportResponse.self)
    }

    // MARK: - Soft-deleted records

    struct DeletedResponse: Decodable {
        let ok: Bool
        let table: String
        let count: Int
        let records: [RecordEntry]?
        let error: String?

        struct RecordEntry: Decodable {
            // Flexible — any columns from the table
            // We decode as a dictionary via a wrapper
        }
    }

    // MARK: - Networking

    private func get<T: Decodable>(_ path: String, decode: T.Type) async throws -> T {
        guard let url = URL(string: Self.apiBaseURL + Self.basePath + path) else {
            throw RestoreCenterError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(ownerToken)", forHTTPHeaderField: "Authorization")
        return try await perform(request, decode: decode)
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any], decode: T.Type) async throws -> T {
        guard let url = URL(string: Self.apiBaseURL + Self.basePath + path) else {
            throw RestoreCenterError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(ownerToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await perform(request, decode: decode)
    }

    private func perform<T: Decodable>(_ request: URLRequest, decode: T.Type) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw RestoreCenterError.httpError(http.statusCode)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw RestoreCenterError.decodingFailed
        }
    }
}
