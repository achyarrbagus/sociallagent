import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { RESERVED_SLUGS } from "@/lib/slug";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  plugins: [
    // Organization = agency (tenant). Owners/admins manage clients, brands, campaigns.
    organization({
      organizationHooks: {
        beforeCreateOrganization: async ({ organization }) => {
          if (organization.slug && RESERVED_SLUGS.has(organization.slug)) {
            throw new APIError("BAD_REQUEST", { message: "Alamat workspace ini tidak tersedia." });
          }
        },
      },
    }),
    // Must stay last so server actions can set auth cookies.
    nextCookies(),
  ],
});
