import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HSC Software Engineering Trial Exam Builder",
  description:
    "Generate and sit 100-mark NSW HSC Software Engineering trial examinations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-surface text-ink">
        {children}
      </body>
    </html>
  );
}
