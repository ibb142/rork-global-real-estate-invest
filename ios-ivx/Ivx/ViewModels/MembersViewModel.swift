//
//  MembersViewModel.swift
//  Ivx
//

import Foundation
import Observation

@Observable
final class MembersViewModel {
    enum TypeFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case member = "Member"
        case investor = "Investor"
        case buyer = "Buyer"
        case owner = "Owner"

        var id: String { rawValue }
    }

    enum SortOrder: String, CaseIterable, Identifiable {
        case newest = "Newest"
        case oldest = "Oldest"
        case nameAZ = "Name A–Z"

        var id: String { rawValue }
    }

    private(set) var members: [MemberRecord] = []
    private(set) var total: Int = 0
    private(set) var isLoading: Bool = false
    private(set) var errorMessage: String?
    private(set) var lastRefreshed: Date?

    var searchText: String = ""
    var typeFilter: TypeFilter = .all
    var sortOrder: SortOrder = .newest

    var filteredMembers: [MemberRecord] {
        var result = members

        if typeFilter != .all {
            let wanted = typeFilter.rawValue.lowercased()
            result = result.filter { ($0.memberType ?? "member").lowercased() == wanted }
        }

        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !query.isEmpty {
            result = result.filter { record in
                record.displayName.localizedStandardContains(query)
                    || (record.email ?? "").localizedStandardContains(query)
                    || (record.phone ?? "").localizedStandardContains(query)
            }
        }

        switch sortOrder {
        case .newest:
            result.sort { ($0.createdDate ?? .distantPast) > ($1.createdDate ?? .distantPast) }
        case .oldest:
            result.sort { ($0.createdDate ?? .distantPast) < ($1.createdDate ?? .distantPast) }
        case .nameAZ:
            result.sort { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        }

        return result
    }

    /// CSV export of the currently filtered members (matches the Android export columns).
    var exportCsv: String {
        let header = "member_id,full_name,email,phone,type,source,verification_status,sms_verified,email_verified,created_at"
        let esc: (String) -> String = { value in
            value.contains(",") || value.contains("\"") || value.contains("\n")
                ? "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\""
                : value
        }
        let lines = filteredMembers.map { m in
            [
                m.memberId,
                m.fullName ?? "",
                m.email ?? "",
                m.phone ?? "",
                m.memberType ?? "",
                m.sourceDetail ?? m.source ?? "",
                m.verificationStatus ?? "",
                String(m.smsVerified == true),
                String(m.emailVerified == true),
                m.createdAt ?? "",
            ].map(esc).joined(separator: ",")
        }
        return ([header] + lines).joined(separator: "\n")
    }

    var investorCount: Int {
        members.filter { ($0.memberType ?? "").lowercased() == "investor" }.count
    }

    var buyerCount: Int {
        members.filter { ($0.memberType ?? "").lowercased() == "buyer" }.count
    }

    var smsVerifiedCount: Int {
        members.filter { $0.smsVerified == true }.count
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        do {
            let response = try await MembersRegistryService.fetchRegistry()
            let sorted = response.members.sorted {
                ($0.createdDate ?? .distantPast) > ($1.createdDate ?? .distantPast)
            }
            members = sorted
            total = response.total ?? sorted.count
            lastRefreshed = Date()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
