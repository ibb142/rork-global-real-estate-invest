package com.rork.ivx26android.services

import com.rork.ivx26android.models.JVDeal
import com.rork.ivx26android.models.Reel
import com.rork.ivx26android.models.ReelComment
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.encodeURLQueryComponent
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Public client configuration for the canonical IVX reels sources.
 * The Supabase anon key is a public client key (RLS enforces read-only access
 * to published + approved rows); social writes go through the IVX backend.
 */
object IVXBackend {
    const val SUPABASE_URL = "https://kvclcdjmjghndxsngfzb.supabase.co"
    const val SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk"
    const val API_BASE = "https://ivx-holdings-platform.onrender.com"
    const val LANDING_BASE = "https://ivxholding.com"
}

class ReelsServiceException(status: Int) : Exception("Reels source returned HTTP $status.")

/** Aggregated real social counts (from persisted rows — never faked). */
data class SocialCounts(
    val likes: Map<String, Int>,
    val saves: Map<String, Int>,
    val comments: Map<String, Int>,
)

/** Read path: direct Supabase REST (public RLS). Write path: IVX backend API. */
object ReelsService {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    private val client: HttpClient = HttpClient(Android) {
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) {
            requestTimeoutMillis = 20_000
            connectTimeoutMillis = 15_000
        }
    }

    private suspend inline fun <reified T> supabaseGet(path: String): T {
        val response = client.get("${IVXBackend.SUPABASE_URL}/rest/v1/$path") {
            header("apikey", IVXBackend.SUPABASE_ANON_KEY)
            header("Authorization", "Bearer ${IVXBackend.SUPABASE_ANON_KEY}")
            header("Accept", "application/json")
        }
        if (!response.status.isSuccess()) throw ReelsServiceException(response.status.value)
        return response.body()
    }

    suspend fun fetchReels(): List<Reel> = supabaseGet(
        "jv_deal_reels?select=*&published=eq.true&approved=eq.true&order=sort_order.asc,created_at.desc&limit=200"
    )

    suspend fun fetchDeals(ids: List<String>): List<JVDeal> {
        if (ids.isEmpty()) return emptyList()
        val quoted = ids.joinToString(",") { "\"$it\"" }
        val list = "in.($quoted)".encodeURLQueryComponent()
        val select = "id,title,project_name,city,state,country,status,currency,expected_roi,estimated_value,propertyValue,total_investment,min_investment"
        return supabaseGet("jv_deals?select=$select&id=$list")
    }

    @Serializable
    private data class ReelRef(@SerialName("reel_id") val reelId: String)

    /** Real persisted social counts — aggregated from actual rows, never faked. */
    suspend fun fetchSocialCounts(): SocialCounts {
        val likeRows: List<ReelRef> = supabaseGet("reel_likes?select=reel_id&limit=5000")
        val saveRows: List<ReelRef> = supabaseGet("reel_saves?select=reel_id&limit=5000")
        val commentRows: List<ReelRef> = supabaseGet("reel_comments?select=reel_id&approved=eq.true&limit=5000")
        fun tally(rows: List<ReelRef>): Map<String, Int> =
            rows.groupingBy { it.reelId }.eachCount()
        return SocialCounts(tally(likeRows), tally(saveRows), tally(commentRows))
    }

    suspend fun fetchComments(reelId: String): List<ReelComment> = supabaseGet(
        "reel_comments?select=id,reel_id,author_name,body,created_at&reel_id=eq.$reelId&approved=eq.true&order=created_at.desc&limit=100"
    )

    // --- Social writes (IVX backend service-role API) ---

    private suspend fun backendPost(path: String, body: Map<String, String>): Boolean {
        return try {
            val response = client.post("${IVXBackend.API_BASE}$path") {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
            response.status.isSuccess()
        } catch (e: Exception) {
            false
        }
    }

    suspend fun sendLike(reelId: String, deviceKey: String, liked: Boolean): Boolean =
        backendPost("/api/reels/$reelId/like", mapOf("device_key" to deviceKey, "action" to if (liked) "like" else "unlike"))

    suspend fun sendSave(reelId: String, deviceKey: String, saved: Boolean): Boolean =
        backendPost("/api/reels/$reelId/save", mapOf("device_key" to deviceKey, "action" to if (saved) "save" else "unsave"))

    suspend fun sendComment(reelId: String, deviceKey: String, authorName: String, body: String): Boolean =
        backendPost("/api/reels/$reelId/comments", mapOf("device_key" to deviceKey, "author_name" to authorName, "body" to body))
}
