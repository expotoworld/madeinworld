import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

import '../../../../data/models/category.dart';
import '../../../../data/models/subcategory.dart';
import '../../../../data/services/api_service.dart';
import '../../../../data/models/product.dart';
import '../../../../data/models/store.dart';

import '../../../../core/enums/store_type.dart';
import '../../../../core/enums/mini_app_type.dart';
import '../../../widgets/common/product_card.dart';
import '../../../widgets/common/category_chip.dart';
import '../../../widgets/common/store_locator_header.dart';
import '../../../widgets/common/product_details_modal.dart';
import '../../../providers/cart_provider.dart';
import '../../../providers/location_provider.dart'; // Import LocationProvider
import '../../cart/cart_screen_wrapper.dart';
import 'unmanned_store_locations_screen.dart';
import '../common/product_list_screen_wrapper.dart';
import '../../../../core/navigation/custom_page_transitions.dart';
import '../../../../core/config/api_config.dart';

class UnmannedStoreScreen extends StatefulWidget {
  final String? instanceId;

  const UnmannedStoreScreen({super.key, this.instanceId});

  @override
  State<UnmannedStoreScreen> createState() => _UnmannedStoreScreenState();
}

class _UnmannedStoreScreenState extends State<UnmannedStoreScreen> {
  int _currentIndex = 0;
  Store? _selectedStore;
  late final GlobalKey<__ProductsTabState> _productsTabKey;

  late final List<Widget> _screens;

  // Product details state management
  Product? _selectedProduct;
  String? _selectedCategoryName;
  String? _selectedSubcategoryName;
  String? _selectedStoreName;

  void _showProductDetails(Product product, {
    String? categoryName,
    String? subcategoryName,
    String? storeName,
  }) {
    setState(() {
      _selectedProduct = product;
      _selectedCategoryName = categoryName;
      _selectedSubcategoryName = subcategoryName;
      _selectedStoreName = storeName;
    });
  }

  void _hideProductDetails() {
    setState(() {
      _selectedProduct = null;
      _selectedCategoryName = null;
      _selectedSubcategoryName = null;
      _selectedStoreName = null;
    });
  }

