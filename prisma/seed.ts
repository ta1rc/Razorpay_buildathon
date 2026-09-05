import { PrismaClient } from "@prisma/client";
import { MERCHANTS } from "../src/lib/demo-products";

const prisma = new PrismaClient();

async function main() {
  for (const m of MERCHANTS) {
    await prisma.merchant.upsert({
      where: { slug: m.slug },
      update: {
        name: m.name,
        vertical: m.vertical,
        siteDescription: m.siteDescription,
        siteBasePath: m.siteBasePath,
      },
      create: {
        slug: m.slug,
        name: m.name,
        vertical: m.vertical,
        siteDescription: m.siteDescription,
        siteBasePath: m.siteBasePath,
      },
    });
  }
  console.log(`Seeded ${MERCHANTS.length} merchants.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
