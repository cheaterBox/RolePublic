export type NavItem = {
  label: string;
  href: string;
  iconName: string;
};

export const navItems: NavItem[] = [
  { label: "Home", href: "/", iconName: "Home" },
  { label: "Jobs", href: "/jobs", iconName: "Briefcase" },
  { label: "Inbox", href: "/inbox", iconName: "Inbox" },
  { label: "Resume Templates", href: "/resumes", iconName: "FileText" },
  { label: "CL Templates", href: "/cover-letters", iconName: "Mail" },
  { label: "Documents", href: "/documents", iconName: "Files" },
  { label: "Compiler", href: "/compiler", iconName: "Cpu" },
  { label: "Themes", href: "/themes", iconName: "Palette" },
  { label: "Cloud Backup", href: "/cloud", iconName: "Cloud" },
  { label: "Downloads", href: "/downloads", iconName: "Download" },
  { label: "Settings", href: "/settings", iconName: "Settings" },
];
