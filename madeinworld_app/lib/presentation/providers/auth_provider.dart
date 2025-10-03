import 'dart:convert';
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../data/models/auth_models.dart';
import '../../data/models/user.dart';
import '../../data/services/auth_service.dart';

/// Authentication provider for managing user authentication state
class AuthProvider extends ChangeNotifier {
  // Secure storage for JWT tokens
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  // Storage keys
  static const String _tokenKey = 'auth_token';
  static const String _refreshTokenKey = 'auth_refresh_token';
  static const String _userKey = 'auth_user';

  // Auth service instance
  final AuthService _authService = AuthService();

  // Scheduled token pre-refresh timer
  Timer? _refreshTimer;

  // Client-side invalid code attempts while awaiting verification
  int _verifyAttempts = 0;

  // Current authentication state
  AuthState _state = const AuthState.unknown();

  /// Get current authentication state
  AuthState get state => _state;

  /// Get current user (null if not authenticated)
  User? get user => _state.user;

  /// Get current token (null if not authenticated)
  String? get token => _state.token;

  /// Check if user is authenticated
  bool get isAuthenticated => _state.isAuthenticated;

  /// Check if authentication is loading
  bool get isLoading => _state.isLoading;

  /// Check if user is unauthenticated
  bool get isUnauthenticated => _state.isUnauthenticated;

  /// Get error message if any
  String? get errorMessage => _state.errorMessage;

  /// Initialize authentication state on app startup
  Future<void> initialize() async {
    debugPrint('AuthProvider: Initializing authentication state...');

    _updateState(const AuthState.loading());

    try {
      // Check if we have a stored refresh token
      final storedRefresh = await _secureStorage.read(key: _refreshTokenKey);

      if (storedRefresh == null) {
        debugPrint('AuthProvider: No stored refresh token found');
        _updateState(const AuthState.unauthenticated());
        return;
      }

      debugPrint('AuthProvider: Found stored refresh token, refreshing access token...');

      // Use refresh token to obtain new access and refresh tokens
      final refreshed = await _authService.refreshWithRefreshToken(storedRefresh);
      final refreshedToken = refreshed['token']!;
      final newRefresh = refreshed['refresh_token']!;
      // Persist the refreshed tokens immediately
      await _secureStorage.write(key: _tokenKey, value: refreshedToken);
      await _secureStorage.write(key: _refreshTokenKey, value: newRefresh);

      // Get stored user data
      final storedUserJson = await _secureStorage.read(key: _userKey);
      if (storedUserJson == null) {
        debugPrint('AuthProvider: No stored user data found');
        await _clearStoredAuth();
        _updateState(const AuthState.unauthenticated());
        return;
      }

      // Parse stored user data from JSON
      final userData = json.decode(storedUserJson) as Map<String, dynamic>;
      final user = User.fromJson(userData);

      debugPrint('AuthProvider: Token validation successful for user: ${user.email}');

      _updateState(AuthState.authenticated(user: user, token: refreshedToken));
      _scheduleTokenRefresh(refreshedToken);
    } catch (e) {
      debugPrint('AuthProvider: Token validation failed: $e');
      await _clearStoredAuth();
      _updateState(const AuthState.unauthenticated());
    }
  }

  /// Send verification code to email (passwordless authentication)
  Future<void> sendVerificationCode(String email) async {
    debugPrint('AuthProvider: Sending verification code to email: $email');

    _updateState(const AuthState.loading());

    try {
      await _authService.sendVerificationCode(email);

      debugPrint('AuthProvider: Verification code sent successfully to: $email');

      // Reset attempts and move to awaitingVerification so UI can navigate to code entry screen
      _verifyAttempts = 0;
      _updateState(AuthState.awaitingVerification(email: email));
    } catch (e) {
      debugPrint('AuthProvider: Failed to send verification code: $e');
      _updateState(AuthState.unauthenticated(errorMessage: e.toString()));
      // Re-throw the exception so the UI can handle it
      rethrow;
    }
  }

