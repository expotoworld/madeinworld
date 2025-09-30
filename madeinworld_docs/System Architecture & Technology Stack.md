## **1\. Executive Summary**

* **PostgreSQL** for flexibility, developer velocity, and professional maintainability.  
* **Compute**: AWS App Runner (global), Alibaba SAE or Function Compute (China).  
* **Databases**: Neon (Serverless PostgreSQL, global) and ApsaraDB for PostgreSQL (China).  
* **Static Assets**: **AWS S3 with AWS CloudFront (CDN)** for global, and **Alibaba Cloud OSS with Alibaba Cloud CDN** for China, ensuring fast, low-latency asset delivery.  
* **Edge Ingress**: Cloudflare Workers (global thin API proxy), Alibaba API Gateway (China).  
* **Data Sync**: Asynchronous, event-driven synchronization (SQS on AWS, MNS/RocketMQ on Alibaba).  
* **Secrets management** with cloud-native Secrets Managers.  
* **Roll out in two phases**: Migrate the global stack first, then add the China region and synchronization when needed and **explicitly prompted**.

---

## **2\. Phased Rollout Plan**

### **Phase 1: Migrate the Global Stack (AWS)**

* **Compute**:  
  * Deploy existing Go microservices (Auth, Catalog, Order, User) as containerized services on **AWS App Runner**.  
* **Database**:  
  * Use **Neon (Serverless PostgreSQL)** for the global database.  
  * Update service configuration to point to Neon, with credentials fetched via **AWS Secrets Manager** at runtime.  
* **Static Assets**:  
  * **AWS S3 bucket** for storing all static assets (e.g., product images, user uploads).  
  * Configure an **AWS CloudFront distribution** in front of the S3 bucket to serve assets globally with low latency.  
* **Ingress (API)**:  
  * Implement a **Cloudflare Worker** as a thin HTTPS proxy to the App Runner services (no business logic initially).  
* **Outcome**:  
  * A scalable, cost-efficient pipeline for both API traffic and static assets is established.  
  * Lower operational cost, simpler ops, and the same business capabilities are maintained for non-China users.

### **Phase 2: Add China Region \+ Synchronization**

* **Compute**:  
  * Deploy the same Go services in Alibaba Cloud using **Serverless App Engine (SAE)** for long-running containers, or Function Compute (containers) if appropriate.  
* **Database**:  
  * Provision **ApsaraDB for PostgreSQL** (e.g., in cn-shanghai) and configure services.  
* **Static Assets**:  
  * Provision **Alibaba Cloud OSS (Object Storage Service)** as the S3 equivalent.  
  * Configure **Alibaba Cloud CDN** to serve assets from OSS within China.  
* **Ingress (API)**:  
  * Use **Alibaba API Gateway** to route traffic to the SAE/Function Compute services.  
* **Synchronization**:  
  * Implement asynchronous, cross-region data sync:  
    * **AWS → CN**: SQS \+ a small "sync-out" worker → calls a CN API endpoint → upserts into ApsaraDB.  
    * **CN → AWS**: MNS/RocketMQ \+ a "sync-out" function → calls an AWS API endpoint → upserts into Neon.  
* **Outcome**:  
  * Region-local data and assets are established for performance and compliance.  
  * Event-driven sync provides global data consistency.

---

## **3\. Definitive Technology Stack**

* **Frontend (Mobile App)**: Flutter (iOS/Android single codebase)  
* **Admin Panel**: React \+ MUI  
* **Backend Language/Framework**: Go (Gin), HTTP JSON APIs  
* **Containerization**: Docker  
* **Compute (Global)**: AWS App Runner  
* **Compute (China)**: Alibaba Serverless App Engine (SAE) or Function Compute (containers)  
* **Databases (Relational SQL)**:  
  * **Global**: Neon (PostgreSQL)  
  * **China**: ApsaraDB for PostgreSQL  
* **Storage (Object)**:  
  * **Global**: AWS S3 (Simple Storage Service)  
  * **China**: Alibaba Cloud OSS (Object Storage Service)  
* **Edge & Content Delivery**:  
  * **Global API Ingress**: Cloudflare Workers (thin proxy)  
  * **Global Static Assets**: **AWS CloudFront (CDN)**  
  * **China API Ingress**: Alibaba API Gateway (HTTPS)  
  * **China Static Assets**: **Alibaba Cloud CDN**  
