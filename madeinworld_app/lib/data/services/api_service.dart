import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' hide Category; // FIX: Hides the conflicting 'Category' class from this import
import 'package:http/http.dart' as http;
import '../models/product.dart';
import '../models/category.dart';
import '../models/subcategory.dart';
import '../models/store.dart';
import '../../core/enums/store_type.dart';
import '../../core/enums/mini_app_type.dart';
import '../../core/config/api_config.dart'; // IMPORT THE CORRECT CONFIG

class ApiService {
  // REMOVED hardcoded _baseUrl and _apiVersion. They will now come from ApiConfig.

  // Timeout duration for HTTP requests
  static final Duration _timeout = ApiConfig.timeout; // Use timeout from ApiConfig

  // HTTP client instance
  static final http.Client _client = http.Client();

  /// Fetches all products from the API
  ///
  /// [storeType] - Filter products by store type (optional)
  /// [featured] - Filter only featured products (optional)
  /// [storeId] - Get stock for specific store (optional, for unmanned stores)
  Future<List<Product>> fetchProducts({
    StoreType? storeType,
    MiniAppType? miniAppType,
    bool? featured,
    int? storeId,
  }) async {
    try {
      // Build query parameters
      final Map<String, String> queryParams = {};

      if (storeType != null) {
        queryParams['store_type'] = storeType.apiValue;
      }

      if (miniAppType != null) {
        queryParams['mini_app_type'] = miniAppType.apiValue;
      }

      if (featured != null) {
        queryParams['featured'] = featured.toString();
      }

      if (storeId != null) {
        queryParams['store_id'] = storeId.toString();
      }

      // Build URI using the CORRECT base URL from ApiConfig
      final uri = Uri.parse('${ApiConfig.apiBaseUrl}/products')
          .replace(queryParameters: queryParams.isNotEmpty ? queryParams : null);

      debugPrint('Fetching products from: $uri'); // Added for debugging

      // Make HTTP request
      final response = await _client.get(
        uri,
        headers: ApiConfig.headers, // Use headers from ApiConfig
      ).timeout(_timeout);

      // Handle response
      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        final products = jsonList.map((json) => Product.fromJson(json)).toList();

        // Debug logging for featured products
        if (featured == true) {
          debugPrint('DEBUG: API returned ${products.length} featured products');
          for (int i = 0; i < products.length && i < 5; i++) {
            debugPrint('DEBUG: API featured product $i: ${products[i].title} (featured: ${products[i].isFeatured})');
          }
        }

        return products;
      } else {
        throw ApiException(
          'Failed to fetch products: ${response.statusCode}',
          response.statusCode,
        );
      }
    } on SocketException {
      throw ApiException('No internet connection', 0);
    } on http.ClientException {
      throw ApiException('Network error occurred', 0);
    } on FormatException {
      throw ApiException('Invalid response format', 0);
    } catch (e) {
      // Add debug print for any other errors
      debugPrint('DEBUG: API Error in fetchProducts: $e');
      if (e is ApiException) rethrow;
      throw ApiException('Unexpected error: $e', 0);
    }
  }

  /// Fetches a specific product by ID
  ///
  /// [productId] - The ID of the product to fetch
  /// [storeId] - Get stock for specific store (optional, for unmanned stores)
  Future<Product> fetchProduct(String productId, {String? storeId}) async {
    try {
      // Build query parameters
      final Map<String, String> queryParams = {};
      if (storeId != null) {
        queryParams['store_id'] = storeId;
      }

      // Build URI using the CORRECT base URL from ApiConfig
      final uri = Uri.parse('${ApiConfig.apiBaseUrl}/products/$productId')
          .replace(queryParameters: queryParams.isNotEmpty ? queryParams : null);

      debugPrint('Fetching product from: $uri'); // Added for debugging

      // Make HTTP request
      final response = await _client.get(
        uri,
        headers: ApiConfig.headers,
      ).timeout(_timeout);

      // Handle response
      if (response.statusCode == 200) {
        final Map<String, dynamic> json = jsonDecode(response.body);
        return Product.fromJson(json);
      } else if (response.statusCode == 404) {
        throw ApiException('Product not found', 404);
      } else {
        throw ApiException(
          'Failed to fetch product: ${response.statusCode}',
          response.statusCode,
        );
      }
    } on SocketException {
      throw ApiException('No internet connection', 0);
    } on http.ClientException {
      throw ApiException('Network error occurred', 0);
    } on FormatException {
      throw ApiException('Invalid response format', 0);
    } catch (e) {
      debugPrint('DEBUG: API Error in fetchProduct: $e');
      if (e is ApiException) rethrow;
      throw ApiException('Unexpected error: $e', 0);
    }
  }

  /// Fetches all categories from the API
  ///
  /// [storeType] - Filter categories by store type association (optional)
  Future<List<Category>> fetchCategories({StoreType? storeType}) async {
    try {
      // Build query parameters
      final Map<String, String> queryParams = {};
      if (storeType != null) {
        queryParams['store_type'] = storeType.apiValue;
      }

      // Build URI using the CORRECT base URL from ApiConfig
      final uri = Uri.parse('${ApiConfig.apiBaseUrl}/categories')
          .replace(queryParameters: queryParams.isNotEmpty ? queryParams : null);

      debugPrint('Fetching categories from: $uri'); // Added for debugging

      // Make HTTP request
      final response = await _client.get(
        uri,
        headers: ApiConfig.headers,
      ).timeout(_timeout);

      // Handle response
      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        return jsonList.map((json) => Category.fromJson(json)).toList();
      } else {
        throw ApiException(
          'Failed to fetch categories: ${response.statusCode}',
          response.statusCode,
        );
      }
    } on SocketException {
      throw ApiException('No internet connection', 0);
    } on http.ClientException {
      throw ApiException('Network error occurred', 0);
    } on FormatException {
      throw ApiException('Invalid response format', 0);
    } catch (e) {
      debugPrint('DEBUG: API Error in fetchCategories: $e');
      if (e is ApiException) rethrow;
      throw ApiException('Unexpected error: $e', 0);
    }
  }

  /// Fetches all stores from the API
  ///
  /// [storeType] - Filter stores by type (optional)
  Future<List<Store>> fetchStores({StoreType? storeType}) async {
    try {
      // Build query parameters
      final Map<String, String> queryParams = {};
      if (storeType != null) {
        queryParams['type'] = storeType.apiValue;
      }

      // Build URI using the CORRECT base URL from ApiConfig
      final uri = Uri.parse('${ApiConfig.apiBaseUrl}/stores')
          .replace(queryParameters: queryParams.isNotEmpty ? queryParams : null);

      debugPrint('Fetching stores from: $uri'); // Added for debugging

      // Make HTTP request
      final response = await _client.get(
        uri,
        headers: ApiConfig.headers,
      ).timeout(_timeout);

      // Handle response
      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        return jsonList.map((json) => Store.fromJson(json)).toList();
      } else {
        throw ApiException(
          'Failed to fetch stores: ${response.statusCode}',
          response.statusCode,
        );
      }
    } on SocketException {
      throw ApiException('No internet connection', 0);
    } on http.ClientException {
      throw ApiException('Network error occurred', 0);
    } on FormatException {
      throw ApiException('Invalid response format', 0);
    } catch (e) {
      debugPrint('DEBUG: API Error in fetchStores: $e');
      if (e is ApiException) rethrow;
      throw ApiException('Unexpected error: $e', 0);
    }
  }

  /// Checks the health of the API service
  Future<bool> checkHealth() async {
    try {
      final response = await _client.get(
        Uri.parse('${ApiConfig.baseUrl}/health'), // Use baseUrl for health check
        headers: ApiConfig.headers,
      ).timeout(ApiConfig.healthTimeout);

      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  /// Fetches subcategories for a specific category
  ///
  /// [categoryId] - The ID of the parent category
  Future<List<Subcategory>> fetchSubcategories(String categoryId) async {
    try {
      final uri = Uri.parse('${ApiConfig.apiBaseUrl}/categories/$categoryId/subcategories');

      debugPrint('Fetching subcategories from: $uri');

      final response = await _client.get(uri).timeout(_timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        return jsonList.map((json) => Subcategory.fromJson(json)).toList();
      } else {
        throw ApiException(
          'Failed to fetch subcategories: ${response.body}',
          response.statusCode,
        );
      }
    } on SocketException {
      throw const ApiException('No internet connection', 0);
    } on HttpException {
      throw const ApiException('HTTP error occurred', 0);
    } on FormatException {
      throw const ApiException('Invalid response format', 0);
    } catch (e) {
      throw ApiException('Unexpected error: $e', 0);
    }
  }

  /// Fetches categories with optional filtering by mini-app type
  ///
  /// [storeType] - Filter categories by store type (optional)
  /// [miniAppType] - Filter categories by mini-app type (optional)
  /// [storeId] - Filter categories by specific store (optional)
  /// [includeSubcategories] - Whether to include subcategories in the response (optional)
  Future<List<Category>> fetchCategoriesWithFilters({
    StoreType? storeType,
    MiniAppType? miniAppType,
    int? storeId,
    bool includeSubcategories = false,
  }) async {
    try {
      // Build query parameters
      final Map<String, String> queryParams = {};

      if (storeType != null) {
        queryParams['store_type'] = storeType.apiValue;
      }

      if (miniAppType != null) {
        queryParams['mini_app_type'] = miniAppType.apiValue;
      }

      if (storeId != null) {
        queryParams['store_id'] = storeId.toString();
      }

      if (includeSubcategories) {
        queryParams['include_subcategories'] = 'true';
      }

      // Build URI
      final uri = Uri.parse('${ApiConfig.apiBaseUrl}/categories')
          .replace(queryParameters: queryParams.isNotEmpty ? queryParams : null);

      debugPrint('Fetching categories from: $uri');

      final response = await _client.get(uri).timeout(_timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        return jsonList.map((json) => Category.fromJson(json)).toList();
      } else {
        throw ApiException(
          'Failed to fetch categories: ${response.body}',
          response.statusCode,
        );
      }
    } on SocketException {
      throw const ApiException('No internet connection', 0);
    } on HttpException {
      throw const ApiException('HTTP error occurred', 0);
    } on FormatException {
      throw const ApiException('Invalid response format', 0);
    } catch (e) {
      throw ApiException('Unexpected error: $e', 0);
    }
  }

  /// Dispose the HTTP client
  static void dispose() {
    _client.close();
  }
}

/// Custom exception class for API errors
class ApiException implements Exception {
  final String message;
  final int statusCode;

  const ApiException(this.message, this.statusCode);

  @override
  String toString() => 'ApiException: $message (Status: $statusCode)';
}