"""Native Vercel Python inference function; also runnable locally with -m."""
import hmac
import json
import logging
import math
import os
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LABELS = frozenset({
    "Account/Login Issue", "Delivery Issue", "General Inquiry", "Order Status Inquiry",
    "Payment Issue", "Product/Stock Inquiry", "Promotion/Discount Inquiry", "Refund/Cancellation",
})
MAX_BODY_BYTES = 16384
UNAVAILABLE = "Classification is temporarily unavailable. Please try again."
logger = logging.getLogger("inquiry-classifier")


# Reuse the fitted model for subsequent requests in this process.
@lru_cache(maxsize=1)
def fitted_model():
    from ai.predict import load_model
    return load_model()


def classify(payload):
    from ai.predict import predict_message
    result = predict_message(payload, fitted_model())
    category, confidence = result.get("category"), result.get("confidence")
    if not isinstance(category, str) or category not in LABELS:
        raise ValueError("Invalid model category")
    if isinstance(confidence, bool) or not isinstance(confidence, (float, int)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError("Invalid model confidence")
    return {"category": category, "confidence": confidence}


def process_request(method, raw, authorization, local=False):
    if method != "POST":
        return 405, {"error": "Method not allowed."}
    secret = os.environ.get("INQUIRY_CLASSIFIER_SECRET", "").strip()
    if secret:
        if not hmac.compare_digest(authorization.encode("utf-8"), ("Bearer " + secret).encode("utf-8")):
            return 401, {"error": "Unauthorized."}
    elif os.environ.get("VERCEL") or not local:
        logger.error("Classifier configuration missing: INQUIRY_CLASSIFIER_SECRET")
        return 503, {"error": UNAVAILABLE}
    if len(raw) > MAX_BODY_BYTES:
        return 413, {"error": "Request body too large."}
    try:
        body = json.loads(raw)
        message = body.get("message") if isinstance(body, dict) else None
        if not isinstance(message, str) or not message.strip():
            raise ValueError()
        message = message.strip()
        # Match the Node server's message limit using UTF-16 code units.
        if len(message.encode("utf-16-le")) // 2 > 2000:
            raise ValueError()
    except (ValueError, UnicodeError):
        return 400, {"error": "Enter a message between 1 and 2000 characters."}
    try:
        return 200, classify(message)
    except Exception as error:
        # Log a diagnostic type, never customer text, tokens, or tracebacks in the response.
        logger.error("Classifier inference failed: %s", type(error).__name__)
        return 503, {"error": UNAVAILABLE}


class handler(BaseHTTPRequestHandler):
    def respond(self, status, body):
        encoded = json.dumps(body, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        if status == 405:
            self.send_header("Allow", "POST")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(encoded)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.respond(400, {"error": "Invalid request body."})
            return
        if length < 0 or length > MAX_BODY_BYTES:
            self.respond(413, {"error": "Request body too large."})
            return
        raw = self.rfile.read(length)
        status, body = process_request("POST", raw, self.headers.get("Authorization", ""), local=self.client_address[0] in ("127.0.0.1", "::1"))
        self.respond(status, body)

    def do_GET(self):
        self.respond(405, {"error": "Method not allowed."})

    do_HEAD = do_GET
    do_PUT = do_GET
    do_PATCH = do_GET
    do_DELETE = do_GET
    do_OPTIONS = do_GET

    def log_message(self, _format, *args):
        # Avoid logging request URLs or headers, which may contain private data.
        pass


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Local classifier listening on http://127.0.0.1:{server.server_port}/api/classify_inquiry", flush=True)
    server.serve_forever()
