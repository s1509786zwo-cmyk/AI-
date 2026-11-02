"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "概説" },
  { href: "/characters", label: "キャラクター" },
  { href: "/battle/new", label: "対戦" },
  { href: "/battles", label: "履歴" },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="ARBITER ホーム">
        <span className="brand-mark">A</span>
        <span className="brand-copy">
          <span className="brand-title">ARBITER</span>
          <span className="brand-sub">AI Battle Adjudication</span>
        </span>
      </Link>
      <nav className="nav" aria-label="メインナビゲーション">
        {LINKS.map((link) => {
          const active =
            link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} href={link.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
