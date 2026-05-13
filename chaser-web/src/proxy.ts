import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js v16 では middleware が proxy にリネームされているため、ここで認証ミドルウェアを実行する
export default clerkMiddleware();

export const config = {
  matcher: [
    // Next.js 内部パスと静的アセットを除外
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // API も走らせる
    "/(api|trpc)(.*)",
  ],
};
