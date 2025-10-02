package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Uploader struct {
	Client *s3.Client
	Bucket string
}

func NewS3Uploader(ctx context.Context) (*S3Uploader, error) {
	bucket := os.Getenv("EBOOK_S3_BUCKET")
	if bucket == "" {
		return &S3Uploader{Client: nil, Bucket: ""}, nil
	}
	region := os.Getenv("AWS_REGION")
	if region == "" { region = os.Getenv("AWS_DEFAULT_REGION") }
	if region == "" { region = "eu-central-1" }
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil { return nil, err }
	return &S3Uploader{Client: s3.NewFromConfig(cfg), Bucket: bucket}, nil
}

func (u *S3Uploader) Enabled() bool { return u != nil && u.Client != nil && u.Bucket != "" }

func (u *S3Uploader) UploadJSON(ctx context.Context, key string, v any) (string, error) {
	if !u.Enabled() {
		return "", fmt.Errorf("s3 uploader not configured")
	}
	b, err := json.Marshal(v)
	if err != nil { return "", err }
	_, err = u.Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: &u.Bucket,
		Key:    &key,
		Body:   bytes.NewReader(b),
		ContentType: func() *string { s := "application/json"; return &s }(),
	})
	if err != nil { return "", err }
	return fmt.Sprintf("s3://%s/%s", u.Bucket, key), nil
}

func TimestampKey(prefix string) string {
	return fmt.Sprintf("%s%s.json", prefix, time.Now().UTC().Format("20060102T150405Z"))
}

