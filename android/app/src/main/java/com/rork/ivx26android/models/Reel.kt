package com.rork.ivx26android.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Canonical reel row from `jv_deal_reels` (Supabase).
 * Every reel is typed (`reelType` + `categoryTags`) and, when investment-linked,
 * carries its immutable `projectId` — never matched by index or title.
 */
@Serializable
data class Reel(
    val id: String,
    @SerialName("project_id") val projectId: String? = null,
    @SerialName("video_url") val videoUrl: String,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    val caption: String? = null,
    @SerialName("sort_order") val sortOrder: Int? = null,
    @SerialName("reel_type") val reelType: String = "walkthrough",
    @SerialName("category_tags") val categoryTags: List<String> = emptyList(),
    @SerialName("buyer_id") val buyerId: String? = null,
    @SerialName("seller_id") val sellerId: String? = null,
    @SerialName("tokenized_asset_id") val tokenizedAssetId: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val isInvestment: Boolean
        get() = projectId != null || reelType == "investment" || categoryTags.contains("investment")
}

/** Feed categories — mirrors the `ivx_reels_integrity` category definitions. */
enum class ReelCategory(val label: String) {
    ALL("All"),
    INVESTMENTS("Investments"),
    BUYERS("Buyers"),
    SELLERS("Sellers"),
    JV_DEALS("JV Deals"),
    TOKENIZED("Tokenized"),
    CONSTRUCTION("Construction"),
    WALKTHROUGHS("Walkthroughs"),
    OPPORTUNITIES("Opportunities"),
    SAVED("Saved");

    fun matches(reel: Reel, savedIds: Set<String>): Boolean = when (this) {
        ALL -> true
        INVESTMENTS -> reel.isInvestment
        BUYERS -> reel.reelType == "buyer" || reel.categoryTags.contains("buyer") || reel.buyerId != null
        SELLERS -> reel.reelType == "seller" || reel.categoryTags.contains("seller") || reel.sellerId != null
        JV_DEALS -> reel.projectId != null || reel.reelType == "jv" || reel.categoryTags.contains("jv")
        TOKENIZED -> reel.reelType == "tokenized" || reel.categoryTags.contains("tokenized") || reel.tokenizedAssetId != null
        CONSTRUCTION -> reel.reelType == "construction" || reel.categoryTags.contains("construction")
        WALKTHROUGHS -> reel.reelType == "walkthrough" || reel.categoryTags.contains("walkthrough")
        OPPORTUNITIES -> reel.reelType == "opportunity" || reel.categoryTags.contains("opportunity")
        SAVED -> savedIds.contains(reel.id)
    }
}
