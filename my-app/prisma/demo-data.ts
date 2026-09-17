export const demoProducts = [
  { name: "[Demo] Ceylon Black Tea 200g", price: 850 },
  { name: "[Demo] Red Rice 1kg", price: 320 },
  { name: "[Demo] Coconut Milk 400ml", price: 450 },
  { name: "[Demo] Roasted Curry Powder 100g", price: 380 },
  { name: "[Demo] Kithul Treacle 375ml", price: 1200 },
  { name: "[Demo] Cream Crackers 500g", price: 650 },
  { name: "[Demo] Full Cream Milk Powder 400g", price: 1150 },
  { name: "[Demo] Laundry Detergent 1kg", price: 980 },
  { name: "[Demo] Herbal Soap 100g", price: 220 },
  { name: "[Demo] Stainless Steel Water Bottle 750ml", price: 2450 },
] as const;

export const demoBranches = [
  { name: "[Demo] Colombo Fort", latitude: 6.9344, longitude: 79.8428 },
  { name: "[Demo] Nugegoda", latitude: 6.8649, longitude: 79.8997 },
  { name: "[Demo] Kandy City", latitude: 7.2906, longitude: 80.6337 },
  { name: "[Demo] Galle Fort", latitude: 6.0269, longitude: 80.217 },
] as const;

// Quantities follow the product order above; existing inventory is never replenished.
export const demoStock = [
  [80, 120, 45, 60, 8, 90, 2, 25, 100, 1],
  [55, 75, 30, 40, 12, 65, 35, 18, 80, 12],
  [60, 95, 20, 50, 6, 40, 18, 30, 70, 5],
  [35, 60, 25, 30, 10, 55, 12, 15, 65, 0],
] as const;

export const demoCustomers = [
  { name: "Demo Customer Nimal Perera", email: "nimal.demo@example.com", role: "CUSTOMER" },
  { name: "Demo Customer Ishara Fernando", email: "ishara.demo@example.com", role: "CUSTOMER" },
] as const;

// Fixed creation times identify these examples even after their statuses change.
export const demoOrders = [
  { customer: 0, createdAt: "2026-09-01T09:00:00.000Z", status: "ALLOCATED",
    latitude: 6.9344, longitude: 79.8428, items: [{ product: 6, quantity: 5 }, { product: 9, quantity: 2 }] },
  { customer: 1, createdAt: "2026-09-02T10:30:00.000Z", status: "COMPLETED",
    latitude: 7.2906, longitude: 80.6337, items: [{ product: 0, quantity: 2 }, { product: 1, quantity: 3 }] },
  { customer: 0, createdAt: "2026-09-03T14:00:00.000Z", status: "CANCELLED",
    latitude: 6.0269, longitude: 80.217, items: [{ product: 2, quantity: 2 }, { product: 8, quantity: 4 }] },
] as const;

export const demoInquiries = [
  { customer: 0, createdAt: "2026-09-04T08:00:00.000Z", category: "Product/Stock Inquiry",
    message: "[Demo inquiry] Can I order five packs of full cream milk powder for delivery in Colombo?" },
  { customer: 1, createdAt: "2026-09-04T09:00:00.000Z", category: "Order Status Inquiry",
    message: "[Demo inquiry] Could you confirm the delivery status of my tea and rice order in Kandy?" },
  { customer: 0, createdAt: "2026-09-04T10:00:00.000Z", category: "Refund/Cancellation",
    message: "[Demo inquiry] I cancelled my coconut milk and soap order. When will my refund be processed?" },
  { customer: 1, createdAt: "2026-09-04T11:00:00.000Z", category: "Delivery Issue",
    message: "[Demo inquiry] Can the courier call before arriving at my apartment?" },
] as const;
