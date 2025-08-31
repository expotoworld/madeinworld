import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_text_styles.dart';
import '../../../core/enums/store_type.dart';
import '../../../data/services/product_data_resolver.dart';
import '../../../data/services/api_service.dart';
import '../../../data/services/order_service.dart';
import '../../../data/models/product.dart';
import '../../../data/models/cart_item.dart';
import '../../../data/models/store.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/location_provider.dart';
import '../../widgets/common/product_tag.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  String? _selectedStoreId; // Currently selected store for multi-store carts
  final Map<String, Store> _storeCache = {}; // Cache for store information
  bool _wasInMultiStoreMode = false; // Track if we were previously in multi-store mode

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.lightBackground,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Consumer<CartProvider>(
          builder: (context, cartProvider, child) {
            final isLocationBased = _isLocationBasedMiniApp(cartProvider.currentMiniAppType);

            return Row(
              children: [
                // Left: 购物车 text (reduced padding to accommodate dropdown)
                Text(
                  '购物车',
                  style: AppTextStyles.majorHeader,
                ),

                if (isLocationBased && cartProvider.isNotEmpty) ...[
                  const Spacer(),
                  // Center: Store dropdown selector (only for location-based mini-apps with items)
                  _buildHeaderStoreSelector(cartProvider),
                  const Spacer(),
                ] else ...[
                  const Spacer(),
                ],

                // Right: 清空 button
                if (cartProvider.isNotEmpty)
                  TextButton(
                    onPressed: () {
                      _showClearCartDialog(context, cartProvider);
                    },
                    child: Text(
                      '清空',
                      style: AppTextStyles.body.copyWith(
                        color: AppColors.themeRed,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
      body: Consumer<CartProvider>(
        builder: (context, cartProvider, child) {
          if (cartProvider.isEmpty) {
            return _buildEmptyCart(context);
          }

          // Check if this is a location-dependent mini-app
          final isLocationBased = _isLocationBasedMiniApp(cartProvider.currentMiniAppType);

          if (isLocationBased) {
            return _buildLocationBasedCart(context, cartProvider);
          } else {
            return _buildStandardCart(context, cartProvider);
          }
        },
      ),
    );
  }

  /// Check if the current mini-app is location-dependent
  bool _isLocationBasedMiniApp(String? miniAppType) {
    return miniAppType == 'UnmannedStore' || miniAppType == 'ExhibitionSales';
  }

  /// Build cart for location-based mini-apps with store segmentation
  Widget _buildLocationBasedCart(BuildContext context, CartProvider cartProvider) {
    final locationProvider = Provider.of<LocationProvider>(context, listen: false);
    return FutureBuilder<Map<String, List<CartItem>>>(
      future: _groupItemsByStore(cartProvider.items, locationProvider),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(
              color: AppColors.themeRed,
            ),
          );
        }

        if (snapshot.hasError) {
          return Center(
            child: Text(
              '加载购物车失败: ${snapshot.error}',
              style: AppTextStyles.body.copyWith(
                color: AppColors.error,
              ),
            ),
          );
        }

        final storeGroups = snapshot.data ?? {};
        final storeIds = storeGroups.keys.toList();

        // Handle different store states with stability for multi-store mode
        if (storeIds.isEmpty) {
          _wasInMultiStoreMode = false;
          return _buildEmptyCart(context);
        } else if (storeIds.length == 1 && !_wasInMultiStoreMode) {
          // Single store - show static banner (only if we weren't previously in multi-store mode)
          final storeId = storeIds.first;
          _selectedStoreId = storeId;
          return _buildSingleStoreCart(context, cartProvider, storeId, storeGroups[storeId]!);
        } else {
          // Multiple stores OR we were previously in multi-store mode - show dropdown selector
          _wasInMultiStoreMode = true;
          _selectedStoreId ??= storeIds.first; // Default to first store if none selected

          // Ensure selected store is still valid
          if (_selectedStoreId != null && !storeIds.contains(_selectedStoreId)) {
            _selectedStoreId = storeIds.first;
          }

          return _buildMultiStoreCart(context, cartProvider, storeGroups);
        }
      },
    );
  }

  /// Build standard cart for non-location-based mini-apps
  Widget _buildStandardCart(BuildContext context, CartProvider cartProvider) {
    return Column(
      children: [
        // Cart Items List
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: cartProvider.items.length,
            itemBuilder: (context, index) {
              final cartItem = cartProvider.items[index];
              return _buildCartItem(context, cartItem, cartProvider);
            },
          ),
        ),

        // Bottom Summary and Checkout
        _buildBottomSummary(context, cartProvider),
      ],
    );
  }

  /// Group cart items by store ID with distance-based ordering (nearest first)
  Future<Map<String, List<CartItem>>> _groupItemsByStore(List<CartItem> items, LocationProvider locationProvider) async {
    final Map<String, List<CartItem>> groups = {};
    final Map<String, Store> storeCache = {};

    // First pass: group items by store and cache store objects
    for (final item in items) {
      // Get full product details to access store_id
      String? storeId = item.product.storeId;

      // If storeId is not available in cart product, fetch full product details
      if (storeId == null || storeId.isEmpty) {
        try {
          final apiService = ApiService();
          final fullProduct = await apiService.fetchProduct(item.product.id);
          storeId = fullProduct.storeId;
        } catch (e) {
          debugPrint('Error fetching full product details for ${item.product.id}: $e');
          storeId = 'unknown';
        }
      }

      final groupKey = storeId ?? 'unknown';
      groups.putIfAbsent(groupKey, () => []).add(item);
    }

    // Second pass: fetch store objects and calculate distances for sorting
    final List<MapEntry<String, List<CartItem>>> entriesWithDistance = [];

    for (final entry in groups.entries) {
      final storeId = entry.key;
      if (storeId != 'unknown' && !storeCache.containsKey(storeId)) {
        try {
          final store = await _getStoreInfo(storeId);
          if (store != null) {
            storeCache[storeId] = store;
          }
        } catch (e) {
          debugPrint('Error fetching store info for $storeId: $e');
        }
      }
      entriesWithDistance.add(entry);
    }

    // Sort by distance (nearest first)
    entriesWithDistance.sort((a, b) {
      final storeA = storeCache[a.key];
      final storeB = storeCache[b.key];

      if (storeA == null && storeB == null) return 0;
      if (storeA == null) return 1;
      if (storeB == null) return -1;

      final distanceA = locationProvider.getDistanceToStore(storeA) ?? double.infinity;
      final distanceB = locationProvider.getDistanceToStore(storeB) ?? double.infinity;

      return distanceA.compareTo(distanceB);
    });

    return Map.fromEntries(entriesWithDistance);
  }

  /// Build cart for single store (no banner needed - AppBar handles store display)
  Widget _buildSingleStoreCart(BuildContext context, CartProvider cartProvider, String storeId, List<CartItem> items) {
    return Column(
      children: [
        // Cart Items List (no store banner - AppBar shows store selector)
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final cartItem = items[index];
              return _buildCartItem(context, cartItem, cartProvider);
            },
          ),
        ),

        // Bottom Summary and Checkout (filtered for this store)
        _buildFilteredBottomSummary(context, cartProvider, items),
      ],
    );
  }

  /// Build cart for multiple stores (dropdown now in header)
  Widget _buildMultiStoreCart(BuildContext context, CartProvider cartProvider, Map<String, List<CartItem>> storeGroups) {
    final selectedItems = storeGroups[_selectedStoreId] ?? [];

    return Column(
      children: [
        // Cart Items List for selected store (no dropdown here, it's in header)
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: selectedItems.length,
            itemBuilder: (context, index) {
              final cartItem = selectedItems[index];
              return _buildCartItem(context, cartItem, cartProvider);
            },
          ),
        ),

        // Bottom Summary and Checkout (filtered for selected store)
        _buildFilteredBottomSummary(context, cartProvider, selectedItems),
      ],
    );
  }



  /// Get store information by ID
  Future<Store?> _getStoreInfo(String storeId) async {
    if (_storeCache.containsKey(storeId)) {
      return _storeCache[storeId];
    }

    try {
      final apiService = ApiService();
      final stores = await apiService.fetchStores();
      final store = stores.firstWhere(
        (s) => s.id.toString() == storeId,
        orElse: () => throw Exception('Store not found'),
      );

      _storeCache[storeId] = store;
      return store;
    } catch (e) {
      debugPrint('Error fetching store info for $storeId: $e');
      return null;
    }
  }


  /// Build filtered bottom summary for store-specific checkout
  Widget _buildFilteredBottomSummary(BuildContext context, CartProvider cartProvider, List<CartItem> filteredItems) {
    if (filteredItems.isEmpty) {
      return const SizedBox.shrink();
    }

    final totalPrice = filteredItems.fold<double>(
      0.0,
      (sum, item) => sum + (item.product.mainPrice * item.quantity),
    );
    final itemCount = filteredItems.fold<int>(
      0,
      (sum, item) => sum + item.quantity,
    );

    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Summary Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '总计 ($itemCount 件)',
                        style: AppTextStyles.body,
                      ),
                      Text(
                        '€${totalPrice.toStringAsFixed(2)}',
                        style: AppTextStyles.priceMain.copyWith(fontSize: 20),
                      ),
                    ],
                  ),
                  SizedBox(
                    width: 120,
                    child: ElevatedButton(
                      onPressed: () {
                        _showCheckoutDialog(context, cartProvider, filteredItems: filteredItems);
                      },
                      child: const Text('结算'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyCart(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.shopping_cart_outlined,
            size: 80,
            color: AppColors.secondaryText,
          ),
          const SizedBox(height: 16),
          Text(
            '购物车是空的',
            style: AppTextStyles.cardTitle.copyWith(
              color: AppColors.secondaryText,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '快去添加一些商品吧！',
            style: AppTextStyles.bodySmall,
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            child: const Text('去购物'),
          ),
        ],
      ),
    );
  }

  Widget _buildCartItem(BuildContext context, cartItem, CartProvider cartProvider) {
    final product = cartItem.product;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: FutureBuilder<Map<String, dynamic>>(
          future: _getEnhancedProductData(product),
          builder: (context, snapshot) {
            final fullProduct = snapshot.data?['fullProduct'] as Product?;
            final dataInfo = snapshot.data?['dataInfo'] as ProductDataInfo?;
            final productToUse = fullProduct ?? product;

            return Row(
              children: [
                // Product Image (left centered aligned) - now uses enhanced product data
                _buildProductImage(productToUse),

                const SizedBox(width: 12),

                // Product Info with Enhanced Layout based on mini-app type
                Expanded(
                  child: snapshot.connectionState == ConnectionState.waiting
                      ? _buildLoadingProductInfo(product)
                      : _buildEnhancedProductInfo(
                          context,
                          productToUse,
                          dataInfo,
                          cartProvider.currentMiniAppType,
                        ),
                ),

                const SizedBox(width: 12),

                // Quantity Controls (positioned in the middle-centered-right of the card)
                _buildQuantityControls(context, product, cartProvider),
              ],
            );
          },
        ),
      ),
    );
  }




  /// Builds category and subcategory tags using ProductTag styling
  Widget _buildCategoryTags(ProductDataInfo? dataInfo) {
    final tags = <Widget>[];

    if (dataInfo?.categoryName != null) {
      tags.add(ProductTag(
        text: dataInfo!.categoryName!,
        type: ProductTagType.category,
        size: ProductTagSize.small, // Use small size for cart
      ));
    }

    if (dataInfo?.subcategoryName != null) {
      tags.add(ProductTag(
        text: dataInfo!.subcategoryName!,
        type: ProductTagType.subcategory,
        size: ProductTagSize.small, // Use small size for cart
      ));
    }

    if (tags.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: tags,
    );
  }

  /// Builds store information with store name and store type tag using ProductTag styling
  Widget _buildStoreInfo(product, String storeName) {
    // Extract store name and type from formatted string
    final parts = storeName.split(': ');
    final storeTypeText = parts.length > 1 ? parts[0] : '';
    final storeNameText = parts.length > 1 ? parts[1] : storeName;

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        // Store location tag
        ProductTag(
          text: storeNameText,
          type: ProductTagType.storeLocation,
          storeType: product.storeType,
          size: ProductTagSize.small, // Use small size for cart
        ),
        // Store type tag
        if (storeTypeText.isNotEmpty)
          ProductTag(
            text: storeTypeText,
            type: ProductTagType.storeType,
            storeType: product.storeType,
            size: ProductTagSize.small, // Use small size for cart
          ),
      ],
    );
  }

  /// Builds pricing section with strikethrough and current price
  Widget _buildPricing(product) {
    return Row(
      children: [
        if (product.strikethroughPrice != null) ...[
          Text(
            '€${product.strikethroughPrice!.toStringAsFixed(2)}',
            style: AppTextStyles.priceStrikethrough,
          ),
          const SizedBox(width: 8),
        ],
        Text(
          '€${product.mainPrice.toStringAsFixed(2)}',
          style: AppTextStyles.priceMain,
        ),
      ],
    );
  }



  Widget _buildBottomSummary(BuildContext context, CartProvider cartProvider) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        border: Border(
          top: BorderSide(
            color: Colors.grey.shade200,
            width: 1,
          ),
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Summary Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '总计 (${cartProvider.itemCount} 件)',
                        style: AppTextStyles.body,
                      ),
                      Text(
                        '€${cartProvider.totalPrice.toStringAsFixed(2)}',
                        style: AppTextStyles.priceMain.copyWith(fontSize: 20),
                      ),
                    ],
                  ),
                  SizedBox(
                    width: 120,
                    child: ElevatedButton(
                      onPressed: () {
                        _showCheckoutDialog(context, cartProvider);
                      },
                      child: const Text('结算'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showClearCartDialog(BuildContext context, CartProvider cartProvider) {
    final isLocationBased = _isLocationBasedMiniApp(cartProvider.currentMiniAppType);

    if (isLocationBased && _selectedStoreId != null) {
      // Store-specific clear for location-based mini-apps
      _showStoreSpecificClearDialog(context, cartProvider);
    } else {
      // Standard clear for non-location-based mini-apps
      _showStandardClearDialog(context, cartProvider);
    }
  }

  void _showStandardClearDialog(BuildContext context, CartProvider cartProvider) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('清空购物车'),
        content: const Text('确定要清空购物车中的所有商品吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              cartProvider.clearCart();
              Navigator.of(context).pop();
            },
            child: Text(
              '确定',
              style: TextStyle(color: AppColors.themeRed),
            ),
          ),
        ],
      ),
    );
  }

  void _showStoreSpecificClearDialog(BuildContext context, CartProvider cartProvider) {
    showDialog(
      context: context,
      builder: (context) => FutureBuilder<Store?>(
        future: _getStoreInfo(_selectedStoreId!),
        builder: (context, snapshot) {
          final storeName = snapshot.data?.name ?? '当前门店';

          return AlertDialog(
            title: const Text('清空购物车'),
            content: Text('确定要清空 $storeName 购物车中的商品吗？'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('取消'),
              ),
              TextButton(
                onPressed: () async {
                  await _clearStoreSpecificCart(cartProvider);
                  if (context.mounted) {
                    Navigator.of(context).pop();
                  }
                },
                child: Text(
                  '确定',
                  style: TextStyle(color: AppColors.themeRed),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _clearStoreSpecificCart(CartProvider cartProvider) async {
    if (_selectedStoreId == null) return;

    await _handleCartOperation(() async {
      try {
        // Get current cart items
        final allItems = cartProvider.items;

        // Group items by store to identify which items to remove
        final locationProvider = Provider.of<LocationProvider>(context, listen: false);
        final storeGroups = await _groupItemsByStore(allItems, locationProvider);
        final itemsToRemove = storeGroups[_selectedStoreId] ?? [];

        // Remove each item from the selected store
        for (final item in itemsToRemove) {
          await cartProvider.removeAllOfProduct(item.product.id);
        }
      } catch (e) {
        debugPrint('Error clearing store-specific cart: $e');
        rethrow;
      }
    });
  }

  void _showCheckoutDialog(BuildContext context, CartProvider cartProvider, {List<CartItem>? filteredItems}) {
    final items = filteredItems ?? cartProvider.items;
    final totalPrice = items.fold<double>(
      0.0,
      (sum, item) => sum + (item.product.mainPrice * item.quantity),
    );

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('结算'),
        content: Text('总金额：€${totalPrice.toStringAsFixed(2)}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _processCheckout(context, cartProvider, filteredItems: filteredItems);
            },
            child: Text(
              '确认支付',
              style: TextStyle(color: AppColors.themeRed),
            ),
          ),
        ],
      ),
    );
  }

  /// Process checkout by creating order through order service
  Future<void> _processCheckout(BuildContext context, CartProvider cartProvider, {List<CartItem>? filteredItems}) async {
    if (cartProvider.currentMiniAppType == null) {
      _showErrorMessage(context, '购物车状态异常，请重试');
      return;
    }

    try {
      // Show loading indicator
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: CircularProgressIndicator(),
        ),
      );

      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final orderService = OrderService();

      // Get auth headers
      final authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${authProvider.token}',
      };

      // Create order with mini-app type and store ID (if applicable)
      // For location-based mini-apps, use the currently selected store from the cart screen
      int? orderStoreId;
      if (cartProvider.currentMiniAppType == 'UnmannedStore' || cartProvider.currentMiniAppType == 'ExhibitionSales') {
        orderStoreId = _selectedStoreId != null ? int.tryParse(_selectedStoreId!) : null;
      }

      await orderService.createOrder(
        cartProvider.currentMiniAppType!,
        authHeaders,
        storeId: orderStoreId,
      );

      // Refresh cart from backend to get updated state (backend clears submitted store's items)
      try {
        await cartProvider.refreshCart();
      } catch (e) {
        // Ignore cart refresh errors
        debugPrint('🛒 Cart refresh after order creation failed: $e');
      }

      // Hide loading indicator
      if (context.mounted) {
        Navigator.of(context).pop();

        // Show success message
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('订单创建成功！'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      // Hide loading indicator
      if (context.mounted) {
        Navigator.of(context).pop();
        _showErrorMessage(context, '订单创建失败：${e.toString()}');
      }
    }
  }

  /// Show error message to user
  void _showErrorMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
      ),
    );
  }

  /// Builds the product image with consistent styling
  Widget _buildProductImage(Product product) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: product.imageUrls.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: product.imageUrls.first,
              width: 80,
              height: 80,
              fit: BoxFit.cover,
              placeholder: (context, url) => Container(
                width: 80,
                height: 80,
                color: AppColors.lightBackground,
                child: const Center(
                  child: CircularProgressIndicator(
                    color: AppColors.themeRed,
                  ),
                ),
              ),
              errorWidget: (context, url, error) => Container(
                width: 80,
                height: 80,
                color: AppColors.lightBackground,
                child: const Icon(
                  Icons.image_not_supported,
                  color: AppColors.secondaryText,
                ),
              ),
            )
          : Container(
              width: 80,
              height: 80,
              color: AppColors.lightBackground,
              child: const Icon(
                Icons.shopping_bag_outlined,
                color: AppColors.secondaryText,
                size: 32,
              ),
            ),
    );
  }

  /// Fetches enhanced product data including full product details and resolved data
  Future<Map<String, dynamic>> _getEnhancedProductData(Product product) async {
    try {
      final apiService = ApiService();

      // Fetch full product details to get images
      final fullProduct = await apiService.fetchProduct(product.id);

      // Resolve additional data (category, subcategory, store names)
      final dataInfo = await ProductDataResolver().resolveProductData(fullProduct);

      return {
        'fullProduct': fullProduct,
        'dataInfo': dataInfo,
      };
    } catch (e) {
      debugPrint('Error fetching enhanced product data: $e');
      // Fallback to basic product data
      final dataInfo = await ProductDataResolver().resolveProductData(product);
      return {
        'fullProduct': product,
        'dataInfo': dataInfo,
      };
    }
  }

  /// Builds loading state for product info
  Widget _buildLoadingProductInfo(Product product) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          product.title,
          style: AppTextStyles.cardTitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 6),
        Container(
          height: 20,
          width: 100,
          decoration: BoxDecoration(
            color: AppColors.lightBackground,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '€${product.mainPrice.toStringAsFixed(2)}',
          style: AppTextStyles.priceMain,
        ),
      ],
    );
  }

  /// Builds enhanced product info with different layouts based on mini-app type
  Widget _buildEnhancedProductInfo(
    BuildContext context,
    Product product,
    ProductDataInfo? dataInfo,
    String? miniAppType,
  ) {
    final isLocationBased = _isLocationBasedMiniApp(miniAppType);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Product Name (always at top, aligned left)
        Text(
          product.title,
          style: AppTextStyles.cardTitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 6),

        // Category and Subcategory Tags (for all mini-app types)
        if (dataInfo?.categoryName != null || dataInfo?.subcategoryName != null)
          _buildCategoryTags(dataInfo),

        // Store Information (only for location-based mini-apps: 无人商店 and 展销展消)
        if (isLocationBased && dataInfo?.storeName != null) ...[
          const SizedBox(height: 6),
          _buildStoreInfo(product, dataInfo!.storeName!),
        ],

        const SizedBox(height: 8),

        // Pricing (strikethrough + current price)
        _buildPricing(product),
      ],
    );
  }

  /// Builds quantity controls positioned in the middle-centered-right of the card
  Widget _buildQuantityControls(BuildContext context, Product product, CartProvider cartProvider) {
    final quantity = cartProvider.getProductQuantity(product.id);

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Custom quantity stepper for cart screen
        _buildCartQuantityStepper(context, product, cartProvider, quantity),
        const SizedBox(height: 8),
        GestureDetector(
          onTap: () async {
            // Preserve multi-store mode state during cart operations
            await _handleCartOperation(() async {
              await cartProvider.removeAllOfProduct(product.id);
            });
          },
          child: Text(
            '移除',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.themeRed,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  /// Build custom quantity stepper for cart screen that preserves multi-store state
  Widget _buildCartQuantityStepper(BuildContext context, Product product, CartProvider cartProvider, int quantity) {
    if (quantity == 0) {
      // Show circular "+" button
      return GestureDetector(
        onTap: () async {
          await _handleCartOperation(() async {
            if (product.minimumOrderQuantity > 1) {
              await cartProvider.addProductWithQuantity(product, product.minimumOrderQuantity);
            } else {
              await cartProvider.addProduct(product);
            }
          });
        },
        child: Container(
          width: 36,
          height: 36,
          decoration: const BoxDecoration(
            color: AppColors.themeRed,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black12,
                blurRadius: 4,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: const Icon(
            Icons.add,
            color: AppColors.white,
            size: 20,
          ),
        ),
      );
    }

    // Show quantity stepper with AddToCartButton design pattern
    return Container(
      height: 36,
      decoration: BoxDecoration(
        color: AppColors.themeRed,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Colors.black12,
            blurRadius: 4,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Minus button
          GestureDetector(
            onTap: () async {
              await _handleCartOperation(() async {
                if (quantity <= product.minimumOrderQuantity) {
                  await cartProvider.removeAllOfProduct(product.id);
                } else {
                  await cartProvider.removeProduct(product.id);
                }
              });
            },
            child: Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.remove,
                color: AppColors.white,
                size: 16,
              ),
            ),
          ),

          // Quantity display
          Container(
            constraints: const BoxConstraints(minWidth: 24),
            child: Text(
              quantity.toString(),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.white,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ),

          // Plus button
          GestureDetector(
            onTap: () async {
              await _handleCartOperation(() async {
                await cartProvider.addProduct(product);
              });
            },
            child: Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.add,
                color: AppColors.white,
                size: 16,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Build header store selector with exact styling from StoreLocatorHeader
  Widget _buildHeaderStoreSelector(CartProvider cartProvider) {
    return FutureBuilder<Map<String, List<CartItem>>>(
      future: _groupItemsByStore(cartProvider.items, Provider.of<LocationProvider>(context, listen: false)),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.grey.shade300,
                width: 1,
              ),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                SizedBox(width: 8),
                Text('加载中...'),
              ],
            ),
          );
        }

        final storeGroups = snapshot.data ?? {};
        final storeIds = storeGroups.keys.toList();

        if (storeIds.isEmpty || storeIds.length == 1) {
          // Single store or no stores - show static display
          return _buildSingleStoreHeaderDisplay(storeIds.isNotEmpty ? storeIds.first : null);
        } else {
          // Multiple stores - show dropdown selector
          return _buildMultiStoreHeaderSelector(storeIds);
        }
      },
    );
  }

  /// Build single store header display (no dropdown)
  Widget _buildSingleStoreHeaderDisplay(String? storeId) {
    if (storeId == null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Colors.grey.shade300,
            width: 1,
          ),
        ),
        child: const Text('无门店'),
      );
    }

    return FutureBuilder<Store?>(
      future: _getStoreInfo(storeId),
      builder: (context, snapshot) {
        final store = snapshot.data;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: Colors.grey.shade300,
              width: 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: store != null ? _getStoreTypeColor(store.type) : Colors.grey,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                store?.name ?? '加载中...',
                style: AppTextStyles.body.copyWith(
                  color: store != null ? AppColors.primaryText : AppColors.secondaryText,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Build multi-store header selector with dropdown
  Widget _buildMultiStoreHeaderSelector(List<String> storeIds) {
    _selectedStoreId ??= storeIds.first;

    return FutureBuilder<Store?>(
      future: _getStoreInfo(_selectedStoreId!),
      builder: (context, snapshot) {
        final selectedStore = snapshot.data;
        return _HeaderStoreSelector(
          storeIds: storeIds,
          selectedStoreId: _selectedStoreId!,
          selectedStore: selectedStore,
          onStoreSelected: (storeId) {
            setState(() {
              _selectedStoreId = storeId;
            });
          },
        );
      },
    );
  }

  /// Get store type color (copied from StoreLocatorHeader)
  Color _getStoreTypeColor(StoreType storeType) {
    switch (storeType) {
      case StoreType.unmannedStore:
        return const Color(0xFF2196F3); // #2196f3
      case StoreType.unmannedWarehouse:
        return const Color(0xFF4CAF50); // #4caf50
      case StoreType.exhibitionStore:
        return const Color(0xFFFFD556); // #ffd556
      case StoreType.exhibitionMall:
        return const Color(0xFFF38900); // #f38900
      default:
        return Colors.grey;
    }
  }

  /// Handle cart operations while preserving multi-store view state
  Future<void> _handleCartOperation(Future<void> Function() operation) async {
    // Store current state
    final wasInMultiStore = _wasInMultiStoreMode;
    final selectedStore = _selectedStoreId;

    try {
      await operation();

      // Restore state immediately after operation without triggering unnecessary rebuilds
      _wasInMultiStoreMode = wasInMultiStore;
      _selectedStoreId = selectedStore;

      // Only call setState if we need to update the UI state
      if (mounted) {
        setState(() {
          // State is already updated above, this just triggers a rebuild
        });
      }
    } catch (e) {
      // Restore state even on error
      _wasInMultiStoreMode = wasInMultiStore;
      _selectedStoreId = selectedStore;

      if (mounted) {
        setState(() {
          // State is already updated above, this just triggers a rebuild
        });
      }
      rethrow;
    }
  }

}

/* Removed unused _CartStoreDisplay to fix analyzer warnings */
/// Cart-specific store selector widget that mimics StoreLocatorHeader behavior
class _CartStoreSelector extends StatefulWidget {
  final List<Store> stores;
  final Store selectedStore;
  final Function(Store) onStoreSelected;

  const _CartStoreSelector({
    required this.stores,
    required this.selectedStore,
    required this.onStoreSelected,
  });

  @override
  State<_CartStoreSelector> createState() => _CartStoreSelectorState();
}

class _CartStoreSelectorState extends State<_CartStoreSelector> {
  final GlobalKey _selectorKey = GlobalKey();
  OverlayEntry? _overlayEntry;
  bool _isDropdownOpen = false;

  @override
  void dispose() {
    _removeOverlay();
    super.dispose();
  }

  void _removeOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
    _isDropdownOpen = false;
  }

  void _toggleDropdown() {
    if (_isDropdownOpen) {
      _removeOverlay();
    } else {
      _showDropdown();
    }
  }

  void _showDropdown() {
    if (!mounted || _selectorKey.currentContext == null) {
      return;
    }

    final RenderBox? renderBox = _selectorKey.currentContext!.findRenderObject() as RenderBox?;
    if (renderBox == null) {
      return;
    }

    final position = renderBox.localToGlobal(Offset.zero);
    final size = renderBox.size;

    _overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        left: 16,
        right: 16,
        top: position.dy + size.height + 8,
        child: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(maxHeight: 300),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.1),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: ListView.separated(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: widget.stores.length,
              separatorBuilder: (context, index) => Divider(
                height: 1,
                color: Colors.grey.shade200,
              ),
              itemBuilder: (context, index) {
                final store = widget.stores[index];
                final isSelected = widget.selectedStore.id == store.id;

                // Get formatted distance using LocationProvider
                final locationProvider = Provider.of<LocationProvider>(context, listen: false);
                final formattedDistance = locationProvider.getFormattedDistanceToStore(store) ?? '距离未知';

                return ListTile(
                  onTap: () {
                    widget.onStoreSelected(store);
                    _removeOverlay();
                  },
                  leading: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: _getStoreTypeColor(store.type),
                      shape: BoxShape.circle,
                    ),
                  ),
                  title: Text(
                    store.name,
                    style: AppTextStyles.body.copyWith(
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                      color: isSelected ? AppColors.themeRed : AppColors.primaryText,
                    ),
                  ),
                  subtitle: Row(
                    children: [
                      Text(
                        store.type.displayName,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.secondaryText,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        formattedDistance,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.secondaryText,
                        ),
                      ),
                    ],
                  ),
                  trailing: isSelected
                      ? const Icon(
                          Icons.check_circle,
                          color: AppColors.themeRed,
                          size: 20,
                        )
                      : null,
                );
              },
            ),
          ),
        ),
      ),
    );

    Overlay.of(context).insert(_overlayEntry!);
    setState(() {
      _isDropdownOpen = true;
    });
  }

  Color _getStoreTypeColor(StoreType storeType) {
    switch (storeType) {
      case StoreType.unmannedStore:
        return const Color(0xFF2196F3); // #2196f3
      case StoreType.unmannedWarehouse:
        return const Color(0xFF4CAF50); // #4caf50
      case StoreType.exhibitionStore:
        return const Color(0xFFFFD556); // #ffd556
      case StoreType.exhibitionMall:
        return const Color(0xFFF38900); // #f38900
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Get formatted distance using LocationProvider
    final locationProvider = Provider.of<LocationProvider>(context, listen: false);
    final formattedDistance = locationProvider.getFormattedDistanceToStore(widget.selectedStore) ?? '距离未知';

    return GestureDetector(
      key: _selectorKey,
      onTap: _toggleDropdown,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: _isDropdownOpen ? AppColors.themeRed : Colors.grey.shade300,
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Store type color indicator
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: _getStoreTypeColor(widget.selectedStore.type),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),

            // Store information
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.selectedStore.name,
                  style: AppTextStyles.body.copyWith(
                    color: AppColors.primaryText,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.selectedStore.type.displayName,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.secondaryText,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      formattedDistance,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.secondaryText,
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(width: 4),
            Icon(
              _isDropdownOpen ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              size: 16,
              color: AppColors.secondaryText,
            ),
          ],
        ),
      ),
    );
  }
}

