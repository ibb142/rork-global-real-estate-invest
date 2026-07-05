//
//  IVXComponents.swift
//  Ivx
//
//  Shared UI building blocks mirroring the Android app's cards and sections
//  (expo/app/(tabs)) so both platforms look identical.
//

import SwiftUI

/// Section header with optional trailing action — mirrors Android's "JV Deals / See All" rows.
struct IVXSectionHeader: View {
    let title: String
    var actionTitle: String? = nil
    var actionURL: URL? = nil

    var body: some View {
        HStack {
            Text(title)
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(.white)
            Spacer()
            if let actionTitle, let actionURL {
                Link(destination: actionURL) {
                    Text(actionTitle)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.ivxGold)
                }
            }
        }
        .padding(.horizontal)
    }
}

/// Stat tile used on Home / Portfolio — mirrors Android's stat cards.
struct StatCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.ivxGold)
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(.white)
            Text(title)
                .font(.caption)
                .foregroundStyle(Color.ivxTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }
}

/// Deal photo that handles both https URLs and base64 `data:` URIs
/// (production deals contain both), using the Color-anchor layout pattern.
struct DealPhotoView: View {
    let photo: String?
    let height: CGFloat

    var body: some View {
        Color.ivxSurface
            .frame(height: height)
            .overlay {
                photoContent
                    .allowsHitTesting(false)
            }
            .clipped()
    }

    @ViewBuilder
    private var photoContent: some View {
        if let photo, photo.hasPrefix("data:"), let image = decodeDataURI(photo) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else if let photo, let url = URL(string: photo), photo.hasPrefix("http") {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    placeholder
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        VStack(spacing: 6) {
            Image(systemName: "building.2")
                .font(.title)
                .foregroundStyle(Color.ivxTextTertiary)
            Text("No photos")
                .font(.caption)
                .foregroundStyle(Color.ivxTextTertiary)
        }
    }

    private func decodeDataURI(_ uri: String) -> UIImage? {
        guard let commaIndex = uri.firstIndex(of: ",") else { return nil }
        let base64 = String(uri[uri.index(after: commaIndex)...])
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }
}

/// JV deal card — mirrors Android's JVPropertyCard (photo, badge, name,
/// location, ROI row, Details + Invest Now buttons).
struct JVDealCard: View {
    let deal: JVDeal
    var width: CGFloat? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DealPhotoView(photo: deal.firstPhoto, height: 150)

            VStack(alignment: .leading, spacing: 6) {
                Text(deal.typeLabel.uppercased())
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxGold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.ivxGold.opacity(0.12))
                    .clipShape(.rect(cornerRadius: 4))

                Text(deal.displayName)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let location = deal.displayLocation {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .lineLimit(1)
                }

                HStack(spacing: 14) {
                    if let roi = deal.expectedRoi {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Expected ROI")
                                .font(.caption2)
                                .foregroundStyle(Color.ivxTextTertiary)
                            Text("\(roi.formatted(.number.precision(.fractionLength(0...1))))%")
                                .font(.subheadline)
                                .fontWeight(.bold)
                                .foregroundStyle(Color.ivxGreen)
                        }
                    }
                    if let min = deal.minInvestment, min > 0 {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Min Invest")
                                .font(.caption2)
                                .foregroundStyle(Color.ivxTextTertiary)
                            Text("$\(min.formatted(.number.precision(.fractionLength(0))))")
                                .font(.subheadline)
                                .fontWeight(.bold)
                                .foregroundStyle(.white)
                        }
                    }
                    Spacer()
                }
                .padding(.top, 2)

                HStack(spacing: 8) {
                    Link(destination: URL(string: "https://ivxholding.com/properties")!) {
                        Text("Details")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(Color.ivxSurfaceTertiary)
                            .clipShape(.rect(cornerRadius: 8))
                    }
                    Link(destination: URL(string: "https://chat.ivxholding.com/investor")!) {
                        Text("Invest Now")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(Color.ivxGold)
                            .clipShape(.rect(cornerRadius: 8))
                    }
                }
                .padding(.top, 4)
            }
            .padding(12)
        }
        .frame(width: width)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }
}

/// Quick action card — mirrors Android's QuickActionCard (Buy Property Shares, JV Partnerships…).
struct QuickActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let tint: Color
    let url: URL

    var body: some View {
        Link(destination: url) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(tint)
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextSecondary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
            .padding(12)
            .background(Color.ivxCard)
            .clipShape(.rect(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.ivxBorder, lineWidth: 1)
            )
        }
    }
}

/// Trust badge row item — mirrors Android's InlineTrustBadges.
struct TrustBadge: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(Color.ivxGold)
                .frame(width: 34, height: 34)
                .background(Color.ivxGold.opacity(0.1))
                .clipShape(.rect(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextSecondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(10)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }
}