* **User Verification for Login and Signup (SMS Verification):**  
  * **Global:** AWS Simple Notification Service (SNS)  
  * **China:** Alibaba Cloud SMS Service  
* **User Communications (Push Notifications):**  
  * Global: Firebase Cloud Messaging (FCM)  
  * China: Alibaba Cloud Push Notification Service (AliPush)  
* **Data Sync & Messaging**:  
  * **AWS**: SQS (Simple Queue Service)  
  * **Alibaba Cloud**: MNS (Message Service) or RocketMQ  
* **Secrets & Config**:  
  * **AWS**: AWS Secrets Manager (fetched via IAM role at runtime)  
  * **Alibaba Cloud**: KMS/Secrets Manager equivalent (fetched via RAM roles)  
* **Observability**:  
  * **AWS**: CloudWatch (Logs, Metrics), X-Ray (optional), CloudFront Logs  
  * **Alibaba**: Log Service (SLS), CloudMonitor  
  * **Cloudflare**: Request Logs & Analytics  
* **DNS & Routing**:  
  * AWS Route 53 with geolocation policies.  
* **CI/CD & IaC**:  
  * **CI/CD**: GitHub Actions (build, test, containerize, push, deploy)  
  * **IaC**: Terraform (AWS \+ Alibaba providers)

---

**4\. Core Architecture**

### **4.1 Request Flow (Global API)**

Client → Cloudflare Worker (HTTPS) → App Runner service (e.g., Catalog) → Neon (PostgreSQL)

* The worker acts as a thin, secure proxy for dynamic API calls.  
* App Runner scales automatically, removing cluster management overhead.

### **4.2 Request Flow (Global Static Assets)**

Client → Cloudflare (DNS/Proxy) → **AWS CloudFront (CDN)** → **AWS S3 Bucket**

* CloudFront serves cached assets from the edge location closest to the user for maximum performance.  
* The S3 bucket can remain private, accessible only by the CloudFront distribution.

### **4.3 Request Flow (China)**

* **API**: Client → Alibaba API Gateway (HTTPS) → SAE/Function Compute service → ApsaraDB for PostgreSQL  
* **Assets**: Client → Alibaba Cloud CDN → Alibaba Cloud OSS

### **4.4 Data Synchronization**

* **Event Source**: After a successful DB commit, the application publishes a minimal change event.  
* **AWS → CN**: Go service → SQS → Sync Worker (Lambda/App Runner) → Calls CN API → Writes to ApsaraDB.  
* **CN → AWS**: Go service → MNS/RocketMQ → Sync Worker (FC/SAE) → Calls AWS API → Writes to Neon.  
* **Conflict Resolution**: Use updated\_at timestamps (last-writer-wins) or domain-specific rules.

### **4.5 Data Synchronization**

To ensure reliable delivery to all users, a dual-provider strategy is required for notifications, managed by a dedicated **Notification Service**. 

* **Global Flow**:  
  * An event (e.g., "order placed") occurs in a global backend service (AWS App Runner).  
  * The service sends a request to the region-local Notification Service.  
  * The Notification Service determines the user's region is global and calls the **Firebase Cloud Messaging (FCM)** API.  
  * FCM delivers the push notification to the user's iOS or Android device.  
* **China Flow**:   
  * An event occurs in a China-based backend service (Alibaba SAE).  
  * The service sends a request to the region-local Notification Service.  
  * The Notification Service determines the user's region is China and calls the **Alibaba Cloud Push Notification (AliPush)** API.   
  * AliPush handles the reliable delivery of the notification within China.

---

## **5\. Service Responsibilities**

* **Auth Service**: Manages passwordless flow (Email & SMS), JWT issuance/validation. Triggers SMS via the region-local provider.  
* **Catalog Service**: Manages categories, products, and store definitions. **Responsible for managing metadata of product images stored in S3/OSS.**  
* **User Service**: Manages user profiles. **Responsible for handling uploads and metadata for user assets (e.g., avatars) stored in S3/OSS.**  
* **Order Service**: Manages carts and orders.  
* **Notification Services**: A new, dedicated service responsible for handling push notifications. It determines the user's region and routes the notification to the appropriate provider (FCM or AliPush).

All services remain stateless HTTP JSON servers and use the region-local PostgreSQL repository. They are responsible for emitting events upon state changes to trigger synchronization.

---

## **6\. Secrets & Configuration**

