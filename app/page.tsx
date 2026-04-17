// Root redirect — next-intl middleware handles locale detection.
// This page is only hit if middleware doesn't intercept (edge case).
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}
