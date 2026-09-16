# Smart Order Allocation System

A full-stack order management and intelligent branch allocation system developed as part of a Software Engineer Intern Technical Assessment.

The system manages products, branches, branch-level inventory, customer orders, and customer support inquiries. It automatically selects the best available branch for each order based on stock availability, customer distance, and current branch workload.

The project also includes a Machine Learning based Customer Inquiry Classification feature that automatically categorizes customer support messages.

---

## Key Features

### Customer Features

- Customer registration and login
- Secure session-based authentication
- Browse available products
- Create orders with multiple products
- Enter customer location / use current geolocation
- Check product availability before placing an order
- View the Best Available Branch before confirming an order
- Place orders
- View personal order history
- View allocated branch and order status
- Submit customer support inquiries
- AI-based inquiry classification
- View personal inquiry history
- View support replies

### Admin / Staff Features

- Secure Admin and Staff authentication
- Role-based access control
- Branch management
- Product management
- Branch inventory management
- Order management
- Order status management
- Order cancellation
- Customer inquiry management
- View AI-predicted inquiry categories and confidence scores
- Reply to customer inquiries
- Resolve customer inquiries

---

## Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Next.js App Router
- Next.js Route Handlers / REST APIs
- Prisma ORM

### Database

- PostgreSQL
- Supabase PostgreSQL

### Authentication

- iron-session
- Secure HttpOnly session cookies
- scrypt password hashing
- Role-based authorization

### Machine Learning

- Python
- pandas
- scikit-learn
- TF-IDF
- Logistic Regression
- joblib

---

# System Architecture

```text
                    CUSTOMER
                        |
                        v
               Next.js Frontend
                        |
                        v
                 REST API Layer
                  /           \
                 /             \
                v               v
        Order Management    Customer Support
                |               |
                v               v
        Smart Allocation    ML Classifier
                |          TF-IDF + Logistic
                |             Regression
                v               |
           PostgreSQL <---------+
            Database
                |
                v
          ADMIN / STAFF
             Dashboard
```

---

# Smart Order Allocation

The main feature of the application is automatic branch allocation.

When a customer places an order, the system determines which branch is best suited to fulfill the complete order.

## Step 1 — Stock Eligibility

A branch is eligible only when it has enough stock for **every item in the order**.

Stock from multiple branches is never combined.

Example:

```text
Order:
Mouse    x 10
Keyboard x 5

Colombo Branch:
Mouse    = 20  ✓
Keyboard = 2   ✗

Kandy Branch:
Mouse    = 10  ✓
Keyboard = 8   ✓
```

Colombo cannot fulfill the complete order.

Kandy can fulfill all requested items and is therefore eligible.

Another example:

```text
Colombo → Mouse = 10
Kandy   → Mouse = 20
Galle   → Mouse = 5

Customer requests:

Mouse x 25
```

No single branch contains 25 units.

Therefore, the order cannot proceed.

---

# Distance Calculation

The customer's latitude and longitude are compared with eligible branch locations.

The system uses the **Haversine Formula** to calculate geographical distance in kilometers.

```text
Customer Location
        |
        v
Eligible Branch Locations
        |
        v
Haversine Distance
        |
        v
Distance in Kilometers
```

---

# Branch Workload

Branch workload is calculated using the number of active `ALLOCATED` orders assigned to each eligible branch.

Orders with statuses such as `CANCELLED` or `COMPLETED` are not treated as active allocation workload.

---

# Allocation Score

Both distance and workload are normalized before calculating the final allocation score.

```text
normalizedDistance =
distance / maximumEligibleDistance

normalizedWorkload =
workload / maximumEligibleWorkload
```

The final score is:

```text
score =
(normalizedDistance × 0.7)
+
(normalizedWorkload × 0.3)
```

Therefore:

- Distance weight = **70%**
- Workload weight = **30%**

The branch with the **lowest score** is selected as the Best Available Branch.

Tie-breaking is deterministic using distance, workload, and branch ID.

---

# Best Available Branch

Before final order placement, customers can check availability.

The system evaluates:

1. Requested products
2. Requested quantities
3. Branch inventory
4. Complete-order fulfillment
5. Customer location
6. Branch distance
7. Branch workload
8. Allocation score

The customer cannot manually select a branch.

The system automatically determines the Best Available Branch.

---

# Inventory Safety

Inventory is deducted only after final order placement.

Example:

```text
Initial Stock = 10

Customer Order = 3

Remaining Stock = 7
```

Stock deduction and order creation are handled transactionally.

Conditional stock updates are used to reduce the risk of overselling during concurrent requests.

Only the selected branch loses inventory.

---

# Order Cancellation

Allocated orders can be cancelled according to the application's authorization and status rules.

When an allocated order is cancelled, the deducted stock is restored to the same allocated branch.

Example:

```text
Initial Stock
10

Order x3
↓
7

Cancel Order
↓
10
```