  /// Verify email code and authenticate user (passwordless authentication)
  Future<void> verifyEmailCode(String email, String code) async {
    final effectiveEmail = (email.isNotEmpty) ? email : (_state.pendingEmail ?? '');
    final attemptNum = _verifyAttempts + 1; // pre-increment display
    debugPrint('AuthProvider: Verifying code for email: $effectiveEmail (attempt $attemptNum/3)');

    _updateState(const AuthState.loading());

    try {
      final response = await _authService.verifyEmailCode(effectiveEmail, code);

      // success: clear attempts and store auth
      _verifyAttempts = 0;
      await _storeAuthData(response.token, response.user, refreshToken: response.refreshToken);

      debugPrint('AuthProvider: Email verification successful for user: ${response.user.email}');

      _updateState(AuthState.authenticated(
        user: response.user,
        token: response.token,
      ));
      _scheduleTokenRefresh(response.token);
    } catch (e) {
      debugPrint('AuthProvider: Email verification failed: $e');
      if (e is AuthException && e.isInvalidCredentials) {
        _verifyAttempts += 1;
        if (_verifyAttempts >= 3) {
          _updateState(const AuthState.unauthenticated(errorMessage: '验证码错误次数过多，请确认您的邮箱地址是否正确'));
        } else {
          _updateState(_state.copyWith(
            status: AuthStatus.awaitingVerification,
            errorMessage: '验证码错误，请重试 (' '$_verifyAttempts/3' ')',
            pendingEmail: effectiveEmail,
          ));
        }
        return; // do not rethrow, stay on verification screen
      }
      _updateState(AuthState.unauthenticated(errorMessage: e.toString()));
      rethrow;
    }
  }

  /// Send verification code to phone (passwordless authentication)
  Future<void> sendPhoneVerification(String phoneE164) async {
    debugPrint('AuthProvider: Sending verification code to phone: $phoneE164');
    _updateState(const AuthState.loading());
    try {
      await _authService.sendPhoneVerification(phoneE164);
      debugPrint('AuthProvider: Phone verification code sent to: $phoneE164');
      _verifyAttempts = 0;
      _updateState(AuthState.awaitingVerification(phone: phoneE164));
    } catch (e) {
      debugPrint('AuthProvider: Failed to send phone verification: $e');
      _updateState(AuthState.unauthenticated(errorMessage: e.toString()));
      rethrow;
    }
  }

  /// Verify phone code and authenticate user
  Future<void> verifyPhoneCode(String phoneE164, String code) async {
    final effectivePhone = (phoneE164.isNotEmpty) ? phoneE164 : (_state.pendingPhone ?? '');
    final attemptNum = _verifyAttempts + 1;
    debugPrint('AuthProvider: Verifying phone code for: $effectivePhone (attempt $attemptNum/3)');
    _updateState(const AuthState.loading());
    try {
      final response = await _authService.verifyPhoneCode(effectivePhone, code);
      _verifyAttempts = 0;
      await _storeAuthData(response.token, response.user, refreshToken: response.refreshToken);
      debugPrint('AuthProvider: Phone verification successful for user: ${response.user.phone ?? ''}');
      _updateState(AuthState.authenticated(user: response.user, token: response.token));
      _scheduleTokenRefresh(response.token);
    } catch (e) {
      debugPrint('AuthProvider: Phone verification failed: $e');
      if (e is AuthException && e.isInvalidCredentials) {
        _verifyAttempts += 1;
        if (_verifyAttempts >= 3) {
          _updateState(const AuthState.unauthenticated(errorMessage: '验证码错误次数过多，请确认您的手机号是否正确'));
        } else {
          _updateState(_state.copyWith(
            status: AuthStatus.awaitingVerification,
            errorMessage: '验证码错误，请重试 (' '$_verifyAttempts/3' ')',
            pendingPhone: effectivePhone,
          ));
        }
        return;
      }
      _updateState(AuthState.unauthenticated(errorMessage: e.toString()));
      rethrow;
    }
  }


  /// Sign up a new user (DEPRECATED - use email verification instead)
  @Deprecated('Use sendVerificationCode and verifyEmailCode instead')
  Future<void> signup({
    required String username,
    required String email,
    required String password,
    String? phone,
    String? firstName,
    String? lastName,
  }) async {
    debugPrint('AuthProvider: Starting signup for email: $email (DEPRECATED)');

    _updateState(const AuthState.loading());

    try {
      final request = SignupRequest(
        username: username,
        email: email,
        password: password,
        phone: phone,
        firstName: firstName,
        lastName: lastName,
      );

      final response = await _authService.signup(request);

      // Store authentication data
      await _storeAuthData(response.token, response.user);

      debugPrint('AuthProvider: Signup successful for user: ${response.user.email}');

      _updateState(AuthState.authenticated(
        user: response.user,
        token: response.token,
      ));
    } catch (e) {
      debugPrint('AuthProvider: Signup failed: $e');
      _updateState(AuthState.unauthenticated(errorMessage: e.toString()));
    }
  }

  /// Log in an existing user (DEPRECATED - use email verification instead)
  @Deprecated('Use sendVerificationCode and verifyEmailCode instead')
  Future<void> login({
    required String email,
    required String password,
  }) async {
    debugPrint('AuthProvider: Starting login for email: $email (DEPRECATED)');

    _updateState(const AuthState.loading());

    try {
      final request = LoginRequest(email: email, password: password);
      final response = await _authService.login(request);

      // Store authentication data
      await _storeAuthData(response.token, response.user);

      debugPrint('AuthProvider: Login successful for user: ${response.user.email}');

      _updateState(AuthState.authenticated(
        user: response.user,
        token: response.token,
      ));
    } catch (e) {
      debugPrint('AuthProvider: Login failed: $e');
      _updateState(AuthState.unauthenticated(errorMessage: e.toString()));
    }
  }

