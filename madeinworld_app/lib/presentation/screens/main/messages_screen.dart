import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';

class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final placeholderMessages = [
      {
        'title': '订单更新',
        'message': '您的订单 #12345 已发货',
        'time': '2分钟前',
        'unread': true,
      },
      {
        'title': '促销活动',
        'message': '新品上架，限时优惠！',
        'time': '1小时前',
        'unread': true,
      },
      {
        'title': '系统通知',
        'message': '欢迎使用Made in World应用',
        'time': '昨天',
        'unread': false,
      },
    ];
    
    return Scaffold(
      appBar: AppBar(
        title: Text(
          '消息',
          style: AppTextStyles.majorHeader,
        ),
        backgroundColor: AppColors.lightBackground,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: () {
              // Mark all as read
            },
            icon: const Icon(
              Icons.done_all,
              color: AppColors.secondaryText,
            ),
          ),
        ],
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: placeholderMessages.length,
        itemBuilder: (context, index) {
          final message = placeholderMessages[index];
          final isUnread = message['unread'] as bool;
          
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              leading: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: isUnread ? AppColors.lightRed : AppColors.lightBackground,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.notifications,
                  color: isUnread ? AppColors.themeRed : AppColors.secondaryText,
                ),
              ),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      message['title'] as String,
                      style: AppTextStyles.cardTitle.copyWith(
                        fontWeight: isUnread ? FontWeight.w700 : FontWeight.w600,
                      ),
                    ),
                  ),
                  if (isUnread)
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AppColors.themeRed,
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 4),
                  Text(
                    message['message'] as String,
                    style: AppTextStyles.body.copyWith(
                      color: isUnread ? AppColors.primaryText : AppColors.secondaryText,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    message['time'] as String,
                    style: AppTextStyles.bodySmall,
                  ),
                ],
              ),
              onTap: () {
                // Navigate to message detail
              },
            ),
          );
        },
      ),
    );
  }
}
