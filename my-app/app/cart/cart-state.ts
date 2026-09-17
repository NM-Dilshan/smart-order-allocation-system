export type CartItem = { productId: number; quantity: number };
export type CheckoutSelection = { items: CartItem[]; mode: "cart" | "buy-now"; revision: number };
export type CartState = { items: CartItem[]; buyNow: CartItem[] | null; revision: number };
export type CartAction =
  | { type: "add"; productId: number }
  | { type: "quantity"; productId: number; quantity: number }
  | { type: "remove"; productId: number }
  | { type: "clear" }
  | { type: "checkout-cart" }
  | { type: "buy-now"; productId: number }
  | { type: "complete"; selection: CheckoutSelection };

export const initialCart: CartState = { items: [], buyNow: null, revision: 0 };
export const validQuantity = (value: number) => Number.isInteger(value) && value >= 1 && value <= 2147483647;

export function cartReducer(state: CartState, action: CartAction): CartState {
  if ("productId" in action && (!Number.isInteger(action.productId) || action.productId <= 0)) return state;
  switch (action.type) {
    case "add": {
      const existing = state.items.find((item) => item.productId === action.productId);
      if (existing && !validQuantity(existing.quantity + 1)) return state;
      const items = existing
        ? state.items.map((item) => item.productId === action.productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...state.items, { productId: action.productId, quantity: 1 }];
      return { ...state, items, revision: state.revision + 1 };
    }
    case "quantity":
      if (!validQuantity(action.quantity) || !state.items.some((item) => item.productId === action.productId && item.quantity !== action.quantity)) return state;
      return { ...state, items: state.items.map((item) => item.productId === action.productId ? { ...item, quantity: action.quantity } : item), revision: state.revision + 1 };
    case "remove":
      return { ...state, items: state.items.filter((item) => item.productId !== action.productId), revision: state.revision + 1 };
    case "clear":
      return { ...state, items: [], revision: state.revision + 1 };
    case "checkout-cart":
      return { ...state, buyNow: null, revision: state.revision + 1 };
    case "buy-now":
      // Keep the regular cart intact while checking out a single product.
      return { ...state, buyNow: [{ productId: action.productId, quantity: 1 }], revision: state.revision + 1 };
    case "complete": {
      // Remove the submitted quantities, preserving any later additions.
      const items = action.selection.mode === "buy-now" ? state.items : state.items.flatMap((item) => {
        const purchased = action.selection.items.find((p) => p.productId === item.productId)?.quantity ?? 0;
        return item.quantity > purchased ? [{ ...item, quantity: item.quantity - purchased }] : [];
      });
      // Unrelated cart edits must not retain a purchased Buy Now selection.
      // A newer Buy Now action creates a different selection and is preserved.
      return { items, buyNow: state.buyNow === action.selection.items ? null : state.buyNow, revision: state.revision + 1 };
    }
  }
}

export function checkoutSelection(state: CartState): CheckoutSelection {
  return { items: state.buyNow ?? state.items, mode: state.buyNow ? "buy-now" : "cart", revision: state.revision };
}
