package com.rork.ivxholdings.di

import com.rork.ivxholdings.data.remote.IVXApiService
import com.rork.ivxholdings.data.repository.IVXRepository
import com.rork.ivxholdings.ui.viewmodel.AgentsViewModel
import com.rork.ivxholdings.ui.viewmodel.AuthViewModel
import com.rork.ivxholdings.ui.viewmodel.ChatViewModel
import com.rork.ivxholdings.ui.viewmodel.HealthViewModel
import com.rork.ivxholdings.ui.viewmodel.VercelExitViewModel
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.dsl.module

val appModule = module {
    single { IVXApiService() }
    single { IVXRepository(get()) }
    viewModel { AuthViewModel(get()) }
    viewModel { VercelExitViewModel(get()) }
    viewModel { AgentsViewModel(get()) }
    viewModel { ChatViewModel(get()) }
    viewModel { HealthViewModel(get()) }
}
