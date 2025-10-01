package services

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	sesv2 "github.com/aws/aws-sdk-go-v2/service/sesv2"
	sestypes "github.com/aws/aws-sdk-go-v2/service/sesv2/types"
	"github.com/expomadeinworld/madeinworld/auth-service/internal/models"
)

// EmailService handles email sending via AWS SES (SESv2 API)
type EmailService struct {
	sesClient *sesv2.Client
	fromEmail string
}

// NewEmailService creates a new email service instance using AWS SDK (role-based)
func NewEmailService(cfg aws.Config) *EmailService {
	region := cfg.Region
	if region == "" {
		region = os.Getenv("SES_AWS_REGION")
		if region == "" {
			if os.Getenv("AWS_DEFAULT_REGION") != "" {
				region = os.Getenv("AWS_DEFAULT_REGION")
			} else {
				region = "eu-central-1"
			}
		}
	}
	cfg.Region = region
	return &EmailService{
		sesClient: sesv2.NewFromConfig(cfg),
		fromEmail: os.Getenv("SES_FROM_EMAIL"),
	}
}

// SendVerificationCode sends a verification code email for admin
func (e *EmailService) SendVerificationCode(email string, data models.EmailVerificationData) error {
	subject := "Made in World Admin - Verification Code"
	body := e.generateEmailHTML(data)

	return e.sendEmail(email, subject, body)
}

// SendUserVerificationCode sends a verification code email for users
func (e *EmailService) SendUserVerificationCode(email string, data models.EmailVerificationData) error {
	subject := "Made in World - Login Verification Code"
	body := e.generateUserEmailHTML(data)

	return e.sendEmail(email, subject, body)
}

// generateRandomID generates a random string for Message-ID
func generateRandomID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, 16)
	for i := range result {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		result[i] = charset[num.Int64()]
	}
	return string(result)
}

// sendEmail sends an email via AWS SESv2 using the instance role
func (e *EmailService) sendEmail(toEmail, subject, htmlBody string) error {
	replyTo := "expotobsrl@gmail.com"
	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(e.fromEmail),
		Destination:      &sestypes.Destination{ToAddresses: []string{toEmail}},
		ReplyToAddresses: []string{replyTo},
		Content: &sestypes.EmailContent{
			Simple: &sestypes.Message{
				Subject: &sestypes.Content{Data: aws.String(subject)},
				Body:    &sestypes.Body{Html: &sestypes.Content{Data: aws.String(htmlBody)}},
			},
		},
	}
	if _, err := e.sesClient.SendEmail(context.Background(), input); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}
	return nil
}

