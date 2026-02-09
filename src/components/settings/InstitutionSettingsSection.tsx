import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/contexts/SettingsContext";
import { Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (digits.length <= 6) {
    return `(${ddd}) ${rest}`;
  }

  if (digits.length <= 10) {
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

function getInstitutionInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "IN";

  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

const MAX_LOGO_SIZE_BYTES = 1024 * 1024;
const RECOMMENDED_LOGO_DIMENSION = 256;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      reject(new Error("Nao foi possivel validar as dimensoes da imagem."));
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });
}

export default function InstitutionSettingsSection() {
  const { settings, saveSettings } = useSettings();
  const { toast } = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  function clearTemporaryLogoSelection() {
    setLogoFile(null);
    setLogoPreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return null;
    });
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  }

  const displayedLogoSrc =
    logoPreviewUrl ??
    (isEditingSettings
      ? tempSettings.instituicao_logo_base64 ?? tempSettings.instituicao_logo_url ?? null
      : settings.instituicao_logo_base64 ?? settings.instituicao_logo_url ?? null);

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;

    if (!selected) {
      clearTemporaryLogoSelection();
      return;
    }

    if (selected.type !== "image/png") {
      toast({
        title: "Formato invalido",
        description: "A logo deve estar no formato PNG.",
        variant: "destructive",
      });
      clearTemporaryLogoSelection();
      return;
    }

    if (selected.size > MAX_LOGO_SIZE_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: "A logo deve ter no maximo 1MB.",
        variant: "destructive",
      });
      clearTemporaryLogoSelection();
      return;
    }

    setLogoFile(selected);

    const nextUrl = URL.createObjectURL(selected);
    setLogoPreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return nextUrl;
    });

    try {
      const [base64Logo, dimensions] = await Promise.all([
        readFileAsDataUrl(selected),
        getImageDimensions(selected),
      ]);

      setTempSettings((prev) => ({
        ...prev,
        instituicao_logo_url: null,
        instituicao_logo_base64: base64Logo,
      }));

      if (
        dimensions.width !== RECOMMENDED_LOGO_DIMENSION ||
        dimensions.height !== RECOMMENDED_LOGO_DIMENSION
      ) {
        toast({
          title: "Dimensao recomendada",
          description: "Recomendado 256x256 (quadrado) para melhor resultado.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro ao processar logo",
        description: err?.message ?? "Nao foi possivel processar a imagem.",
        variant: "destructive",
      });
      clearTemporaryLogoSelection();
    }
  }

  async function handleSettingsUpdate(e?: React.FormEvent) {
    e?.preventDefault();
    try {
      setSaving(true);
      const payloadToSave = {
        ...tempSettings,
        instituicao_logo_base64:
          tempSettings.instituicao_logo_base64 ?? settings.instituicao_logo_base64 ?? null,
      };
      await saveSettings(payloadToSave);
      setIsEditingSettings(false);
      clearTemporaryLogoSelection();
      toast({
        title: "Configuracoes salvas",
        description: "Configuracoes do sistema atualizadas com sucesso!",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="w-4 h-4" />
          Configuracoes Institucionais
        </CardTitle>
        <CardDescription className="text-xs">
          Informacoes da instituicao que aparecerao no sistema
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <form className="space-y-3" onSubmit={handleSettingsUpdate}>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Logo da Instituicao</Label>
            <div className="flex items-center gap-3">
              <div className="h-24 w-24 overflow-hidden rounded-md border bg-muted">
                {displayedLogoSrc ? (
                  <img
                    src={displayedLogoSrc}
                    alt="Preview da logo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                    {getInstitutionInitials(
                      isEditingSettings
                        ? tempSettings.instituicao_nome
                        : settings.instituicao_nome
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <input
                  ref={logoInputRef}
                  id="instituicao_logo"
                  type="file"
                  accept="image/png"
                  onChange={handleLogoSelect}
                  className="hidden"
                  disabled={!isEditingSettings || saving}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={!isEditingSettings || saving}
                >
                  Enviar logo
                </Button>
                <p className="text-xs text-muted-foreground">
                  {logoFile
                    ? logoFile.name
                    : displayedLogoSrc
                    ? "Logo carregada"
                    : "Sem logo enviada"}
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG - recomendado 256x256 (quadrado) - ate 1MB
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instituicao_nome" className="text-sm font-medium">
                Nome da Instituicao
              </Label>
              <Input
                id="instituicao_nome"
                value={
                  isEditingSettings
                    ? tempSettings.instituicao_nome
                    : settings.instituicao_nome
                }
                onChange={(e) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    instituicao_nome: e.target.value,
                  }))
                }
                disabled={!isEditingSettings || saving}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instituicao_email" className="text-sm font-medium">
                E-mail da Instituicao
              </Label>
              <Input
                id="instituicao_email"
                type="email"
                value={
                  isEditingSettings
                    ? tempSettings.instituicao_email
                    : settings.instituicao_email
                }
                onChange={(e) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    instituicao_email: e.target.value,
                  }))
                }
                disabled={!isEditingSettings || saving}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instituicao_telefone" className="text-sm font-medium">
                Telefone da Instituicao
              </Label>
              <Input
                id="instituicao_telefone"
                value={
                  isEditingSettings
                    ? tempSettings.instituicao_telefone
                    : settings.instituicao_telefone
                }
                onChange={(e) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    instituicao_telefone: formatPhoneBR(e.target.value),
                  }))
                }
                disabled={!isEditingSettings || saving}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instituicao_endereco" className="text-sm font-medium">
                Endereco da Instituicao
              </Label>
              <Input
                id="instituicao_endereco"
                value={
                  isEditingSettings
                    ? tempSettings.instituicao_endereco
                    : settings.instituicao_endereco
                }
                onChange={(e) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    instituicao_endereco: e.target.value,
                  }))
                }
                disabled={!isEditingSettings || saving}
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {isEditingSettings ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditingSettings(false);
                    setTempSettings(settings);
                    clearTemporaryLogoSelection();
                  }}
                  size="sm"
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar Configuracoes"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => setIsEditingSettings(true)}
                size="sm"
              >
                Editar Configuracoes
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
