import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/hooks/use-toast";

interface SystemSettingsSectionProps {
  canEdit?: boolean;
}

export default function SystemSettingsSection({ canEdit = true }: SystemSettingsSectionProps) {
  const { settings, saveSettings } = useSettings();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(
    settings.allow_public_registration
  );
  const [allowProfessionalViewOthers, setAllowProfessionalViewOthers] = useState(
    settings.allow_professional_view_others
  );

  useEffect(() => {
    setAllowPublicRegistration(settings.allow_public_registration);
    setAllowProfessionalViewOthers(settings.allow_professional_view_others);
  }, [settings.allow_public_registration, settings.allow_professional_view_others]);

  async function handleSave() {
    try {
      setSaving(true);
      await saveSettings({
        allow_public_registration: allowPublicRegistration,
        allow_professional_view_others: allowProfessionalViewOthers,
      });

      toast({
        title: "Configuracoes salvas",
        description: "Politicas de acesso publico e agenda foram atualizadas.",
      });

      setIsEditing(false);
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Nao foi possivel salvar a configuracao.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pilar Sistema</CardTitle>
        <CardDescription className="text-xs">
          Controle de acesso ao cadastro publico na tela de login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="allow_public_registration" className="text-sm">
              Permitir cadastro publico
            </Label>
            <p className="text-xs text-muted-foreground">
              Quando ligado, exibe o link "Crie sua conta" no login e libera o endpoint de registro.
            </p>
          </div>
          <Switch
            id="allow_public_registration"
            checked={allowPublicRegistration}
            onCheckedChange={setAllowPublicRegistration}
            disabled={!canEdit || !isEditing || saving}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="allow_professional_view_others" className="text-sm">
              Permitir profissional ver agenda de outros
            </Label>
            <p className="text-xs text-muted-foreground">
              Quando ligado, profissionais com permissao "agenda:view_all_professionals" podem alternar agenda.
            </p>
          </div>
          <Switch
            id="allow_professional_view_others"
            checked={allowProfessionalViewOthers}
            onCheckedChange={setAllowProfessionalViewOthers}
            disabled={!canEdit || !isEditing || saving}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-2">
          {!canEdit ? (
            <p className="text-xs text-muted-foreground">Somente leitura</p>
          ) : isEditing ? (
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setAllowPublicRegistration(settings.allow_public_registration);
                  setAllowProfessionalViewOthers(settings.allow_professional_view_others);
                  setIsEditing(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" onClick={() => setIsEditing(true)}>
              Editar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
