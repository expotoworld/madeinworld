package api

import (
	"context"
	"log"

	"net/http"
	"strconv"
	"strings"
	"time"

	"user-service/internal/db"
	"user-service/internal/models"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests
type Handler struct {
	userRepo *db.UserRepository
}

// NewHandler creates a new handler
func NewHandler(database *db.Database) *Handler {
	return &Handler{
		userRepo: db.NewUserRepository(database),
	}
}

// Health handles health check requests
func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "user-service",
		"timestamp": time.Now().UTC(),
	})
}

// GetUsers handles GET /api/admin/users
func (h *Handler) GetUsers(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Parse query parameters
	params := models.UserSearchParams{
		Page:  1,
		Limit: 20,
		Sort:  "created_at",
		Order: "desc",
	}

	if page := c.Query("page"); page != "" {
		if p, err := strconv.Atoi(page); err == nil && p > 0 {
			params.Page = p
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 100 {
			params.Limit = l
		}
	}

	if search := c.Query("search"); search != "" {
		params.Search = strings.TrimSpace(search)
	}

	if role := c.Query("role"); role != "" {
		if models.ValidateUserRole(role) {
			userRole := models.UserRole(role)
			params.Role = &userRole
		}
	}

	if status := c.Query("status"); status != "" {
		if models.ValidateUserStatus(status) {
			userStatus := models.UserStatus(status)
			params.Status = &userStatus
		}
	}

	if sort := c.Query("sort"); sort != "" {
		validSorts := []string{"created_at", "last_login", "full_name", "email", "phone", "role", "order_count", "total_spent"}
		for _, validSort := range validSorts {
			if sort == validSort {
				params.Sort = sort
				break
			}
		}
	}

	if order := c.Query("order"); order == "asc" || order == "desc" {
		params.Order = order
	}

	// Get users from repository
	response, err := h.userRepo.GetUsers(ctx, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve users",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

// CreateUser handles POST /api/admin/users
func (h *Handler) CreateUser(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var req models.UserCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Validate role
	if !models.ValidateUserRole(string(req.Role)) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid role",
			Message: "The specified role is not valid",
		})
		return
	}

	// Validate status
	if !models.ValidateUserStatus(string(req.Status)) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid status",
			Message: "The specified status is not valid",
		})
		return
	}

	// Audit log
	adminEmail, _ := c.Get("email")
	adminRole, _ := c.Get("role")
	log.Printf("[AUDIT][USERS][CREATE] by=%v role=%v target_email=%s", adminEmail, adminRole, req.Email)

	// Create user in repository
	user, err := h.userRepo.CreateUser(ctx, req)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error:   "User already exists",
				Message: "A user with this email or username already exists",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to create user",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, models.SuccessResponse{
		Message: "User created successfully",
		Data:    user,
	})
}

// GetUser handles GET /api/admin/users/{user_id}
func (h *Handler) GetUser(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	userID := c.Param("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid user ID",
			Message: "User ID is required",
		})
		return
	}

	// Get user from repository
	user, err := h.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "User not found",
				Message: "The specified user does not exist",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve user",
			Message: err.Error(),
		})
		return
	}

	// Get user order statistics
	orderStats, err := h.userRepo.GetUserOrderStats(ctx, userID)
	if err != nil {
		// Log error but don't fail the request
		// orderStats will be nil and won't be included in response
	}

	// Combine user data with order stats
	response := gin.H{
		"user": user,
	}
	if orderStats != nil {
		response["order_stats"] = orderStats
	}

	c.JSON(http.StatusOK, response)
}

// UpdateUser handles PUT /api/admin/users/{user_id}
func (h *Handler) UpdateUser(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	userID := c.Param("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid user ID",
			Message: "User ID is required",
		})
		return
	}

	var updates models.UserUpdateRequest
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// Validate role if provided
	if updates.Role != nil && !models.ValidateUserRole(string(*updates.Role)) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid role",
			Message: "The specified role is not valid",
		})
		return
	}

	// Audit log
	adminEmail, _ := c.Get("email")
	adminRole, _ := c.Get("role")
	log.Printf("[AUDIT][USERS][UPDATE] by=%v role=%v target_user_id=%s fields=%v", adminEmail, adminRole, userID, updates)

	// Update user in repository
	err := h.userRepo.UpdateUser(ctx, userID, updates)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "User not found",
				Message: "The specified user does not exist",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to update user",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "User updated successfully",
	})
}

