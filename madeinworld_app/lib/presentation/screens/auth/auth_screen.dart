import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../core/utils/responsive_utils.dart';
import '../../providers/auth_provider.dart';
import '../../../data/models/auth_models.dart';

import 'my_countries.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  final FocusNode _codeFocus = FocusNode();

  // phone
  String _phoneE164 = '';
  String? _selectedIso;

  // ui
  bool _usePhone = false; // false=email, true=phone
  bool _isLoading = false;
  String? _errorMessage;
  int _countdown = 0;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _codeFocus.dispose();
    super.dispose();
  }


  void _startCountdown() {
    setState(() => _countdown = 60);
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return false;
      setState(() => _countdown--);
      return _countdown > 0;
    });
  }

  Future<void> _sendCode(AuthProvider auth) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      if (_usePhone) {
        await auth.sendPhoneVerification(_phoneE164.trim());
      } else {
        await auth.sendVerificationCode(_emailController.text.trim());
      }
      if (!mounted) return;
      setState(() { _isLoading = false; });
      _startCountdown();
      _codeFocus.requestFocus();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_usePhone ? '验证码已通过短信发送' : '验证码已发送到邮箱'),
          backgroundColor: AppColors.themeRed,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() { _isLoading = false; _errorMessage = e.toString(); });
    }
  }

  Future<void> _verifyCode(AuthProvider auth) async {
    if (_codeController.text.trim().length != 6) {
      setState(() => _errorMessage = '请输入6位验证码');
      return;
    }
    setState(() { _isLoading = true; _errorMessage = null; });
    try {
      final isPhoneFlow = auth.state.status == AuthStatus.awaitingVerification
          ? (auth.state.pendingPhone != null)
          : _usePhone;
      if (isPhoneFlow) {
        final phone = auth.state.pendingPhone ?? _phoneE164.trim();
        await auth.verifyPhoneCode(phone, _codeController.text.trim());
      } else {
        final email = auth.state.pendingEmail ?? _emailController.text.trim();
        await auth.verifyEmailCode(email, _codeController.text.trim());
      }
    } catch (e) {
      if (!mounted) return;
      setState(() { _errorMessage = e.toString(); });
    } finally {
      if (mounted) {
        setState(() { _isLoading = false; });
      }
    }
  }

  void _resendCode(AuthProvider auth) {
    if (_countdown != 0) return;
    final isPhoneFlow = auth.state.status == AuthStatus.awaitingVerification
        ? (auth.state.pendingPhone != null)
        : _usePhone;
    if (isPhoneFlow) {
      final phone = auth.state.pendingPhone ?? _phoneE164.trim();
      if (phone.isNotEmpty) {
        auth.sendPhoneVerification(phone).then((_) => _startCountdown());
      }
    } else {
      final email = auth.state.pendingEmail ?? _emailController.text.trim();
      if (email.isNotEmpty) {
        auth.sendVerificationCode(email).then((_) => _startCountdown());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: context.read<AuthProvider>().state.status != AuthStatus.awaitingVerification,
      onPopInvokedWithResult: (didPop, result) {
        final awaiting = context.read<AuthProvider>().state.status == AuthStatus.awaitingVerification;
        if (!didPop && awaiting) {
          context.read<AuthProvider>().cancelVerification();
          setState(() { _codeController.clear(); _errorMessage = null; _countdown = 0; });
        }
      },
      child: Scaffold(
        backgroundColor: AppColors.lightBackground,
        body: SafeArea(
          child: Consumer<AuthProvider>(
            builder: (context, auth, _) {
              if (auth.isLoading || _isLoading) {
                return const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircularProgressIndicator(color: AppColors.themeRed),
                      SizedBox(height: 16),
                      Text('处理中...', style: TextStyle(color: AppColors.secondaryText)),
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
                      _buildHeader(context),
                      SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 32)),
                      if (auth.state.status != AuthStatus.awaitingVerification) ...[
                        _buildToggle(context),
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
                        if (_usePhone) _buildPhoneInput(context, auth) else _buildEmailInput(context, auth),
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 24)),
                        _buildPrimaryButton(context, label: '发送验证码', onPressed: () => _sendCode(auth)),
                      ] else ...[
                        _buildCodeHeader(context),
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
                        _buildCodeField(context),
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 24)),
                        _buildPrimaryButton(context, label: '验证并登录', onPressed: () => _verifyCode(auth)),
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
                        TextButton(
                          onPressed: _countdown == 0 ? () => _resendCode(auth) : null,
                          child: Text(
                            _countdown > 0 ? '重新发送 $_countdown秒' : '重新发送验证码',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: _countdown > 0 ? AppColors.secondaryText : AppColors.themeRed,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                      if ((_errorMessage ?? auth.errorMessage) != null) ...[
                        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
                        _buildErrorMessage(context, (_errorMessage ?? auth.errorMessage)!),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(color: AppColors.themeRed, borderRadius: BorderRadius.circular(20)),
          child: const Icon(Icons.shopping_bag, color: Colors.white, size: 40),
        ),
        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 16)),
        Text('Made in World', style: AppTextStyles.responsiveMajorHeader(context).copyWith(
          fontSize: ResponsiveUtils.getResponsiveFontSize(context, 28), fontWeight: FontWeight.w800,
        )),
        SizedBox(height: ResponsiveUtils.getResponsiveSpacing(context, 8)),
        Text(
          (context.watch<AuthProvider>().state.status == AuthStatus.awaitingVerification)
              ? (_usePhone ? '输入短信验证码' : '输入邮箱验证码')
              : '请选择登录方式',
          style: AppTextStyles.responsiveBody(context).copyWith(
            color: AppColors.secondaryText,
            fontSize: ResponsiveUtils.getResponsiveFontSize(context, 16),
          ),
        ),
      ],
    );
  }

  Widget _buildToggle(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => setState(() => _usePhone = false),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _usePhone ? Colors.white : AppColors.themeRed.withValues(alpha: 0.08),
                  borderRadius: const BorderRadius.only(topLeft: Radius.circular(10), bottomLeft: Radius.circular(10)),
                ),
                child: Text('邮箱', style: AppTextStyles.responsiveBody(context).copyWith(
                  color: _usePhone ? AppColors.primaryText : AppColors.themeRed,
                  fontWeight: _usePhone ? FontWeight.w500 : FontWeight.w700,
                )),
              ),
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: () => setState(() => _usePhone = true),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _usePhone ? AppColors.themeRed.withValues(alpha: 0.08) : Colors.white,
                  borderRadius: const BorderRadius.only(topRight: Radius.circular(10), bottomRight: Radius.circular(10)),
                ),
                child: Text('手机', style: AppTextStyles.responsiveBody(context).copyWith(
                  color: _usePhone ? AppColors.themeRed : AppColors.primaryText,
                  fontWeight: _usePhone ? FontWeight.w700 : FontWeight.w500,
                )),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmailInput(BuildContext context, AuthProvider auth) {
    return TextFormField(
      controller: _emailController,
      keyboardType: TextInputType.emailAddress,
      textInputAction: TextInputAction.done,
      decoration: const InputDecoration(
        labelText: '邮箱',
        hintText: '请输入您的邮箱地址',
        prefixIcon: Icon(Icons.email_outlined),
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) return '请输入邮箱地址';
        // Simple, robust check: contains one '@' and a dot after it
        final at = value.indexOf('@');
        final dot = value.lastIndexOf('.');
        if (at <= 0 || dot <= at + 1 || dot == value.length - 1) {
          return '请输入有效的邮箱地址';
        }
        return null;
      },
      onChanged: (_) => auth.clearError(),
      onFieldSubmitted: (_) => _sendCode(auth),
    );
  }

  Widget _buildPhoneInput(BuildContext context, AuthProvider auth) {
    return IntlPhoneField(
      countries: patchedCountries(),
      disableLengthCheck: true,
      decoration: const InputDecoration(
        labelText: '手机号',
        hintText: '请输入您的手机号',
        prefixIcon: Icon(Icons.phone_outlined),
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      dropdownIconPosition: IconPosition.trailing,
      dropdownIcon: const Icon(Icons.arrow_drop_down),
      flagsButtonPadding: const EdgeInsets.only(left: 8, right: 4),
      onCountryChanged: (country) {
        _selectedIso = country.code;
        debugPrint('IntlPhoneField: iso=${country.code}, dial=+${country.dialCode}');
      },
      onChanged: (phone) {
        try {
          final iso = (_selectedIso ?? phone.countryISOCode).toUpperCase();
          final isoEnum = IsoCode.values.firstWhere(
            (e) => e.name.toUpperCase() == iso,
            orElse: () => IsoCode.values.firstWhere((e) => e == IsoCode.US),
          );
          final parsed = PhoneNumber.parse(
            phone.number,
            destinationCountry: isoEnum,
          );
          var e164 = parsed.international.replaceAll(' ', '');
          if (iso == 'IT' && !e164.startsWith('+39')) {
            final itParsed = PhoneNumber.parse(phone.number, destinationCountry: IsoCode.IT);
            e164 = itParsed.international.replaceAll(' ', '');
          }
          setState(() => _phoneE164 = e164);
        } catch (e) {
          setState(() => _phoneE164 = phone.completeNumber);
        }
        auth.clearError();
      },
      validator: (phone) {
        if (_usePhone && (phone == null || phone.number.isEmpty)) return '请输入有效的手机号';
        return null;
      },
    );
  }

  Widget _buildCodeHeader(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: () {
            context.read<AuthProvider>().cancelVerification();
            setState(() { _codeController.clear(); _errorMessage = null; _countdown = 0; });
          },
          icon: const Icon(Icons.arrow_back, color: AppColors.themeRed),
        ),
        Expanded(
          child: Text(
            (context.read<AuthProvider>().state.pendingPhone != null)
                ? '验证码已发送至 ${context.read<AuthProvider>().state.pendingPhone}'
                : '验证码已发送至 ${context.read<AuthProvider>().state.pendingEmail ?? _emailController.text}',
            style: AppTextStyles.bodySmall.copyWith(color: AppColors.secondaryText, fontSize: 14),
          ),
        ),
      ],
    );
  }

  Widget _buildCodeField(BuildContext context) {
    return TextFormField(
      controller: _codeController,
      focusNode: _codeFocus,
      autofocus: true,
      keyboardType: TextInputType.number,
      maxLength: 6,
      textAlign: TextAlign.center,
      style: AppTextStyles.majorHeader.copyWith(fontSize: 24, letterSpacing: 8),
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        hintText: '000000',
        hintStyle: AppTextStyles.bodySmall.copyWith(color: Colors.grey.shade400, fontSize: 24, letterSpacing: 8),
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
        contentPadding: const EdgeInsets.symmetric(vertical: 16),
        counterText: '',
      ),
      onChanged: (value) { if (value.length == 6) _verifyCode(context.read<AuthProvider>()); },
    );
  }

  Widget _buildPrimaryButton(BuildContext context, {required String label, required VoidCallback onPressed}) {
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: onPressed,
        child: Text(label, style: AppTextStyles.responsiveButton(context)),
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
          Icon(Icons.error_outline, color: AppColors.error, size: ResponsiveUtils.getResponsiveFontSize(context, 20)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: AppTextStyles.responsiveBodySmall(context).copyWith(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}

