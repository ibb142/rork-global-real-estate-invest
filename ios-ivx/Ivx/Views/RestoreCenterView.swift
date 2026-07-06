//
//  RestoreCenterView.swift
//  Ivx
//
//  Owner admin page for the IVX zero-data-loss system.
//  Shows: backup status, soft-deleted records, vault entries, snapshots,
//  PITR status, two-person approvals, guard audit, recovery drill,
//  daily report, and emergency backup export.
//

import SwiftUI
import Combine

@MainActor
final class RestoreCenterViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var overview: RestoreCenterService.OverviewResponse.Overview?
    @Published var report: RestoreCenterService.ReportResponse.Report?
    @Published var drillResult: RestoreCenterService.DrillResponse.DrillReport?
    @Published var exportResult: RestoreCenterService.ExportResponse.ExportSummary?
    @Published var isRunningDrill = false
    @Published var isRunningExport = false

    private let service: RestoreCenterService

    init(ownerToken: String) {
        self.service = RestoreCenterService(ownerToken: ownerToken)
    }

    func loadAll() async {
        isLoading = true
        errorMessage = nil
        async let overviewTask = service.fetchOverview()
        async let reportTask = service.fetchReport()
        do {
            let overviewResp = try await overviewTask
            let reportResp = try await reportTask
            self.overview = overviewResp.overview
            self.report = reportResp.report
        } catch {
            self.errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func runDrill() async {
        isRunningDrill = true
        defer { isRunningDrill = false }
        do {
            let resp = try await service.runDrill()
            self.drillResult = resp.report
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func runExport() async {
        isRunningExport = true
        defer { isRunningExport = false }
        do {
            let resp = try await service.runEmergencyExport()
            self.exportResult = resp.export
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }
}

struct RestoreCenterView: View {
    @State private var viewModel: RestoreCenterViewModel
    @State private var ownerTokenInput = ""

    init(token: String = "") {
        _viewModel = State(initialValue: RestoreCenterViewModel(ownerToken: token))
        ownerTokenInput = token
    }

    var body: some View {
        NavigationStack {
            Group {
                if ownerTokenInput.isEmpty {
                    tokenEntryView
                } else {
                    contentView
                }
            }
            .navigationTitle("Restore Center")
            .background(Color.ivxBackground)
            .toolbarBackground(Color.ivxBackground, for: .navigationBar)
            .toolbar(.hidden, for: .tabBar)
        }
    }

    // MARK: - Token entry

    private var tokenEntryView: some View {
        VStack(spacing: 20) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 56))
                .foregroundStyle(Color.ivxGold)
            Text("Owner Access Required")
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(.white)
            Text("Enter your IVX owner token to access the Restore Center. All data-loss protection controls are owner-only.")
                .font(.subheadline)
                .foregroundStyle(Color.ivxTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            SecureField("Owner Token", text: $ownerTokenInput)
                .textFieldStyle(.plain)
                .padding(14)
                .background(Color.ivxSurface)
                .clipShape(.rect(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ivxBorder, lineWidth: 1))
                .padding(.horizontal, 24)
                .autocorrectionDisabled()

            Button {
                viewModel = RestoreCenterViewModel(ownerToken: ownerTokenInput)
                Task { await viewModel.loadAll() }
            } label: {
                Text("Unlock Restore Center")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxBackground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.ivxGold)
                    .clipShape(.rect(cornerRadius: 10))
            }
            .padding(.horizontal, 24)
            .disabled(ownerTokenInput.isEmpty)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Content

    private var contentView: some View {
        ScrollView {
            VStack(spacing: 16) {
                if viewModel.isLoading && viewModel.overview == nil {
                    ProgressView()
                        .tint(Color.ivxGold)
                        .padding(.top, 40)
                } else if let error = viewModel.errorMessage, viewModel.overview == nil {
                    errorView(error)
                } else {
                    riskBanner
                    backupStatusCard
                    pitrCard
                    protectedTablesCard
                    drillCard
                    reportCard
                    exportCard
                }
            }
            .padding(.vertical, 16)
        }
        .refreshable { await viewModel.loadAll() }
        .task { if viewModel.overview == nil { await viewModel.loadAll() } }
    }

    // MARK: - Risk banner

    private var riskBanner: some View {
        let risk = viewModel.report?.recoveryRisk ?? "unknown"
        let color: Color = risk == "low" ? .ivxGreen : risk == "medium" ? .ivxOrange : .ivxRed
        let icon = risk == "low" ? "checkmark.shield.fill" : risk == "medium" ? "exclamationmark.shield.fill" : "xmark.shield.fill"

        return VStack(spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(color)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Recovery Risk: \(risk.uppercased())")
                        .font(.headline)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                    Text(viewModel.report?.recommendation ?? "Loading status…")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .lineLimit(3)
                }
                Spacer()
            }
        }
        .padding(16)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(color.opacity(0.4), lineWidth: 1))
        .padding(.horizontal)
    }

    // MARK: - Backup status

    private var backupStatusCard: some View {
        let vault = viewModel.overview?.fileVault
        let totalSnapshots = vault?.totalSnapshots ?? 0
        let enabled = vault?.enabled ?? false
        let lastAt = vault?.lastSnapshotAt

        return card(title: "BACKUP STATUS", icon: "externaldrive.fill") {
            VStack(alignment: .leading, spacing: 8) {
                statusRow(label: "File Vault", value: enabled ? "ENABLED" : "OFF", color: enabled ? .ivxGreen : .ivxRed)
                statusRow(label: "Total Snapshots", value: "\(totalSnapshots)", color: .white)
                statusRow(label: "Last Snapshot", value: lastAt ?? "none yet", color: .white)
                statusRow(label: "Vault Size", value: viewModel.report?.vaultSizeNote ?? "—", color: .white)
                statusRow(label: "Supabase Reachable", value: (viewModel.report?.backupStatus.supabaseReachable ?? false) ? "YES" : "NO", color: (viewModel.report?.backupStatus.supabaseReachable ?? false) ? .ivxGreen : .ivxRed)
            }
        }
    }

    // MARK: - PITR

    private var pitrCard: some View {
        let pitr = viewModel.overview?.pitr
        let reachable = pitr?.supabaseReachable ?? false

        return card(title: "PITR / BACKUP STATUS", icon: "clock.arrow.circlepath") {
            VStack(alignment: .leading, spacing: 8) {
                statusRow(label: "Supabase", value: reachable ? "Reachable" : "Unreachable", color: reachable ? .ivxGreen : .ivxRed)
                if let alert = pitr?.pitrAlert {
                    Text(alert)
                        .font(.caption)
                        .foregroundStyle(Color.ivxOrange)
                        .lineLimit(4)
                }
                if let window = pitr?.restoreWindowNote {
                    Text(window)
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .lineLimit(3)
                }
                if let rec = pitr?.recommendation {
                    Text("Recommendation: \(rec)")
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .lineLimit(3)
                }
            }
        }
    }

    // MARK: - Protected tables

    private var protectedTablesCard: some View {
        let count = viewModel.overview?.protectedTableCount ?? 0
        let tables = viewModel.overview?.protectedTables ?? []

        return card(title: "PROTECTED TABLES (\(count))", icon: "shield.lefthalf.filled") {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(tables.prefix(12), id: \.self) { table in
                    HStack {
                        Image(systemName: "lock.fill")
                            .font(.caption2)
                            .foregroundStyle(Color.ivxGold)
                        Text(table)
                            .font(.caption)
                            .foregroundStyle(.white)
                        Spacer()
                    }
                }
                if tables.count > 12 {
                    Text("+ \(tables.count - 12) more")
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextTertiary)
                }
            }
        }
    }

    // MARK: - Recovery drill

    private var drillCard: some View {
        card(title: "RECOVERY DRILL", icon: "wrench.and.screwdriver.fill") {
            VStack(alignment: .leading, spacing: 10) {
                if let drill = viewModel.drillResult {
                    HStack {
                        Image(systemName: drill.overallPassed ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(drill.overallPassed ? Color.ivxGreen : Color.ivxRed)
                        Text(drill.overallPassed ? "ALL STEPS PASSED" : "\(drill.summary.failed) FAILED")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundStyle(drill.overallPassed ? Color.ivxGreen : Color.ivxRed)
                        Spacer()
                        Text("\(drill.summary.passed)/\(drill.summary.total)")
                            .font(.caption)
                            .foregroundStyle(Color.ivxTextSecondary)
                    }
                    ForEach(drill.steps, id: \.step) { step in
                        HStack(spacing: 8) {
                            Image(systemName: step.passed ? "checkmark" : "xmark")
                                .font(.caption2)
                                .foregroundStyle(step.passed ? Color.ivxGreen : Color.ivxRed)
                            Text(step.step.replacingOccurrences(of: "_", with: " "))
                                .font(.caption)
                                .foregroundStyle(.white)
                            Spacer()
                            Text(step.detail)
                                .font(.caption2)
                                .foregroundStyle(Color.ivxTextSecondary)
                                .lineLimit(1)
                        }
                    }
                } else {
                    Text("Run a test: create → soft-delete → restore → vault capture → vault restore → guard block → ledger correction.")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                }

                Button {
                    Task { await viewModel.runDrill() }
                } label: {
                    HStack {
                        if viewModel.isRunningDrill { ProgressView().tint(Color.ivxBackground) }
                        Text(viewModel.isRunningDrill ? "Running drill…" : "Run Recovery Drill")
                    }
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxBackground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.ivxGold)
                    .clipShape(.rect(cornerRadius: 8))
                }
                .disabled(viewModel.isRunningDrill)
            }
        }
    }

    // MARK: - Daily report

    private var reportCard: some View {
        let report = viewModel.report

        return card(title: "DAILY REPORT", icon: "doc.text.magnifyingglass") {
            VStack(alignment: .leading, spacing: 8) {
                if let report {
                    Text("Generated: \(formatDate(report.generatedAt))")
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextTertiary)
                    ForEach(report.rowCounts, id: \.table) { tc in
                        HStack {
                            Text(tc.table)
                                .font(.caption)
                                .foregroundStyle(.white)
                            Spacer()
                            Text(tc.exists ? "\(tc.count ?? 0)" : "missing")
                                .font(.caption)
                                .foregroundStyle(tc.exists ? Color.ivxGold : Color.ivxRed)
                        }
                    }
                    if let softDeleted = report.softDeletedCounts, !softDeleted.isEmpty {
                        Divider().background(Color.ivxBorder)
                        Text("Soft-Deleted Records")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundStyle(Color.ivxTextSecondary)
                        ForEach(softDeleted, id: \.table) { sd in
                            HStack {
                                Text(sd.table)
                                    .font(.caption)
                                    .foregroundStyle(.white)
                                Spacer()
                                Text("\(sd.count)")
                                    .font(.caption)
                                    .foregroundStyle(sd.count > 0 ? Color.ivxOrange : Color.ivxTextSecondary)
                            }
                        }
                    }
                } else {
                    Text("Loading daily report…")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                }
            }
        }
    }

    // MARK: - Emergency export

    private var exportCard: some View {
        card(title: "EMERGENCY BACKUP", icon: "arrow.down.to.line.compact") {
            VStack(alignment: .leading, spacing: 10) {
                if let exportResult = viewModel.exportResult {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.ivxGreen)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Snapshot \(exportResult.snapshotId)")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.white)
                            Text("\(exportResult.tables) tables · \(exportResult.totalRows) rows")
                                .font(.caption2)
                                .foregroundStyle(Color.ivxTextSecondary)
                        }
                    }
                    Text(exportResult.message)
                        .font(.caption2)
                        .foregroundStyle(Color.ivxTextSecondary)
                } else {
                    Text("Trigger an immediate snapshot of all critical tables to the file vault.")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                }

                Button {
                    Task { await viewModel.runExport() }
                } label: {
                    HStack {
                        if viewModel.isRunningExport { ProgressView().tint(Color.ivxBackground) }
                        Text(viewModel.isRunningExport ? "Capturing…" : "Export Now")
                    }
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxBackground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.ivxGold)
                    .clipShape(.rect(cornerRadius: 8))
                }
                .disabled(viewModel.isRunningExport)
            }
        }
    }

    // MARK: - Error

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(Color.ivxRed)
            Text("Connection Error")
                .font(.headline)
                .foregroundStyle(.white)
            Text(error)
                .font(.caption)
                .foregroundStyle(Color.ivxTextSecondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task { await viewModel.loadAll() }
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.ivxGold)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Helpers

    private func card(title: String, icon: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundStyle(Color.ivxGold)
                Text(title)
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxTextSecondary)
            }
            content()
        }
        .padding(16)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.ivxBorder, lineWidth: 1))
        .padding(.horizontal)
    }

    private func statusRow(label: String, value: String, color: Color) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color.ivxTextSecondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(color)
        }
    }

    private func formatDate(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        if let date = f.date(from: iso) {
            return date.formatted(date: .abbreviated, time: .shortened)
        }
        return iso
    }
}

#Preview {
    RestoreCenterView(token: "test-token")
        .preferredColorScheme(.dark)
}
