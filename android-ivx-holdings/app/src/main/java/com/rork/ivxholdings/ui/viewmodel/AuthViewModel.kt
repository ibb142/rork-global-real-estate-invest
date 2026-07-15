package com.rork.ivxholdings.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rork.ivxholdings.data.repository.IVXRepository
import com.rork.ivxholdings.util.AppConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthState {
    data object Idle : AuthState()
    data object Loading : AuthState()
    data class Authenticated(val email: String) : AuthState()
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(private val repository: IVXRepository) : ViewModel() {

    private val _state = MutableStateFlow<AuthState>(AuthState.Idle)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    fun login(email: String = AppConfig.OWNER_EMAIL) {
        _state.value = AuthState.Loading
        viewModelScope.launch {
            val result = repository.login(email)
            result.fold(
                onSuccess = { response ->
                    if (response.success && response.accessToken != null) {
                        _state.value = AuthState.Authenticated(response.email ?: email)
                    } else {
                        _state.value = AuthState.Error(response.message ?: "Login failed")
                    }
                },
                onFailure = { error ->
                    _state.value = AuthState.Error(error.message ?: "Network error")
                }
            )
        }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logout()
            _state.value = AuthState.Idle
        }
    }

    fun resetError() {
        if (_state.value is AuthState.Error) {
            _state.value = AuthState.Idle
        }
    }
}
