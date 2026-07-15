package com.rork.ivxholdings.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.rork.ivxholdings.ui.screens.AboutScreen
import com.rork.ivxholdings.ui.screens.AgentsScreen
import com.rork.ivxholdings.ui.screens.ChatScreen
import com.rork.ivxholdings.ui.screens.HomeScreen
import com.rork.ivxholdings.ui.screens.VercelExitScreen
import com.rork.ivxholdings.ui.theme.IVXDark
import com.rork.ivxholdings.ui.theme.IVXGold
import com.rork.ivxholdings.ui.theme.IVXOnSurface
import com.rork.ivxholdings.ui.theme.IVXOnSurfaceMuted
import com.rork.ivxholdings.ui.theme.IVXSurfaceVariant

sealed class Screen(val route: String, val label: String, val icon: ImageVector) {
    data object Home : Screen("home", "Home", Icons.Default.Home)
    data object VercelExit : Screen("vercel_exit", "Exit", Icons.Default.Dashboard)
    data object Agents : Screen("agents", "Agents", Icons.Default.Group)
    data object Chat : Screen("chat", "AI", Icons.AutoMirrored.Filled.Chat)
    data object About : Screen("about", "Health", Icons.Default.HealthAndSafety)
}

private val bottomNavItems = listOf(
    Screen.Home,
    Screen.VercelExit,
    Screen.Agents,
    Screen.Chat,
    Screen.About
)

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val currentBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStack?.destination?.route

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = IVXDark,
                contentColor = IVXOnSurface
            ) {
                bottomNavItems.forEach { screen ->
                    val selected = currentRoute == screen.route
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.startDestinationRoute ?: Screen.Home.route) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            Icon(
                                imageVector = screen.icon,
                                contentDescription = screen.label
                            )
                        },
                        label = { Text(screen.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = IVXGold,
                            selectedTextColor = IVXGold,
                            unselectedIconColor = IVXOnSurfaceMuted,
                            unselectedTextColor = IVXOnSurfaceMuted,
                            indicatorColor = IVXSurfaceVariant
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) { HomeScreen(navController = navController) }
            composable(Screen.VercelExit.route) { VercelExitScreen(navController = navController) }
            composable(Screen.Agents.route) { AgentsScreen(navController = navController) }
            composable(Screen.Chat.route) { ChatScreen(navController = navController) }
            composable(Screen.About.route) { AboutScreen(navController = navController) }
        }
    }
}
