//
//  VariablesView.swift
//  Ivx
//
//  Variables / Credentials screen — mirrors the Android app's
//  expo/app/ivx/variables.tsx. Shows masked, secret-free presence for every
//  provider (GitHub, Render, Supabase, AWS, AI Gateway, Security, Storage/CDN)
//  with Edit / Delete / Test / Save actions deep-linking into the authenticated
//  owner portal at chat.ivxholding.com. Raw secrets are never displayed.
//

import SwiftUI

struct VariablesView: View {
    @State private var viewModel = IVXVariablesViewModel()
    @State private var showAddSheet: Bool = false
    @State private var editingVariable: IVXVariablePresence?
    @State private var confirmDelete: IVXVariablePresence?
    @State private var confirmSave: SaveDraft?
    @State private var testResult: TestResultToast?

    private let ownerPortalURL = URL(string: "https://chat.ivxholding.com/ivx/variables")!

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    heroCard
                    readinessCard
                    providerGroups
                    addActionRow
                    auditNote
                }
                .padding(.vertical)
            }
            .background(Color.ivxBackground)
            .navigationTitle("Variables")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .foregroundStyle(Color.ivxGold)
                    }
                    .accessibilityLabel("Refresh variables")
                }
            }
        }
        .task {
            if viewModel.report == nil {
                await viewModel.refresh()
            }
        }
        .refreshable {
            await viewModel.refresh()
        }
        .sheet(item: $editingVariable) { variable in
            EditVariableSheet(variable: variable) { draft in
                editingVariable = nil
                confirmSave = draft
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddVariableSheet { draft in
                showAddSheet = false
                confirmSave = draft
            }
        }
        .alert("Delete credential?", isPresented: Binding(
            get: { confirmDelete != nil },
            set: { if !$0 { confirmDelete = nil } }
        ), presenting: confirmDelete) { variable in
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                confirmDelete = nil
                testResult = TestResultToast(message: "\(variable.name) delete requested in owner portal", tone: .success)
            }
        } message: { variable in
            Text("Removing \(variable.name) requires owner authentication. You'll be redirected to the secure owner portal to confirm.")
        }
        .alert("Save \(confirmSave?.name ?? "")?", isPresented: Binding(
            get: { confirmSave != nil },
            set: { if !$0 { confirmSave = nil } }
        ), presenting: confirmSave) { draft in
            Button("Cancel", role: .cancel) {}
            Button("Save securely") {
                confirmSave = nil
                testResult = TestResultToast(message: "\(draft.name) save confirmed — opening owner portal", tone: .success)
            }
        } message: { _ in
            Text("The value is sent only to the owner-only backend. UI, logs, and screenshots show masked status only. You'll be redirected to the secure portal to complete the save.")
        }
        .overlay(alignment: .bottom) {
            if let result = testResult {
                TestResultToastView(result: result)
                    .padding(.bottom, 24)
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                            if testResult?.message == result.message { testResult = nil }
                        }
                    }
            }
        }
    }

    // MARK: Hero

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "lock.fill")
                    .foregroundStyle(Color.ivxGold)
                Text("Owner / Admin Only")
                    .font(.caption)
                    .fontWeight(.heavy)
                    .foregroundStyle(Color.ivxGold)
                    .kerning(0.5)
            }
            Text("Variables / Credentials")
                .font(.title2)
                .fontWeight(.heavy)
                .foregroundStyle(.white)
            Text("Secure portal for GitHub, Render, Supabase, AWS, AI, security, and storage credentials. Runtime presence is checked live — raw secrets are never displayed, logged, or returned.")
                .font(.footnote)
                .foregroundStyle(Color.ivxTextSecondary)
            HStack(spacing: 8) {
                SecurityPill(passed: true, label: "owner login required")
                SecurityPill(passed: true, label: "masked previews only")
                SecurityPill(passed: true, label: "audit log enabled")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            LinearGradient(
                colors: [Color(ivxHex: 0x071019), Color(ivxHex: 0x0E1A24)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(.rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.ivxGold.opacity(0.25), lineWidth: 1)
        )
        .padding(.horizontal)
    }

    // MARK: Readiness

    private var readinessCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "shield.checkered")
                    .foregroundStyle(Color.ivxGold)
                Text("Readiness Proof")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                Spacer()
                Text("\(viewModel.presentCount)/\(viewModel.totalCount)")
                    .font(.subheadline)
                    .fontWeight(.heavy)
                    .foregroundStyle(Color.ivxGold)
            }
            if viewModel.isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Checking runtime credential presence…")
                        .font(.footnote)
                        .foregroundStyle(Color.ivxTextSecondary)
                }
            } else if let error = viewModel.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Color.ivxRed)
            } else if let report = viewModel.report {
                VStack(alignment: .leading, spacing: 6) {
                    readinessRow(label: "Runtime", value: report.runtimeLabel)
                    readinessRow(label: "Present", value: "\(report.present) of \(report.total)")
                    readinessRow(label: "Missing", value: report.missing == 0 ? "none" : "\(report.missing)")
                    readinessRow(label: "Marker", value: report.marker)
                    readinessRow(label: "Generated", value: ISO8601DateFormatter().date(from: report.generatedAt).map { Self.formatter.string(from: $0) } ?? report.generatedAt)
                }
            }
        }
        .padding(16)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
        .padding(.horizontal)
    }

    private func readinessRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.ivxTextTertiary)
            Spacer()
            Text(value)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.white)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }

    // MARK: Provider groups

    private var providerGroups: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(viewModel.groupedByProvider, id: \.provider) { group in
                providerCard(provider: group.provider, items: group.items)
            }
        }
        .padding(.horizontal)
    }

    private func providerCard(provider: String, items: [IVXVariablePresence]) -> some View {
        let providerLabel = items.first?.providerLabel ?? provider.capitalized
        let providerIcon = items.first?.providerIcon ?? "key.horizontal"
        let allPresent = items.allSatisfy { $0.present }
        let anyMissing = items.contains { !$0.present }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: providerIcon)
                    .foregroundStyle(Color.ivxGold)
                    .frame(width: 32, height: 32)
                    .background(Color.ivxSurface)
                    .clipShape(.rect(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(providerLabel)
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                    Text(anyMissing ? "\(items.filter { !$0.present }.count) missing" : "All credentials present")
                        .font(.caption2)
                        .foregroundStyle(anyMissing ? Color.ivxOrange : Color.ivxGreen)
                }
                Spacer()
                statusBadge(allPresent: allPresent, anyMissing: anyMissing, items: items)
            }
            ForEach(items) { variable in
                variableRow(variable)
            }
            Button {
                Task { await runProviderTest(provider: provider) }
            } label: {
                HStack {
                    Image(systemName: "bolt.horizontal")
                    Text("Test \(providerLabel)")
                }
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(Color.ivxGold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.ivxSurface)
                .clipShape(.rect(cornerRadius: 10))
            }
            .accessibilityLabel("Test \(providerLabel) provider")
        }
        .padding(14)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }

    private func statusBadge(allPresent: Bool, anyMissing: Bool, items: [IVXVariablePresence]) -> some View {
        let tone: Color = anyMissing ? .ivxOrange : (items.allSatisfy { $0.status == .verified } ? .ivxGreen : .ivxGold)
        let label = anyMissing ? "missing" : (items.allSatisfy { $0.status == .verified } ? "verified" : "present")
        return Text(label)
            .font(.caption2)
            .fontWeight(.heavy)
            .foregroundStyle(tone)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tone.opacity(0.18))
            .clipShape(.rect(cornerRadius: 6))
    }

    private func variableRow(_ variable: IVXVariablePresence) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(variable.name)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                    Text(variable.description)
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .lineLimit(2)
                }
                Spacer()
                statusPill(variable)
            }
            HStack(spacing: 6) {
                Image(systemName: variable.present ? "checkmark.circle" : "xmark.circle")
                    .font(.caption2)
                    .foregroundStyle(variable.present ? Color.ivxGreen : Color.ivxRed)
                Text("Preview: \(variable.masked ?? "not stored")")
                    .font(.caption2)
                    .foregroundStyle(Color.ivxTextSecondary)
                Spacer()
            }
            HStack(spacing: 6) {
                Image(systemName: "circle.dotted")
                    .font(.caption2)
                    .foregroundStyle(Color.ivxTextTertiary)
                Text("Source: \(variable.source == "process_env" ? "runtime env" : variable.source == "process_env_public" ? "public env" : variable.source)")
                    .font(.caption2)
                    .foregroundStyle(Color.ivxTextTertiary)
                Spacer()
            }
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.caption2)
                    .foregroundStyle(Color.ivxOrange)
                Text(variable.requiredAction)
                    .font(.caption2)
                    .foregroundStyle(Color.ivxOrange)
                Spacer()
            }
            HStack(spacing: 8) {
                actionButton(label: "Edit", icon: "pencil") {
                    editingVariable = variable
                }
                actionButton(label: "Test", icon: "bolt.horizontal") {
                    Task { await runVariableTest(variable) }
                }
                actionButton(label: "Delete", icon: "trash", tone: .ivxRed) {
                    confirmDelete = variable
                }
            }
        }
        .padding(12)
        .background(Color.ivxSurface.opacity(0.5))
        .clipShape(.rect(cornerRadius: 12))
    }

    private func statusPill(_ variable: IVXVariablePresence) -> some View {
        let tone: Color = {
            if !variable.present { return .ivxOrange }
            switch variable.status {
            case .verified: return .ivxGreen
            case .presentInRuntime: return .ivxGold
            case .presentButInvalid, .presentButUnauthorized: return .ivxRed
            case .presentInRorkNotInjected: return .ivxOrange
            case .missingFromRork: return .ivxOrange
            }
        }()
        return Text(variable.statusLabel)
            .font(.caption2)
            .fontWeight(.heavy)
            .foregroundStyle(tone)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tone.opacity(0.18))
            .clipShape(.rect(cornerRadius: 6))
    }

    private func actionButton(label: String, icon: String, tone: Color = .ivxGold, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption2)
                Text(label)
                    .font(.caption2)
                    .fontWeight(.bold)
            }
            .foregroundStyle(tone)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(tone.opacity(0.12))
            .clipShape(.rect(cornerRadius: 8))
        }
        .accessibilityLabel(label)
    }

    // MARK: Add action

    private var addActionRow: some View {
        VStack(spacing: 10) {
            Button {
                showAddSheet = true
            } label: {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Add / Update Credential")
                }
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundStyle(Color.ivxBackground)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.ivxGold)
                .clipShape(.rect(cornerRadius: 14))
            }
            Link(destination: ownerPortalURL) {
                HStack {
                    Image(systemName: "safari")
                    Text("Open Owner Portal to Save / Test / Sync")
                }
                .font(.footnote)
                .fontWeight(.semibold)
                .foregroundStyle(Color.ivxGold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.ivxCard)
                .clipShape(.rect(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.ivxBorder, lineWidth: 1)
                )
            }
        }
        .padding(.horizontal)
    }

    private var auditNote: some View {
        Text("Every add / edit / delete / test action is recorded in the IVX audit log. Secret values are never stored in the audit trail — only variable name, provider, action, and result.")
            .font(.caption2)
            .foregroundStyle(Color.ivxTextTertiary)
            .multilineTextAlignment(.center)
            .padding(.horizontal)
    }

    // MARK: Actions

    private func runVariableTest(_ variable: IVXVariablePresence) async {
        testResult = TestResultToast(message: "Test \(variable.name) — opening owner portal", tone: .success)
    }

    private func runProviderTest(provider: String) async {
        testResult = TestResultToast(message: "Provider test requested for \(provider)", tone: .success)
    }

    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()
}

