"use client";

import { useEffect, useState } from "react";
import { api, message, type Product } from "../orders/order-ui";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Product[]>("/api/products", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setProducts(data); })
      .catch((reason) => { if (!controller.signal.aborted) setError(message(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  return { products, loading, error, retry() { setLoading(true); setError(""); setVersion((value) => value + 1); } };
}
