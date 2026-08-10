import { Shell } from "@/components/shell/AppShell";
import { PageTransition } from "@/components/shell/PageTransition";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Shell>
      <PageTransition>{children}</PageTransition>
    </Shell>
  );
}
