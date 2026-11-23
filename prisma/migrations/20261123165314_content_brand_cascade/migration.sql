-- DropForeignKey
ALTER TABLE "content" DROP CONSTRAINT "content_brandId_fkey";

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
