export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/client",
    "/client/:path*",
    "/interviewer",
    "/interviewer/:path*",
    "/login",
  ],
};
