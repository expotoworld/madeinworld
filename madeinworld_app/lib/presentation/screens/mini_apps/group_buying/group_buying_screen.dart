import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'package:provider/provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

import '../../../../data/models/category.dart';
import '../../../../data/models/subcategory.dart';
import '../../../../data/services/api_service.dart';
import '../../../../data/models/product.dart';
import '../../../../core/enums/store_type.dart';
import '../../../../core/enums/mini_app_type.dart';
import '../../../widgets/common/product_card.dart';
import '../../../widgets/common/category_chip.dart';
import '../../../widgets/common/product_details_modal.dart';
import '../../../providers/cart_provider.dart';
import '../common/product_list_screen.dart';
import '../../../../core/navigation/custom_page_transitions.dart';
import '../../../../core/config/api_config.dart';

class GroupBuyingScreen extends StatefulWidget {
  const GroupBuyingScreen({super.key});

  @override
  State<GroupBuyingScreen> createState() => _GroupBuyingScreenState();
}

class _GroupBuyingScreenState extends State<GroupBuyingScreen> {
  int _currentIndex = 0;

  // Product details state management
  Product? _selectedProduct;
  String? _selectedCategoryName;
  String? _selectedSubcategoryName;
  String? _selectedStoreName;

  @override
  void initState() {
    super.initState();
    // Initialize cart context for group buying mini-app
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final cartProvider = Provider.of<CartProvider>(context, listen: false);
      cartProvider.setMiniAppContext('GroupBuying');
      debugPrint('🛒 GroupBuyingScreen: Cart context initialized for GroupBuying');
    });
  }

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

  List<Widget> get _screens => [
    _ProductsTab(
      key: const ValueKey('group_products'),
      onProductTap: _showProductDetails,
    ),
    const _MessagesTab(key: ValueKey('group_messages')),
    const _ProfileTab(key: ValueKey('group_profile')),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('团购团批', style: AppTextStyles.majorHeader),
        backgroundColor: AppColors.lightBackground,
        elevation: 0,
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close, color: AppColors.primaryText),
          ),
        ],
      ),
      body: Stack(
        children: [
          // Main content
          IndexedStack(
            key: const ValueKey('group_indexed_stack'),
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
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(
                  index: 0,
                  icon: Icons.home,
                  label: '首页',
                ),
                _buildNavItem(
                  index: 1,
                  icon: Icons.message,
                  label: '消息',
                ),
                _buildNavItem(
                  index: 2,
                  icon: Icons.person,
                  label: '我的',
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
  final Function(Product, {String? categoryName, String? subcategoryName, String? storeName})? onProductTap;

  const _ProductsTab({
    super.key,
    this.onProductTap,
  });

  @override
  State<_ProductsTab> createState() => _ProductsTabState();
}

class _ProductsTabState extends State<_ProductsTab> {
  final ApiService _apiService = ApiService();
  late Future<List<Category>> _categoriesFuture;
  late Future<List<Product>> _productsFuture;
  String? _selectedCategoryId;

  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  void _fetchData() {
    setState(() {
      _categoriesFuture = _apiService.fetchCategoriesWithFilters(
        miniAppType: MiniAppType.groupBuying,
        includeSubcategories: true,
      );
      _productsFuture = _apiService.fetchProducts(
        miniAppType: MiniAppType.groupBuying,
      );
    });
  }

  Future<void> _refreshData() async {
    _fetchData();
    try {
      await Future.wait([_categoriesFuture, _productsFuture]);
    } catch (e) {
      // Handle errors silently for refresh
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refreshData,
      child: FutureBuilder<List<dynamic>>(
        future: Future.wait([_categoriesFuture, _productsFuture]),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          } else if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 64,
                    color: AppColors.secondaryText,
                  ),
                  const SizedBox(height: 16),
                  Text('加载失败', style: AppTextStyles.body),
                  const SizedBox(height: 8),
                  Text(
                    '${snapshot.error}',
                    style: AppTextStyles.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _fetchData,
                    child: const Text('重试'),
                  ),
                ],
              ),
            );
          } else if (snapshot.hasData) {
            final categories = snapshot.data![0] as List<Category>;
            final products = snapshot.data![1] as List<Product>;

            // Check if there are any mini-app recommended products for group buying
            final hasRecommendedProducts = products.any((product) =>
                product.isMiniAppRecommendation && product.miniAppType == MiniAppType.groupBuying);

            // Build categories list with featured category if there are recommended products
            final displayCategories = _buildCategoriesWithFeatured(categories, hasRecommendedProducts);



            return Column(
              children: [
                // Categories horizontal list
                Container(
                  height: 50,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: displayCategories.length,
                    itemBuilder: (context, index) {
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
                  child: _buildContentArea(displayCategories, products),
                ),
              ],
            );
          } else {
            return const Center(child: Text('暂无数据'));
          }
        },
      ),
    );
  }

  /// Builds the content area based on selected category
  Widget _buildContentArea(List<Category> categories, List<Product> allProducts) {
    if (_selectedCategoryId == null || _selectedCategoryId == 'featured') {
      // Show featured products directly
      final featuredProducts = allProducts.where((product) =>
          product.isMiniAppRecommendation &&
          product.miniAppType == MiniAppType.groupBuying).toList();

      return _buildProductGrid(featuredProducts);
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
            page: ProductListScreen(
              category: category,
              subcategory: subcategory,
              allProducts: allProducts,
              miniAppName: '团购团批',
              onProductTap: widget.onProductTap,
            ),
            routeKey: 'group_subcategory_${subcategory.id}_${DateTime.now().millisecondsSinceEpoch}',
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

      return {
        'categoryName': categoryName,
        'subcategoryName': subcategoryName,
        'storeName': null, // Group buying doesn't show store name tags
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
  List<Category> _buildCategoriesWithFeatured(List<Category> apiCategories, bool hasRecommendedProducts) {
    final List<Category> result = [];

    // Always add featured category first if there are recommended products
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