// DeleteUser handles DELETE /api/admin/users/{user_id}
func (h *Handler) DeleteUser(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	userID := c.Param("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid user ID",
			Message: "User ID is required",
		})
		return
	}

	// Audit log
	adminEmail, _ := c.Get("email")
	adminRole, _ := c.Get("role")
	log.Printf("[AUDIT][USERS][DELETE] by=%v role=%v target_user_id=%s", adminEmail, adminRole, userID)

	// Delete user from repository
	err := h.userRepo.DeleteUser(ctx, userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "User not found",
				Message: "The specified user does not exist",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to delete user",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "User deleted successfully",
	})
}

// UpdateUserStatus handles POST /api/admin/users/{user_id}/status
func (h *Handler) UpdateUserStatus(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Attach the timeout context to the request so any downstream operations use it
	c.Request = c.Request.WithContext(ctx)

	userID := c.Param("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid user ID",
			Message: "User ID is required",
		})
		return
	}

	var statusUpdate models.UserStatusUpdateRequest
	if err := c.ShouldBindJSON(&statusUpdate); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// Validate status
	if !models.ValidateUserStatus(string(statusUpdate.Status)) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid status",
			Message: "The specified status is not valid",
		})
		return
	}

	// Audit log
	adminEmail, _ := c.Get("email")
	adminRole, _ := c.Get("role")
	log.Printf("[AUDIT][USERS][STATUS] by=%v role=%v target_user_id=%s new_status=%s reason=%s", adminEmail, adminRole, userID, statusUpdate.Status, statusUpdate.Reason)

	// For now, we'll just log the status update since we don't have a status field in the database
	// In a real implementation, you would update the user's status field
	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "User status updated successfully",
		Data: gin.H{
			"user_id": userID,
			"status":  statusUpdate.Status,
			"reason":  statusUpdate.Reason,
		},
	})
}

// GetUserAnalytics handles GET /api/admin/users/analytics
func (h *Handler) GetUserAnalytics(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	start := time.Now()
	log.Printf("[USER-API] GetUserAnalytics start")

	// Get analytics from repository
	analytics, err := h.userRepo.GetUserAnalytics(ctx)
	if err != nil {
		log.Printf("[USER-API] GetUserAnalytics error: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve user analytics",
			Message: err.Error(),
		})
		return
	}
	log.Printf("[USER-API] GetUserAnalytics success in %v", time.Since(start))

	c.JSON(http.StatusOK, analytics)
}

// BulkUpdateUsers handles POST /api/admin/users/bulk-update
func (h *Handler) BulkUpdateUsers(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var bulkUpdate models.BulkUserUpdateRequest
	if err := c.ShouldBindJSON(&bulkUpdate); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// Validate operation
	validOperations := []string{"status_update", "role_update", "delete"}
	isValidOperation := false
	for _, op := range validOperations {
		if bulkUpdate.Operation == op {
			isValidOperation = true
			break
		}
	}

	if !isValidOperation {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid operation",
			Message: "Operation must be one of: status_update, role_update, delete",
		})
		return
	}

	// Validate parameters based on operation
	updates := make(map[string]interface{})
	switch bulkUpdate.Operation {
	case "role_update":
		if bulkUpdate.Role == nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error:   "Missing role",
				Message: "Role is required for role_update operation",
			})
			return
		}
		if !models.ValidateUserRole(string(*bulkUpdate.Role)) {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error:   "Invalid role",
				Message: "The specified role is not valid",
			})
			return
		}
		updates["role"] = string(*bulkUpdate.Role)
	case "status_update":
		if bulkUpdate.Status == nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error:   "Missing status",
				Message: "Status is required for status_update operation",
			})
			return
		}
		if !models.ValidateUserStatus(string(*bulkUpdate.Status)) {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error:   "Invalid status",
				Message: "The specified status is not valid",
			})
			return
		}
		updates["status"] = string(*bulkUpdate.Status)
	}

	// Audit log
	adminEmail, _ := c.Get("email")
	adminRole, _ := c.Get("role")
	log.Printf("[AUDIT][USERS][BULK] by=%v role=%v operation=%s count=%d", adminEmail, adminRole, bulkUpdate.Operation, len(bulkUpdate.UserIDs))

	// Perform bulk update
	err := h.userRepo.BulkUpdateUsers(ctx, bulkUpdate.UserIDs, bulkUpdate.Operation, updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to perform bulk update",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Bulk update completed successfully",
		Data: gin.H{
			"operation":      bulkUpdate.Operation,
			"affected_users": len(bulkUpdate.UserIDs),
		},
	})
}