Cancellation and inventory restoration are performed transactionally.

The system also prevents the same order from restoring stock more than once.

---

# Order Status

The application uses order statuses such as:

```text
PENDING
ALLOCATED
COMPLETED
CANCELLED
```

Normal successful allocation results in:

```text
Order
  ↓
ALLOCATED
  ├──→ COMPLETED
  └──→ CANCELLED
```

Completing an order does **not** deduct inventory again because inventory was already deducted during allocation.

Cancelling an eligible allocated order restores inventory.

---

# Authentication and Authorization

The application provides role-based authentication.

Supported roles include:

```text
CUSTOMER
STAFF
ADMIN
```

### Customer

Customers can:

- Place orders
- View their own orders
- Submit support inquiries
- View their own inquiry history and support replies

### Staff / Admin

Staff and administrators can access management functionality including:

- Branches
- Products
- Inventory
- Orders
- Customer inquiries

Authorization is enforced server-side and is not based only on hiding frontend navigation.

Passwords are stored using salted scrypt password hashes.

Sessions use `iron-session` with secure HttpOnly cookies.

---

# AI Customer Inquiry Classification

The project includes a locally trained Machine Learning model for automatically classifying customer support messages.

Example:

```text
Customer Message:

"Where is my order?"

        ↓

TF-IDF Vectorization

        ↓

Logistic Regression

        ↓

Order Status Inquiry
```

The model predicts one of the supported customer inquiry categories.

Categories include:

- Account/Login Issue
- Delivery Issue
- General Inquiry
- Order Status Inquiry
- Payment Issue
- Product/Stock Inquiry
- Promotion/Discount Inquiry
- Refund/Cancellation

---

# AI Dataset

Dataset location:

```text
ai/data/Customer_Message_Dataset.csv
```

Original dataset:

```text
Rows: 450
Columns:
- id
- message
- category
```

After preprocessing and duplicate handling:

```text
Usable rows: 351

Training rows: 280
Testing rows: 71
```

The dataset is split approximately:

```text
80% Training
20% Testing
```

using:

```text
random_state = 42
```

and stratification by category.

---

# Machine Learning Pipeline

The ML pipeline is:

```text
Customer Message
       |
       v
TF-IDF Vectorizer
       |
       v
Logistic Regression
       |
       v
Predicted Category
       +
Confidence
```

The complete pipeline is persisted using `joblib`.

Saved model:

```text
ai/models/customer_message_classifier.joblib
```

---

# AI Model Performance

The trained model achieved:

```text
Training Accuracy: 100%

Held-out Test Accuracy:
83.10%

Correct Test Predictions:
59 / 71
```

Weighted F1 score:

```text
0.8237
```

The test results indicate useful classification performance on the supplied dataset, while the difference between training and test accuracy suggests some overfitting/generalization limitations.

Confidence values are obtained from the classifier's actual `predict_proba()` output and are not artificially generated.

---

# AI Integration

Customer support flow:

```text
Customer
    |
    v
Submit Inquiry
    |
    v
Local ML Classifier
    |
    +---- Predicted Category
    |
    +---- Confidence
    |
    v
CustomerInquiry
Database Record
    |
    v
ADMIN / STAFF
Inquiry Management
```

The Next.js server communicates with the local Python classifier using a controlled child process.

Customer input is passed through JSON standard input rather than being concatenated into shell commands.

The classifier runs locally and does not require an external AI API.

---

# Customer Support Workflow

```text
CUSTOMER
    |
    v
Submit Inquiry
    |
    v
AI Classification
    |
    v
OPEN
    |
    v
ADMIN / STAFF
    |
    v
Manual Support Reply
    |
    v
RESOLVED
    |
    v
Customer Views Reply
```

AI is used only to classify the inquiry.

The AI does **not**:

- Cancel orders
- Change order statuses
- Modify inventory
- Select branches
- Generate automatic support actions

Business operations remain controlled by the application's validated backend logic.

---

# Project Structure

```text
my-app/
│
├── app/
│   ├── api/
│   ├── branches/
│   ├── products/
│   ├── inventory/
│   ├── orders/
│   ├── support/
│   └── admin/
│
├── lib/
│   ├── allocation.ts
│   ├── inventory.ts
│   ├── orders.ts
│   ├── order-stock.ts
│   ├── order-cancellation.ts
│   ├── inquiries.ts
│   └── ai-classifier.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── ai/
│   ├── data/
│   │   └── Customer_Message_Dataset.csv
│   │
│   ├── models/
│   │   └── customer_message_classifier.joblib
│   │
│   ├── reports/
│   ├── tests/
│   ├── train.py
│   ├── predict.py
│   ├── requirements.txt
│   └── README.md
│
├── tests/
├── package.json
├── .env.example
└── README.md
```

---

# Installation

## Prerequisites

Install:

