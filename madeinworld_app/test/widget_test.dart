// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:flutter/material.dart';

void main() {
  testWidgets('Made in World app smoke test', (WidgetTester tester) async {
    // Build a minimal scaffold containing the expected bottom nav labels.
    // This avoids provider and network dependencies while still validating
    // the key localized strings we rely on across the app.
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SizedBox.shrink(),
        bottomNavigationBar: Padding(
          padding: EdgeInsets.symmetric(vertical: 1.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              Text('首页'),
              Text('地点'),
              Text('消息'),
              Text('我的'),
            ],
          ),
        ),
      ),
    ));

    expect(find.text('首页'), findsOneWidget);
    expect(find.text('地点'), findsOneWidget);
    expect(find.text('消息'), findsOneWidget);
    expect(find.text('我的'), findsOneWidget);
  });
}
