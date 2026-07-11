package com.rork.ivx26android.ui.components

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.rork.ivx26android.models.JVDeal
import com.rork.ivx26android.models.Reel
import com.rork.ivx26android.services.IVXBackend
import com.rork.ivx26android.ui.theme.IVXGold
import com.rork.ivx26android.viewmodels.ReelsUiState
import java.util.Locale

private val LikeRed = Color(0xFFFF4559)

/** One full-screen reel: looping video, right action rail, caption + investment card. */
@Composable
fun ReelCard(
    reel: Reel,
    deal: JVDeal?,
    isActive: Boolean,
    uiState: ReelsUiState,
    onLike: () -> Unit,
    onSave: () -> Unit,
    onComments: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val haptics = LocalHapticFeedback.current
    var isMuted by remember { mutableStateOf(false) }

    val isLiked = uiState.likedIds.contains(reel.id)
    val isSaved = uiState.savedIds.contains(reel.id)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { isMuted = !isMuted },
    ) {
        if (isActive) {
            ReelVideoPlayer(
                videoUrl = reel.videoUrl,
                isMuted = isMuted,
                modifier = Modifier.fillMaxSize(),
            )
        } else if (!reel.thumbnailUrl.isNullOrEmpty()) {
            AsyncImage(
                model = reel.thumbnailUrl,
                contentDescription = reel.caption ?: "Reel preview",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.35f),
                            Color.Transparent,
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.72f),
                        )
                    )
                )
        )

        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 14.dp)
                .padding(bottom = 26.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = reel.reelType.uppercase(Locale.US),
                    color = Color.Black,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.2.sp,
                    modifier = Modifier
                        .background(IVXGold, CircleShape)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )

                val caption = reel.caption?.trim().orEmpty()
                if (caption.isNotEmpty()) {
                    Text(
                        text = caption,
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                if (deal != null) {
                    InvestmentCard(deal = deal)
                } else {
                    Text(
                        text = "Explore Investment Opportunities →",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .background(Color.White.copy(alpha = 0.16f), CircleShape)
                            .border(1.dp, Color.White.copy(alpha = 0.25f), CircleShape)
                            .clickable { uriHandler.openUri("${IVXBackend.LANDING_BASE}/#projects") }
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                    )
                }
            }

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                RailButton(
                    icon = if (isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    tint = if (isLiked) LikeRed else Color.White,
                    count = uiState.likeCounts[reel.id] ?: 0,
                    contentDescription = if (isLiked) "Unlike" else "Like",
                ) {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    onLike()
                }

                RailButton(
                    icon = Icons.Filled.ChatBubble,
                    tint = Color.White,
                    count = uiState.commentCounts[reel.id] ?: 0,
                    contentDescription = "Comments",
                    onClick = onComments,
                )

                RailButton(
                    icon = if (isSaved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                    tint = if (isSaved) IVXGold else Color.White,
                    count = uiState.saveCounts[reel.id] ?: 0,
                    contentDescription = if (isSaved) "Unsave" else "Save",
                    onClick = onSave,
                )

                RailButton(
                    icon = Icons.Filled.Share,
                    tint = Color.White,
                    count = 0,
                    contentDescription = "Share",
                ) {
                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, reel.videoUrl)
                    }
                    context.startActivity(Intent.createChooser(sendIntent, "Share reel"))
                }

                RailButton(
                    icon = if (isMuted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                    tint = Color.White,
                    count = 0,
                    contentDescription = if (isMuted) "Unmute" else "Mute",
                ) { isMuted = !isMuted }
            }
        }
    }
}

@Composable
private fun RailButton(
    icon: ImageVector,
    tint: Color,
    count: Int,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = onClick, modifier = Modifier.size(44.dp)) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = tint,
                modifier = Modifier.size(28.dp),
            )
        }
        Text(
            text = if (count > 0) count.toString() else " ",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}
