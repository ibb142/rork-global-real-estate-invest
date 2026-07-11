package com.rork.ivx26android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rork.ivx26android.models.Reel
import com.rork.ivx26android.models.ReelComment
import com.rork.ivx26android.ui.theme.IVXGold
import com.rork.ivx26android.viewmodels.ReelsViewModel
import kotlinx.coroutines.launch

/**
 * Real persisted comments for one reel, with a composer that writes through
 * the IVX backend service-role API.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommentsSheet(
    reel: Reel,
    viewModel: ReelsViewModel,
    onDismiss: () -> Unit,
) {
    var comments by remember { mutableStateOf<List<ReelComment>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var draft by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var sendError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(reel.id) {
        isLoading = true
        comments = viewModel.loadComments(reel.id)
        isLoading = false
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            Text(
                text = "Comments (${comments.size})",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(bottom = 12.dp),
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp),
            ) {
                when {
                    isLoading -> CircularProgressIndicator(
                        color = IVXGold,
                        modifier = Modifier.align(Alignment.Center),
                    )
                    comments.isEmpty() -> Text(
                        text = "No comments yet.\nBe the first to comment on this reel.",
                        color = Color.Gray,
                        fontSize = 13.sp,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(horizontal = 32.dp),
                    )
                    else -> LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    ) {
                        items(comments, key = { it.id }) { comment ->
                            Column {
                                Text(
                                    text = comment.authorName,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.Gray,
                                )
                                Text(text = comment.body, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }

            sendError?.let { error ->
                Text(
                    text = error,
                    color = Color(0xFFE53935),
                    fontSize = 11.sp,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    placeholder = { Text("Add a comment…") },
                    modifier = Modifier.weight(1f),
                    maxLines = 3,
                )
                IconButton(
                    onClick = {
                        val body = draft.trim()
                        if (body.isEmpty() || isSending) return@IconButton
                        scope.launch {
                            isSending = true
                            sendError = null
                            val ok = viewModel.sendComment(reel.id, body)
                            if (ok) {
                                draft = ""
                                comments = viewModel.loadComments(reel.id)
                            } else {
                                sendError = "Comment could not be posted right now. Please try again."
                            }
                            isSending = false
                        }
                    },
                    enabled = !isSending && draft.trim().isNotEmpty(),
                ) {
                    if (isSending) {
                        CircularProgressIndicator(color = IVXGold, modifier = Modifier.height(20.dp))
                    } else {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Send comment",
                            tint = IVXGold,
                        )
                    }
                }
            }
        }
    }
}
