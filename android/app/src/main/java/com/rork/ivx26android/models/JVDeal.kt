package com.rork.ivx26android.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Investment deal row from `jv_deals` (Supabase). Note: `propertyValue` is a
 * camelCase column in the production schema; the rest are snake_case.
 */
@Serializable
data class JVDeal(
    val id: String,
    val title: String? = null,
    @SerialName("project_name") val projectName: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    val status: String? = null,
    val currency: String? = null,
    @SerialName("expected_roi") val expectedRoi: Double? = null,
    @SerialName("estimated_value") val estimatedValue: Double? = null,
    val propertyValue: Double? = null,
    @SerialName("total_investment") val totalInvestment: Double? = null,
    @SerialName("min_investment") val minInvestment: Double? = null,
) {
    val displayTitle: String
        get() {
            val name = (title ?: projectName ?: "").trim()
            return name.ifEmpty { "Investment Project" }
        }

    val displayLocation: String?
        get() {
            val parts = listOfNotNull(city, state, country).map { it.trim() }.filter { it.isNotEmpty() }
            return if (parts.isEmpty()) null else parts.joinToString(", ")
        }

    /**
     * Canonical investment card math (same rules as landing + backend):
     * salePrice = estimated_value || propertyValue || total_investment.
     */
    val salePrice: Double?
        get() = listOf(estimatedValue, propertyValue, totalInvestment)
            .firstOrNull { it != null && it > 0 }

    val minimumInvestment: Double
        get() = if (minInvestment != null && minInvestment > 0) minInvestment else 50.0

    val minimumOwnershipPercent: Double?
        get() {
            val price = salePrice ?: return null
            if (price <= 0) return null
            return (minimumInvestment / price) * 100.0
        }
}

/** Comment row from `reel_comments`. */
@Serializable
data class ReelComment(
    val id: String,
    @SerialName("reel_id") val reelId: String,
    @SerialName("author_name") val authorName: String,
    val body: String,
    @SerialName("created_at") val createdAt: String? = null,
)
