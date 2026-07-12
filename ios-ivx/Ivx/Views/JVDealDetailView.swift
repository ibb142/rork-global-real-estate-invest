//
//  JVDealDetailView.swift
//  Ivx
//
//  Full-screen professional deal detail — the complete investor-grade view:
//  photo gallery, investment metrics, investment option paths (tokenized,
//  JV deal, buyer), partner & legal terms, description, timeline, fees,
//  and CTAs to register/invest/schedule.
//

import SwiftUI

struct JVDealDetailView: View {
    let deal: JVDeal

    @Environment(\.dismiss) private var dismiss
    @State private var selectedPhotoIndex: Int = 0
    @State private var showFullDescription = false

    var body: some View {
        ZStack {
            Color.ivxBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    photoGallerySection
                    headerSection
                    investmentOptionsSection
                    metricsGrid
                    descriptionSection
                    timelineSection
                    partnerSection
                    legalSection
                    ctaSection
                }
                .padding(.bottom, 120)
            }
        }
        .navigationBarBackButtonHidden(true)
        .overlay(alignment: .topLeading) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.black.opacity(0.55))
                    .clipShape(Circle())
            }
            .padding(.leading, 16)
            .padding(.top, 8)
            .accessibilityLabel("Back")
        }
    }

    // MARK: Photo gallery

    @ViewBuilder
    private var photoGallerySection: some View {
        let gallery = deal.photoGallery
        if gallery.isEmpty {
            Color.ivxSurface
                .frame(height: 280)
                .overlay {
                    VStack(spacing: 8) {
                        Image(systemName: "building.2")
                            .font(.system(size: 40))
                            .foregroundStyle(Color.ivxTextTertiary)
                        Text("No photos available")
                            .font(.caption)
                            .foregroundStyle(Color.ivxTextTertiary)
                    }
                }
                .clipped()
        } else {
            TabView(selection: $selectedPhotoIndex) {
                ForEach(Array(gallery.enumerated()), id: \.offset) { index, photo in
                    DealPhotoView(photo: photo, height: 280)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: gallery.count > 1 ? .always : .never))
            .frame(height: 280)
            .clipped()
        }
    }

    // MARK: Header — name, location, badges

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(deal.typeLabel.uppercased())
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxGold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.ivxGold.opacity(0.12))
                    .clipShape(.rect(cornerRadius: 4))

                if let status = deal.status, !status.isEmpty {
                    Text(status.uppercased())
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.ivxGreen)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.ivxGreen.opacity(0.12))
                        .clipShape(.rect(cornerRadius: 4))
                }
            }

            Text(deal.displayName)
                .font(.title)
                .fontWeight(.bold)
                .foregroundStyle(.white)

            if let location = deal.displayLocation {
                Label(location, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(Color.ivxTextSecondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
    }

    // MARK: Investment options — tokenized / JV / buyer icons

    private var investmentOptionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Investment Options")
                .font(.headline)
                .foregroundStyle(.white)

            HStack(spacing: 10) {
                ForEach(deal.investmentOptions) { option in
                    investmentOptionCard(option)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
    }

    private func investmentOptionCard(_ option: InvestmentOption) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: option.icon)
                .font(.title2)
                .foregroundStyle(option.tint.color)
                .frame(width: 38, height: 38)
                .background(option.tint.color.opacity(0.12))
                .clipShape(.rect(cornerRadius: 8))
            Text(option.label)
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundStyle(.white)
            Text(option.subtitle)
                .font(.caption2)
                .foregroundStyle(Color.ivxTextSecondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(option.tint.color.opacity(0.25), lineWidth: 1)
        )
    }

    // MARK: Metrics grid

    private var metricsGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Financial Summary")
                .font(.headline)
                .foregroundStyle(.white)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                if let roi = deal.expectedRoi {
                    metricTile(
                        icon: "chart.line.uptrend.xyaxis",
                        label: "Expected ROI",
                        value: "\(roi.formatted(.number.precision(.fractionLength(0...1))))%",
                        tint: .ivxGreen
                    )
                }
                if let total = deal.totalInvestment, total > 0 {
                    metricTile(
                        icon: "dollarsign.circle",
                        label: "Total Investment",
                        value: compactCurrency(total),
                        tint: .ivxGold
                    )
                }
                if let value = deal.estimatedValue, value > 0 {
                    metricTile(
                        icon: "building.2.fill",
                        label: "Estimated Value",
                        value: compactCurrency(value),
                        tint: .white
                    )
                }
                if let min = deal.minInvestment, min > 0 {
                    metricTile(
                        icon: "tag.fill",
                        label: "Min Investment",
                        value: compactCurrency(min),
                        tint: .ivxGold
                    )
                }
                if let term = deal.termLabel {
                    metricTile(
                        icon: "calendar",
                        label: "Term",
                        value: term,
                        tint: .ivxBlue
                    )
                }
                if let freq = deal.distributionFrequency, !freq.isEmpty {
                    metricTile(
                        icon: "arrow.2.squarepath",
                        label: "Distributions",
                        value: freq.capitalized,
                        tint: .ivxOrange
                    )
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
    }

    private func metricTile(icon: String, label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(tint)
            Text(value)
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.ivxTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }

    // MARK: Description

    @ViewBuilder
    private var descriptionSection: some View {
        if let desc = deal.description, !desc.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Project Details")
                    .font(.headline)
                    .foregroundStyle(.white)

                Text(desc)
                    .font(.subheadline)
                    .foregroundStyle(Color.ivxTextSecondary)
                    .lineLimit(showFullDescription ? nil : 6)
                    .multilineTextAlignment(.leading)

                if desc.count > 200 {
                    Button {
                        showFullDescription.toggle()
                    } label: {
                        Text(showFullDescription ? "Show less" : "Read more")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.ivxGold)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 20)
        }
    }

    // MARK: Timeline

    @ViewBuilder
    private var timelineSection: some View {
        if deal.startDate != nil || deal.endDate != nil || deal.exitStrategy != nil {
            VStack(alignment: .leading, spacing: 10) {
                Text("Timeline & Exit")
                    .font(.headline)
                    .foregroundStyle(.white)

                if let start = deal.startDate {
                    timelineRow(icon: "play.circle.fill", label: "Start Date", value: formatDate(start))
                }
                if let end = deal.endDate {
                    timelineRow(icon: "flag.checkered.circle.fill", label: "End Date", value: formatDate(end))
                }
                if let exit = deal.exitStrategy, !exit.isEmpty {
                    timelineRow(icon: "arrow.right.circle.fill", label: "Exit Strategy", value: exit)
                }
                if let hold = deal.minimumHoldPeriod, hold > 0 {
                    timelineRow(icon: "lock.circle.fill", label: "Min Hold Period", value: "\(hold) months")
                }
            }
            .padding(12)
            .background(Color.ivxCard)
            .clipShape(.rect(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.ivxBorder, lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.top, 20)
        }
    }

    private func timelineRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(Color.ivxGold)
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(Color.ivxTextTertiary)
                Text(value)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.white)
            }
            Spacer()
        }
    }

    // MARK: Partner / Developer

    @ViewBuilder
    private var partnerSection: some View {
        if deal.partnerName != nil || deal.partnerType != nil || deal.partnerEmail != nil {
            VStack(alignment: .leading, spacing: 10) {
                Text("Development Partner")
                    .font(.headline)
                    .foregroundStyle(.white)

                if let name = deal.partnerName, !name.isEmpty {
                    infoRow(icon: "person.fill", label: "Name", value: name)
                }
                if let type = deal.partnerType, !type.isEmpty {
                    infoRow(icon: "briefcase.fill", label: "Role", value: type.capitalized)
                }
                if let email = deal.partnerEmail, !email.isEmpty {
                    infoRow(icon: "envelope.fill", label: "Email", value: email)
                }
                if let phone = deal.partnerPhone, !phone.isEmpty {
                    infoRow(icon: "phone.fill", label: "Phone", value: phone)
                }
                if let propType = deal.propertyType, !propType.isEmpty {
                    infoRow(icon: "house.fill", label: "Property Type", value: propType)
                }
                if let lot = deal.lotSize, lot > 0 {
                    let unit = deal.lotSizeUnit ?? "units"
                    infoRow(icon: "ruler", label: "Lot Size", value: "\(lot.formatted()) \(unit)")
                }
                if let zoning = deal.zoning, !zoning.isEmpty {
                    infoRow(icon: "map.fill", label: "Zoning", value: zoning)
                }
            }
            .padding(12)
            .background(Color.ivxCard)
            .clipShape(.rect(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.ivxBorder, lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.top, 20)
        }
    }

    // MARK: Legal terms

    @ViewBuilder
    private var legalSection: some View {
        if deal.governingLaw != nil || deal.disputeResolution != nil || deal.managementFee != nil {
            VStack(alignment: .leading, spacing: 10) {
                Text("Legal & Fee Structure")
                    .font(.headline)
                    .foregroundStyle(.white)

                if let law = deal.governingLaw, !law.isEmpty {
                    infoRow(icon: "scale.3d", label: "Governing Law", value: law)
                }
                if let dispute = deal.disputeResolution, !dispute.isEmpty {
                    infoRow(icon: "exclamationmark.bubble.fill", label: "Dispute Resolution", value: dispute)
                }
                if let mgmt = deal.managementFee, mgmt > 0 {
                    infoRow(icon: "percent", label: "Management Fee", value: "\(mgmt.formatted(.number.precision(.fractionLength(0...1))))%")
                }
                if let perf = deal.performanceFee, perf > 0 {
                    infoRow(icon: "chart.bar.fill", label: "Performance Fee", value: "\(perf.formatted(.number.precision(.fractionLength(0...1))))%")
                }
                if let split = deal.profitSplit, !split.isEmpty {
                    infoRow(icon: "piechart.fill", label: "Profit Split", value: split)
                }
            }
            .padding(12)
            .background(Color.ivxCard)
            .clipShape(.rect(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.ivxBorder, lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.top, 20)
        }
    }

    private func infoRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(Color.ivxGold)
                .frame(width: 26, height: 26)
                .background(Color.ivxGold.opacity(0.1))
                .clipShape(.rect(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(Color.ivxTextTertiary)
                Text(value)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.white)
                    .lineLimit(2)
            }
            Spacer()
        }
    }

    // MARK: CTAs

    private var ctaSection: some View {
        VStack(spacing: 10) {
            Link(destination: URL(string: "https://chat.ivxholding.com/investor")!) {
                HStack {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                    Text("Invest Now")
                }
                .font(.headline)
                .fontWeight(.bold)
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.ivxGold)
                .clipShape(.rect(cornerRadius: 12))
            }

            HStack(spacing: 10) {
                Link(destination: URL(string: "https://ivxholding.com/properties")!) {
                    HStack {
                        Image(systemName: "doc.text.fill")
                        Text("View Deal")
                    }
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.ivxSurfaceTertiary)
                    .clipShape(.rect(cornerRadius: 10))
                }

                Link(destination: URL(string: "https://chat.ivxholding.com")!) {
                    HStack {
                        Image(systemName: "calendar.badge.plus")
                        Text("Schedule")
                    }
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.ivxSurfaceTertiary)
                    .clipShape(.rect(cornerRadius: 10))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 24)
    }

    // MARK: Helpers

    private func compactCurrency(_ value: Double) -> String {
        if value >= 1_000_000 {
            let millions = value / 1_000_000
            return "$\(millions.formatted(.number.precision(.fractionLength(0...1))))M"
        }
        if value >= 1_000 {
            let thousands = value / 1_000
            return "$\(thousands.formatted(.number.precision(.fractionLength(0...1))))K"
        }
        return "$\(value.formatted(.number.precision(.fractionLength(0))))"
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withDashSeparatorInDate, .withFractionalSeconds]
        if let date = formatter.date(from: isoString) {
            return date.formatted(date: .abbreviated, time: .omitted)
        }
        let alt = ISO8601DateFormatter()
        if let date = alt.date(from: isoString) {
            return date.formatted(date: .abbreviated, time: .omitted)
        }
        return isoString
    }
}

#Preview {
    NavigationStack {
        JVDealDetailView(
            deal: try! JSONDecoder().decode(
                JVDeal.self,
                from: """
                {"id":"casa-rosario-001","title":"Casa Rosario","project_name":"Casa Rosario","type":"jv","status":"active","description":"Ground-up residential development.","expected_roi":30,"total_investment":1400000,"estimated_value":1400000,"min_investment":50,"property_address":"Pembroke Pines, FL","city":"Pembroke Pines","state":"FL","term_months":24,"distribution_frequency":"quarterly","exit_strategy":"14-24 months","partner_name":"ONE STOP DEVELOPMENT TWO LLC","partner_type":"developer","management_fee":2,"performance_fee":20,"photos":[]}
                """.data(using: .utf8)!
            )
        )
    }
    .preferredColorScheme(.dark)
}
