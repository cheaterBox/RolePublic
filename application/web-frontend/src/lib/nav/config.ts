export type NavItem = {
  label: string;
  href: string;
  section: string;
};

export const navSections = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", href: "/", section: "Workspace" },
      { label: "Jobs", href: "/jobs", section: "Workspace" },
      { label: "Inbox", href: "/inbox", section: "Workspace" },
    ] as NavItem[],
  },
  {
    title: "Content",
    items: [
      { label: "Resumes", href: "/resumes", section: "Content" },
      { label: "Cover Letters", href: "/cover-letters", section: "Content" },
      { label: "Documents", href: "/documents", section: "Content" },
    ] as NavItem[],
  },
  {
    title: "Tools",
    items: [
      { label: "Compiler", href: "/compiler", section: "Tools" },
      { label: "PDF", href: "/pdf", section: "Tools" },
      { label: "Scoring", href: "/scoring", section: "Tools" },
    ] as NavItem[],
  },
  {
    title: "System",
    items: [
      { label: "Themes", href: "/themes", section: "System" },
      { label: "Cloud", href: "/cloud", section: "System" },
      { label: "Downloads", href: "/downloads", section: "System" },
      { label: "Settings", href: "/settings", section: "System" },
    ] as NavItem[],
  },
] as const;

export const allNavItems: NavItem[] = navSections.flatMap((s) => [...s.items]);
