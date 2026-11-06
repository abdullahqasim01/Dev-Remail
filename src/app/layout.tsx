import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Dev-Remail",
  description: "A local Resend-compatible mail server with a mailbox UI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="flex h-full">
        <Nav />
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
