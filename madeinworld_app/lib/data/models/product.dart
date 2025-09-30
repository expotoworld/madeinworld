import '../../core/enums/store_type.dart';
import '../../core/enums/mini_app_type.dart';

class Product {
  final String id;
  final String sku;
  final String title;
  final String descriptionShort;
  final String descriptionLong;
  final String manufacturerId;
  final StoreType storeType;
  final MiniAppType miniAppType;
  final String? storeId; // Store ID for location-dependent mini-apps
  final double mainPrice;
  final double? strikethroughPrice;
  final bool isActive;
  final bool isFeatured;
  final bool isMiniAppRecommendation;
  final List<String> imageUrls;
  final List<String> categoryIds;
  final List<String> subcategoryIds;
  final int? stockLeft; // Only for unmanned stores
  final int minimumOrderQuantity; // Minimum order quantity (MOQ)

  Product({
    required this.id,
    required this.sku,
    required this.title,
    required this.descriptionShort,
    required this.descriptionLong,
    required this.manufacturerId,
    required this.storeType,
    required this.miniAppType,
    this.storeId,
    required this.mainPrice,
    this.strikethroughPrice,
    this.isActive = true,
    this.isFeatured = false,
    this.isMiniAppRecommendation = false,
    required this.imageUrls,
    required this.categoryIds,
    this.subcategoryIds = const [],
    this.stockLeft,
    this.minimumOrderQuantity = 1, // Default MOQ is 1
  });

  // Display stock with buffer (actual stock - 5)
  int? get displayStock {
    if (stockLeft == null) return null;
    return (stockLeft! - 5).clamp(0, stockLeft!);
  }

  bool get hasStock {
    // Only 无人商店 (UnmannedStore) mini-app validates stock
    // All other mini-apps have infinite stock
    if (miniAppType != MiniAppType.unmannedStore) {
      return true;
    }
    // For unmanned stores, check actual stock
    return displayStock != null && displayStock! > 0;
  }

  // Helper method to safely parse store type from API response
  static StoreType _parseStoreType(dynamic storeTypeValue) {
    if (storeTypeValue == null) return StoreType.exhibitionStore; // Default fallback

    final storeTypeStr = storeTypeValue.toString();

    // Try to parse Chinese values from backend
    try {
      return StoreTypeExtension.fromChineseValue(storeTypeStr);
    } catch (e) {
      // Fallback: try English enum values
      try {
        return StoreTypeExtension.fromApiValue(storeTypeStr);
      } catch (e) {
        // Final fallback: try enum name matching
        try {
          return StoreType.values.firstWhere(
            (e) => e.toString().split('.').last.toLowerCase() == storeTypeStr.toLowerCase(),
          );
        } catch (e) {
          // Ultimate fallback
          return StoreType.exhibitionStore;
        }
      }
    }
  }

  // Helper method to safely parse mini app type from API response
  static MiniAppType _parseMiniAppType(dynamic miniAppTypeValue) {
    if (miniAppTypeValue == null) return MiniAppType.retailStore; // Default fallback

    final miniAppTypeStr = miniAppTypeValue.toString();

    try {
      return MiniAppTypeExtension.fromApiValue(miniAppTypeStr);
    } catch (e) {
      // Fallback: try enum name matching
      try {
        return MiniAppType.values.firstWhere(
          (e) => e.toString().split('.').last.toLowerCase() == miniAppTypeStr.toLowerCase(),
        );
      } catch (e) {
        // Ultimate fallback
        return MiniAppType.retailStore;
      }
    }
  }

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['uuid'] ?? json['id'].toString(), // Use UUID if available, fallback to integer ID
      sku: json['sku'],
      title: json['title'],
      descriptionShort: json['description_short'],
      descriptionLong: json['description_long'],
      manufacturerId: json['manufacturer_id'].toString(), // Convert int to string
      storeType: _parseStoreType(json['store_type']),
      miniAppType: _parseMiniAppType(json['mini_app_type']),
      storeId: json['store_id']?.toString(), // Parse store_id for location-dependent mini-apps
      mainPrice: json['main_price'].toDouble(),
      strikethroughPrice: json['strikethrough_price']?.toDouble(),
      isActive: json['is_active'] ?? true,
      isFeatured: json['is_featured'] ?? false,
      isMiniAppRecommendation: json['is_mini_app_recommendation'] ?? false,
      imageUrls: List<String>.from(json['image_urls'] ?? []),
      categoryIds: List<String>.from(json['category_ids'] ?? []),
      subcategoryIds: List<String>.from(json['subcategory_ids'] ?? []),
      stockLeft: json['stock_left'],
      minimumOrderQuantity: (json['minimum_order_quantity'] ?? 1) as int,
    );
  }

  /// Factory constructor for simplified backend API response format (from order service)
  factory Product.fromBackendJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'].toString(),
      sku: json['sku'] ?? '',
      title: json['title'] ?? '',
      descriptionShort: '', // Not available in backend response
      descriptionLong: '', // Not available in backend response
      manufacturerId: '', // Not available in backend response
      storeType: StoreType.exhibitionStore, // Default, will be resolved from context
      miniAppType: MiniAppType.retailStore, // Default, will be resolved from context
      storeId: null, // Not available in backend response
      mainPrice: (json['main_price'] ?? 0.0).toDouble(),
      strikethroughPrice: null, // Not available in backend response
      isActive: json['is_active'] ?? true,
      isFeatured: false, // Not available in backend response
      isMiniAppRecommendation: false, // Not available in backend response
      imageUrls: [], // Not available in backend response
      categoryIds: [], // Not available in backend response
      subcategoryIds: [], // Not available in backend response
      stockLeft: json['stock_left'],
      minimumOrderQuantity: (json['minimum_order_quantity'] ?? 1) as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'sku': sku,
      'title': title,
      'description_short': descriptionShort,
      'description_long': descriptionLong,
      'manufacturer_id': manufacturerId,
      'store_type': storeType.toString().split('.').last,
      'mini_app_type': miniAppType.apiValue,
      'store_id': storeId,
      'main_price': mainPrice,
      'strikethrough_price': strikethroughPrice,
      'is_active': isActive,
      'is_featured': isFeatured,
      'is_mini_app_recommendation': isMiniAppRecommendation,
      'image_urls': imageUrls,
      'category_ids': categoryIds,
      'subcategory_ids': subcategoryIds,
      'stock_left': stockLeft,
      'minimum_order_quantity': minimumOrderQuantity,
    };
  }
}


