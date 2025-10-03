package models

import (
	"time"
)

// UserRole represents the user role enum
type UserRole string

const (
	RoleCustomer     UserRole = "Customer"
	RoleAdmin        UserRole = "Admin"
	RoleManufacturer UserRole = "Manufacturer"
	Role3PL          UserRole = "3PL"
	RolePartner      UserRole = "Partner"
	RoleAuthor       UserRole = "Author"
)

// UserStatus represents user account status
type UserStatus string

const (
	StatusActive      UserStatus = "active"
	StatusDeactivated UserStatus = "deactivated"
)

// User represents a user in the system
type User struct {
	ID         string    `json:"id" db:"id"`
	Username   string    `json:"username" db:"username"`
	Email      *string   `json:"email,omitempty" db:"email"`
	Phone      *string   `json:"phone,omitempty" db:"phone"`
	FirstName  *string   `json:"first_name,omitempty" db:"first_name"`
	MiddleName *string   `json:"middle_name,omitempty" db:"middle_name"`
	LastName   *string   `json:"last_name,omitempty" db:"last_name"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`

	// Additional computed fields for admin panel
	FullName   string     `json:"full_name"`
	Role       UserRole   `json:"role"`
	Status     UserStatus `json:"status"`
	LastLogin  *time.Time `json:"last_login,omitempty"`
	OrderCount int        `json:"order_count,omitempty"`
	TotalSpent float64    `json:"total_spent,omitempty"`
}

// UserListResponse represents paginated user list response
type UserListResponse struct {
	Users      []User `json:"users"`
	Total      int    `json:"total"`
	Page       int    `json:"page"`
	Limit      int    `json:"limit"`
	TotalPages int    `json:"total_pages"`
}

// UserSearchParams represents search and filter parameters
type UserSearchParams struct {
	Page   int         `json:"page"`
	Limit  int         `json:"limit"`
	Search string      `json:"search"`
	Role   *UserRole   `json:"role"`
	Status *UserStatus `json:"status"`
	Sort   string      `json:"sort"`
	Order  string      `json:"order"`
}

// UserCreateRequest represents user creation request
type UserCreateRequest struct {
	Username   string  `json:"username" binding:"required,min=3"`
	Email      string  `json:"email" binding:"required,email"`
	Phone      *string `json:"phone,omitempty"`
	FirstName  *string `json:"first_name,omitempty"`
	MiddleName *string `json:"middle_name,omitempty"`

	LastName *string    `json:"last_name,omitempty"`
	Role     UserRole   `json:"role" binding:"required"`
	Status   UserStatus `json:"status" binding:"required"`
}

// UserUpdateRequest represents user update request

type UserUpdateRequest struct {
	FullName   *string     `json:"full_name,omitempty"`
	FirstName  *string     `json:"first_name,omitempty"`
	MiddleName *string     `json:"middle_name,omitempty"`
	LastName   *string     `json:"last_name,omitempty"`
	Phone      *string     `json:"phone,omitempty"`
	Email      *string     `json:"email,omitempty"`
	Role       *UserRole   `json:"role,omitempty"`
	Status     *UserStatus `json:"status,omitempty"`
}

// UserStatusUpdateRequest represents user status update request
type UserStatusUpdateRequest struct {
	Status UserStatus `json:"status" binding:"required"`
	Reason string     `json:"reason,omitempty"`
}

// BulkUserUpdateRequest represents bulk user operations
type BulkUserUpdateRequest struct {
	UserIDs   []string    `json:"user_ids" binding:"required"`
	Operation string      `json:"operation" binding:"required"` // "status_update", "role_update", "delete"
	Status    *UserStatus `json:"status,omitempty"`
	Role      *UserRole   `json:"role,omitempty"`
	Reason    string      `json:"reason,omitempty"`
}

// UserAnalytics represents user analytics data
type UserAnalytics struct {
	TotalUsers        int                     `json:"total_users"`
	ActiveUsers       int                     `json:"active_users"`
	NewUsersToday     int                     `json:"new_users_today"`
	NewUsersThisWeek  int                     `json:"new_users_this_week"`
	UsersByRole       map[string]int          `json:"users_by_role"`
	UsersByStatus     map[string]int          `json:"users_by_status"`
	RegistrationTrend []RegistrationTrendItem `json:"registration_trend"`
}

// RegistrationTrendItem represents daily registration data
type RegistrationTrendItem struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// UserOrderStats represents user order statistics
type UserOrderStats struct {
	TotalOrders   int        `json:"total_orders"`
	TotalSpent    float64    `json:"total_spent"`
	AverageOrder  float64    `json:"average_order"`
	LastOrderDate *time.Time `json:"last_order_date,omitempty"`
	FavoriteStore *string    `json:"favorite_store,omitempty"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
	Code    string `json:"code,omitempty"`
}

// SuccessResponse represents a success response
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// ValidateUserRole validates if the role is valid
func ValidateUserRole(role string) bool {
	switch UserRole(role) {
	case RoleCustomer, RoleAdmin, RoleManufacturer, Role3PL, RolePartner, RoleAuthor:
		return true
	default:
		return false
	}
}

// ValidateUserStatus validates if the status is valid
func ValidateUserStatus(status string) bool {
	switch UserStatus(status) {
	case StatusActive, StatusDeactivated:
		return true
	default:
		return false
	}
}

// GetUserStatus determines user status based on creation date and other factors
func (u *User) GetUserStatus() UserStatus {
	// This is a simple implementation - can be enhanced with more complex logic
	// For now, consider users created in the last 30 days as active
	if time.Since(u.CreatedAt) <= 30*24*time.Hour {
		return StatusActive
	}

	return StatusDeactivated
}