// generateEmailHTML creates the HTML email template
func (e *EmailService) generateEmailHTML(data models.EmailVerificationData) string {
	return fmt.Sprintf(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Made in World Admin - Verification Code</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #1976d2;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 16px;
        }
        .code-container {
            background-color: #f8f9fa;
            border: 2px dashed #1976d2;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 30px 0;
        }
        .verification-code {
            font-size: 36px;
            font-weight: bold;
            color: #1976d2;
            letter-spacing: 8px;
            margin: 10px 0;
            font-family: 'Courier New', monospace;
        }
        .expiry-info {
            color: #e53e3e;
            font-weight: 600;
            margin: 20px 0;
        }
        .security-info {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
        }
        .details {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Made in World</div>
            <div class="subtitle">Admin Panel Authentication</div>
        </div>

        <h2>Your Verification Code</h2>
        <p>Hello! You've requested access to the Made in World Admin Panel. Please use the verification code below to complete your login:</p>

        <div class="code-container">
            <div>Your verification code is:</div>
            <div class="verification-code">%s</div>
        </div>

        <div class="expiry-info">
            ⏰ This code expires in %d minutes
        </div>

        <div class="security-info">
            <strong>🔒 Security Notice:</strong><br>
            • This code can only be used once<br>
            • Maximum 3 verification attempts allowed<br>
            • If you didn't request this code, please ignore this email<br>
            • Never share this code with anyone
        </div>

        <div class="details">
            <strong>Request Details:</strong><br>
            📧 Email: %s<br>
            🌐 IP Address: %s<br>
            🔧 User Agent: %s<br>
            📤 Sent from: no-reply@expomadeinworld.com
        </div>

        <div class="footer">
            <p><strong>Made in World Admin Panel</strong><br>
            This is an automated security message. Please do not reply to this email.</p>

            <p>If you're having trouble accessing the admin panel, please contact your system administrator.</p>

            <p style="color: #999; font-size: 12px;">
                <strong>Made in World</strong><br>
                Business Address: Frankfurt, Germany<br>
                This email was sent to: %s<br>
                <a href="mailto:unsubscribe@expomadeinworld.com" style="color: #999;">Unsubscribe</a> |
                <a href="mailto:support@expomadeinworld.com" style="color: #999;">Support</a>
            </p>

            <p style="color: #999; font-size: 12px;">
                © 2025 Made in World. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>`,
		data.Code,
		data.ExpiresInMin,
		e.fromEmail,
		data.IPAddress,
		data.UserAgent,
		data.Email,
	)
}

// generateUserEmailHTML creates the HTML email template for user verification
func (e *EmailService) generateUserEmailHTML(data models.EmailVerificationData) string {
	return fmt.Sprintf(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Made in World - Login Verification</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border: 1px solid #e9ecef;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #f1f3f4;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #dc3545;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #6c757d;
            font-size: 16px;
        }
        .verification-code {
            background: linear-gradient(135deg, #dc3545, #e74c3c);
            color: white;
            font-size: 36px;
            font-weight: bold;
            text-align: center;
            padding: 25px;
            border-radius: 12px;
            margin: 30px 0;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
            color: #856404;
        }
        .warning-title {
            font-weight: bold;
            margin-bottom: 10px;
            color: #856404;
        }
        .info {
            background: #e7f3ff;
            border: 1px solid #b8daff;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
            color: #004085;
            font-size: 14px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        }
        .footer a {
            color: #dc3545;
            text-decoration: none;
        }
        .footer a:hover {
            text-decoration: underline;
        }
        .button {
            display: inline-block;
            background: #dc3545;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
        }
        .security-info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            font-size: 13px;
            color: #495057;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🌍 Made in World</div>
            <div class="subtitle">Your Login Verification Code</div>
        </div>

        <p>Hello!</p>

        <p>We received a request to sign in to your Made in World account. Use the verification code below to complete your login:</p>

        <div class="verification-code">%s</div>

        <div class="warning">
            <div class="warning-title">⏰ Important:</div>
            This code will expire in <strong>%d minutes</strong>. Please use it promptly to access your account.
        </div>

        <p>If you didn't request this code, you can safely ignore this email. Your account remains secure.</p>

        <div class="security-info">
            <strong>🔒 Security Information:</strong><br>
            📧 Email: %s<br>
            🌐 IP Address: %s<br>
            🔧 Device: %s<br>
            📤 Sent from: no-reply@expomadeinworld.com
        </div>

        <div class="footer">
            <p><strong>Made in World Mobile App</strong><br>
            This is an automated security message. Please do not reply to this email.</p>

            <p>Need help? Contact our support team at <a href="mailto:support@expomadeinworld.com">support@expomadeinworld.com</a></p>

            <p style="color: #999; font-size: 12px;">
                <strong>Made in World</strong><br>
                Business Address: Frankfurt, Germany<br>
                This email was sent to: %s<br>
                <a href="mailto:unsubscribe@expomadeinworld.com" style="color: #999;">Unsubscribe</a> |
                <a href="mailto:support@expomadeinworld.com" style="color: #999;">Support</a>
            </p>

            <p style="color: #999; font-size: 12px;">
                © 2025 Made in World. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>`,
		data.Code,
		data.ExpiresInMin,
		data.Email,
		data.IPAddress,
		data.UserAgent,
		data.Email,
	)
}
