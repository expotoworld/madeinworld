package services

import (
	"context"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/aws/aws-sdk-go-v2/service/sns/types"
)

// SmsService handles sending SMS messages via AWS SNS.
type SmsService struct {
	client *sns.Client
}

// NewSmsService creates a new SMS service client.
func NewSmsService(cfg aws.Config) *SmsService {
	client := sns.NewFromConfig(cfg)
	return &SmsService{client: client}
}

// SendSMS sends a verification code to a phone number.
// The phone number must be in E.164 format (e.g., +12065550100).
func (s *SmsService) SendSMS(ctx context.Context, phoneNumber, message string) error {
	log.Printf("Attempting to send SMS to %s", phoneNumber)

	// For verification codes, setting the SMSType to "Transactional" is a best practice.
	messageAttributes := map[string]types.MessageAttributeValue{
		"AWS.SNS.SMS.SMSType": {
			DataType:    aws.String("String"),
			StringValue: aws.String("Transactional"),
		},
	}

	input := &sns.PublishInput{
		Message:           aws.String(message),
		PhoneNumber:       aws.String(phoneNumber),
		MessageAttributes: messageAttributes,
	}

	result, err := s.client.Publish(ctx, input)
	if err != nil {
		log.Printf("Failed to send SMS to %s: %v", phoneNumber, err)
		return err
	}

	log.Printf("Successfully sent SMS. Message ID: %s", *result.MessageId)
	return nil
}

