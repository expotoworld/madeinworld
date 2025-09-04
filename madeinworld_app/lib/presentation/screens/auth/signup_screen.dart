import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../core/utils/responsive_utils.dart';
import '../../providers/auth_provider.dart';
import 'email_verification_screen.dart';


class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

  @override
  void dispose() {
    _usernameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(
        backgroundColor: AppColors.lightBackground,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.primaryText),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          '注册账户',
          style: AppTextStyles.responsiveCardTitle(context),
        ),
      ),
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
                    Text('注册中...', style: TextStyle(color: AppColors.secondaryText)),
                  ],
                ),
              );
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Signup form
                    _buildSignupForm(context, authProvider),

                    SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 32)),

                    // Signup button
                    _buildSignupButton(context, authProvider),

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

  Widget _buildSignupForm(BuildContext context, AuthProvider authProvider) {
    return Column(
      children: [
        // Username field
        TextFormField(
          controller: _usernameController,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: '用户名',
            hintText: '请输入用户名',
            prefixIcon: Icon(Icons.person_outlined),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '请输入用户名';
            }
            if (value.length < 3) {
              return '用户名至少需要3个字符';
            }
            return null;
          },
          onChanged: (_) => authProvider.clearError(),
        ),

        const SizedBox(height: 16),

        // Email field
        TextFormField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: '邮箱',
            hintText: '请输入您的邮箱地址',
            prefixIcon: Icon(Icons.email_outlined),
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

        const SizedBox(height: 16),

        // Password field
        TextFormField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: '密码',
            hintText: '请输入密码（至少8个字符）',
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
        ),

        const SizedBox(height: 16),

        // Confirm password field
        TextFormField(
          controller: _confirmPasswordController,
          obscureText: _obscureConfirmPassword,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: '确认密码',
            hintText: '请再次输入密码',
            prefixIcon: const Icon(Icons.lock_outlined),
            suffixIcon: IconButton(
              icon: Icon(
                _obscureConfirmPassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
              ),
              onPressed: () {
                setState(() {
                  _obscureConfirmPassword = !_obscureConfirmPassword;
                });
              },
            ),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '请确认密码';
            }
            if (value != _passwordController.text) {
              return '密码不匹配';
            }
            return null;
          },
          onChanged: (_) => authProvider.clearError(),
        ),

        const SizedBox(height: 16),

        // Optional fields section
        Text(
          '可选信息',
          style: AppTextStyles.responsiveBodySmall(context).copyWith(
            color: AppColors.secondaryText,
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 12),

        // First name field
        TextFormField(
          controller: _firstNameController,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: '名字',
            hintText: '请输入您的名字（可选）',
            prefixIcon: Icon(Icons.badge_outlined),
          ),
        ),

        const SizedBox(height: 16),

        // Last name field
        TextFormField(
          controller: _lastNameController,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(
            labelText: '姓氏',
            hintText: '请输入您的姓氏（可选）',
            prefixIcon: Icon(Icons.badge_outlined),
          ),
        ),

        const SizedBox(height: 16),

        // Phone field
        TextFormField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            labelText: '电话号码',
            hintText: '请输入您的电话号码（可选）',
            prefixIcon: Icon(Icons.phone_outlined),
          ),
          onFieldSubmitted: (_) => _handleSignup(context, authProvider),
        ),
      ],
    );
  }

  Widget _buildSignupButton(BuildContext context, AuthProvider authProvider) {
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: authProvider.isLoading ? null : () => _handleSignup(context, authProvider),
        child: Text(
          '注册',
          style: AppTextStyles.responsiveButton(context),
        ),
      ),
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

  void _handleSignup(BuildContext context, AuthProvider authProvider) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final email = _emailController.text.trim();

    try {
      await authProvider.sendVerificationCode(email);
      if (!context.mounted) return;
      Navigator.of(context).push(
        PageRouteBuilder(
          pageBuilder: (context, animation, secondaryAnimation) => EmailVerificationScreen(initialEmail: email),
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
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error),
      );
    }
  }
}