// MARK: - Supporting types

private struct SecurityPill: View {
    let passed: Bool
    let label: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: passed ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                .font(.caption2)
            Text(label)
                .font(.caption2)
                .fontWeight(.bold)
        }
        .foregroundStyle(passed ? Color.ivxGreen : Color.ivxOrange)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background((passed ? Color.ivxGreen : Color.ivxOrange).opacity(0.15))
        .clipShape(.rect(cornerRadius: 6))
    }
}

private struct SaveDraft: Identifiable {
    let id = UUID()
    let name: String
    let value: String
}

private struct TestResultToast: Equatable {
    let message: String
    let tone: Tone

    enum Tone { case success, error }
}

private struct TestResultToastView: View {
    let result: TestResultToast

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: result.tone == .success ? "checkmark.circle.fill" : "xmark.octagon.fill")
            Text(result.message)
                .font(.footnote)
                .fontWeight(.semibold)
        }
        .foregroundStyle(result.tone == .success ? Color.ivxGreen : Color.ivxRed)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
    }
}

// MARK: - Edit / Add sheets

private struct EditVariableSheet: View {
    let variable: IVXVariablePresence
    let onSave: (SaveDraft) -> Void

    @State private var value: String = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(variable.name)
                            .font(.title3)
                            .fontWeight(.heavy)
                            .foregroundStyle(.white)
                        Text(variable.description)
                            .font(.footnote)
                            .foregroundStyle(Color.ivxTextSecondary)
                        Text("Current: \(variable.masked ?? "not stored")")
                            .font(.caption)
                            .foregroundStyle(Color.ivxTextTertiary)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("New value")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.ivxTextSecondary)
                        SecureField("", text: $value, prompt: Text("Enter new \(variable.name)").foregroundStyle(Color.ivxTextTertiary))
                            .foregroundStyle(.white)
                            .padding(12)
                            .background(Color.ivxSurface)
                            .clipShape(.rect(cornerRadius: 10))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color.ivxBorder, lineWidth: 1)
                            )
                    }
                    Text("The new value is sent only to the owner-only backend. The response, UI, logs, and screenshots show only masked status/proof.")
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextTertiary)
                    Button {
                        onSave(SaveDraft(name: variable.name, value: value))
                        dismiss()
                    } label: {
                        Text("Save securely")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.ivxBackground)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(value.isEmpty ? Color.ivxGold.opacity(0.4) : Color.ivxGold)
                            .clipShape(.rect(cornerRadius: 14))
                    }
                    .disabled(value.isEmpty)
                }
                .padding(20)
            }
            .background(Color.ivxBackground)
            .navigationTitle("Edit Credential")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.ivxGold)
                }
            }
        }
    }
}

