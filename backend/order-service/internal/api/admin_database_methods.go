package api

import (
	"context"
	"fmt"
	"strings"

	"github.com/expomadeinworld/madeinworld/order-service/internal/models"
	"github.com/jackc/pgx/v5"
)

// getAdminOrders retrieves orders with filtering and pagination for admin
func (h *Handler) getAdminOrders(ctx context.Context, req *models.AdminOrderListRequest) ([]models.AdminOrderResponse, int, error) {
	// Build WHERE clause
	var whereConditions []string
	var args []interface{}
	argIndex := 1

	if req.OrderID != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("o.order_id::text ILIKE $%d", argIndex))
		args = append(args, "%"+req.OrderID+"%")
		argIndex++
	}

	if req.UserID != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("o.user_id = $%d", argIndex))
		args = append(args, req.UserID)
		argIndex++
	}

	if req.MiniAppType != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("o.mini_app_type = $%d", argIndex))
		args = append(args, req.MiniAppType)
		argIndex++
	}

	if req.Status != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("o.status = $%d", argIndex))
		args = append(args, req.Status)
		argIndex++
	}

	if req.DateFrom != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("o.created_at >= $%d", argIndex))
		args = append(args, req.DateFrom+" 00:00:00")
		argIndex++
	}

	if req.DateTo != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("o.created_at <= $%d", argIndex))
		args = append(args, req.DateTo+" 23:59:59")
		argIndex++
	}

	if req.Search != "" {
		searchCondition := fmt.Sprintf("(o.order_id::text ILIKE $%d OR u.email ILIKE $%d OR u.username ILIKE $%d)", argIndex, argIndex, argIndex)
		whereConditions = append(whereConditions, searchCondition)
		args = append(args, "%"+req.Search+"%")
		argIndex++
	}

	whereClause := ""
	if len(whereConditions) > 0 {
		whereClause = "WHERE " + strings.Join(whereConditions, " AND ")
	}

	// Build ORDER BY clause
	orderBy := "ORDER BY o.created_at DESC"
	if req.SortBy != "" {
		sortColumn := "o.created_at"
		switch req.SortBy {
		case "total_amount":
			sortColumn = "o.total_amount"
		case "status":
			sortColumn = "o.status"
		case "created_at":
			sortColumn = "o.created_at"
		}

		sortOrder := "DESC"
		if req.SortOrder == "asc" {
			sortOrder = "ASC"
		}

		orderBy = fmt.Sprintf("ORDER BY %s %s", sortColumn, sortOrder)
	}

	// Count total records
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM orders o
		LEFT JOIN users u ON o.user_id = u.id




		%s
	`, whereClause)

	var total int
	err := h.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count orders: %w", err)
	}

	// Get paginated results
	offset := (req.Page - 1) * req.Limit
	query := fmt.Sprintf(`
		SELECT
			o.order_id,
			o.user_id,
			COALESCE(u.email, '') as user_email,
			TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) as user_name,
			o.mini_app_type,

			o.total_amount,
			o.status,
			(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) as item_count,
			o.created_at,
			o.updated_at
		FROM orders o
		LEFT JOIN users u ON o.user_id = u.id





		%s
		%s
		LIMIT $%d OFFSET $%d
	`, whereClause, orderBy, argIndex, argIndex+1)

	args = append(args, req.Limit, offset)

	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query orders: %w", err)
	}
	defer rows.Close()

	var orders []models.AdminOrderResponse
	for rows.Next() {
		var order models.AdminOrderResponse
		err := rows.Scan(
			&order.ID,
			&order.UserID,
			&order.UserEmail,
			&order.UserName,
			&order.MiniAppType,
			&order.TotalAmount,
			&order.Status,
			&order.ItemCount,
			&order.CreatedAt,
			&order.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan order: %w", err)
		}

		orders = append(orders, order)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating orders: %w", err)
	}

	return orders, total, nil
}

// getAdminOrderByID retrieves a specific order by ID for admin with full details
func (h *Handler) getAdminOrderByID(ctx context.Context, orderID string) (*models.AdminOrderDetailResponse, error) {
	// Get order details
	query := `
		SELECT
			o.order_id,
			o.user_id,
			COALESCE(u.email, '') as user_email,
			TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) as user_name,
			o.mini_app_type,
			o.total_amount,
			o.status,
			(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) as item_count,
			o.created_at,
			o.updated_at
		FROM orders o
		LEFT JOIN users u ON o.user_id = u.id





		WHERE o.order_id = $1
	`

	var order models.AdminOrderResponse
	err := h.db.Pool.QueryRow(ctx, query, orderID).Scan(
		&order.ID,
		&order.UserID,
		&order.UserEmail,
		&order.UserName,
		&order.MiniAppType,
		&order.TotalAmount,
		&order.Status,
		&order.ItemCount,
		&order.CreatedAt,
		&order.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("order not found")
		}
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	// Get order items
	items, err := h.getOrderItems(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to get order items: %w", err)
	}

	response := &models.AdminOrderDetailResponse{
		Order: order,
		Items: items,
	}

	return response, nil
}

// updateOrderStatus updates the status of an order and logs the change
func (h *Handler) updateOrderStatus(ctx context.Context, orderID string, newStatus models.OrderStatus, reason, changedBy string) error {
	// Start transaction
	tx, err := h.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get current status
	var currentStatus models.OrderStatus
	err = tx.QueryRow(ctx, "SELECT status FROM orders WHERE order_id = $1", orderID).Scan(&currentStatus)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("order not found")
		}
		return fmt.Errorf("failed to get current status: %w", err)
	}

	// Update order status
	_, err = tx.Exec(ctx,
		"UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2",
		newStatus, orderID)
	if err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// Commit transaction
	err = tx.Commit(ctx)
	if err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// bulkUpdateOrderStatus updates multiple orders' status
func (h *Handler) bulkUpdateOrderStatus(ctx context.Context, orderIDs []string, newStatus models.OrderStatus, reason, changedBy string) (int, error) {
	successCount := 0

	for _, orderID := range orderIDs {
		err := h.updateOrderStatus(ctx, orderID, newStatus, reason, changedBy)
		if err != nil {
			// Log error but continue with other orders
			fmt.Printf("Failed to update order %s: %v\n", orderID, err)
			continue
		}
		successCount++
	}

	return successCount, nil
}

// getOrderStatistics retrieves comprehensive order statistics for admin dashboard
func (h *Handler) getOrderStatistics(ctx context.Context, dateFrom, dateTo string) (*models.OrderStatistics, error) {
	stats := &models.OrderStatistics{
		OrdersByStatus:   make(map[models.OrderStatus]int),
		OrdersByMiniApp:  make(map[models.MiniAppType]int),
		RevenueByMiniApp: make(map[models.MiniAppType]float64),
	}

	// Build date filter
	dateFilter := ""
	var dateArgs []interface{}
	if dateFrom != "" && dateTo != "" {
		dateFilter = "WHERE created_at >= $1 AND created_at <= $2"
		dateArgs = append(dateArgs, dateFrom+" 00:00:00", dateTo+" 23:59:59")
	} else if dateFrom != "" {
		dateFilter = "WHERE created_at >= $1"
		dateArgs = append(dateArgs, dateFrom+" 00:00:00")
	} else if dateTo != "" {
		dateFilter = "WHERE created_at <= $1"
		dateArgs = append(dateArgs, dateTo+" 23:59:59")
	}

	// Get total orders and revenue
	totalQuery := fmt.Sprintf("SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders %s", dateFilter)
	err := h.db.Pool.QueryRow(ctx, totalQuery, dateArgs...).Scan(&stats.TotalOrders, &stats.TotalRevenue)
	if err != nil {
		return nil, fmt.Errorf("failed to get total statistics: %w", err)
	}

	// Get orders by status
	statusQuery := fmt.Sprintf("SELECT status, COUNT(*) FROM orders %s GROUP BY status", dateFilter)
	rows, err := h.db.Pool.Query(ctx, statusQuery, dateArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to get status statistics: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var status models.OrderStatus
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, fmt.Errorf("failed to scan status statistics: %w", err)
		}
		stats.OrdersByStatus[status] = count
	}

	// Get orders and revenue by mini-app
	miniAppQuery := fmt.Sprintf("SELECT mini_app_type, COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders %s GROUP BY mini_app_type", dateFilter)
	rows, err = h.db.Pool.Query(ctx, miniAppQuery, dateArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to get mini-app statistics: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var miniAppType models.MiniAppType
		var count int
		var revenue float64
		if err := rows.Scan(&miniAppType, &count, &revenue); err != nil {
			return nil, fmt.Errorf("failed to scan mini-app statistics: %w", err)
		}
		stats.OrdersByMiniApp[miniAppType] = count
		stats.RevenueByMiniApp[miniAppType] = revenue
	}

	// Get daily statistics for the last 30 days (simplified for now)
	stats.DailyStats = []models.DailyOrderStats{}

	// Get top products by order count (simplified for now)
	// Note: This is a simplified version - can be enhanced later
	stats.TopProducts = []models.ProductOrderStats{}

	return stats, nil
}

// Admin Cart Database Methods

// getAdminCarts retrieves carts with filtering and pagination for admin
func (h *Handler) getAdminCarts(ctx context.Context, req *models.AdminCartListRequest) ([]models.AdminCartResponse, int, error) {
	// Build WHERE clause
	var whereConditions []string
	var args []interface{}
	argIndex := 1

	if req.UserID != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("c.user_id = $%d", argIndex))
		args = append(args, req.UserID)
		argIndex++
	}

	if req.MiniAppType != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("c.mini_app_type = $%d", argIndex))
		args = append(args, req.MiniAppType)
		argIndex++
	}

	if req.DateFrom != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("c.created_at >= $%d", argIndex))
		args = append(args, req.DateFrom+" 00:00:00")
		argIndex++
	}

	if req.DateTo != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("c.created_at <= $%d", argIndex))
		args = append(args, req.DateTo+" 23:59:59")
		argIndex++
	}

	if req.Search != "" {
		searchCondition := fmt.Sprintf("(u.email ILIKE $%d OR u.username ILIKE $%d OR p.title ILIKE $%d)", argIndex, argIndex, argIndex)
		whereConditions = append(whereConditions, searchCondition)
		args = append(args, "%"+req.Search+"%")
		argIndex++
	}

	whereClause := ""
	if len(whereConditions) > 0 {
		whereClause = "WHERE " + strings.Join(whereConditions, " AND ")
	}

	// Build ORDER BY clause
	orderBy := "ORDER BY "
	switch req.SortBy {
	case "created_at":
		orderBy += "MIN(c.created_at)"
	case "updated_at":
		orderBy += "MAX(c.updated_at)"
	case "total_value":
		orderBy += "total_value"
	default:
		orderBy += "MAX(c.updated_at)"
	}

	if req.SortOrder == "asc" {
		orderBy += " ASC"
	} else {
		orderBy += " DESC"
	}

	// Get total count - count unique combinations of user_id and mini_app_type
	countQuery := fmt.Sprintf(`
		SELECT COUNT(DISTINCT CONCAT(c.user_id::text, '-', c.mini_app_type))
		FROM carts c
		LEFT JOIN users u ON c.user_id = u.id
		LEFT JOIN products p ON c.product_id = p.product_uuid
		%s
	`, whereClause)

	var total int
	err := h.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count carts: %w", err)
	}

	// Get paginated results - group by user_id and mini_app_type to get unique carts
	offset := (req.Page - 1) * req.Limit
	query := fmt.Sprintf(`
		SELECT
			CONCAT(c.user_id::text, '-', c.mini_app_type) as cart_id,
			c.user_id,
			COALESCE(u.email, '') as user_email,
			COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.username) as user_name,
			c.mini_app_type,
			COUNT(c.id) as item_count,
			COALESCE(SUM(p.main_price * c.quantity), 0) as total_value,
			MIN(c.created_at) as created_at,
			MAX(c.updated_at) as updated_at
		FROM carts c
		LEFT JOIN users u ON c.user_id = u.id
		LEFT JOIN products p ON c.product_id = p.product_uuid
		%s
		GROUP BY c.user_id, c.mini_app_type, u.email, u.first_name, u.last_name, u.username
		%s
		LIMIT $%d OFFSET $%d
	`, whereClause, orderBy, argIndex, argIndex+1)

	args = append(args, req.Limit, offset)

	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query carts: %w", err)
	}
	defer rows.Close()

	var carts []models.AdminCartResponse
	for rows.Next() {
		var cart models.AdminCartResponse

		err := rows.Scan(
			&cart.ID,
			&cart.UserID,
			&cart.UserEmail,
			&cart.UserName,
			&cart.MiniAppType,
			&cart.ItemCount,
			&cart.TotalValue,
			&cart.CreatedAt,
			&cart.UpdatedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan cart: %w", err)
		}

		carts = append(carts, cart)
	}

	return carts, total, nil
}

// getAdminCartByID retrieves a specific cart by ID for admin with full details
func (h *Handler) getAdminCartByID(ctx context.Context, cartID string) (*models.AdminCartDetailResponse, error) {
	// Parse cart ID (format: user_id-mini_app_type where user_id is a UUID with hyphens)
	// Find the last hyphen to split correctly
	lastHyphenIndex := strings.LastIndex(cartID, "-")
	if lastHyphenIndex == -1 {
		return nil, fmt.Errorf("invalid cart ID format")
	}
	userID := cartID[:lastHyphenIndex]
	miniAppType := cartID[lastHyphenIndex+1:]

	// Get cart summary
	query := `
		SELECT
			CONCAT(c.user_id::text, '-', c.mini_app_type) as cart_id,
			c.user_id,
			COALESCE(u.email, '') as user_email,
			COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.username) as user_name,
			c.mini_app_type,

			COUNT(c.id) as item_count,
			COALESCE(SUM(p.main_price * c.quantity), 0) as total_value,
			MIN(c.created_at) as created_at,
			MAX(c.updated_at) as updated_at
		FROM carts c
		LEFT JOIN users u ON c.user_id = u.id
		LEFT JOIN products p ON c.product_id = p.product_uuid

		WHERE c.user_id = $1 AND c.mini_app_type = $2
		GROUP BY c.user_id, c.mini_app_type, u.email, u.first_name, u.last_name, u.username
	`

	var cart models.AdminCartResponse

	err := h.db.Pool.QueryRow(ctx, query, userID, miniAppType).Scan(
		&cart.ID,
		&cart.UserID,
		&cart.UserEmail,
		&cart.UserName,
		&cart.MiniAppType,
		&cart.ItemCount,
		&cart.TotalValue,
		&cart.CreatedAt,
		&cart.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("cart not found")
		}
		return nil, fmt.Errorf("failed to get cart: %w", err)
	}

	// Get cart items
	itemsQuery := `
		SELECT
			c.id,
			c.product_id,
			c.quantity,
			c.created_at,
			p.product_uuid,
			p.sku,
			p.title,
			p.main_price,
			p.stock_left,
			p.minimum_order_quantity,
			p.is_active
		FROM carts c
		JOIN products p ON c.product_id = p.product_uuid
		WHERE c.user_id = $1 AND c.mini_app_type = $2
		ORDER BY c.created_at DESC
	`

	rows, err := h.db.Pool.Query(ctx, itemsQuery, userID, miniAppType)
	if err != nil {
		return nil, fmt.Errorf("failed to get cart items: %w", err)
	}
	defer rows.Close()

	var items []models.CartItem
	for rows.Next() {
		var item models.CartItem
		var product models.Product

		err := rows.Scan(
			&item.ID,
			&item.ProductID,
			&item.Quantity,
			&item.AddedAt,
			&product.ID,
			&product.SKU,
			&product.Title,
			&product.MainPrice,
			&product.StockLeft,
			&product.MinimumOrderQuantity,
			&product.IsActive,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan cart item: %w", err)
		}

		item.Product = &product
		items = append(items, item)
	}

	return &models.AdminCartDetailResponse{
		Cart:  cart,
		Items: items,
	}, nil
}

// updateAdminCartItem updates a cart item quantity for admin
func (h *Handler) updateAdminCartItem(ctx context.Context, cartID, productID string, quantity int) error {
	// Parse cart ID (format: user_id-mini_app_type where user_id is a UUID with hyphens)
	lastHyphenIndex := strings.LastIndex(cartID, "-")
	if lastHyphenIndex == -1 {
		return fmt.Errorf("invalid cart ID format")
	}
	userID := cartID[:lastHyphenIndex]
	miniAppType := cartID[lastHyphenIndex+1:]

	if quantity == 0 {
		// Remove item from cart
		query := `DELETE FROM carts WHERE user_id = $1 AND mini_app_type = $2 AND product_id = $3`
		_, err := h.db.Pool.Exec(ctx, query, userID, miniAppType, productID)
		if err != nil {
			return fmt.Errorf("failed to remove cart item: %w", err)
		}
	} else {
		// Update quantity
		query := `
			UPDATE carts
			SET quantity = $4, updated_at = CURRENT_TIMESTAMP
			WHERE user_id = $1 AND mini_app_type = $2 AND product_id = $3
		`
		result, err := h.db.Pool.Exec(ctx, query, userID, miniAppType, productID, quantity)
		if err != nil {
			return fmt.Errorf("failed to update cart item: %w", err)
		}

		if result.RowsAffected() == 0 {
			return fmt.Errorf("cart item not found")
		}
	}

	return nil
}

// deleteAdminCart deletes a cart for admin
func (h *Handler) deleteAdminCart(ctx context.Context, cartID string) error {
	// Parse cart ID (format: user_id-mini_app_type where user_id is a UUID with hyphens)
	lastHyphenIndex := strings.LastIndex(cartID, "-")
	if lastHyphenIndex == -1 {
		return fmt.Errorf("invalid cart ID format")
	}
	userID := cartID[:lastHyphenIndex]
	miniAppType := cartID[lastHyphenIndex+1:]

	query := `DELETE FROM carts WHERE user_id = $1 AND mini_app_type = $2`
	result, err := h.db.Pool.Exec(ctx, query, userID, miniAppType)
	if err != nil {
		return fmt.Errorf("failed to delete cart: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cart not found")
	}

	return nil
}

// getCartStatistics retrieves comprehensive cart statistics for admin dashboard
func (h *Handler) getCartStatistics(ctx context.Context, dateFrom, dateTo string) (*models.CartStatistics, error) {
	stats := &models.CartStatistics{
		CartsByMiniApp:     make(map[models.MiniAppType]int),
		CartValueByMiniApp: make(map[models.MiniAppType]float64),
	}

	// Build date filter
	var dateFilter string
	var args []interface{}
	argIndex := 1

	if dateFrom != "" && dateTo != "" {
		dateFilter = fmt.Sprintf("WHERE c.created_at >= $%d AND c.created_at <= $%d", argIndex, argIndex+1)
		args = append(args, dateFrom+" 00:00:00", dateTo+" 23:59:59")
		argIndex += 2
	} else if dateFrom != "" {
		dateFilter = fmt.Sprintf("WHERE c.created_at >= $%d", argIndex)
		args = append(args, dateFrom+" 00:00:00")
		argIndex++
	} else if dateTo != "" {
		dateFilter = fmt.Sprintf("WHERE c.created_at <= $%d", argIndex)
		args = append(args, dateTo+" 23:59:59")
		argIndex++
	}

	// Get total carts and total value
	totalQuery := fmt.Sprintf(`
		SELECT
			COUNT(DISTINCT CONCAT(c.user_id, '-', c.mini_app_type)) as total_carts,
			COALESCE(SUM(p.main_price * c.quantity), 0) as total_value
		FROM carts c
		JOIN products p ON c.product_id = p.product_uuid
		%s
	`, dateFilter)

	err := h.db.Pool.QueryRow(ctx, totalQuery, args...).Scan(&stats.TotalCarts, &stats.TotalCartValue)
	if err != nil {
		return nil, fmt.Errorf("failed to get total cart statistics: %w", err)
	}

	// Calculate average cart value
	if stats.TotalCarts > 0 {
		stats.AverageCartValue = stats.TotalCartValue / float64(stats.TotalCarts)
	}

	// Get statistics by mini-app type
	miniAppQuery := fmt.Sprintf(`
		SELECT
			c.mini_app_type,
			COUNT(DISTINCT CONCAT(c.user_id, '-', c.mini_app_type)) as cart_count,
			COALESCE(SUM(p.main_price * c.quantity), 0) as total_value
		FROM carts c
		JOIN products p ON c.product_id = p.product_uuid
		%s
		GROUP BY c.mini_app_type
	`, dateFilter)

	rows, err := h.db.Pool.Query(ctx, miniAppQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get mini-app cart statistics: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var miniAppType models.MiniAppType
		var count int
		var value float64
		if err := rows.Scan(&miniAppType, &count, &value); err != nil {
			return nil, fmt.Errorf("failed to scan mini-app cart statistics: %w", err)
		}
		stats.CartsByMiniApp[miniAppType] = count
		stats.CartValueByMiniApp[miniAppType] = value
	}

	// Get abandoned carts (older than 7 days)
	abandonedQuery := `
		SELECT COUNT(DISTINCT CONCAT(c.user_id, '-', c.mini_app_type))
		FROM carts c
		WHERE c.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
	`

	err = h.db.Pool.QueryRow(ctx, abandonedQuery).Scan(&stats.AbandonedCarts)
	if err != nil {
		return nil, fmt.Errorf("failed to get abandoned cart count: %w", err)
	}

	return stats, nil
}
