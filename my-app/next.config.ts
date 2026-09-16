import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include the local predictor and existing model in traced Node deployments.
  // A compatible Python runtime/dependencies must still be supplied separately.
  outputFileTracingIncludes: {
    "/api/inquiries": ["./ai/predict.py", "./ai/models/customer_message_classifier.joblib"],
  },
};

export default nextConfig;