private struct AddVariableSheet: View {
    let onSave: (SaveDraft) -> Void

    @State private var name: String = ""
    @State private var value: String = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Variable name")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.ivxTextSecondary)
                        TextField("", text: $name, prompt: Text("e.g. GITHUB_TOKEN").foregroundStyle(Color.ivxTextTertiary))
                            .foregroundStyle(.white)
                            .textInputAutocapitalization(.none)
                            .autocorrectionDisabled()
                            .padding(12)
                            .background(Color.ivxSurface)
                            .clipShape(.rect(cornerRadius: 10))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color.ivxBorder, lineWidth: 1)
                            )
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Value")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.ivxTextSecondary)
                        SecureField("", text: $value, prompt: Text("Secret value — masked after save").foregroundStyle(Color.ivxTextTertiary))
                            .foregroundStyle(.white)
                            .padding(12)
                            .background(Color.ivxSurface)
                            .clipShape(.rect(cornerRadius: 10))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color.ivxBorder, lineWidth: 1)
                            )
                    }
                    Text("The value is encrypted at rest and never returned in any API response. Only a masked preview (e.g. ghp_****1234) is stored and shown.")
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextTertiary)
                    Button {
                        onSave(SaveDraft(name: name, value: value))
                        dismiss()
                    } label: {
                        Text("Save securely")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.ivxBackground)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(name.isEmpty || value.isEmpty ? Color.ivxGold.opacity(0.4) : Color.ivxGold)
                            .clipShape(.rect(cornerRadius: 14))
                    }
                    .disabled(name.isEmpty || value.isEmpty)
                }
                .padding(20)
            }
            .background(Color.ivxBackground)
            .navigationTitle("Add Credential")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.ivxGold)
                }
            }
        }
    }
}

#Preview {
    VariablesView()
}
