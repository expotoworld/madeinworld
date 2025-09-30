package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/expomadeinworld/madeinworld/order-service/internal/models"
	"github.com/gin-gonic/gin"
)

// GetManufacturerOrders returns orders that include at least one item owned by any of the manufacturer's orgs
func (h *Handler) GetManufacturerOrders(c *gin.Context) {
	// Extract manufacturer org IDs from JWT
	orgIDs := extractManufacturerOrgIDs(c)
	if len(orgIDs) == 0 {
		c.JSON(http.StatusOK, models.AdminOrderListResponse{Orders: []models.AdminOrderResponse{}, Total: 0, Page: 1, Limit: 20, TotalPages: 0})
		return
	}

	var req models.AdminOrderListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid query parameters", Message: err.Error()})
		return
	}
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

	orders, total, err := h.getManufacturerOrders(ctx, &req, orgIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to get orders", Message: err.Error()})
		return
	}
	totalPages := (total + req.Limit - 1) / req.Limit
	c.JSON(http.StatusOK, models.AdminOrderListResponse{Orders: orders, Total: total, Page: req.Page, Limit: req.Limit, TotalPages: totalPages})
}

// GetManufacturerOrder returns detailed info for a single order if it includes at least one product owned by manufacturer orgs
func (h *Handler) GetManufacturerOrder(c *gin.Context) {
	orgIDs := extractManufacturerOrgIDs(c)
	if len(orgIDs) == 0 {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Not a manufacturer", Message: "No manufacturer organization memberships"})
		return
	}
	orderID := c.Param("order_id")
	if orderID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Missing order ID", Message: "Order ID is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	belongs, err := h.orderBelongsToAnyOrg(ctx, orderID, orgIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to verify order", Message: err.Error()})
		return
	}
	if !belongs {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Forbidden", Message: "Order does not include your products"})
		return
	}

	detail, err := h.getAdminOrderByID(ctx, orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Order not found", Message: err.Error()})
		return
	}
	c.JSON(http.StatusOK, detail)
}

// UpdateManufacturerOrderStatus allows a manufacturer to update status for orders that include their products
func (h *Handler) UpdateManufacturerOrderStatus(c *gin.Context) {
	orgIDs := extractManufacturerOrgIDs(c)
	if len(orgIDs) == 0 {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Not a manufacturer", Message: "No manufacturer organization memberships"})
		return
	}
	orderID := c.Param("order_id")
	if orderID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Missing order ID", Message: "Order ID is required"})
		return
	}
	var req models.UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid request", Message: err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Verify the order is associated with this manufacturer
	belongs, err := h.orderBelongsToAnyOrg(ctx, orderID, orgIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to verify order", Message: err.Error()})
		return
	}
	if !belongs {
		c.JSON(http.StatusForbidden, models.ErrorResponse{Error: "Forbidden", Message: "Order does not include your products"})
		return
	}

	userID, _ := GetUserID(c)
	if err := h.updateOrderStatus(ctx, orderID, req.Status, req.Reason, userID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update order", Message: err.Error()})
		return
	}
	c.JSON(http.StatusOK, models.SuccessResponse{Message: "Order status updated"})
}

// extractManufacturerOrgIDs pulls org_ids from JWT where org_type == "Manufacturer"
func extractManufacturerOrgIDs(c *gin.Context) []string {
	v, ok := c.Get("org_memberships")
	if !ok || v == nil {
		return nil
	}
	arr, ok := v.([]interface{})
	if !ok {
		return nil
	}
	res := make([]string, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if t, ok := m["org_type"].(string); ok && t == "Manufacturer" {
			if id, ok := m["org_id"].(string); ok && id != "" {
				res = append(res, id)
			}
		}
	}
	return res
}

