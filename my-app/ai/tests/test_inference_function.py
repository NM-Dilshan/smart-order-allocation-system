"""HTTP and prediction tests for the native function; never trains the model."""
import http.client
import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from api.classify_inquiry import handler, process_request, UNAVAILABLE
from ai.predict import predict_message


class InferenceFunctionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = patch.dict(os.environ, {"INQUIRY_CLASSIFIER_SECRET": "test-only-token", "VERCEL": "1"})
        cls.env.start()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.env.stop()

    def request(self, body, method="POST", token="test-only-token"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=20)
        try:
            headers = {"Content-Type": "application/json"}
            if token is not None:
                headers["Authorization"] = f"Bearer {token}"
            connection.request(method, "/api/classify_inquiry", body, headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_actual_model_output_unchanged(self):
        status, result = self.request(json.dumps({"message": "  Where is my order?  "}))
        self.assertEqual(status, 200)
        self.assertEqual(result, predict_message("Where is my order?"))
        self.assertEqual(result["category"], "Order Status Inquiry")
        self.assertAlmostEqual(result["confidence"], 0.48953044144599595)

    def test_invalid_input(self):
        for body in ["{", "null", "[]", "{}", '{"message":false}', '{"message":"   "}', json.dumps({"message": "x" * 2001}), json.dumps({"message": "\U0001F600" * 1001})]:
            self.assertEqual(self.request(body)[0], 400)

    def test_auth_method_and_size(self):
        self.assertEqual(self.request('{"message":"hello"}', token=None)[0], 401)
        self.assertEqual(self.request('{"message":"hello"}', token="wrong")[0], 401)
        self.assertEqual(self.request("", method="GET")[0], 405)
        self.assertEqual(self.request("x" * 16385)[0], 413)

    def test_inference_errors_are_safe(self):
        with patch("api.classify_inquiry.fitted_model", side_effect=FileNotFoundError("secret path")):
            status, result = self.request('{"message":"hello"}')
        self.assertEqual(status, 503)
        self.assertEqual(result, {"error": UNAVAILABLE})

    def test_prediction_output_validation(self):
        for category, confidence in [("Invented", 0.4), ("Payment Issue", -1), ("Payment Issue", 1.1), ("Payment Issue", float("nan")), ("Payment Issue", float("inf")), ("Payment Issue", True)]:
            with patch("ai.predict.predict_message", return_value={"category": category, "confidence": confidence}):
                self.assertEqual(self.request('{"message":"hello"}')[0], 503)

    def test_production_requires_secret(self):
        with patch.dict(os.environ, {"INQUIRY_CLASSIFIER_SECRET": ""}):
            self.assertEqual(process_request("POST", b'{"message":"hello"}', "", local=True)[0], 503)


if __name__ == "__main__":
    unittest.main()