  @override
  void initState() {
    super.initState();
    // Create unique GlobalKey with instance ID
    final instanceId = widget.instanceId ?? DateTime.now().millisecondsSinceEpoch.toString();
    _productsTabKey = GlobalKey<__ProductsTabState>(debugLabel: 'unmanned_products_tab_$instanceId');

    _screens = [
      _ProductsTab(
        key: _productsTabKey,
        onStoreSelected: _onStoreSelected,
        instanceId: widget.instanceId,
        onProductTap: _showProductDetails,
      ),
      _LocationsTab(key: ValueKey('unmanned_locations_$instanceId')),
      _MessagesTab(key: ValueKey('unmanned_messages_$instanceId')),
      _ProfileTab(key: ValueKey('unmanned_profile_$instanceId')),
    ];

    // Initialize cart context for unmanned store mini-app
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final cartProvider = Provider.of<CartProvider>(context, listen: false);
      cartProvider.setMiniAppContext('UnmannedStore');
      debugPrint('🛒 UnmannedStoreScreen: Cart context initialized for UnmannedStore');
    });
  }

  void _onStoreSelected(Store? store) {
    setState(() {
      _selectedStore = store;
    });
    // Update the selected store in the ProductsTab and refresh data
    _productsTabKey.currentState?.updateSelectedStore(store);

    // Update cart context with store_id
    final cartProvider = Provider.of<CartProvider>(context, listen: false);
    final storeId = store?.id != null ? int.tryParse(store!.id) : null;
    cartProvider.setMiniAppContext('UnmannedStore', storeId: storeId);
    debugPrint('🛒 UnmannedStoreScreen: Updated cart context with store ID: $storeId');
  }

  // Store locator header for unmanned store
  PreferredSizeWidget _buildAppBar(LocationProvider locationProvider) {
    return StoreLocatorHeader(
      miniAppName: '无人商店',
      allowedStoreTypes: const [StoreType.unmannedStore, StoreType.unmannedWarehouse],
      selectedStore: _selectedStore,
      onStoreSelected: _onStoreSelected,
      onClose: () => Navigator.of(context).pop(),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Access the LocationProvider here
    final locationProvider = Provider.of<LocationProvider>(context);

    return Scaffold(
      // REPLACE the old appBar property with this conditional one:
      appBar: _currentIndex == 1 ? null : _buildAppBar(locationProvider),
      body: Stack(
        children: [
          // Main content
          IndexedStack(
            key: const ValueKey('unmanned_indexed_stack'),
            index: _currentIndex,
            children: _screens,
          ),
          // Product details overlay
          if (_selectedProduct != null)
            ProductDetailsModal(
              key: ValueKey('product_details_${_selectedProduct!.id}'),
              product: _selectedProduct!,
              onClose: _hideProductDetails,
              categoryName: _selectedCategoryName,
              subcategoryName: _selectedSubcategoryName,
              storeName: _selectedStoreName,
            ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: AppColors.white,
          border: Border(
            top: BorderSide(color: Colors.grey.shade200, width: 1),
          ),
        ),
        child: SafeArea(
          child: SizedBox(
            height: 80,
            child: Row(
              children: [
                // Left nav items
                Expanded(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildNavItem(
                        index: 0,
                        icon: Icons.home,
                        label: '首页',
                      ),
                      _buildNavItem(
                        index: 1,
                        icon: Icons.location_on,
                        label: '地点',
                      ),
                    ],
                  ),
                ),

                // Center FAB for cart
                Consumer<CartProvider>(
                  builder: (context, cartProvider, child) {
                    return GestureDetector(
                      onTap: () {
                        Navigator.of(context).push(
                          PageRouteBuilder(
                            pageBuilder: (context, animation, secondaryAnimation) => CartScreenWrapper(
                              miniAppType: 'UnmannedStore',
                              instanceId: widget.instanceId,
                              storeId: _selectedStore?.id != null ? int.tryParse(_selectedStore!.id) : null,
                            ),
                            transitionDuration: Duration.zero, // Instant transition
                            reverseTransitionDuration: Duration.zero, // Instant reverse transition
                          ),
                        );
                      },
                      child: Container(
                        width: 56,
                        height: 56,
                        margin: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: const BoxDecoration(
                          color: AppColors.themeRed,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black12,
                              blurRadius: 8,
                              offset: Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Stack(
                          children: [
                            const Center(
                              child: Icon(
                                Icons.shopping_cart,
                                color: AppColors.white,
                                size: 24,
                              ),
                            ),
                            if (cartProvider.itemCount > 0)
                              Positioned(
                                right: 8,
                                top: 8,
                                child: Container(
                                  padding: const EdgeInsets.all(4),
                                  decoration: const BoxDecoration(
                                    color: AppColors.white,
                                    shape: BoxShape.circle,
                                  ),
                                  constraints: const BoxConstraints(
                                    minWidth: 20,
                                    minHeight: 20,
                                  ),
                                  child: Text(
                                    cartProvider.itemCount.toString(),
                                    style: const TextStyle(
                                      color: AppColors.themeRed,
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),

                // Right nav items
                Expanded(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildNavItem(index: 2, icon: Icons.message, label: '消息'),
                      _buildNavItem(index: 3, icon: Icons.person, label: '我的'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required String label,
  }) {
    final isSelected = _currentIndex == index;

    return GestureDetector(
      onTap: () {
        setState(() {
          _currentIndex = index;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 24,
              color: isSelected ? AppColors.themeRed : AppColors.secondaryText,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: isSelected
                  ? AppTextStyles.navActive
                  : AppTextStyles.navInactive,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductsTab extends StatefulWidget {
  final Function(Store?) onStoreSelected;
  final String? instanceId;
  final Function(Product, {String? categoryName, String? subcategoryName, String? storeName})? onProductTap;

  const _ProductsTab({
    super.key,
    required this.onStoreSelected,
    this.instanceId,
    this.onProductTap,
  });

  @override
  State<_ProductsTab> createState() => __ProductsTabState();
}

class __ProductsTabState extends State<_ProductsTab>
    with WidgetsBindingObserver {
  String? _selectedCategoryId = 'featured'; // Default to featured/推荐
  String? _selectedSubcategoryId;
  Store? _selectedStore; // Selected store for location-based categories
  final ApiService _apiService = ApiService();
  late Future<List<Category>> _categoriesFuture;
  late Future<List<Product>> _productsFuture;

  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    // Add lifecycle observer for automatic foreground refresh
    WidgetsBinding.instance.addObserver(this);
    // Initialize data with empty futures to prevent LateInitializationError
    _categoriesFuture = Future.value([]);
    _productsFuture = Future.value([]);
    // Initialize store selection
    _initializeStore();
    // Removed 30s periodic refresh; rely on pull-to-refresh and foreground refresh only
  }

  void _initializeStore() async {
    try {
      // Get unmanned stores from API using mini_app_type filter
      final stores = await _apiService.fetchStores();
      // Filter for unmanned stores (无人商店 and 无人仓店)
      final unmannedStores = stores
          .where(
            (store) =>
                store.type == StoreType.unmannedStore ||
                store.type == StoreType.unmannedWarehouse,
          )
          .toList();

      if (unmannedStores.isNotEmpty && _selectedStore == null) {
        // Auto-select first store if none selected
        setState(() {
          _selectedStore = unmannedStores.first;
        });
        // Notify parent about the selected store
        widget.onStoreSelected(_selectedStore);
        // Fetch data after store is initialized
        fetchData();
      } else if (unmannedStores.isEmpty) {
        // No stores found, but still initialize with empty data
        debugPrint('DEBUG: No unmanned stores found');
        fetchData(); // This will fetch data without store filter
      }
    } catch (e) {
      debugPrint('Error loading stores: $e');
    }
  }

  @override
  void dispose() {
    // Remove lifecycle observer and cancel timer
    WidgetsBinding.instance.removeObserver(this);
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    // Automatically refresh data when app comes to foreground
    if (state == AppLifecycleState.resumed) {
      fetchData();
      // No periodic timer on resume to avoid background polling
    } else if (state == AppLifecycleState.paused) {
      _refreshTimer?.cancel(); // Stop timer when app is paused
    }
  }



  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Data will be fetched after store initialization
    // No need to fetch data here to avoid race conditions
  }

  void updateSelectedStore(Store? store) {
    setState(() {
      _selectedStore = store;
      // Reset to featured/推荐 category when store changes
      _selectedCategoryId = 'featured';
    });
    fetchData();
  }

  void fetchData() {
    final storeId = _selectedStore?.id != null ? int.tryParse(_selectedStore!.id) : null;
    debugPrint('🔍 DEBUG: Unmanned Store - Fetching data for store ID: $storeId');
    debugPrint('🔍 DEBUG: Unmanned Store - Selected store: ${_selectedStore?.name}');
    debugPrint('🔍 DEBUG: Unmanned Store - Selected store type: ${_selectedStore?.type}');
    debugPrint('🔍 DEBUG: Unmanned Store - Selected store type API value: ${_selectedStore?.type.apiValue}');

    setState(() {
      // For categories: use miniAppType for filtering, and storeId for store-specific categories
      _categoriesFuture = _apiService.fetchCategoriesWithFilters(
        miniAppType: MiniAppType.unmannedStore,
        storeId: storeId,
        includeSubcategories: true,
      ).then((categories) {
        debugPrint('🔍 DEBUG: Unmanned Store - Categories fetched: ${categories.length}');
        for (final category in categories) {
          debugPrint('🔍 DEBUG: Unmanned category: ${category.name} (ID: ${category.id})');
        }
        return categories;
      });

      // For products: use storeId for precise filtering (store type is automatically determined by backend)
      // This ensures recommendations are filtered by the specific store location
      _productsFuture = _apiService.fetchProducts(
        storeId: storeId, // Only use storeId - backend will determine the correct store type
      ).then((products) {
        debugPrint('🔍 DEBUG: Unmanned Store - Products fetched: ${products.length}');

        // Count recommendations vs featured vs regular products
        final recommendedProducts = products.where((p) => p.isMiniAppRecommendation).length;
        final featuredProducts = products.where((p) => p.isFeatured).length;
        final regularProducts = products.where((p) => !p.isMiniAppRecommendation && !p.isFeatured).length;

        debugPrint('🔍 DEBUG: Product breakdown - Recommended: $recommendedProducts, Featured: $featuredProducts, Regular: $regularProducts');

        for (int i = 0; i < products.length && i < 5; i++) {
          final product = products[i];
          debugPrint('🔍 DEBUG: Product $i: ${product.title} (Recommended: ${product.isMiniAppRecommendation}, Featured: ${product.isFeatured}, StoreType: ${product.storeType})');
        }
        return products;
      });
    });
  }

  // Method for pull-to-refresh
  Future<void> _refreshData() async {
    fetchData();
    // Wait for both futures to complete
    try {
      await Future.wait([_categoriesFuture, _productsFuture]);
    } catch (e) {
      // Handle errors silently for refresh
      // Error logging could be added here in production
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: Future.wait([_categoriesFuture, _productsFuture]),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: AppColors.themeRed),
          );
        } else if (snapshot.hasError) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.error_outline,
                  size: 48,
                  color: AppColors.secondaryText,
                ),
                const SizedBox(height: 16),
                Text(
                  '加载失败',
                  style: AppTextStyles.responsiveBodySmall(context).copyWith(
                    color: AppColors.primaryText,
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '请检查网络连接后重试',
                  style: AppTextStyles.responsiveBodySmall(
                    context,
                  ).copyWith(color: AppColors.secondaryText),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: fetchData, // Use the new fetchData method
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.themeRed,
                    foregroundColor: AppColors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text('重试'),
                ),
              ],
            ),
          );
        } else if (snapshot.hasData) {
          final allCategories = snapshot.data![0] as List<Category>;
          final allProducts = snapshot.data![1] as List<Product>;

          // Filter categories that have products for the selected store
          final filteredCategories = allCategories.where((category) {
            return allProducts.any((product) =>
              product.categoryIds.contains(category.id)
            );
          }).toList();

          // Ensure "推荐" (recommendations) category is always first if there are mini-app recommendations
          final categories = <Category>[];
          final hasRecommendedProducts = allProducts.any((product) => product.isMiniAppRecommendation);

          if (hasRecommendedProducts) {
            // Add featured category first
            categories.add(Category(
              id: 'featured',
              name: '推荐',
              storeTypeAssociation: StoreTypeAssociation.all,
              miniAppAssociation: [MiniAppType.unmannedStore],
              subcategories: [],
            ));
          }

          // Add other categories
          categories.addAll(filteredCategories.where((cat) => cat.id != 'featured'));

          // Filter products by category and subcategory
          List<Product> filteredProducts = allProducts;

          if (_selectedCategoryId != null && _selectedCategoryId != 'featured') {
            filteredProducts = filteredProducts
                .where(
                  (product) =>
                      product.categoryIds.contains(_selectedCategoryId),
                )
                .toList();
          } else if (_selectedCategoryId == 'featured') {
            // Show only mini-app recommendations for the selected store
            filteredProducts = filteredProducts
                .where((product) => product.isMiniAppRecommendation)
                .toList();
          }

          if (_selectedSubcategoryId != null) {
            filteredProducts = filteredProducts
                .where(
                  (product) =>
                      product.subcategoryIds.contains(_selectedSubcategoryId),
                )
                .toList();
          }

          return RefreshIndicator(
            onRefresh: _refreshData,
            color: AppColors.themeRed,
            child: Column(
              children: [
                // Store selector moved to header
                // Categories
                Container(
                  height: 60,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _buildCategoriesWithFeatured(categories, allProducts).length,
                    itemBuilder: (context, index) {
                      final displayCategories = _buildCategoriesWithFeatured(categories, allProducts);
                      final category = displayCategories[index];

                      return CategoryChip(
                        category: category,
                        isSelected: _selectedCategoryId == category.id ||
                            (_selectedCategoryId == null && category.id == 'featured'),
                        onTap: () {
                          setState(() {
                            _selectedCategoryId = category.id;
                          });
                        },
                      );
                    },
                  ),
                ),

                // Level 2: Subcategory Grid or Level 3: Product Grid
                Expanded(
                  child: _buildContentArea(categories, allProducts),
                ),
              ],
            ),
          );
        } else {
          return const Center(child: Text('暂无数据'));
        }
      },
    );
  }

  /// Builds the content area based on selected category
  Widget _buildContentArea(List<Category> categories, List<Product> allProducts) {
    if (_selectedCategoryId == null || _selectedCategoryId == 'featured') {
      // Show mini-app recommendations directly
      final recommendedProducts = allProducts.where((product) => product.isMiniAppRecommendation).toList();

      return _buildProductGrid(recommendedProducts);
    } else {
      // Find the selected category
      final selectedCategory = categories.firstWhere(
        (cat) => cat.id == _selectedCategoryId,
        orElse: () => categories.first,
      );

      // Check if category has subcategories
      if (selectedCategory.subcategories.isNotEmpty) {
        // Show subcategory grid (Level 2)
        return _buildSubcategoryGrid(selectedCategory, allProducts);
      } else {
        // Show products directly if no subcategories
        final categoryProducts = allProducts.where((product) =>
            product.categoryIds.contains(_selectedCategoryId)).toList();
        return _buildProductGrid(categoryProducts);
      }
    }
  }

  /// Builds the subcategory grid (Level 2)
  Widget _buildSubcategoryGrid(Category category, List<Product> allProducts) {
    // Filter subcategories that have products
    final subcategoriesWithProducts = category.subcategories.where((subcategory) {
      return allProducts.any((product) =>
        product.subcategoryIds.contains(subcategory.id.toString())
      );
    }).toList();

    if (subcategoriesWithProducts.isEmpty) {
      return _buildEmptyState('该分类暂无商品');
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: GridView.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3, // 3 columns for better visual aesthetics and readability
          crossAxisSpacing: 12,
          mainAxisSpacing: 16,
          childAspectRatio: 0.75, // Adjusted ratio for larger cards in 3-column layout
        ),
        itemCount: subcategoriesWithProducts.length,
        itemBuilder: (context, index) {
          final subcategory = subcategoriesWithProducts[index];

          return _buildSubcategoryCard(context, category, subcategory, allProducts);
        },
      ),
    );
  }

  /// Builds a subcategory card
  Widget _buildSubcategoryCard(BuildContext context, Category category, Subcategory subcategory, List<Product> allProducts) {
    return GestureDetector(
      onTap: () {
        // Navigate to product list for this subcategory (Level 3)
        Navigator.of(context).push(
          SlideRightRoute(
            page: ProductListScreenWrapper(
              category: category,
              subcategory: subcategory,
              allProducts: allProducts,
              miniAppName: '无人商店',
              miniAppType: 'unmanned_store',
              selectedStore: _selectedStore, // Pass the selected store context
              instanceId: widget.instanceId,
            ),
            routeKey: 'unmanned_subcategory_${subcategory.id}_${DateTime.now().millisecondsSinceEpoch}',
          ),
        );
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Image area - square container with small border radius
          Container(
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(8), // Added 8px border radius
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8), // Match container border radius
              child: AspectRatio(
                aspectRatio: 1.0, // Perfect square (1:1 ratio)
                child: Container(
                  color: AppColors.lightBackground,
                  child: subcategory.imageUrl != null
                      ? Image.network(
                          _buildFullImageUrl(subcategory.imageUrl!),
                          fit: BoxFit.contain, // Show complete image without cropping
                          errorBuilder: (context, error, stackTrace) {
                            return Container(
                              color: AppColors.lightBackground,
                              child: Icon(
                                Icons.category,
                                size: 24,
                                color: AppColors.secondaryText,
                              ),
                            );
                          },
                        )
                      : Container(
                          color: AppColors.lightBackground,
                          child: Icon(
                            Icons.category,
                            size: 24,
                            color: AppColors.secondaryText,
                          ),
                        ),
                ),
              ),
            ),
          ),

          // Text area - completely separate below the image
          const SizedBox(height: 4), // Reduced space between image and text
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
              child: Text(
                subcategory.name,
                style: AppTextStyles.bodySmall.copyWith(
                  fontWeight: FontWeight.w600,
                  fontSize: 14, // Increased font size for better readability in 3-column layout
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds full image URL from relative path
  String _buildFullImageUrl(String imageUrl) {
    // If the URL is already a full URL (starts with http), return as is
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }

    // If it's a relative path, prepend the base URL
    return '${ApiConfig.baseUrl}$imageUrl';
  }

  /// Resolves category, subcategory, and store names for a product
  Future<Map<String, String?>> _resolveProductTagData(Product product) async {
    try {
      String? categoryName;
      String? subcategoryName;
      String? storeName;

      // Resolve category and subcategory names from the fetched categories
      final categories = await _categoriesFuture;
      for (final category in categories) {
        // Find subcategory that matches the product's subcategory IDs
        for (final subcategory in category.subcategories) {
          if (product.subcategoryIds.contains(subcategory.id)) {
            categoryName = category.name;
            subcategoryName = subcategory.name;
            break;
          }
        }
        if (categoryName != null) break;
      }

      // Format store name for location-dependent mini-apps
      if (_selectedStore != null) {
        storeName = '${_selectedStore!.type.displayName}: ${_selectedStore!.name}';
      }

      return {
        'categoryName': categoryName,
        'subcategoryName': subcategoryName,
        'storeName': storeName,
      };
    } catch (e) {
      debugPrint('🔍 Error resolving product tag data: $e');
      return {
        'categoryName': null,
        'subcategoryName': null,
        'storeName': null,
      };
    }
  }

  /// Builds the product grid
  Widget _buildProductGrid(List<Product> products) {
    if (products.isEmpty) {
      return _buildEmptyState('暂无商品');
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: MasonryGridView.count(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        itemCount: products.length,
        physics: const AlwaysScrollableScrollPhysics(), // Ensures pull-to-refresh works
        itemBuilder: (context, index) {
          final product = products[index];

          return FutureBuilder<Map<String, String?>>(
            future: _resolveProductTagData(product),
            builder: (context, snapshot) {
              final tagData = snapshot.data ?? {};

              return ProductCard(
                product: product,
                categoryName: tagData['categoryName'],
                subcategoryName: tagData['subcategoryName'],
                storeName: tagData['storeName'],
                onTap: widget.onProductTap != null
                    ? () => widget.onProductTap!(product,
                        categoryName: tagData['categoryName'],
                        subcategoryName: tagData['subcategoryName'],
                        storeName: tagData['storeName'])
                    : null,
              );
            },
          );
        },
      ),
    );
  }

  /// Builds empty state widget
  Widget _buildEmptyState(String message) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.shopping_bag_outlined,
            size: 64,
            color: AppColors.secondaryText,
          ),
          const SizedBox(height: 16),
          Text(
            message,
            style: AppTextStyles.body.copyWith(
              color: AppColors.secondaryText,
            ),
          ),
        ],
      ),
    );
  }

  /// Builds a list of categories with featured category, ensuring no duplicates
  List<Category> _buildCategoriesWithFeatured(List<Category> apiCategories, List<Product> allProducts) {
    final List<Category> result = [];

    // Check if there are any mini-app recommendations
    final hasRecommendedProducts = allProducts.any((product) => product.isMiniAppRecommendation);

    // Always add recommendations category first if there are mini-app recommendations
    if (hasRecommendedProducts) {
      result.add(Category(
        id: 'featured',
        name: '推荐',
        storeTypeAssociation: StoreTypeAssociation.all,
        miniAppAssociation: [],
      ));
    }

    // Add all API categories except any "推荐" categories (to avoid duplicates)
    for (final category in apiCategories) {
      if (category.name != '推荐' && category.id != 'featured') {
        result.add(category);
      }
    }

    return result;
  }
}

class _LocationsTab extends StatelessWidget {
  const _LocationsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const UnmannedStoreLocationsScreen();
  }
}

class _MessagesTab extends StatelessWidget {
  const _MessagesTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('消息功能开发中...'));
  }
}

class _ProfileTab extends StatelessWidget {
  const _ProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('个人中心功能开发中...'));
  }
}
