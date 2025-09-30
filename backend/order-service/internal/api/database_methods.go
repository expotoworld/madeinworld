package api

import (
	"context"
	"fmt"

	"github.com/expomadeinworld/madeinworld/order-service/internal/logging"
	"github.com/expomadeinworld/madeinworld/order-service/internal/models"
)

// getCartItems gets all cart items for a user and mini-app type
func (h *Handler) getCartItems(ctx context.Context, userID string, miniAppType models.MiniAppType) ([]models.Cart, error) {
	return h.getCartItemsWithStore(ctx, userID, miniAppType, nil)
}

// getCartItemsWithStore gets cart items for a user and mini-app type, optionally filtered by store
func (h *Handler) getCartItemsWithStore(ctx context.Context, userID string, miniAppType models.MiniAppType, storeID *int) ([]models.Cart, error) {
	var query string
	var args []interface{}

	if storeID != nil && miniAppType.RequiresStore() {
		// For location-based mini-apps with store filter
		// Include items with matching store_id OR NULL store_id (for backward compatibility)
		query = `
			SELECT
				c.id, c.user_id, c.product_id, c.quantity, c.mini_app_type, c.created_at, c.updated_at,
				p.product_uuid, p.sku, p.title, p.main_price, p.stock_left,
				p.minimum_order_quantity, p.is_active
			FROM carts c
			JOIN products p ON c.product_id = p.product_uuid
			WHERE c.user_id = $1 AND c.mini_app_type = $2 AND (c.store_id = $3 OR c.store_id IS NULL)
			ORDER BY c.created_at DESC
		`
		args = []interface{}{userID, string(miniAppType), *storeID}
	} else {
		// For non-location mini-apps or when no store filter needed
		query = `
			SELECT
				c.id, c.user_id, c.product_id, c.quantity, c.mini_app_type, c.created_at, c.updated_at,
				p.product_uuid, p.sku, p.title, p.main_price, p.stock_left,
				p.minimum_order_quantity, p.is_active
			FROM carts c
			JOIN products p ON c.product_id = p.product_uuid
			WHERE c.user_id = $1 AND c.mini_app_type = $2
			ORDER BY c.created_at DESC
		`
		args = []interface{}{userID, string(miniAppType)}
	}

	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query cart items: %w", err)
	}
	defer rows.Close()

	var items []models.Cart
	for rows.Next() {
		var item models.Cart
		var product models.Product

		err := rows.Scan(
			&item.ID,
			&item.UserID,
			&item.ProductID,
			&item.Quantity,
			&item.MiniAppType,
			&item.CreatedAt,
			&item.UpdatedAt,
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

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating cart items: %w", err)
	}

	return items, nil
}

// updateProductStock reduces product stock levels after order creation
func (h *Handler) updateProductStock(ctx context.Context, orderItems []models.Cart, miniAppType models.MiniAppType) error {
	// Only update stock for UnmannedStore mini-app
	if miniAppType != models.MiniAppTypeUnmannedStore {
		return nil
	}

	// Update stock for each product in the order
	for _, item := range orderItems {
		updateQuery := `
			UPDATE products
			SET stock_left = stock_left - $1, updated_at = CURRENT_TIMESTAMP
			WHERE product_uuid = $2 AND stock_left >= $1
		`

		result, err := h.db.Pool.Exec(ctx, updateQuery, item.Quantity, item.ProductID)
		if err != nil {
			return fmt.Errorf("failed to update stock for product %s: %w", item.ProductID, err)
		}

		// Check if any rows were affected (stock was sufficient)
		if result.RowsAffected() == 0 {
			// This shouldn't happen as we validate stock before order creation
			// But it's a safety check in case of concurrent orders
			return fmt.Errorf("insufficient stock for product %s (concurrent order may have depleted stock)", item.ProductID)
		}
	}

	return nil
}

// getProduct retrieves a product by ID (using UUID)
func (h *Handler) getProduct(ctx context.Context, productID string) (*models.Product, error) {
	var product models.Product
	query := `
		SELECT product_uuid, sku, title, main_price, stock_left, minimum_order_quantity, is_active
		FROM products
		WHERE product_uuid = $1
	`

	err := h.db.Pool.QueryRow(ctx, query, productID).Scan(
		&product.ID,
		&product.SKU,
		&product.Title,
		&product.MainPrice,
		&product.StockLeft,
		&product.MinimumOrderQuantity,
		&product.IsActive,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get product: %w", err)
	}

	return &product, nil
}

