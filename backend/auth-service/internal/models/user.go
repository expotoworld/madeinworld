package models

import (
	"time"
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
}

// SignupRequest represents the request payload for user registration
type SignupRequest struct {
	Username  string  `json:"username" binding:"required,min=3"`
	Email     string  `json:"email" binding:"required,email"`
	Password  string  `json:"password" binding:"required,min=8"`
	Phone     *string `json:"phone,omitempty"`
	FirstName *string `json:"first_name,omitempty"`
	LastName  *string `json:"last_name,omitempty"`
}

// LoginRequest represents the request payload for user login
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// AuthResponse represents the response after successful authentication
type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// SuccessResponse represents a success response
type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// UserVerificationCode represents a verification code for user authentication
type UserVerificationCode struct {
	ID        string    `json:"id" db:"id"`
	Email     string    `json:"email" db:"email"`
	CodeHash  string    `json:"-" db:"code_hash"` // Never expose code hash
	Attempts  int       `json:"attempts" db:"attempts"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
	Used      bool      `json:"used" db:"used"`
	IPAddress string    `json:"ip_address,omitempty" db:"ip_address"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// UserRateLimit represents rate limiting for user verification requests
type UserRateLimit struct {
	ID           string    `json:"id" db:"id"`
	IPAddress    string    `json:"ip_address" db:"ip_address"`
	RequestCount int       `json:"request_count" db:"request_count"`
	WindowStart  time.Time `json:"window_start" db:"window_start"`
}

// SendUserVerificationRequest represents the request to send a verification code for users
type SendUserVerificationRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// SendUserVerificationResponse represents the response after sending verification code for users
type SendUserVerificationResponse struct {
	Message   string    `json:"message"`
	ExpiresAt time.Time `json:"expires_at"`
}

// VerifyUserCodeRequest represents the request to verify a code for users
type VerifyUserCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
}

// VerifyUserCodeResponse represents the response after successful user verification
type VerifyUserCodeResponse struct {
	Token            string    `json:"token"`
	ExpiresAt        time.Time `json:"expires_at"`
	RefreshToken     string    `json:"refresh_token"`
	RefreshExpiresAt time.Time `json:"refresh_expires_at"`
	User             User      `json:"user"`
}

// UserPhoneVerificationCode represents a phone verification code for user authentication
type UserPhoneVerificationCode struct {
	ID          string    `json:"id" db:"id"`
	PhoneNumber string    `json:"phone_number" db:"phone_number"`
	CodeHash    string    `json:"-" db:"code_hash"` // Never expose code hash
	Attempts    int       `json:"attempts" db:"attempts"`
	ExpiresAt   time.Time `json:"expires_at" db:"expires_at"`
	Used        bool      `json:"used" db:"used"`
	IPAddress   string    `json:"ip_address,omitempty" db:"ip_address"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// SendPhoneVerificationRequest represents the request to send a phone verification code
type SendPhoneVerificationRequest struct {
	Phone string `json:"phone" binding:"required"`
}

// VerifyPhoneCodeRequest represents the request to verify a phone code
type VerifyPhoneCodeRequest struct {
	Phone string `json:"phone" binding:"required"`
	Code  string `json:"code" binding:"required,len=6"`
}