* **Global (AWS)**: Store DB credentials in AWS Secrets Manager. App Runner services are granted an IAM role to retrieve secrets at runtime.  
* **China (Alibaba)**: Use Alibaba Secrets Manager with RAM roles for SAE/Function Compute. The same retrieval and short-term caching pattern applies.

---

## **7\. CI/CD and IaC**

* **IaC (Terraform)**: Define all infrastructure resources (**App Runner, SQS, S3, CloudFront, SAE, MNS, OSS, CDNs, IAM/RAM roles, DNS**) as code for consistency and repeatability.  
* **CI/CD (GitHub Actions)**: Create workflows to lint, test, build Go binaries, create Docker images, push to registries (ECR for AWS, ACR for Alibaba), and trigger deployments to App Runner and SAE.

---

## **8\. Observability & Reliability**

* **Logging**: Use structured JSON logs in all services for easier parsing and searching.  
* **Metrics**: Monitor basic endpoint metrics (latency, error rate, throughput), **CloudFront metrics (cache-hit ratio)**, and key business metrics (e.g., orders per hour).  
* **Tracing**: Optionally implement distributed tracing (e.g., OpenTelemetry) and propagate correlation IDs through all services via headers.  
* **Health Checks**: Leverage built-in health checks from App Runner and SAE.  
* **Backups**: Configure automated backup policies for Neon, ApsaraDB, S3, and OSS.

---

## **9\. Security**

* **Transport**: Enforce HTTPS everywhere with HSTS at the edge.  
* **Authentication**: Continue using the JWT-based pattern.  
* **Authorization**: Implement role-based checks within services.  
* **Rate Limiting**: Use Cloudflare and Alibaba API Gateway for basic IP-based rate limiting.  
* **Secrets**: Strictly avoid plaintext secrets in code or environment variables. Always use a secrets manager.  
* **Asset Security**:  
  * Keep S3/OSS buckets **private**. Use **CloudFront Origin Access Control (OAC)** or Alibaba CDN equivalent to allow the CDN to securely access bucket contents.  
  * For user-restricted content, generate **pre-signed URLs** from the backend services.  
* **Database Access**: Restrict network access to the databases from only the necessary application sources.

---

## **10\. DNS & Routing**

* **Route 53**:  
  * device-api.madeinworld.com → Geolocation policy → Points to Cloudflare Worker (Global).  
  * assets.madeinworld.com → CNAME → Points to **AWS CloudFront distribution**.  
  * device-api-cn.madeinworld.com → Geolocation policy (for China) → Points to Alibaba API Gateway.  
  * assets-cn.madeinworld.com → CNAME → Points to **Alibaba Cloud CDN distribution**.  
* **Client Configuration**: Clients in China should be configured to use the \-cn endpoints for both the API and assets for optimal latency.

---

## **11\. Reference Code Snippets**

### **Thin Cloudflare Worker Proxy**

JavaScript

export default {  
  async fetch(request) {  
    const url \= new URL(request.url);  
    // Replace with your App Runner service hostname  
    url.hostname \= "your-app-runner-service.awsapprunner.com";

    // Attach a correlation ID for tracing  
    const headers \= new Headers(request.headers);  
    headers.set("x-correlation-id", crypto.randomUUID());

    return fetch(url.toString(), {  
      method: request.method,  
      headers,  
      body: request.body,  
      redirect: "follow",  
    });  
  }  
}

### **Publish Event to SQS (Go)**

Go

import (  
    "context"  
    "encoding/json"  
    "time"  
    "github.com/aws/aws-sdk-go-v2/service/sqs"  
    "github.com/aws/aws-sdk-go-v2/aws"  
)

type ProductUpdatedEvent struct {  
    ID        string    \`json:"id"\`  
    UpdatedAt time.Time \`json:"updated\_at"\`  
}

// publishProductUpdated sends an event to SQS after a successful DB write.  
func publishProductUpdated(ctx context.Context, sqsClient \*sqs.Client, queueURL string, event ProductUpdatedEvent) error {  
    body, err := json.Marshal(event)  
    if err \!= nil {  
        return err // Should not happen with this struct  
    }

    \_, err \= sqsClient.SendMessage(ctx, \&sqs.SendMessageInput{  
        QueueUrl:    aws.String(queueURL),  
        MessageBody: aws.String(string(body)),  
    })  
    return err  
}