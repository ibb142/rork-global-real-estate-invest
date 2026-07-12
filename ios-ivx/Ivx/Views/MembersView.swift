//
//  MembersView.swift
//  Ivx
//
//  Live Members registry — reads the canonical registry API
//  (api.ivxholding.com/api/ivx/members/registry). No mock data.
//

import SwiftUI

struct MembersView: View {
    @State private var viewModel = MembersViewModel()
    @State private var selectedMember: MemberRecord?

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.members.isEmpty {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Loading live registry…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = viewModel.errorMessage, viewModel.members.isEmpty {
                    ContentUnavailableView {
                        Label("Registry Unavailable", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") {
                            Task { await viewModel.load() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    membersList
                }
            }
            .navigationTitle("Members")
            .background(Color.ivxBackground)
            .toolbarBackground(Color.ivxBackground, for: .navigationBar)
            .searchable(text: $viewModel.searchText, prompt: "Search name, email, phone")
            .refreshable { await viewModel.load() }
            .task { await viewModel.load() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $viewModel.sortOrder) {
                            ForEach(MembersViewModel.SortOrder.allCases) { order in
                                Text(order.rawValue).tag(order)
                            }
                        }
                        ShareLink(
                            item: viewModel.exportCsv,
                            preview: SharePreview("ivx-members.csv")
                        ) {
                            Label("Export CSV", systemImage: "square.and.arrow.up")
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down.circle")
                            .foregroundStyle(Color.ivxGold)
                    }
                }
            }
            .sheet(item: $selectedMember) { member in
                MemberDetailSheet(member: member)
                    .presentationDetents([.medium, .large])
                    .presentationContentInteraction(.scrolls)
            }
        }
    }

    private var membersList: some View {
        List {
            Section {
                statsHeader
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            Section {
                Picker("Type", selection: $viewModel.typeFilter) {
                    ForEach(MembersViewModel.TypeFilter.allCases) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
            }

            Section {
                if viewModel.filteredMembers.isEmpty {
                    Text("No members match the current filter.")
                        .font(.subheadline)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .listRowBackground(Color.ivxCard)
                } else {
                    ForEach(viewModel.filteredMembers) { member in
                        Button {
                            selectedMember = member
                        } label: {
                            MemberRow(member: member)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.ivxCard)
                        .contextMenu {
                            Button {
                                UIPasteboard.general.string = member.memberId
                            } label: {
                                Label("Copy Member ID", systemImage: "doc.on.doc")
                            }
                            if let email = member.email, !email.isEmpty {
                                Button {
                                    UIPasteboard.general.string = email
                                } label: {
                                    Label("Copy Email", systemImage: "envelope")
                                }
                            }
                        }
                    }
                }
            } header: {
                Text("\(viewModel.filteredMembers.count) shown · source: landing registrations")
            } footer: {
                if let refreshed = viewModel.lastRefreshed {
                    Text("Live from api.ivxholding.com · refreshed \(refreshed.formatted(date: .omitted, time: .standard))")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.ivxBackground)
    }

    private var statsHeader: some View {
        HStack(spacing: 10) {
            RegistryStat(value: "\(viewModel.total)", label: "Total", icon: "person.3.fill", tint: .ivxGold)
            RegistryStat(value: "\(viewModel.investorCount)", label: "Investors", icon: "chart.line.uptrend.xyaxis", tint: .ivxGreen)
            RegistryStat(value: "\(viewModel.buyerCount)", label: "Buyers", icon: "house.fill", tint: .ivxOrange)
            RegistryStat(value: "\(viewModel.smsVerifiedCount)", label: "SMS ✓", icon: "checkmark.shield.fill", tint: .ivxGreen)
        }
    }
}

private struct RegistryStat: View {
    let value: String
    let label: String
    let icon: String
    let tint: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(tint)
            Text(value)
                .font(.headline)
                .fontWeight(.bold)
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.ivxTextSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }
}

private struct MemberRow: View {
    let member: MemberRecord

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(typeColor.opacity(0.15))
                    .frame(width: 40, height: 40)
                Text(initials)
                    .font(.footnote)
                    .fontWeight(.semibold)
                    .foregroundStyle(typeColor)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(member.displayName)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                if let email = member.email, !email.isEmpty {
                    Text(email)
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .lineLimit(1)
                }
                HStack(spacing: 6) {
                    Text(member.typeLabel)
                        .font(.caption2)
                        .fontWeight(.medium)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(typeColor.opacity(0.12))
                        .foregroundStyle(typeColor)
                        .clipShape(.capsule)
                    if member.smsVerified == true {
                        Label("SMS", systemImage: "checkmark.shield.fill")
                            .font(.caption2)
                            .foregroundStyle(Color.ivxGreen)
                            .labelStyle(.titleAndIcon)
                    }
                    if let date = member.createdDate {
                        Text(date.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption2)
                            .foregroundStyle(Color.ivxTextTertiary)
                    }
                }
            }

            Spacer()
        }
        .padding(.vertical, 2)
    }

    private var initials: String {
        let parts = member.displayName.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }

    private var typeColor: Color {
        switch (member.memberType ?? "member").lowercased() {
        case "investor": return .ivxGreen
        case "buyer": return .ivxOrange
        case "owner": return .ivxGold
        case "realtor": return .purple
        default: return .ivxBlue
        }
    }
}

private struct MemberDetailSheet: View {
    let member: MemberRecord
    @State private var copiedField: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Identity") {
                    detailRow("Member ID", member.memberId, copyable: true)
                    detailRow("Full Name", member.fullName ?? "—")
                    detailRow("Email", member.email ?? "—", copyable: member.email != nil)
                    detailRow("Phone", member.phone ?? "—")
                    detailRow("Auth User ID", member.authUserId ?? "— (lead only, no login)")
                }
                Section("Classification") {
                    detailRow("Member Type", member.typeLabel)
                    detailRow("Source", member.source ?? "—")
                    detailRow("Source Detail", member.sourceDetail ?? "—")
                }
                Section("Verification") {
                    detailRow("Status", member.verificationStatus ?? "unverified")
                    detailRow("SMS Verified", member.smsVerified == true ? "Yes" : "No")
                    detailRow("Email Verified", member.emailVerified == true ? "Yes" : "No")
                }
                Section("Interest") {
                    detailRow("Investor Interest", member.investorInterest ?? "—")
                    detailRow("Preferred Zipcode", member.preferredZipcode ?? "—")
                    detailRow("Budget Range", member.budgetRange ?? "—")
                }
                Section("Timestamps") {
                    detailRow("Registered", member.createdDate?.formatted(date: .abbreviated, time: .shortened) ?? member.createdAt ?? "—")
                    detailRow("Updated", member.updatedAt ?? "—")
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.ivxBackground)
            .navigationTitle(member.displayName)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func detailRow(_ label: String, _ value: String, copyable: Bool = false) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.ivxTextSecondary)
                .frame(width: 110, alignment: .leading)
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
                .textSelection(.enabled)
            Spacer()
            if copyable {
                Button {
                    UIPasteboard.general.string = value
                    copiedField = label
                } label: {
                    Image(systemName: copiedField == label ? "checkmark" : "doc.on.doc")
                        .font(.caption)
                        .foregroundStyle(copiedField == label ? Color.ivxGreen : Color.ivxGold)
                }
                .buttonStyle(.borderless)
            }
        }
        .listRowBackground(Color.ivxCard)
    }
}

#Preview {
    MembersView()
}
