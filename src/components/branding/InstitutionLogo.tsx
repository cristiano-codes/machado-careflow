import { useSettings } from "@/contexts/SettingsContext";
import { cn } from "@/lib/utils";

interface InstitutionLogoProps {
  size?: number;
  className?: string;
  logoClassName?: string;
  showName?: boolean;
  nameClassName?: string;
  loading?: "lazy" | "eager";
}

export function InstitutionLogo({
  size = 32,
  className,
  logoClassName,
  showName = false,
  nameClassName,
  loading = "lazy",
}: InstitutionLogoProps) {
  const { settings } = useSettings();
  const institutionName = settings?.instituicao_nome?.trim() || "Instituicao";
  const logoSrc =
    settings?.instituicao_logo_base64?.trim() ||
    settings?.instituicao_logo_url?.trim() ||
    "/logo.png";

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
          logoClassName
        )}
        style={{ width: size, height: size }}
      >
        <img
          src={logoSrc}
          alt={`Logo ${institutionName}`}
          className="h-full w-full object-cover"
          loading={loading}
        />
      </div>

      {showName ? (
        <span className={cn("truncate font-semibold text-foreground", nameClassName)}>
          {institutionName}
        </span>
      ) : null}
    </div>
  );
}
