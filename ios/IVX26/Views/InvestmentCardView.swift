import SwiftUI

/// Investment card shown on project-linked reels: real deal data only —
/// ROI, minimum investment, minimum ownership %, status, View Deal + Invest Now.
struct InvestmentCardView: View {
    let deal: JVDeal

    private static let gold = Color(red: 0.96, green: 0.77, blue: 0.09)

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(deal.displayTitle)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if let location = deal.displayLocation {
                        Text(location)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(1)
                    }
                }
                Spacer()
                if let status = deal.status, !status.isEmpty {
                    Text(status.uppercased())
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(Self.gold)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .overlay(Capsule().strokeBorder(Self.gold.opacity(0.6), lineWidth: 1))
                }
            }

            HStack(spacing: 0) {
                metric(label: "ROI", value: deal.expectedRoi.map { "\(Self.trimmed($0))%" } ?? "—")
                divider
                metric(label: "MIN INVEST", value: Self.currency(deal.minimumInvestment))
                divider
                metric(label: "MIN OWNERSHIP", value: deal.minimumOwnershipPercent.map { Self.percent($0) } ?? "—")
            }

            HStack(spacing: 8) {
                dealLink(title: "View Deal", filled: false)
                dealLink(title: "Invest Now", filled: true)
            }
        }
        .padding(12)
        .background(.black.opacity(0.55), in: .rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Self.gold.opacity(0.45), lineWidth: 1))
    }

    private var divider: some View {
        Rectangle()
            .fill(.white.opacity(0.15))
            .frame(width: 1, height: 26)
    }

    private func metric(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.footnote.weight(.bold))
                .foregroundStyle(Self.gold)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .tracking(0.5)
                .foregroundStyle(.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
    }

    private func dealLink(title: String, filled: Bool) -> some View {
        Link(destination: URL(string: "\(IVXBackend.landingBase)/?project=\(deal.id)#projects")!) {
            Text(title)
                .font(.footnote.weight(.bold))
                .foregroundStyle(filled ? .black : Self.gold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(filled ? Self.gold : .clear, in: .capsule)
                .overlay(Capsule().strokeBorder(Self.gold, lineWidth: filled ? 0 : 1.2))
        }
    }

    private static func trimmed(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }

    private static func percent(_ value: Double) -> String {
        if value >= 1 { return String(format: "%.1f%%", value) }
        if value >= 0.01 { return String(format: "%.2f%%", value) }
        return String(format: "%.4f%%", value)
    }

    private static func currency(_ value: Double) -> String {
        if value >= 1_000_000 {
            return "$\(trimmed(value / 1_000_000))M"
        }
        if value >= 1_000 {
            return "$\(trimmed(value / 1_000))K"
        }
        return "$\(trimmed(value))"
    }
}