- Node.js
- npm
- Python
- PostgreSQL database or Supabase PostgreSQL
- Git

---

## 1. Clone Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd smart-order-allocation-system/my-app
```

Replace `<YOUR_GITHUB_REPOSITORY_URL>` with the actual repository URL.

---

## 2. Install Node Dependencies

```bash
npm install
```

---

## 3. Environment Variables

Create:

```text
.env
```

Use `.env.example` as the reference.

Required environment variables include:

```env
DATABASE_URL="your-postgresql-connection-string"
AUTH_SECRET="your-authentication-secret"
AUTH_ORIGIN="http://localhost:3000"
```

Never commit the real `.env` file or production secrets to GitHub.

---

## 4. Prisma Setup

Generate Prisma Client:

```bash
npx prisma generate
```

Apply database migrations:

```bash
npx prisma migrate dev
```

Optional database viewer:

```bash
npx prisma studio
```

---

## 5. AI Environment Setup

From the project root on Windows PowerShell:

```powershell
python -m venv ai\.venv
```

Install the Python dependencies:

```powershell
.\ai\.venv\Scripts\python.exe -m pip install -r ai\requirements.txt
```

The required Python packages include:

```text
pandas
scikit-learn
joblib
```

---

## 6. Train AI Model

The trained model is included in the project where permitted, but it can be regenerated using:

```powershell
.\ai\.venv\Scripts\python.exe ai\train.py
```

The generated model is stored at:

```text
ai/models/customer_message_classifier.joblib
```

---

## 7. Test AI Prediction

Example:

```powershell
.\ai\.venv\Scripts\python.exe ai\predict.py "Where is my order?"
```

The result includes:

```text
Predicted Category
Confidence
```

---

## 8. Administrator Setup

The project includes administrator provisioning instructions in:

```text
AUTHENTICATION.md
```

Example PowerShell flow:

```powershell
$env:BOOTSTRAP_EMAIL = Read-Host 'Administrator email'
$secret = Read-Host 'Administrator password (at least 12 characters)' -AsSecureString
$env:BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
try {
    node scripts/setup-auth.mjs
} finally {
    Remove-Item Env:BOOTSTRAP_PASSWORD
    Remove-Item Env:BOOTSTRAP_EMAIL
}
```

Do not commit administrator credentials to the repository.

---

# Running the Application

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

If port 3000 is already occupied, Next.js may use another available port.

---

# Testing

Run the project's application tests using the commands defined in `package.json`.

The AI tests can be run with:

```powershell
.\ai\.venv\Scripts\python.exe -m unittest discover -s ai\tests -v
```

Additional validation can include:

```bash
npx tsc --noEmit
npx prisma validate
```

---

# Important Business Rules

1. A single branch must be able to fulfill the entire order.
2. Inventory from multiple branches is never combined for one allocation.
3. Only branches with sufficient stock are considered for allocation.
4. Distance is calculated using the Haversine formula.
5. Distance contributes 70% of the allocation score.
6. Active workload contributes 30% of the allocation score.
7. The branch with the lowest score is selected.
8. Customers cannot manually select the allocated branch.
9. Stock is deducted only from the selected branch.
10. Stock deduction and order creation are handled safely.
11. Cancelling an eligible allocated order restores stock.
12. Completing an order does not deduct stock again.
13. AI classification cannot directly modify orders or inventory.
14. Customers can access only their own protected information.
15. Management operations require ADMIN or STAFF authorization.

---

# Security

The application includes:

- Server-side authentication
- Role-based authorization
- HttpOnly session cookies
- Secure password hashing
- Input validation
- Protected management APIs
- Customer ownership checks
- Transactional inventory updates
- Safe AI process invocation
- Environment-based secret configuration

Sensitive values such as database credentials, passwords, and authentication secrets must never be committed to the repository.

---

# Limitations

- The ML model is trained on a relatively small supplied dataset.
- Held-out test accuracy is approximately 83.10%.
- Prediction probabilities are not calibrated confidence guarantees.
- Local AI inference requires a Python runtime and the required Python packages.
- Some serverless deployment environments may not support Python child processes.
- A production deployment could move ML inference to a dedicated inference service.
- Further production hardening, monitoring, and scalability improvements would be required for large-scale deployment.

---

# Future Improvements

Possible future improvements include:

- Dedicated production ML inference service
- Improved ML dataset and model evaluation
- Email notifications for support replies
- Order delivery tracking
- Inventory analytics
- Low-stock alerts
- Management dashboard analytics
- Audit logging
- Improved monitoring and observability
- Additional automated end-to-end testing

---

# Author

**Naveen W.A**

Software Engineer Intern Candidate

---

# Repository

GitHub Repository:

```text
<ADD_GITHUB_REPOSITORY_URL>
```

---

## License

This project was developed for a technical assessment.

The supplied assessment dataset should only be redistributed if permitted by the dataset owner.