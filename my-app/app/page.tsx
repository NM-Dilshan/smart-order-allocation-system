import Link from "next/link";
import { ArrowRight, Headset, ShoppingBag, Warehouse } from "lucide-react";

export const metadata = {
  title: "Smart Order | Smart Ordering, Better Fulfillment",
  description: "Place orders easily and let our smart allocation system find the best available branch for fulfillment.",
};

const features = [
  { title: "Easy Ordering", description: "Browse products and add items to your cart.", icon: ShoppingBag },
  { title: "Smart Allocation", description: "Orders are automatically allocated based on available branch inventory.", icon: Warehouse },
  { title: "Customer Support", description: "Submit inquiries and receive categorized support.", icon: Headset },
];

export default function Home() {
  return (
    <main className="flex-1 bg-zinc-50 font-sans text-zinc-900 [color-scheme:light]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section aria-labelledby="home-heading" className="relative overflow-hidden rounded-2xl border border-teal-100 bg-teal-50 px-6 py-14 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border-[48px] border-teal-100/70 sm:size-112" />
          <div className="relative max-w-2xl">
            <p className="mb-5 text-sm font-semibold tracking-wide text-teal-800">SMART ORDER ALLOCATION</p>
            <h1 id="home-heading" className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">Smart Ordering,<br className="hidden sm:block" /> Better Fulfillment</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8">Place orders easily and let our smart allocation system find the best available branch for fulfillment.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/shop" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-teal-700 px-6 py-3 font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">Shop Now <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href="/my-orders" className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 py-3 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">My Orders</Link>
            </div>
          </div>
        </section>
        <section aria-labelledby="features-heading" className="py-10 sm:py-14">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">A simpler way to order</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3 lg:gap-6">
            {features.map(({ title, description, icon: Icon }) => (
              <article key={title} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon size={24} aria-hidden="true" /></div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
