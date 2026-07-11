package com.rork.ivx26android.viewmodels

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.rork.ivx26android.models.JVDeal
import com.rork.ivx26android.models.Reel
import com.rork.ivx26android.models.ReelCategory
import com.rork.ivx26android.models.ReelComment
import com.rork.ivx26android.services.ReelsService
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReelsUiState(
    val reels: List<Reel> = emptyList(),
    val dealsByProjectId: Map<String, JVDeal> = emptyMap(),
    val likeCounts: Map<String, Int> = emptyMap(),
    val saveCounts: Map<String, Int> = emptyMap(),
    val commentCounts: Map<String, Int> = emptyMap(),
    val likedIds: Set<String> = emptySet(),
    val savedIds: Set<String> = emptySet(),
    val selectedCategory: ReelCategory = ReelCategory.ALL,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
) {
    val filteredReels: List<Reel>
        get() = reels.filter { selectedCategory.matches(it, savedIds) }

    fun categoryCount(category: ReelCategory): Int =
        reels.count { category.matches(it, savedIds) }

    fun dealFor(reel: Reel): JVDeal? = reel.projectId?.let { dealsByProjectId[it] }
}

class ReelsViewModel(application: Application) : AndroidViewModel(application) {

    private companion object {
        const val PREFS_NAME = "ivx_reels_prefs"
        const val LIKED_KEY = "ivx_reel_liked_ids"
        const val SAVED_KEY = "ivx_reel_saved_ids"
        const val DEVICE_KEY_KEY = "ivx_reels_device_key"
    }

    private val prefs: SharedPreferences =
        application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Stable per-device key so like/save writes are idempotent server-side. */
    val deviceKey: String = prefs.getString(DEVICE_KEY_KEY, null)?.takeIf { it.length >= 8 }
        ?: "android-${UUID.randomUUID().toString().lowercase()}".also {
            prefs.edit().putString(DEVICE_KEY_KEY, it).apply()
        }

    private val _uiState = MutableStateFlow(
        ReelsUiState(
            likedIds = prefs.getStringSet(LIKED_KEY, emptySet()) ?: emptySet(),
            savedIds = prefs.getStringSet(SAVED_KEY, emptySet()) ?: emptySet(),
        )
    )
    val uiState: StateFlow<ReelsUiState> = _uiState.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val fetched = ReelsService.fetchReels()
                val projectIds = fetched.mapNotNull { it.projectId }.distinct()

                val dealsDeferred = async(Dispatchers.IO) { ReelsService.fetchDeals(projectIds) }
                val countsDeferred = async(Dispatchers.IO) { ReelsService.fetchSocialCounts() }
                val deals = dealsDeferred.await()
                val counts = countsDeferred.await()

                _uiState.update { state ->
                    state.copy(
                        reels = fetched,
                        dealsByProjectId = deals.associateBy { it.id },
                        likeCounts = counts.likes,
                        saveCounts = counts.saves,
                        commentCounts = counts.comments,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, errorMessage = e.message ?: "Couldn't load reels.")
                }
            }
        }
    }

    fun selectCategory(category: ReelCategory) {
        _uiState.update { it.copy(selectedCategory = category) }
    }

    fun toggleLike(reel: Reel) {
        val state = _uiState.value
        val nowLiked = !state.likedIds.contains(reel.id)
        val newLiked = if (nowLiked) state.likedIds + reel.id else state.likedIds - reel.id
        val current = state.likeCounts[reel.id] ?: 0
        val newCounts = state.likeCounts + (reel.id to if (nowLiked) current + 1 else maxOf(0, current - 1))
        _uiState.update { it.copy(likedIds = newLiked, likeCounts = newCounts) }
        prefs.edit().putStringSet(LIKED_KEY, newLiked).apply()
        viewModelScope.launch(Dispatchers.IO) {
            ReelsService.sendLike(reel.id, deviceKey, nowLiked)
        }
    }

    fun toggleSave(reel: Reel) {
        val state = _uiState.value
        val nowSaved = !state.savedIds.contains(reel.id)
        val newSaved = if (nowSaved) state.savedIds + reel.id else state.savedIds - reel.id
        val current = state.saveCounts[reel.id] ?: 0
        val newCounts = state.saveCounts + (reel.id to if (nowSaved) current + 1 else maxOf(0, current - 1))
        _uiState.update { it.copy(savedIds = newSaved, saveCounts = newCounts) }
        prefs.edit().putStringSet(SAVED_KEY, newSaved).apply()
        viewModelScope.launch(Dispatchers.IO) {
            ReelsService.sendSave(reel.id, deviceKey, nowSaved)
        }
    }

    suspend fun loadComments(reelId: String): List<ReelComment> = try {
        ReelsService.fetchComments(reelId)
    } catch (e: Exception) {
        emptyList()
    }

    suspend fun sendComment(reelId: String, body: String): Boolean {
        val ok = ReelsService.sendComment(reelId, deviceKey, "Guest", body)
        if (ok) {
            _uiState.update { state ->
                val current = state.commentCounts[reelId] ?: 0
                state.copy(commentCounts = state.commentCounts + (reelId to current + 1))
            }
        }
        return ok
    }
}
