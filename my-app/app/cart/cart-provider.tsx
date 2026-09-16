"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";
import { cartReducer, checkoutSelection, initialCart, type CheckoutSelection } from "./cart-state";

function useCartState() {
  const [state, dispatch] = useReducer(cartReducer, initialCart);
  return {
    items: state.items,
    count: state.items.reduce((sum, item) => sum + item.quantity, 0),
    selection: checkoutSelection(state),
    add: (productId: number) => dispatch({ type: "add", productId }),
    quantity: (productId: number, quantity: number) => dispatch({ type: "quantity", productId, quantity }),
    remove: (productId: number) => dispatch({ type: "remove", productId }),
    clear: () => dispatch({ type: "clear" }),
    checkoutCart: () => dispatch({ type: "checkout-cart" }),
    buyNow: (productId: number) => dispatch({ type: "buy-now", productId }),
    complete: (selection: CheckoutSelection) => dispatch({ type: "complete", selection }),
  };
}

const CartContext = createContext<ReturnType<typeof useCartState> | null>(null);
export default function CustomerCartProvider({ children }: { children: ReactNode }) {
  const cart = useCartState();
  return <CartContext.Provider value={cart}>{children}</CartContext.Provider>;
}
export const useCustomerCart = () => useContext(CartContext);
export function useCart() {
  const cart = useCustomerCart();
  if (!cart) throw new Error("Customer cart provider is required.");
  return cart;
}
