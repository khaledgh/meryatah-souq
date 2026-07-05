package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Storage stores objects in a private S3 bucket, served via
// short-lived presigned GET URLs (blueprint §4.4, §5.4). Server-side
// encryption is enabled on every Put.
type S3Storage struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	bucket        string
}

func NewS3Storage(ctx context.Context, region, bucket, accessKeyID, secretAccessKey string) (*S3Storage, error) {
	if bucket == "" {
		return nil, fmt.Errorf("storage: AWS_S3_BUCKET is required for the s3 driver")
	}
	if region == "" {
		return nil, fmt.Errorf("storage: AWS_REGION is required for the s3 driver")
	}

	loadOpts := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(region)}
	if accessKeyID != "" && secretAccessKey != "" {
		loadOpts = append(loadOpts, awsconfig.WithCredentialsProvider(
			aws.CredentialsProviderFunc(func(ctx context.Context) (aws.Credentials, error) {
				return aws.Credentials{AccessKeyID: accessKeyID, SecretAccessKey: secretAccessKey}, nil
			}),
		))
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return nil, fmt.Errorf("storage: load AWS config: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	return &S3Storage{
		client:        client,
		presignClient: s3.NewPresignClient(client),
		bucket:        bucket,
	}, nil
}

func (s *S3Storage) Put(ctx context.Context, key string, r io.Reader, contentType string) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:               aws.String(s.bucket),
		Key:                  aws.String(key),
		Body:                 r,
		ContentType:          aws.String(contentType),
		ServerSideEncryption: "AES256",
	})
	if err != nil {
		return fmt.Errorf("storage: s3 put object: %w", err)
	}
	return nil
}

func (s *S3Storage) URL(ctx context.Context, key string, ttl time.Duration) (string, error) {
	req, err := s.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("storage: presign s3 get: %w", err)
	}
	return req.URL, nil
}

func (s *S3Storage) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("storage: s3 delete object: %w", err)
	}
	return nil
}