/// Header store selector widget (copied styling from StoreLocatorHeader)
class _HeaderStoreSelector extends StatefulWidget {
  final List<String> storeIds;
  final String selectedStoreId;
  final Store? selectedStore;
  final Function(String) onStoreSelected;

  const _HeaderStoreSelector({
    required this.storeIds,
    required this.selectedStoreId,
    required this.selectedStore,
    required this.onStoreSelected,
  });

  @override
  State<_HeaderStoreSelector> createState() => _HeaderStoreSelectorState();
}

class _HeaderStoreSelectorState extends State<_HeaderStoreSelector> {
  final GlobalKey _selectorKey = GlobalKey();
  OverlayEntry? _overlayEntry;
  bool _isDropdownOpen = false;

  @override
  void dispose() {
    _removeOverlay();
    super.dispose();
  }

  void _removeOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
    _isDropdownOpen = false;
  }

  void _toggleDropdown() {
    if (_isDropdownOpen) {
      _removeOverlay();
    } else {
      _showDropdown();
    }
  }

  void _showDropdown() {
    if (!mounted || _selectorKey.currentContext == null) {
      return;
    }

    final RenderBox? renderBox = _selectorKey.currentContext!.findRenderObject() as RenderBox?;
    if (renderBox == null) {
      return;
    }

    final position = renderBox.localToGlobal(Offset.zero);
    final size = renderBox.size;

    _overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        left: 16,
        right: 16,
        top: position.dy + size.height + 8,
        child: Material(
          elevation: 8,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(maxHeight: 300),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.1),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: ListView.separated(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: widget.storeIds.length,
              separatorBuilder: (context, index) => Divider(
                height: 1,
                color: Colors.grey.shade200,
              ),
              itemBuilder: (context, index) {
                final storeId = widget.storeIds[index];
                final isSelected = widget.selectedStoreId == storeId;

                return FutureBuilder<Store?>(
                  future: _getStoreInfo(storeId),
                  builder: (context, snapshot) {
                    final store = snapshot.data;
                    if (store == null) {
                      return const ListTile(
                        title: Text('加载中...'),
                      );
                    }

                    // Get formatted distance using LocationProvider
                    final locationProvider = Provider.of<LocationProvider>(context, listen: false);
                    final formattedDistance = locationProvider.getFormattedDistanceToStore(store) ?? '距离未知';

                    return ListTile(
                      onTap: () {
                        widget.onStoreSelected(storeId);
                        _removeOverlay();
                      },
                      leading: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: _getStoreTypeColor(store.type),
                          shape: BoxShape.circle,
                        ),
                      ),
                      title: Text(
                        store.name,
                        style: AppTextStyles.body.copyWith(
                          fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                          color: isSelected ? AppColors.themeRed : AppColors.primaryText,
                        ),
                      ),
                      subtitle: Row(
                        children: [
                          Text(
                            store.type.displayName,
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.secondaryText,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            formattedDistance,
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.secondaryText,
                            ),
                          ),
                        ],
                      ),
                      trailing: isSelected
                          ? const Icon(
                              Icons.check_circle,
                              color: AppColors.themeRed,
                              size: 20,
                            )
                          : null,
                    );
                  },
                );
              },
            ),
          ),
        ),
      ),
    );

    Overlay.of(context).insert(_overlayEntry!);
    setState(() {
      _isDropdownOpen = true;
    });
  }

  Color _getStoreTypeColor(StoreType storeType) {
    switch (storeType) {
      case StoreType.unmannedStore:
        return const Color(0xFF2196F3); // #2196f3
      case StoreType.unmannedWarehouse:
        return const Color(0xFF4CAF50); // #4caf50
      case StoreType.exhibitionStore:
        return const Color(0xFFFFD556); // #ffd556
      case StoreType.exhibitionMall:
        return const Color(0xFFF38900); // #f38900
      default:
        return Colors.grey;
    }
  }

  Future<Store?> _getStoreInfo(String storeId) async {
    try {
      final apiService = ApiService();
      final stores = await apiService.fetchStores();
      return stores.firstWhere(
        (store) => store.id == storeId,
        orElse: () => Store(
          id: storeId,
          name: '未知门店',
          city: '',
          address: '',
          latitude: 0,
          longitude: 0,
          type: StoreType.exhibitionStore,
          isActive: true,
        ),
      );
    } catch (e) {
      debugPrint('Error fetching store info: $e');
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: _selectorKey,
      onTap: _toggleDropdown,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: _isDropdownOpen ? AppColors.themeRed : Colors.grey.shade300,
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: widget.selectedStore != null
                    ? _getStoreTypeColor(widget.selectedStore!.type)
                    : Colors.grey,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              widget.selectedStore?.name ?? '选择门店',
              style: AppTextStyles.body.copyWith(
                color: widget.selectedStore != null
                    ? AppColors.primaryText
                    : AppColors.secondaryText,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              _isDropdownOpen ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              size: 16,
              color: AppColors.secondaryText,
            ),
          ],
        ),
      ),
    );
  }
}
