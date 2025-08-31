import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../core/utils/responsive_utils.dart';
import '../../providers/auth_provider.dart';
import 'signup_screen.dart';
import 'email_verification_screen.dart';


class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        child: Consumer<AuthProvider>(
          builder: (context, authProvider, child) {
            // Show loading indicator when authenticating
            if (authProvider.isLoading) {
              return const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircularProgressIndicator(color: AppColors.themeRed),
                    SizedBox(height: 16),
                    Text('登录中...', style: TextStyle(color: AppColors.secondaryText)),
                  ],
                ),
              );
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Logo and title section
                    _buildHeader(context),

                    SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 48)),

                    // Login form
                    _buildLoginForm(context, authProvider),

                    SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 24)),

                    // Login button
                    _buildLoginButton(context, authProvider),

                    SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 32)),

                    // Sign up link
                    _buildSignupLink(context),

                    // Error message
                    if (authProvider.errorMessage != null) ...[
                      SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
                      _buildErrorMessage(context, authProvider.errorMessage!),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Column(
      children: [
        // App logo placeholder
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: AppColors.themeRed,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Icon(
            Icons.shopping_bag,
            size: ResponsiveUtils.getResponsiveFontSize(context, 40),
            color: AppColors.white,
          ),
        ),

        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 24)),

        Text(
          'Made in World',
          style: AppTextStyles.responsiveMajorHeader(context).copyWith(
            fontSize: ResponsiveUtils.getResponsiveFontSize(context, 28),
            fontWeight: FontWeight.w800,
          ),
        ),

        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 8)),

        Text(
          '欢迎回来',
          style: AppTextStyles.responsiveBody(context).copyWith(
            color: AppColors.secondaryText,
            fontSize: ResponsiveUtils.getResponsiveFontSize(context, 16),
          ),
        ),
      ],
    );
  }

  Widget _buildLoginForm(BuildContext context, AuthProvider authProvider) {
    return Column(
      children: [
        // Email field
        TextFormField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: '邮箱',
            hintText: '请输入您的邮箱地址',
            prefixIcon: const Icon(Icons.email_outlined),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '请输入邮箱地址';
            }
            if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
              return '请输入有效的邮箱地址';
            }
            return null;
          },
          onChanged: (_) => authProvider.clearError(),
        ),

        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),

        // Password field
        TextFormField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(
            labelText: '密码',
            hintText: '请输入您的密码',
            prefixIcon: const Icon(Icons.lock_outlined),
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
              ),
              onPressed: () {
                setState(() {
                  _obscurePassword = !_obscurePassword;
                });
              },
            ),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '请输入密码';
            }
            if (value.length < 8) {
              return '密码至少需要8个字符';
            }
            return null;
          },
          onChanged: (_) => authProvider.clearError(),
          onFieldSubmitted: (_) => _handleLogin(context, authProvider),
        ),
      ],
    );
  }

  Widget _buildLoginButton(BuildContext context, AuthProvider authProvider) {
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: authProvider.isLoading ? null : () => _handleLogin(context, authProvider),
        child: Text(
          '登录',
          style: AppTextStyles.responsiveButton(context),
        ),
      ),
    );
  }

  Widget _buildSignupLink(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          '还没有账户？',
          style: AppTextStyles.responsiveBody(context).copyWith(
            color: AppColors.secondaryText,
          ),
        ),
        TextButton(
          onPressed: () => _navigateToSignup(context),
          child: Text(
            '立即注册',
            style: AppTextStyles.responsiveBody(context).copyWith(
              color: AppColors.themeRed,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildErrorMessage(BuildContext context, String message) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.error_outline,
            color: AppColors.error,
            size: ResponsiveUtils.getResponsiveFontSize(context, 20),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: AppTextStyles.responsiveBodySmall(context).copyWith(
                color: AppColors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleLogin(BuildContext context, AuthProvider authProvider) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    // New passwordless flow: send verification then navigate to the verification screen
    await authProvider.sendVerificationCode(_emailController.text.trim());

    if (!context.mounted) return;
    Navigator.of(context).push(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => EmailVerificationScreen(
          initialEmail: _emailController.text.trim(),
        ),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.0, 1.0),
              end: Offset.zero,
            ).animate(CurvedAnimation(parent: animation, curve: Curves.easeInOut)),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 300),
        reverseTransitionDuration: const Duration(milliseconds: 300),
      ),
    );
  }

  void _navigateToSignup(BuildContext context) {
    Navigator.of(context).push(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => const SignupScreen(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0.0, 1.0), // Start from bottom
              end: Offset.zero, // End at normal position
            ).animate(CurvedAnimation(
              parent: animation,
              curve: Curves.easeInOut,
            )),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 300),
        reverseTransitionDuration: const Duration(milliseconds: 300),
      ),
    );
  }
}
