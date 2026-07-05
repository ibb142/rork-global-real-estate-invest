//
//  MemberRecord.swift
//  Ivx
//
//  Canonical member registry record served by the IVX backend
//  (GET /api/ivx/members/registry).
//

import Foundation

nonisolated struct MembersRegistryResponse: Codable {
    let ok: Bool
    let total: Int?
    let members: [MemberRecord]
}

nonisolated struct MemberRecord: Codable, Identifiable, Hashable {
    let memberId: String
    let fullName: String?
    let email: String?
    let phone: String?
    let memberType: String?
    let source: String?
    let sourceDetail: String?
    let verificationStatus: String?
    let smsVerified: Bool?
    let emailVerified: Bool?
    let investorInterest: String?
    let preferredZipcode: String?
    let budgetRange: String?
    let authUserId: String?
    let createdAt: String?
    let updatedAt: String?

    var id: String { memberId }

    enum CodingKeys: String, CodingKey {
        case memberId = "member_id"
        case fullName = "full_name"
        case email
        case phone
        case memberType = "member_type"
        case source
        case sourceDetail = "source_detail"
        case verificationStatus = "verification_status"
        case smsVerified = "sms_verified"
        case emailVerified = "email_verified"
        case investorInterest = "investor_interest"
        case preferredZipcode = "preferred_zipcode"
        case budgetRange = "budget_range"
        case authUserId = "auth_user_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var displayName: String {
        let trimmed = (fullName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
        return email ?? "Unknown member"
    }

    var typeLabel: String {
        (memberType ?? "member").replacingOccurrences(of: "_", with: " ").capitalized
    }

    var createdDate: Date? {
        guard let createdAt else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: createdAt) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: createdAt)
    }
}
