//
//  HomeFeedDealCard.swift
//  Ivx
//
//  Deal card for the canonical investor-first home feed — renders the exact
//  payload every platform shows: property name, city, construction phase,
//  investment amount, ROI, minimum investment, progress %, and the
//  View Deal + Invest Now CTAs.
//

import SwiftUI

struct HomeFeedDealCard: View {
    let deal: HomeFeedDeal
    var onTapDetail: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DealPhotoView(photo: deal.photoUrl, height: 170)

            VStack(alignment: .leading, spacing: 6) {
                badgeRow
                Text(deal.name ?? "Investment Opportunity")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let city = deal.city, !city.isEmpty {
                    Label(city, systemImage: "mappin.and.ellipse")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .lineLimit(1)
                }

                statsRow
                progressRow
                ctaRow
            }
            .padding(12)
        }
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onTapDetail?()
        }
    }

    private var badgeRow: some View {
        HStack(spacing: 6) {
            Text((deal.dealType ?? "JV").replacingOccurrences(of: "_", with: " ").uppercased())
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(Color.ivxGold)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.ivxGold.opacity(0.12))
                .clipShape(.rect(cornerRadius: 4))
            if let phase = deal.phase, !phase.isEmpty {
                Text(phase.uppercased())
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxGreen)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.ivxGreen.opacity(0.12))
                    .clipShape(.rect(cornerRadius: 4))
            }
            Spacer()
        }
    }

    private var statsRow: some View {
        HStack(spacing: 14) {
            if let amount = deal.investmentAmount, amount > 0 {
                stat(label: "Investment", value: compactCurrency(amount), tint: .white)
            }
            if let roi = deal.expectedRoi, !roi.isEmpty {
                stat(label: "Expected ROI", value: "\(roi)%", tint: .ivxGreen)
            }
            if let min = deal.minInvestment, min > 0 {
                stat(label: "Min Invest", value: compactCurrency(min), tint: .white)
            }
            Spacer()
        }
        .padding(.top, 2)
    }

    @ViewBuilder
    private var progressRow: some View {
        if let progress = deal.progressPercent {
            HStack(spacing: 8) {
                ProgressView(value: min(max(progress, 0), 100), total: 100)
                    .tint(Color.ivxGold)
                Text("\(progress.formatted(.number.precision(.fractionLength(0))))%")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxTextSecondary)
            }
            .padding(.top, 2)
        }
    }

    private var ctaRow: some View {
        HStack(spacing: 8) {
            Button {
                onTapDetail?()
            } label: {
                Text("View Deal")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.ivxSurfaceTertiary)
                    .clipShape(.rect(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            Link(destination: URL(string: "https://chat.ivxholding.com/investor")!) {
                Text("Invest Now")
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.ivxGold)
                    .clipShape(.rect(cornerRadius: 8))
            }
        }
        .padding(.top, 4)
    }

    private func stat(label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.ivxTextTertiary)
            Text(value)
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundStyle(tint)
        }
    }

    private var dealURL: URL {
        if let raw = deal.url, let url = URL(string: raw) { return url }
        return URL(string: "https://ivxholding.com/#deals")!
    }

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
}
