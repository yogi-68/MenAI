import type { CSSProperties } from "react";
import Link from "next/link";

type BrandLogoProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Static logo — avoids Edge lazy-load intervention from next/image. */
export function BrandLogo({ size = 36, className, style }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Mettle"
      width={size}
      height={size}
      className={className}
      style={style}
      decoding="async"
      fetchPriority="high"
    />
  );
}

export function BrandLogoLink({
  size = 36,
  href = "/",
  className,
}: BrandLogoProps & { href?: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "10px" }}>
      <BrandLogo size={size} className={className} style={{ borderRadius: size > 40 ? "50%" : undefined }} />
    </Link>
  );
}
