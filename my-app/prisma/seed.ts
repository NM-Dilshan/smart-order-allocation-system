import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { demoProducts, demoBranches, demoStock, demoCustomers, demoOrders, demoInquiries } from "./demo-data";
import { demoPasswords, seedDemo, validateSeedTarget } from "./seed-demo";

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !["--allow-remote", "--dry-run"].includes(flag))) throw new Error("Unknown seed option.");
  if (flags.includes("--dry-run")) {
    console.log(JSON.stringify({ products: demoProducts, branches: demoBranches, stock: demoStock,
      customers: demoCustomers, orders: demoOrders, inquiries: demoInquiries }, null, 2));
    console.log("Preview only: no database connection or writes. Product/customer indexes are zero-based; prices are LKR.");
    return;
  }
  const connectionString = validateSeedTarget(process.env.SEED_DATABASE_URL || process.env.DATABASE_URL, flags.includes("--allow-remote"));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // Roll back all demo writes if any record or stock update fails.
    // ReadCommitted sees the previous seed's writes after waiting for its advisory lock.
    const result = await prisma.$transaction((tx) => seedDemo(tx, demoPasswords()), { isolationLevel: "ReadCommitted", timeout: 60000 });
    console.log("Demo records created:", result.created);
    for (const account of result.credentials) console.log(`New customer login: ${account.email} | Password: ${account.password}`);
    console.log("Existing records and passwords were preserved. Save new login credentials securely; they are printed only on creation.");
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  // Do not expose database credentials through connection error details.
  console.error(error instanceof Error && !('code' in error) && !error.message.includes("://")
    ? error.message : "Demo seed failed. Check the database connection and schema; no seed transaction was committed.");
  process.exitCode = 1;
});
