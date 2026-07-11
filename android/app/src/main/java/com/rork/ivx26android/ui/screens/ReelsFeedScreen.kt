package com.rork.ivx26android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rork.ivx26android.models.Reel
import com.rork.ivx26android.models.ReelCategory
import com.rork.ivx26android.ui.components.CommentsSheet
import com.rork.ivx26android.ui.components.ReelCard
import com.rork.ivx26android.ui.theme.IVXGold
import com.rork.ivx26android.viewmodels.ReelsViewModel

/**
 * IVX Reels — vertical full-screen paging feed over the canonical
 * `jv_deal_reels` source with category chips and real social counts.
 */
@Composable
fun ReelsFeedScreen(viewModel: ReelsViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var commentsReel by remember { mutableStateOf<Reel?>(null) }

    LaunchedEffect(Unit) { viewModel.load() }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        val filtered = uiState.filteredReels

        when {
            uiState.isLoading && uiState.reels.isEmpty() -> LoadingState()
            uiState.errorMessage != null && uiState.reels.isEmpty() -> ErrorState(
                message = uiState.errorMessage ?: "",
                onRetry = { viewModel.load() },
            )
            filtered.isEmpty() -> EmptyState(uiState.selectedCategory)
            else -> {
                val pagerState = rememberPagerState(pageCount = { filtered.size })

                LaunchedEffect(uiState.selectedCategory) {
                    if (filtered.isNotEmpty()) pagerState.scrollToPage(0)
                }

                VerticalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize(),
                    beyondViewportPageCount = 0,
                ) { page ->
                    val reel = filtered[page]
                    ReelCard(
                        reel = reel,
                        deal = uiState.dealFor(reel),
                        isActive = pagerState.currentPage == page,
                        uiState = uiState,
                        onLike = { viewModel.toggleLike(reel) },
                        onSave = { viewModel.toggleSave(reel) },
                        onComments = { commentsReel = reel },
                    )
                }
            }
        }

        Header(
            uiState = uiState,
            onSelectCategory = { viewModel.selectCategory(it) },
        )
    }

    commentsReel?.let { reel ->
        CommentsSheet(
            reel = reel,
            viewModel = viewModel,
            onDismiss = { commentsReel = null },
        )
    }
}

@Composable
private fun Header(
    uiState: com.rork.ivx26android.viewmodels.ReelsUiState,
    onSelectCategory: (ReelCategory) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color.Black.copy(alpha = 0.72f), Color.Transparent)
                )
            )
            .statusBarsPadding()
            .padding(top = 6.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "IVX",
                color = IVXGold,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
            )
            Spacer(modifier = Modifier.size(6.dp))
            Text(
                text = "Reels",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
            )
            Spacer(modifier = Modifier.weight(1f))
            if (uiState.isLoading && uiState.reels.isNotEmpty()) {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                )
            }
        }

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(horizontal = 16.dp),
            modifier = Modifier.padding(bottom = 8.dp),
        ) {
            items(ReelCategory.entries) { category ->
                CategoryChip(
                    category = category,
                    isSelected = uiState.selectedCategory == category,
                    count = uiState.categoryCount(category),
                    onClick = { onSelectCategory(category) },
                )
            }
        }
    }
}

@Composable
private fun CategoryChip(
    category: ReelCategory,
    isSelected: Boolean,
    count: Int,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .background(
                if (isSelected) IVXGold else Color.White.copy(alpha = 0.14f),
                CircleShape,
            )
            .border(1.dp, Color.White.copy(alpha = if (isSelected) 0f else 0.2f), CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text(
            text = category.label,
            color = if (isSelected) Color.Black else Color.White,
            fontSize = 12.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.SemiBold,
        )
        if (count > 0) {
            Text(
                text = count.toString(),
                color = if (isSelected) Color.Black.copy(alpha = 0.65f) else Color.White.copy(alpha = 0.55f),
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun LoadingState() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = IVXGold)
        Spacer(modifier = Modifier.size(14.dp))
        Text(
            text = "Loading IVX Reels…",
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 14.sp,
        )
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Filled.WifiOff,
            contentDescription = null,
            tint = IVXGold,
            modifier = Modifier.size(40.dp),
        )
        Spacer(modifier = Modifier.size(14.dp))
        Text(
            text = "Couldn't load reels",
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = message,
            color = Color.White.copy(alpha = 0.6f),
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp),
        )
        Spacer(modifier = Modifier.size(14.dp))
        Button(
            onClick = onRetry,
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(containerColor = IVXGold, contentColor = Color.Black),
        ) {
            Text("Retry", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun EmptyState(category: ReelCategory) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = if (category == ReelCategory.SAVED) Icons.Filled.BookmarkBorder else Icons.Filled.VideocamOff,
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.4f),
            modifier = Modifier.size(40.dp),
        )
        Spacer(modifier = Modifier.size(12.dp))
        Text(
            text = if (category == ReelCategory.SAVED) "No saved reels yet" else "No reels in ${category.label}",
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = if (category == ReelCategory.SAVED)
                "Tap the bookmark on any reel to save it here."
            else
                "New reels appear here as soon as they're published.",
            color = Color.White.copy(alpha = 0.6f),
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}