// addItemToCart adds an item to the cart or updates quantity if it already exists
func (h *Handler) addItemToCart(ctx context.Context, userID string, miniAppType models.MiniAppType, productID string, quantity int, storeID *int) error {
	var checkQuery, updateQuery, insertQuery string
	var checkArgs, updateArgs, insertArgs []interface{}

	if storeID != nil && miniAppType.RequiresStore() {
		// For location-based mini-apps, include store_id in all operations
		checkQuery = `
			SELECT quantity FROM carts
			WHERE user_id = $1 AND mini_app_type = $2 AND product_id = $3 AND store_id = $4
		`
		checkArgs = []interface{}{userID, string(miniAppType), productID, *storeID}

		updateQuery = `
			UPDATE carts
			SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
			WHERE user_id = $2 AND mini_app_type = $3 AND product_id = $4 AND store_id = $5
		`
		updateArgs = []interface{}{quantity, userID, string(miniAppType), productID, *storeID}

		insertQuery = `
			INSERT INTO carts (user_id, mini_app_type, product_id, quantity, store_id)
			VALUES ($1, $2, $3, $4, $5)
		`
		insertArgs = []interface{}{userID, string(miniAppType), productID, quantity, *storeID}
	} else {
		// For non-location mini-apps, don't include store_id
		checkQuery = `
			SELECT quantity FROM carts
			WHERE user_id = $1 AND mini_app_type = $2 AND product_id = $3
		`
		checkArgs = []interface{}{userID, string(miniAppType), productID}

		updateQuery = `
			UPDATE carts
			SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
			WHERE user_id = $2 AND mini_app_type = $3 AND product_id = $4
		`
		updateArgs = []interface{}{quantity, userID, string(miniAppType), productID}

		insertQuery = `
			INSERT INTO carts (user_id, mini_app_type, product_id, quantity)
			VALUES ($1, $2, $3, $4)
		`
		insertArgs = []interface{}{userID, string(miniAppType), productID, quantity}
	}

	// Check if item already exists in cart
	var existingQuantity int
	err := h.db.Pool.QueryRow(ctx, checkQuery, checkArgs...).Scan(&existingQuantity)

	if err == nil {
		// Item exists, update quantity
		_, err = h.db.Pool.Exec(ctx, updateQuery, updateArgs...)
		if err != nil {
			return fmt.Errorf("failed to update cart item quantity: %w", err)
		}
	} else {
		// Item doesn't exist, insert new
		_, err = h.db.Pool.Exec(ctx, insertQuery, insertArgs...)
		if err != nil {
			return fmt.Errorf("failed to add item to cart: %w", err)
		}
	}

	return nil
}

// updateCartItemQuantity updates the quantity of an existing cart item
func (h *Handler) updateCartItemQuantity(ctx context.Context, userID string, miniAppType models.MiniAppType, productID string, quantity int) error {
	updateQuery := `
		UPDATE carts
		SET quantity = $1, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $2 AND mini_app_type = $3 AND product_id = $4
	`

	result, err := h.db.Pool.Exec(ctx, updateQuery, quantity, userID, string(miniAppType), productID)
	if err != nil {
		return fmt.Errorf("failed to update cart item quantity: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cart item not found")
	}

	return nil
}

