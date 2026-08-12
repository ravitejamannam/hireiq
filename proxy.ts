export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login"],
};
