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

function getInstitutionInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "IN";

  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
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
  const institutionName = settings.instituicao_nome || "Instituicao";
  const logoSrc = settings.instituicao_logo_base64 ?? settings.instituicao_logo_url ?? null;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted",
          logoClassName
        )}
        style={{ width: size, height: size }}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={`Logo ${institutionName}`}
            className="h-full w-full object-cover"
            loading={loading}
          />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {getInstitutionInitials(institutionName)}
          </span>
        )}
      </div>

      {showName ? (
        <span className={cn("truncate font-semibold text-foreground", nameClassName)}>
          {institutionName}
        </span>
      ) : null}
    </div>
  );
}
