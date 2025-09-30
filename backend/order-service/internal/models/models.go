package models

import (
	"time"
)

// MiniAppType represents the type of mini-app
type MiniAppType string

const (
	MiniAppTypeRetailStore     MiniAppType = "RetailStore"
	MiniAppTypeUnmannedStore   MiniAppType = "UnmannedStore"
	MiniAppTypeExhibitionSales MiniAppType = "ExhibitionSales"
	MiniAppTypeGroupBuying     MiniAppType = "GroupBuying"
)

// IsValid checks if the mini-app type is valid
func (m MiniAppType) IsValid() bool {
	switch m {
	case MiniAppTypeRetailStore, MiniAppTypeUnmannedStore, MiniAppTypeExhibitionSales, MiniAppTypeGroupBuying:
		return true
	default:
		return false
	}
}

// RequiresStore returns true if the mini-app type requires a store_id
func (m MiniAppType) RequiresStore() bool {
	return m == MiniAppTypeUnmannedStore || m == MiniAppTypeExhibitionSales
}

// OrderStatus represents the status of an order
type OrderStatus string

const (
	OrderStatusPending    OrderStatus = "pending"
	OrderStatusConfirmed  OrderStatus = "confirmed"
	OrderStatusProcessing OrderStatus = "processing"
	OrderStatusShipped    OrderStatus = "shipped"
	OrderStatusDelivered  OrderStatus = "delivered"
	OrderStatusCancelled  OrderStatus = "cancelled"
)

// Cart represents a user's cart for a specific mini-app
// Note: In the existing DB, each cart entry represents one product (no separate cart_items table)
type Cart struct {
	ID          string      `json:"id" db:"id"`
	UserID      string      `json:"user_id" db:"user_id"`
	ProductID   string      `json:"product_id" db:"product_id"`
	Quantity    int         `json:"quantity" db:"quantity"`
	MiniAppType MiniAppType `json:"mini_app_type" db:"mini_app_type"`
	Product     *Product    `json:"product,omitempty"` // Populated when needed
	CreatedAt   time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at" db:"updated_at"`
}

// CartResponse represents the response format for cart operations
type CartResponse struct {
	Items []Cart `json:"items"`
}

// CartItem represents an item in a cart (for compatibility)
type CartItem struct {
	ID        string    `json:"id" db:"id"`
	ProductID string    `json:"product_id" db:"product_id"`
	Quantity  int       `json:"quantity" db:"quantity"`
	Product   *Product  `json:"product,omitempty"` // Populated when needed
	AddedAt   time.Time `json:"added_at" db:"created_at"`
}

// Order represents a completed order
type Order struct {
	ID          string      `json:"id" db:"id"`
	UserID      string      `json:"user_id" db:"user_id"`
	MiniAppType MiniAppType `json:"mini_app_type" db:"mini_app_type"`
	TotalAmount float64     `json:"total_amount" db:"total_amount"`
	Status      OrderStatus `json:"status" db:"status"`
	Items       []OrderItem `json:"items"`
	CreatedAt   time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at" db:"updated_at"`
}

// OrderItem represents an item in an order
type OrderItem struct {
	ID         string   `json:"id" db:"id"`
	OrderID    string   `json:"order_id" db:"order_id"`
	ProductID  string   `json:"product_id" db:"product_id"`
	Quantity   int      `json:"quantity" db:"quantity"`
	UnitPrice  float64  `json:"unit_price" db:"unit_price"`
	TotalPrice float64  `json:"total_price" db:"total_price"`
	Product    *Product `json:"product,omitempty"` // Populated when needed
}

// Product represents a product (simplified for order service)
type Product struct {
	ID                   string  `json:"id" db:"id"`
	SKU                  string  `json:"sku" db:"sku"`
	Title                string  `json:"title" db:"title"`
	MainPrice            float64 `json:"main_price" db:"main_price"`
	StockLeft            int     `json:"stock_left" db:"stock_left"`
	MinimumOrderQuantity int     `json:"minimum_order_quantity" db:"minimum_order_quantity"`
	IsActive             bool    `json:"is_active" db:"is_active"`
}