// removeItemFromCart removes an item from the cart
func (h *Handler) removeItemFromCart(ctx context.Context, userID string, miniAppType models.MiniAppType, productID string) error {
	deleteQuery := `
		DELETE FROM carts
		WHERE user_id = $1 AND mini_app_type = $2 AND product_id = $3
	`

	result, err := h.db.Pool.Exec(ctx, deleteQuery, userID, string(miniAppType), productID)
	if err != nil {
		return fmt.Errorf("failed to remove cart item: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("cart item not found")
	}

	return nil
}

// validateStockForCartAddition checks if adding quantity to cart would exceed available stock
func (h *Handler) validateStockForCartAddition(ctx context.Context, userID string, miniAppType models.MiniAppType, productID string, additionalQuantity int) error {
	// Get current quantity in cart for this product
	var currentQuantity int
	checkQuery := `
		SELECT COALESCE(quantity, 0) FROM carts
		WHERE user_id = $1 AND mini_app_type = $2 AND product_id = $3
	`

	err := h.db.Pool.QueryRow(ctx, checkQuery, userID, string(miniAppType), productID).Scan(&currentQuantity)
	if err != nil {
		// If no existing item, current quantity is 0
		currentQuantity = 0
	}

	// Get product details
	product, err := h.getProduct(ctx, productID)
	if err != nil {
		return fmt.Errorf("failed to get product: %w", err)
	}

	// Check if product is active
	if !product.IsActive {
		return fmt.Errorf("product is not active")
	}

	// Calculate total quantity after addition
	totalQuantity := currentQuantity + additionalQuantity

	// Check against display stock (actual stock - 5 buffer)
	if totalQuantity > product.DisplayStock() {
		return fmt.Errorf("insufficient stock: requested %d, available %d (including current cart: %d)",
			totalQuantity, product.DisplayStock(), currentQuantity)
	}

	return nil
}

// clearCart removes all items from a user's cart for a specific mini-app
func (h *Handler) clearCart(ctx context.Context, userID string, miniAppType models.MiniAppType) error {
	return h.clearCartWithStore(ctx, userID, miniAppType, nil)
}

// clearCartWithStore removes cart items for a user and mini-app type, optionally filtered by store
func (h *Handler) clearCartWithStore(ctx context.Context, userID string, miniAppType models.MiniAppType, storeID *int) error {
	var deleteQuery string
	var args []interface{}

	if storeID != nil && miniAppType.RequiresStore() {
		// For location-based mini-apps with store filter
		// Clear items with matching store_id OR NULL store_id (for backward compatibility)
		deleteQuery = `DELETE FROM carts WHERE user_id = $1 AND mini_app_type = $2 AND (store_id = $3 OR store_id IS NULL)`
		args = []interface{}{userID, string(miniAppType), *storeID}
	} else {
		// For non-location mini-apps or when no store filter needed
		deleteQuery = `DELETE FROM carts WHERE user_id = $1 AND mini_app_type = $2`
		args = []interface{}{userID, string(miniAppType)}
	}

	_, err := h.db.Pool.Exec(ctx, deleteQuery, args...)
	if err != nil {
		return fmt.Errorf("failed to clear cart: %w", err)
	}
	return nil
}

// validateCartStockBeforeOrder validates all cart items have sufficient stock before order creation
func (h *Handler) validateCartStockBeforeOrder(ctx context.Context, cartItems []models.Cart) error {
	for _, item := range cartItems {
		// Refresh product data to get latest stock
		product, err := h.getProduct(ctx, item.ProductID)
		if err != nil {
			return fmt.Errorf("failed to get product %s: %w", item.ProductID, err)
		}

		// Check if product is still active
		if !product.IsActive {
			return fmt.Errorf("product '%s' is no longer available", product.Title)
		}

		// Check stock availability
		if item.Quantity > product.DisplayStock() {
			return fmt.Errorf("insufficient stock for product '%s': requested %d, available %d",
				product.Title, item.Quantity, product.DisplayStock())
		}

		// Update the product reference in cart item for accurate pricing
		item.Product = product
	}

	return nil
}

// createOrder creates a new order with items
func (h *Handler) createOrder(ctx context.Context, userID string, miniAppType models.MiniAppType, storeID *int, totalAmount float64, cartItems []models.Cart) (*models.Order, error) {
	// Start transaction
	tx, err := h.db.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Create order
	var order models.Order
	orderQuery := `
		INSERT INTO orders (user_id, mini_app_type, total_amount, status)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, mini_app_type, total_amount, status, created_at, updated_at
	`

	err = tx.QueryRow(ctx, orderQuery, userID, string(miniAppType), totalAmount, string(models.OrderStatusPending)).Scan(
		&order.ID,
		&order.UserID,
		&order.MiniAppType,
		&order.TotalAmount,
		&order.Status,
		&order.CreatedAt,
		&order.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}

	// Resolve organization relationships for routing/notifications
	partners, _ := h.getPartnersForStore(ctx, storeID)

	// Create order items
	var orderItems []models.OrderItem
	for _, cartItem := range cartItems {
		unitPrice := cartItem.Product.MainPrice
		totalPrice := float64(cartItem.Quantity) * unitPrice

		var orderItem models.OrderItem
		itemQuery := `
			INSERT INTO order_items (order_id, product_id, quantity, price)
			VALUES ($1, $2, $3, $4)
			RETURNING id, order_id, product_id, quantity, price
		`

		err = tx.QueryRow(ctx, itemQuery, order.ID, cartItem.ProductID, cartItem.Quantity, totalPrice).Scan(
			&orderItem.ID,
			&orderItem.OrderID,
			&orderItem.ProductID,
			&orderItem.Quantity,
			&orderItem.TotalPrice,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create order item: %w", err)
		}

		orderItem.UnitPrice = unitPrice
		orderItem.Product = cartItem.Product

		// Resolve per-item organizations
		var manufacturerID *string
		if mID, err := h.getManufacturerForProductAndRegion(ctx, cartItem.ProductID, storeID); err == nil {
			manufacturerID = mID
		}
		tplIDs, _ := h.getTPLsForProduct(ctx, cartItem.ProductID)

		// Persist resolution
		_, _ = tx.Exec(ctx, `
			INSERT INTO order_item_org_links (order_item_id, product_id, manufacturer_org_id, tpl_org_ids, partner_org_ids)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (order_item_id) DO UPDATE SET
				manufacturer_org_id = EXCLUDED.manufacturer_org_id,
				tpl_org_ids = EXCLUDED.tpl_org_ids,
				partner_org_ids = EXCLUDED.partner_org_ids,
				updated_at = CURRENT_TIMESTAMP
		`, orderItem.ID, orderItem.ProductID, manufacturerID, tplIDs, partners)

		orderItems = append(orderItems, orderItem)
	}

	// Commit transaction
	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Update product stock levels after successful order creation (only for UnmannedStore)
	if err = h.updateProductStock(ctx, cartItems, miniAppType); err != nil {
		// Log error but don't fail the order creation since the order was already committed
		// In a production system, you might want to implement compensation logic here
		fmt.Printf("Warning: Failed to update product stock after order creation: %v\n", err)
	}

	order.Items = orderItems

	// Publish JSON log events per order item with resolved orgs (dev-friendly publisher)
	for _, it := range orderItems {
		// Re-read persisted resolution for logging
		var manufacturerID *string
		var tplIDs []string
		var partnerIDs []string
		row := h.db.Pool.QueryRow(ctx, `
			SELECT manufacturer_org_id::text, COALESCE(ARRAY(SELECT x::text FROM UNNEST(tpl_org_ids) x), ARRAY[]::text[]),
			       COALESCE(ARRAY(SELECT x::text FROM UNNEST(partner_org_ids) x), ARRAY[]::text[])
			FROM order_item_org_links WHERE order_item_id = $1
		`, it.ID)
		_ = row.Scan(&manufacturerID, &tplIDs, &partnerIDs)
		logging.LogKV("event", "OrderItemOrgResolved", map[string]interface{}{
			"order_id":            order.ID,
			"order_item_id":       it.ID,
			"product_id":          it.ProductID,
			"manufacturer_org_id": manufacturerID,
			"tpl_org_ids":         tplIDs,
			"partner_org_ids":     partnerIDs,
		})
	}

	return &order, nil
}

// getUserOrders retrieves all orders for a user and mini-app type
func (h *Handler) getUserOrders(ctx context.Context, userID string, miniAppType models.MiniAppType) ([]models.Order, error) {
	query := `
		SELECT id, user_id, mini_app_type, total_amount, status, created_at, updated_at
		FROM orders
		WHERE user_id = $1 AND mini_app_type = $2
		ORDER BY created_at DESC
	`

	rows, err := h.db.Pool.Query(ctx, query, userID, string(miniAppType))
	if err != nil {
		return nil, fmt.Errorf("failed to query orders: %w", err)
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var order models.Order
		err := rows.Scan(
			&order.ID,
			&order.UserID,
			&order.MiniAppType,
			&order.TotalAmount,
			&order.Status,
			&order.CreatedAt,
			&order.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan order: %w", err)
		}

		// Get order items
		items, err := h.getOrderItems(ctx, order.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get order items: %w", err)
		}
		order.Items = items

		orders = append(orders, order)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating orders: %w", err)
	}

	return orders, nil
}

// getOrderByID retrieves a specific order by ID (with user validation)
func (h *Handler) getOrderByID(ctx context.Context, orderID string, userID string) (*models.Order, error) {
	var order models.Order
	query := `
		SELECT id, user_id, mini_app_type, total_amount, status, created_at, updated_at
		FROM orders
		WHERE id = $1 AND user_id = $2
	`

	err := h.db.Pool.QueryRow(ctx, query, orderID, userID).Scan(
		&order.ID,
		&order.UserID,
		&order.MiniAppType,
		&order.TotalAmount,
		&order.Status,
		&order.CreatedAt,
		&order.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	// Get order items
	items, err := h.getOrderItems(ctx, order.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get order items: %w", err)
	}
	order.Items = items

	return &order, nil
}

// getOrderItems retrieves all items for an order with product details
func (h *Handler) getOrderItems(ctx context.Context, orderID string) ([]models.OrderItem, error) {
	query := `
		SELECT
			oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price,
			p.product_uuid, p.sku, p.title, p.main_price, p.stock_left,
			p.minimum_order_quantity, p.is_active
		FROM order_items oi
		JOIN products p ON oi.product_id = p.product_uuid
		WHERE oi.order_id = $1
		ORDER BY oi.id
	`

	rows, err := h.db.Pool.Query(ctx, query, orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to query order items: %w", err)
	}
	defer rows.Close()

	var items []models.OrderItem
	for rows.Next() {
		var item models.OrderItem
		var product models.Product

		err := rows.Scan(
			&item.ID,
			&item.OrderID,
			&item.ProductID,
			&item.Quantity,
			&item.TotalPrice,
			&product.ID,
			&product.SKU,
			&product.Title,
			&product.MainPrice,
			&product.StockLeft,
			&product.MinimumOrderQuantity,
			&product.IsActive,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan order item: %w", err)
		}

		item.Product = &product
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating order items: %w", err)
	}

	return items, nil
}
