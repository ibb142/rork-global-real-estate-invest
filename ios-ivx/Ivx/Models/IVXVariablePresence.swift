//
//  IVXVariablePresence.swift
//  Ivx
//
//  Masked, secret-free representation of a backend credential/variable.
//  Mirrors the public-safe /api/ivx/variables-presence payload. The raw
//  secret value is NEVER present in this model — only name, provider,
//  presence, masked preview, source, status, and description.
//

import Foundation

nonisolated enum IVXVariableStatus: String, Codable, Sendable {
    case missingFromRork = "MISSING_FROM_RORK"
    case presentInRorkNotInjected = "PRESENT_IN_RORK_NOT_INJECTED"
    case presentInRuntime = "PRESENT_IN_RUNTIME"
    case presentButInvalid = "PRESENT_BUT_INVALID"
    case presentButUnauthorized = "PRESENT_BUT_UNAUTHORIZED"
    case verified = "VERIFIED"
}

nonisolated struct IVXVariablePresence: Codable, Identifiable, Sendable {
    let name: String
    let provider: String
    let present: Bool
    let masked: String?
    let source: String
    let status: IVXVariableStatus
    let isPublic: Bool
    let description: String

    var id: String { name }
}

nonisolated struct IVXVariablesPresenceReport: Codable, Sendable {
    let ok: Bool
    let marker: String
    let generatedAt: String
    let runtimeLabel: String
    let total: Int
    let present: Int
    let missing: Int
    let variables: [IVXVariablePresence]
    let secretValuesReturned: Bool
}