// getManufacturerOrders queries orders filtered by products owned by any of the given org IDs
func (h *Handler) getManufacturerOrders(ctx context.Context, req *models.AdminOrderListRequest, orgIDs []string) ([]models.AdminOrderResponse, int, error) {
	// Build WHERE for general filters
	where := ""
	args := []interface{}{}
	argIdx := 1
	add := func(cond string, val interface{}) {
		where = appendCond(where, cond)
		args = append(args, val)
		argIdx++
	}
	if req.OrderID != "" {
		add(fmt.Sprintf("o.id::text ILIKE $%d", argIdx), "%"+req.OrderID+"%")
	}
	if req.UserID != "" {
		add(fmt.Sprintf("o.user_id = $%d", argIdx), req.UserID)
	}
	if req.MiniAppType != "" {
		add(fmt.Sprintf("o.mini_app_type = $%d", argIdx), req.MiniAppType)
	}
	if req.Status != "" {
		add(fmt.Sprintf("o.status = $%d", argIdx), req.Status)
	}
	if req.DateFrom != "" {
		add(fmt.Sprintf("o.created_at >= $%d", argIdx), req.DateFrom+" 00:00:00")
	}
	if req.DateTo != "" {
		add(fmt.Sprintf("o.created_at <= $%d", argIdx), req.DateTo+" 23:59:59")
	}
	if req.Search != "" {
		add(fmt.Sprintf("(o.id::text ILIKE $%d)", argIdx), "%"+req.Search+"%")
	}

	// Add manufacturer ownership filter using EXISTS on order_items -> products.owner_org_id
	placeholders := make([]string, len(orgIDs))
	for i := range orgIDs {
		placeholders[i] = fmt.Sprintf("$%d", argIdx+i)
	}
	ownershipCond := fmt.Sprintf(`EXISTS (
		SELECT 1 FROM order_items oi
		JOIN products p ON p.product_uuid = oi.product_id
		WHERE oi.order_id = o.id AND p.owner_org_id::text IN (%s)
	)`, strings.Join(placeholders, ", "))
	where = appendCond(where, ownershipCond)
	for _, id := range orgIDs {
		args = append(args, id)
	}
	argIdx += len(orgIDs)

	orderBy := "ORDER BY o.created_at DESC"
	if req.SortBy != "" {
		col := "o.created_at"
		switch req.SortBy {
		case "total_amount":
			col = "o.total_amount"
		case "status":
			col = "o.status"
		}
		dir := "DESC"
		if req.SortOrder == "asc" {
			dir = "ASC"
		}
		orderBy = fmt.Sprintf("ORDER BY %s %s", col, dir)
	}

	// Count
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM orders o %s`, where)
	var total int
	if err := h.db.Pool.QueryRow(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count failed: %w", err)
	}

	offset := (req.Page - 1) * req.Limit
	listQ := fmt.Sprintf(`
		SELECT o.id, o.user_id, COALESCE(u.email, '') as user_email,
		COALESCE(TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')), u.username) as user_name,
		o.mini_app_type, o.total_amount, o.status,
		(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
		o.created_at, o.updated_at
		FROM orders o
		LEFT JOIN users u ON o.user_id = u.id
		%s %s LIMIT $%d OFFSET $%d`, where, orderBy, argIdx, argIdx+1)
	args = append(args, req.Limit, offset)

	rows, err := h.db.Pool.Query(ctx, listQ, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()
	var orders []models.AdminOrderResponse
	for rows.Next() {
		var o models.AdminOrderResponse
		if err := rows.Scan(&o.ID, &o.UserID, &o.UserEmail, &o.UserName, &o.MiniAppType, &o.TotalAmount, &o.Status, &o.ItemCount, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan failed: %w", err)
		}
		orders = append(orders, o)
	}
	return orders, total, rows.Err()
}

func (h *Handler) orderBelongsToAnyOrg(ctx context.Context, orderID string, orgIDs []string) (bool, error) {
	placeholders := make([]string, len(orgIDs))
	for i := range orgIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	q := fmt.Sprintf(`SELECT EXISTS(
		SELECT 1 FROM order_items oi JOIN products p ON p.product_uuid = oi.product_id
		WHERE oi.order_id = $%d AND p.owner_org_id::text IN (%s)
	)`, len(orgIDs)+1, strings.Join(placeholders, ", "))
	args := make([]interface{}, 0, len(orgIDs)+1)
	for _, id := range orgIDs {
		args = append(args, id)
	}
	args = append(args, orderID)
	var exists bool
	if err := h.db.Pool.QueryRow(ctx, q, args...).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func appendCond(existing string, cond string) string {
	if existing == "" {
		return "WHERE " + cond
	}
	return existing + " AND " + cond
}