  /// Log out the current user
  Future<void> logout() async {
    debugPrint('AuthProvider: Logging out user');

    _updateState(const AuthState.loading());

    try {
      await _clearStoredAuth();
      _updateState(const AuthState.unauthenticated());
      debugPrint('AuthProvider: Logout successful');
    } catch (e) {
      debugPrint('AuthProvider: Logout error: $e');
      // Even if clearing storage fails, we should still log out
      _updateState(const AuthState.unauthenticated());
    }
  }

  /// Clear any error messages
  void clearError() {
    if (_state.errorMessage != null) {
      _updateState(_state.copyWith(errorMessage: null));
    }
  }

  /// Store authentication data securely
  Future<void> _storeAuthData(String token, User user, {String? refreshToken}) async {
    try {
      await _secureStorage.write(key: _tokenKey, value: token);
      if (refreshToken != null) {
        await _secureStorage.write(key: _refreshTokenKey, value: refreshToken);
      }
      await _secureStorage.write(key: _userKey, value: json.encode(user.toJson()));
      debugPrint('AuthProvider: Authentication data stored successfully');
    } catch (e) {
      debugPrint('AuthProvider: Failed to store auth data: $e');
      throw Exception('Failed to store authentication data');
    }
  }

  /// Clear stored authentication data
  Future<void> _clearStoredAuth() async {
    _cancelScheduledRefresh();
    try {
      await _secureStorage.delete(key: _tokenKey);
      await _secureStorage.delete(key: _refreshTokenKey);
      await _secureStorage.delete(key: _userKey);
      debugPrint('AuthProvider: Stored authentication data cleared');
    } catch (e) {
      debugPrint('AuthProvider: Failed to clear auth data: $e');
    }
  }

  /// Update authentication state and notify listeners
  void _updateState(AuthState newState) {
    _state = newState;
    notifyListeners();
    debugPrint('AuthProvider: State updated to: ${newState.status}');
  }

  // Cancel any scheduled token refresh
  void _cancelScheduledRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  // Decode JWT 'exp' claim (seconds since epoch). Returns null if not present.
  int? _decodeJwtExp(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      final normalized = base64Url.normalize(parts[1]);
      final payload = utf8.decode(base64Url.decode(normalized));
      final data = json.decode(payload) as Map<String, dynamic>;
      final exp = data['exp'];
      if (exp is int) return exp;
      if (exp is String) return int.tryParse(exp);
      return null;
    } catch (_) {
      return null;
    }
  }

  // Schedule a token pre-refresh ~5 minutes before expiry, or fallback interval.
  void _scheduleTokenRefresh(String token, {Duration fallback = const Duration(minutes: 25)}) {
    _cancelScheduledRefresh();
    Duration delay;
    final exp = _decodeJwtExp(token);
    if (exp != null) {
      final expiry = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
      delay = expiry.difference(DateTime.now()) - const Duration(minutes: 5);
      if (delay.isNegative) delay = const Duration(seconds: 30);
    } else {
      delay = fallback;
    }
    _refreshTimer = Timer(delay, () async {
      try {
        final storedRefresh = await _secureStorage.read(key: _refreshTokenKey);
        if (storedRefresh == null) {
          _updateState(const AuthState.unauthenticated());
          return;
        }
        final refreshed = await _authService.refreshWithRefreshToken(storedRefresh);
        final newToken = refreshed['token']!;
        final newRefresh = refreshed['refresh_token']!;
        await _secureStorage.write(key: _tokenKey, value: newToken);
        await _secureStorage.write(key: _refreshTokenKey, value: newRefresh);
        if (_state.user != null) {
          _updateState(AuthState.authenticated(user: _state.user!, token: newToken));
        } else {
          final storedUserJson = await _secureStorage.read(key: _userKey);
          if (storedUserJson != null) {
            final user = User.fromJson(json.decode(storedUserJson) as Map<String, dynamic>);
            _updateState(AuthState.authenticated(user: user, token: newToken));
          }
        }
        _scheduleTokenRefresh(newToken);
      } catch (e) {
        // If refresh fails, move to unauthenticated (UI will handle redirect)
        _updateState(const AuthState.unauthenticated());
      }
    });
  }

  /// Allow UI to cancel verification flow and return to input screen
  Future<void> cancelVerification() async {
    _verifyAttempts = 0;
    _updateState(const AuthState.unauthenticated());
  }


}