// DisplayStock returns the stock quantity with buffer applied (actual - 5)
func (p *Product) DisplayStock() int {
	displayStock := p.StockLeft - 5
	if displayStock < 0 {
		displayStock = 0
	}
	return displayStock
}

// HasStock returns true if the product has stock available for display
// Note: This method is only used for UnmannedStore validation
func (p *Product) HasStock() bool {
	return p.DisplayStock() > 0
}

// Request/Response models
// OrderItemOrgLink persists resolved organizations per order item
// Note: organization IDs are UUID strings
type OrderItemOrgLink struct {
	OrderItemID       string    `json:"order_item_id" db:"order_item_id"`
	ProductID         string    `json:"product_id" db:"product_id"`
	ManufacturerOrgID *string   `json:"manufacturer_org_id,omitempty" db:"manufacturer_org_id"`
	TplOrgIDs         []string  `json:"tpl_org_ids,omitempty" db:"tpl_org_ids"`
	PartnerOrgIDs     []string  `json:"partner_org_ids,omitempty" db:"partner_org_ids"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

// AddToCartRequest represents a request to add an item to cart
type AddToCartRequest struct {
	ProductID string `json:"product_id" binding:"required"`
	Quantity  int    `json:"quantity" binding:"required,min=1"`
	StoreID   *int   `json:"store_id,omitempty"` // Required for location-based mini-apps
}

// UpdateCartItemRequest represents a request to update cart item quantity
type UpdateCartItemRequest struct {
	ProductID string `json:"product_id" binding:"required"`
	Quantity  int    `json:"quantity" binding:"required,min=0"` // 0 means remove
}

// CreateOrderRequest represents a request to create an order
type CreateOrderRequest struct {
	StoreID *int `json:"store_id,omitempty"` // Required for location-based mini-apps
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// SuccessResponse represents a success response
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Admin-specific models

// AdminOrderListRequest represents request parameters for admin order listing
type AdminOrderListRequest struct {
	Page        int    `form:"page" binding:"omitempty,min=1"`
	Limit       int    `form:"limit" binding:"omitempty,min=1,max=100"`
	OrderID     string `form:"order_id"`
	UserID      string `form:"user_id"`
	MiniAppType string `form:"mini_app_type"`
	Status      string `form:"status"`
	StoreID     *int   `form:"store_id"`
	DateFrom    string `form:"date_from"`  // YYYY-MM-DD format
	DateTo      string `form:"date_to"`    // YYYY-MM-DD format
	Search      string `form:"search"`     // Search in order ID, user email, product names
	SortBy      string `form:"sort_by"`    // created_at, total_amount, status
	SortOrder   string `form:"sort_order"` // asc, desc
}

// AdminOrderResponse represents an order in admin list view
type AdminOrderResponse struct {
	ID          string      `json:"id"`
	UserID      string      `json:"user_id"`
	UserEmail   string      `json:"user_email"`
	UserName    string      `json:"user_name"`
	MiniAppType MiniAppType `json:"mini_app_type"`
	StoreID     *int        `json:"store_id,omitempty"`
	StoreName   string      `json:"store_name,omitempty"`
	TotalAmount float64     `json:"total_amount"`
	Status      OrderStatus `json:"status"`
	ItemCount   int         `json:"item_count"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// AdminOrderListResponse represents the response for admin order listing
type AdminOrderListResponse struct {
	Orders     []AdminOrderResponse `json:"orders"`
	Total      int                  `json:"total"`
	Page       int                  `json:"page"`
	Limit      int                  `json:"limit"`
	TotalPages int                  `json:"total_pages"`
}

// AdminOrderDetailResponse represents detailed order information for admin
type AdminOrderDetailResponse struct {
	Order         AdminOrderResponse  `json:"order"`
	Items         []OrderItem         `json:"items"`
	StatusHistory []OrderStatusChange `json:"status_history,omitempty"`
}

// OrderStatusChange represents a status change record
type OrderStatusChange struct {
	ID        string      `json:"id"`
	OrderID   string      `json:"order_id"`
	OldStatus OrderStatus `json:"old_status"`
	NewStatus OrderStatus `json:"new_status"`
	ChangedBy string      `json:"changed_by"`
	Reason    string      `json:"reason,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
}

// UpdateOrderStatusRequest represents a request to update order status
type UpdateOrderStatusRequest struct {
	Status OrderStatus `json:"status" binding:"required"`
	Reason string      `json:"reason,omitempty"`
}

// BulkUpdateOrdersRequest represents a request for bulk order updates
type BulkUpdateOrdersRequest struct {
	OrderIDs []string    `json:"order_ids" binding:"required,min=1"`
	Status   OrderStatus `json:"status" binding:"required"`
	Reason   string      `json:"reason,omitempty"`
}

// OrderStatistics represents order statistics for admin dashboard
type OrderStatistics struct {
	TotalOrders      int                     `json:"total_orders"`
	TotalRevenue     float64                 `json:"total_revenue"`
	OrdersByStatus   map[OrderStatus]int     `json:"orders_by_status"`
	OrdersByMiniApp  map[MiniAppType]int     `json:"orders_by_mini_app"`
	RevenueByMiniApp map[MiniAppType]float64 `json:"revenue_by_mini_app"`
	DailyStats       []DailyOrderStats       `json:"daily_stats"`
	TopProducts      []ProductOrderStats     `json:"top_products"`
}

// DailyOrderStats represents daily order statistics
type DailyOrderStats struct {
	Date       string  `json:"date"`
	OrderCount int     `json:"order_count"`
	Revenue    float64 `json:"revenue"`
}

// ProductOrderStats represents product order statistics
type ProductOrderStats struct {
	ProductID    string  `json:"product_id"`
	ProductTitle string  `json:"product_title"`
	OrderCount   int     `json:"order_count"`
	TotalRevenue float64 `json:"total_revenue"`
}

// Admin Cart Models

// AdminCartListRequest represents request parameters for admin cart listing
type AdminCartListRequest struct {
	Page        int    `form:"page" binding:"omitempty,min=1"`
	Limit       int    `form:"limit" binding:"omitempty,min=1,max=100"`
	UserID      string `form:"user_id"`
	MiniAppType string `form:"mini_app_type"`
	StoreID     *int   `form:"store_id"`
	DateFrom    string `form:"date_from"`  // YYYY-MM-DD format
	DateTo      string `form:"date_to"`    // YYYY-MM-DD format
	Search      string `form:"search"`     // Search in user email, product names
	SortBy      string `form:"sort_by"`    // created_at, updated_at, total_value
	SortOrder   string `form:"sort_order"` // asc, desc
}

// AdminCartResponse represents a cart in admin list view
type AdminCartResponse struct {
	ID          string      `json:"id"`
	UserID      string      `json:"user_id"`
	UserEmail   string      `json:"user_email"`
	UserName    string      `json:"user_name"`
	MiniAppType MiniAppType `json:"mini_app_type"`
	StoreID     *int        `json:"store_id,omitempty"`
	StoreName   string      `json:"store_name,omitempty"`
	ItemCount   int         `json:"item_count"`
	TotalValue  float64     `json:"total_value"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// AdminCartListResponse represents the response for admin cart listing
type AdminCartListResponse struct {
	Carts      []AdminCartResponse `json:"carts"`
	Total      int                 `json:"total"`
	Page       int                 `json:"page"`
	Limit      int                 `json:"limit"`
	TotalPages int                 `json:"total_pages"`
}

// AdminCartDetailResponse represents detailed cart information for admin
type AdminCartDetailResponse struct {
	Cart  AdminCartResponse `json:"cart"`
	Items []CartItem        `json:"items"`
}

// AdminCartUpdateRequest represents a request to update cart item quantity by admin
type AdminCartUpdateRequest struct {
	ProductID string `json:"product_id" binding:"required"`
	Quantity  int    `json:"quantity" binding:"required,min=0"` // 0 means remove
}

// CartStatistics represents comprehensive cart statistics for admin dashboard
type CartStatistics struct {
	TotalCarts         int                     `json:"total_carts"`
	TotalCartValue     float64                 `json:"total_cart_value"`
	AverageCartValue   float64                 `json:"average_cart_value"`
	CartsByMiniApp     map[MiniAppType]int     `json:"carts_by_mini_app"`
	CartValueByMiniApp map[MiniAppType]float64 `json:"cart_value_by_mini_app"`
	AbandonedCarts     int                     `json:"abandoned_carts"` // Carts older than 7 days
}
