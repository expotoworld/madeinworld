package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/expomadeinworld/madeinworld/order-service/internal/models"
	"github.com/gin-gonic/gin"
)

// GetAdminOrders retrieves all orders with filtering and pagination for admin
func (h *Handler) GetAdminOrders(c *gin.Context) {
	var req models.AdminOrderListRequest

	// Bind query parameters
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid query parameters",
			Message: err.Error(),
		})
		return
	}

	// Set defaults
	if req.Page == 0 {
		req.Page = 1
	}
	if req.Limit == 0 {
		req.Limit = 20
	}
	if req.SortBy == "" {
		req.SortBy = "created_at"
	}
	if req.SortOrder == "" {
		req.SortOrder = "desc"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Get orders with filtering
	orders, total, err := h.getAdminOrders(ctx, &req)
	if err != nil {
		fmt.Printf("[ADMIN_ORDERS] query failed: err=%v req=%+v\n", err, req)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to get orders",
			Message: err.Error(),
		})
		return
	}

	// Calculate total pages
	totalPages := (total + req.Limit - 1) / req.Limit

	response := models.AdminOrderListResponse{
		Orders:     orders,
		Total:      total,
		Page:       req.Page,
		Limit:      req.Limit,
		TotalPages: totalPages,
	}

	c.JSON(http.StatusOK, response)
}

// GetAdminOrder retrieves a specific order by ID for admin
func (h *Handler) GetAdminOrder(c *gin.Context) {
	orderID := c.Param("order_id")
	if orderID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Missing order ID",
			Message: "Order ID is required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get order details
	order, err := h.getAdminOrderByID(ctx, orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "Order not found",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, order)
}

// UpdateOrderStatus updates the status of an order
func (h *Handler) UpdateOrderStatus(c *gin.Context) {
	orderID := c.Param("order_id")
	if orderID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Missing order ID",
			Message: "Order ID is required",
		})
		return
	}

	var req models.UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Get admin user ID from JWT
	adminUserID, ok := GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid admin user",
			Message: "Could not extract admin user ID from token",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Update order status
	err := h.updateOrderStatus(ctx, orderID, req.Status, req.Reason, adminUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to update order status",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Order status updated successfully",
	})
}

// DeleteOrder cancels/deletes an order
func (h *Handler) DeleteOrder(c *gin.Context) {
	orderID := c.Param("order_id")
	if orderID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Missing order ID",
			Message: "Order ID is required",
		})
		return
	}

	// Get admin user ID from JWT
	adminUserID, ok := GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid admin user",
			Message: "Could not extract admin user ID from token",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Cancel the order (set status to cancelled)
	err := h.updateOrderStatus(ctx, orderID, models.OrderStatusCancelled, "Cancelled by admin", adminUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to cancel order",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Order cancelled successfully",
	})
}

// BulkUpdateOrders updates multiple orders at once
func (h *Handler) BulkUpdateOrders(c *gin.Context) {
	var req models.BulkUpdateOrdersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Get admin user ID from JWT
	adminUserID, ok := GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid admin user",
			Message: "Could not extract admin user ID from token",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Update all orders
	successCount, err := h.bulkUpdateOrderStatus(ctx, req.OrderIDs, req.Status, req.Reason, adminUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to update orders",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Orders updated successfully",
		Data: gin.H{
			"updated_count": successCount,
			"total_count":   len(req.OrderIDs),
		},
	})
}

// GetOrderStatistics retrieves order statistics for admin dashboard
func (h *Handler) GetOrderStatistics(c *gin.Context) {
	// Get optional date range parameters
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Get statistics
	stats, err := h.getOrderStatistics(ctx, dateFrom, dateTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to get order statistics",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// Admin Cart Handlers

// GetAdminCarts retrieves all carts with filtering and pagination for admin
func (h *Handler) GetAdminCarts(c *gin.Context) {
	var req models.AdminCartListRequest

	// Bind query parameters
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid query parameters",
			Message: err.Error(),
		})
		return
	}

	// Set defaults
	if req.Page == 0 {
		req.Page = 1
	}
	if req.Limit == 0 {
		req.Limit = 20
	}
	if req.SortBy == "" {
		req.SortBy = "updated_at"
	}
	if req.SortOrder == "" {
		req.SortOrder = "desc"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Get carts with filtering
	carts, total, err := h.getAdminCarts(ctx, &req)
	if err != nil {
		fmt.Printf("[ADMIN_CARTS] query failed: err=%v req=%+v\n", err, req)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to get carts",
			Message: err.Error(),
		})
		return
	}

	// Calculate total pages
	totalPages := (total + req.Limit - 1) / req.Limit

	response := models.AdminCartListResponse{
		Carts:      carts,
		Total:      total,
		Page:       req.Page,
		Limit:      req.Limit,
		TotalPages: totalPages,
	}

	c.JSON(http.StatusOK, response)
}

// GetAdminCart retrieves a specific cart by ID for admin
func (h *Handler) GetAdminCart(c *gin.Context) {
	cartID := c.Param("cart_id")
	if cartID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Missing cart ID",
			Message: "Cart ID is required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get cart details
	cart, err := h.getAdminCartByID(ctx, cartID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "Cart not found",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, cart)
}

// UpdateAdminCartItem updates a cart item quantity for admin
func (h *Handler) UpdateAdminCartItem(c *gin.Context) {
	cartID := c.Param("cart_id")
	if cartID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Missing cart ID",
			Message: "Cart ID is required",
		})
		return
	}

	var req models.AdminCartUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Update cart item
	err := h.updateAdminCartItem(ctx, cartID, req.ProductID, req.Quantity)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to update cart item",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Cart item updated successfully",
	})
}

// DeleteAdminCart deletes a cart for admin
func (h *Handler) DeleteAdminCart(c *gin.Context) {
	cartID := c.Param("cart_id")
	if cartID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Missing cart ID",
			Message: "Cart ID is required",
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Delete cart
	err := h.deleteAdminCart(ctx, cartID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to delete cart",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Cart deleted successfully",
	})
}

// GetCartStatistics retrieves cart statistics for admin dashboard
func (h *Handler) GetCartStatistics(c *gin.Context) {
	// Get optional date range parameters
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Get statistics
	stats, err := h.getCartStatistics(ctx, dateFrom, dateTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to get cart statistics",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}
