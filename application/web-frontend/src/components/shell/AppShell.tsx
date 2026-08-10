"use client";

import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { TopNav } from "@astryxdesign/core/TopNav";
import { usePathname } from "next/navigation";
import { navSections } from "@/lib/nav/config";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AstryxAppShell
      variant="elevated"
      contentPadding={4}
      topNav={
        <TopNav
          heading="RoleTect"
          endContent={
            <Text size="sm" color="secondary">
              local
            </Text>
          }
        />
      }
      sideNav={
        <SideNav
          header={
            <SideNavHeading heading="RoleTect" subheading="Job workspace" />
          }
        >
          {navSections.map((section) => (
            <SideNavSection key={section.title} title={section.title}>
              {section.items.map((item) => (
                <SideNavItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  isSelected={
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href))
                  }
                />
              ))}
            </SideNavSection>
          ))}
        </SideNav>
      }
    >
      {children}
    </AstryxAppShell>
  );
}
