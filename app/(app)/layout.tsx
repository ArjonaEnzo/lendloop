import { EnsureUser } from "@/components/EnsureUser";

export default function SignedInLayout({ children }: LayoutProps<"/">) {
  return <EnsureUser>{children}</EnsureUser>;
}
