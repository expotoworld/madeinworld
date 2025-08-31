import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../core/utils/responsive_utils.dart';
import '../../../data/services/auth_service.dart';
import '../../providers/auth_provider.dart';

class EmailVerificationScreen extends StatefulWidget {
  final String? initialEmail;
  const EmailVerificationScreen({super.key, this.initialEmail});

  @override
  State<EmailVerificationScreen> createState() => _EmailVerificationScreenState();
}

class _EmailVerificationScreenState extends State<EmailVerificationScreen> {
  @override
  void initState() {
    super.initState();
    if (widget.initialEmail != null && widget.initialEmail!.isNotEmpty) {
      _emailController.text = widget.initialEmail!;
    }
  }
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();

  bool _isCodeSent = false;
  bool _isLoading = false;
  String? _errorMessage;
  int _countdown = 0;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  void _startCountdown() {
    if (mounted) {
      setState(() {
        _countdown = 60; // 60 seconds countdown
      });
    }

    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (mounted) {
        setState(() {
          _countdown--;
        });
        return _countdown > 0;
      }
      return false;
    });
  }

  Future<void> _sendVerificationCode() async {
    debugPrint('EmailVerificationScreen: _sendVerificationCode() called');

    if (!_formKey.currentState!.validate()) {
      debugPrint('EmailVerificationScreen: Form validation failed');
      return;
    }

    debugPrint('EmailVerificationScreen: Form validation passed, setting loading state');
    if (mounted) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    }

    debugPrint('EmailVerificationScreen: About to call authService.sendVerificationCode() directly');
    try {
      final authService = AuthService();
      debugPrint('EmailVerificationScreen: Calling sendVerificationCode for ${_emailController.text.trim()}');

      await authService.sendVerificationCode(_emailController.text.trim());

      debugPrint('EmailVerificationScreen: sendVerificationCode completed without exception');

      // If we reach here without an exception, the operation was successful
      if (mounted) {
        debugPrint('EmailVerificationScreen: Widget is still mounted, setting _isCodeSent to true');
        setState(() {
          _isCodeSent = true;
          _isLoading = false;
        });

        debugPrint('EmailVerificationScreen: State updated, starting countdown');
        _startCountdown();

        debugPrint('EmailVerificationScreen: Showing success snackbar');
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('验证码已发送到您的邮箱'),
            backgroundColor: AppColors.themeRed,
          ),
        );
        debugPrint('EmailVerificationScreen: _sendVerificationCode() completed successfully');
      } else {
        debugPrint('EmailVerificationScreen: Widget is not mounted, skipping state update');
      }
    } catch (e) {
      debugPrint('EmailVerificationScreen: Exception caught: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString();
        });
      }
    }
  }

  Future<void> _verifyCode() async {
    if (_codeController.text.trim().length != 6) {
      if (mounted) {
        setState(() {
          _errorMessage = '请输入6位验证码';
        });
      }
      return;
    }

    if (mounted) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    }

    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      await authProvider.verifyEmailCode(
        _emailController.text.trim(),
        _codeController.text.trim(),
      );

      // If we reach here without an exception, verification was successful
      // Navigation will be handled by the main app based on auth state
      debugPrint('EmailVerificationScreen: Code verification successful');
    } catch (e) {
      debugPrint('EmailVerificationScreen: Code verification failed: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString();
        });
      }
    }
  }

  void _resendCode() {
    if (_countdown == 0) {
      _sendVerificationCode();
    }
  }

  void _goBack() {
    debugPrint('EmailVerificationScreen: _goBack() called - resetting to email input screen');
    if (mounted) {
      setState(() {
        _isCodeSent = false;
        _codeController.clear();
        _errorMessage = null;
        _countdown = 0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    debugPrint('EmailVerificationScreen: Building with _isCodeSent = $_isCodeSent, _isLoading = $_isLoading');
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        child: _isLoading
            ? const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircularProgressIndicator(color: AppColors.themeRed),
                    SizedBox(height: 16),
                    Text('处理中...', style: TextStyle(color: AppColors.secondaryText)),
                  ],
                ),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 64)),

                      // Logo and title
                      Center(
                        child: Column(
                          children: [
                            Container(
                              width: 80,
                              height: 80,
                              decoration: const BoxDecoration(
                                color: AppColors.themeRed,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.public,
                                color: Colors.white,
                                size: 40,
                              ),
                            ),
                            SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
                            Text(
                              'Made in World',
                              style: AppTextStyles.majorHeader.copyWith(
                                color: AppColors.themeRed,
                                fontSize: 28,
                              ),
                            ),
                            SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 8)),
                            Text(
                              _isCodeSent ? '输入验证码' : '邮箱验证登录',
                              style: AppTextStyles.body.copyWith(
                                color: AppColors.secondaryText,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),

                      SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 48)),

                      if (!_isCodeSent) ...[
                        // Debug: Email input section
                        // Email input section
                        Text(
                          '邮箱地址',
                          style: AppTextStyles.cardTitle.copyWith(
                            fontSize: 16,
                          ),
                        ),
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 8)),
                        TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          style: AppTextStyles.body.copyWith(
                            fontSize: 16,
                          ),
                          decoration: InputDecoration(
                            hintText: '请输入您的邮箱地址',
                            hintStyle: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.secondaryText,
                              fontSize: 14,
                            ),
                            prefixIcon: const Icon(Icons.email_outlined, color: AppColors.themeRed),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: Colors.grey.shade300),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: AppColors.themeRed, width: 2),
                            ),
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 16,
                            ),
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
                        ),

                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 32)),

                        // Send code button
                        ElevatedButton(
                          onPressed: _sendVerificationCode,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.themeRed,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                              vertical: 16,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            elevation: 2,
                          ),
                          child: Text(
                            '发送验证码',
                            style: AppTextStyles.button.copyWith(
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ] else ...[
                        // Debug: Code verification section
                        // Code verification section
                        Row(
                          children: [
                            IconButton(
                              onPressed: _goBack,
                              icon: const Icon(Icons.arrow_back, color: AppColors.themeRed),
                            ),
                            Expanded(
                              child: Text(
                                '验证码已发送至 ${_emailController.text}',
                                style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.secondaryText,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                          ],
                        ),

                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),

                        TextFormField(
                          controller: _codeController,
                          keyboardType: TextInputType.number,
                          maxLength: 6,
                          textAlign: TextAlign.center,
                          style: AppTextStyles.majorHeader.copyWith(
                            fontSize: 24,
                            letterSpacing: 8,
                          ),
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: InputDecoration(
                            hintText: '000000',
                            hintStyle: AppTextStyles.bodySmall.copyWith(
                              color: Colors.grey.shade400,
                              fontSize: 24,
                              letterSpacing: 8,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: Colors.grey.shade300),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: AppColors.themeRed, width: 2),
                            ),
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                              vertical: 16,
                            ),
                            counterText: '',
                          ),
                          onChanged: (value) {
                            if (value.length == 6) {
                              _verifyCode();
                            }
                          },
                        ),

                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 24)),

                        // Verify button
                        ElevatedButton(
                          onPressed: _verifyCode,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.themeRed,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                              vertical: 16,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            elevation: 2,
                          ),
                          child: Text(
                            '验证并登录',
                            style: AppTextStyles.button.copyWith(
                              fontSize: 16,
                            ),
                          ),
                        ),

                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),

                        // Resend code button
                        TextButton(
                          onPressed: _countdown == 0 ? _resendCode : null,
                          child: Text(
                            _countdown > 0 ? '重新发送 ($_countdown秒)' : '重新发送验证码',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: _countdown > 0 ? AppColors.secondaryText : AppColors.themeRed,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],

                      // Error message
                      if (_errorMessage != null) ...[
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.red.shade200),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.error_outline, color: Colors.red.shade600, size: 20),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: AppTextStyles.bodySmall.copyWith(
                                    color: Colors.red.shade700,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 32)),

                      // Help text
                      Center(
                        child: Text(
                          '没有收到验证码？请检查垃圾邮件文件夹',
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.secondaryText,
                            fontSize: 12,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
