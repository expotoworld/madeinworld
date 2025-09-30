import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../providers/auth_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, authProvider, child) {
        final user = authProvider.user;
        final userName = user?.displayName ?? '尊贵的用户';
        final userEmail = user?.email ?? 'user.name@email.com';
        const userAvatarUrl = 'https://i.pravatar.cc/96';
    
    return Scaffold(
      appBar: AppBar(
        title: Text(
          '我的',
          style: AppTextStyles.majorHeader,
        ),
        backgroundColor: AppColors.lightBackground,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: () {
              // Settings
            },
            icon: const Icon(
              Icons.settings,
              color: AppColors.secondaryText,
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // User Profile Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    // Avatar
                    ClipRRect(
                      borderRadius: BorderRadius.circular(32),
                      child: CachedNetworkImage(
                        imageUrl: userAvatarUrl,
                        width: 64,
                        height: 64,
                        fit: BoxFit.cover,
                        placeholder: (context, url) => Container(
                          width: 64,
                          height: 64,
                          color: AppColors.lightRed,
                          child: const Icon(
                            Icons.person,
                            color: AppColors.themeRed,
                            size: 32,
                          ),
                        ),
                        errorWidget: (context, url, error) => Container(
                          width: 64,
                          height: 64,
                          color: AppColors.lightRed,
                          child: const Icon(
                            Icons.person,
                            color: AppColors.themeRed,
                            size: 32,
                          ),
                        ),
                      ),
                    ),
                    
                    const SizedBox(width: 16),
                    
                    // User Info
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            userName,
                            style: AppTextStyles.cardTitle,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '+41791234567',
                            style: AppTextStyles.bodySmall,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            userEmail,
                            style: AppTextStyles.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    
                    // Edit button
                    IconButton(
                      onPressed: () {
                        // Edit profile
                      },
                      icon: const Icon(
                        Icons.edit,
                        color: AppColors.secondaryText,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 24),
            
            // Menu Items
            _buildMenuSection('订单管理', [
              _buildMenuItem(Icons.shopping_bag, '我的订单', () {}),
              _buildMenuItem(Icons.favorite, '我的收藏', () {}),
              _buildMenuItem(Icons.history, '浏览历史', () {}),
            ]),
            
            const SizedBox(height: 16),
            
            _buildMenuSection('账户设置', [
              _buildMenuItem(Icons.location_on, '收货地址', () {}),
              _buildMenuItem(Icons.payment, '支付方式', () {}),
              _buildMenuItem(Icons.security, '账户安全', () {}),
            ]),
            
            const SizedBox(height: 16),
            
            _buildMenuSection('帮助与支持', [
              _buildMenuItem(Icons.help, '帮助中心', () {}),
              _buildMenuItem(Icons.feedback, '意见反馈', () {}),
              _buildMenuItem(Icons.info, '关于我们', () {}),
            ]),
            
            const SizedBox(height: 32),
            
            // Logout Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => _handleLogout(context, authProvider),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.lightRed,
                  foregroundColor: AppColors.themeRed,
                  elevation: 0,
                ),
                child: Text(
                  '退出登录',
                  style: AppTextStyles.button.copyWith(
                    color: AppColors.themeRed,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
      },
    );
  }

  void _handleLogout(BuildContext context, AuthProvider authProvider) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text(
            '确认退出',
            style: AppTextStyles.cardTitle,
          ),
          content: Text(
            '您确定要退出登录吗？',
            style: AppTextStyles.body,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(
                '取消',
                style: AppTextStyles.body.copyWith(
                  color: AppColors.secondaryText,
                ),
              ),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                authProvider.logout();
              },
              child: Text(
                '退出',
                style: AppTextStyles.body.copyWith(
                  color: AppColors.themeRed,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildMenuSection(String title, List<Widget> items) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            title,
            style: AppTextStyles.body.copyWith(
              fontWeight: FontWeight.w600,
              color: AppColors.secondaryText,
            ),
          ),
        ),
        Card(
          child: Column(
            children: items,
          ),
        ),
      ],
    );
  }

  Widget _buildMenuItem(IconData icon, String title, VoidCallback onTap) {
    return ListTile(
      leading: Icon(
        icon,
        color: AppColors.secondaryText,
      ),
      title: Text(
        title,
        style: AppTextStyles.body,
      ),
      trailing: const Icon(
        Icons.chevron_right,
        color: AppColors.secondaryText,
      ),
      onTap: onTap,
    );
  }
}
