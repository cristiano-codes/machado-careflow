import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/hooks/use-toast";

interface SystemSettingsSectionProps {
  canEdit?: boolean;
}

const REGISTRATION_OPTIONS: Array<{ value: "ADMIN_ONLY" | "PUBLIC_SIGNUP" | "INVITE_ONLY"; label: string; description: string }> = [
  {
    value: "INVITE_ONLY",
    label: "Somente convite",
    description: "Cadastro externo desativado. Contas sao criadas ou liberadas pela administracao.",
  },
  {
    value: "ADMIN_ONLY",
    label: "Somente admin",
    description: "Somente administradores podem criar novos usuarios manualmente.",
  },
  {
    value: "PUBLIC_SIGNUP",
    label: "Cadastro publico",
    description: "Exibe o botao de criar conta no login e habilita /api/auth/register.",
  },
];

const LINK_POLICY_OPTIONS: Array<{
  value: "MANUAL_LINK_ADMIN" | "AUTO_LINK_BY_EMAIL" | "SELF_CLAIM_WITH_APPROVAL";
  label: string;
  description: string;
}> = [
  {
    value: "MANUAL_LINK_ADMIN",
    label: "Vinculo manual (admin)",
    description: "Apenas administradores podem vincular ou desvincular Usuario <-> Profissional.",
  },
  {
    value: "AUTO_LINK_BY_EMAIL",
    label: "Auto-vinculo por e-mail",
    description: "No login/verify, vincula automaticamente quando e-mail de usuario e profissional coincide.",
  },
  {
    value: "SELF_CLAIM_WITH_APPROVAL",
    label: "Solicitacao com aprovacao",
    description: "Usuario solicita vinculo e o administrador aprova ou rejeita.",
  },
];

const PUBLIC_STATUS_OPTIONS: Array<{ value: "pendente" | "ativo"; label: string; description: string }> = [
  {
    value: "pendente",
    label: "Pendente",
    description: "Novos cadastros publicos precisam de aprovacao antes de acessar.",
  },
  {
    value: "ativo",
    label: "Ativo",
    description: "Novos cadastros publicos entram com acesso imediato.",
  },
];

export default function SystemSettingsSection({ canEdit = true }: SystemSettingsSectionProps) {
  const { settings, saveSettings } = useSettings();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [registrationMode, setRegistrationMode] = useState(settings.registration_mode);
  const [publicSignupDefaultStatus, setPublicSignupDefaultStatus] = useState(
    settings.public_signup_default_status
  );
  const [linkPolicy, setLinkPolicy] = useState(settings.link_policy);
  const [allowCreateUserFromProfessional, setAllowCreateUserFromProfessional] = useState(
    settings.allow_create_user_from_professional
  );
  const [blockDuplicateEmail, setBlockDuplicateEmail] = useState(settings.block_duplicate_email);
  const [allowProfessionalViewOthers, setAllowProfessionalViewOthers] = useState(
    settings.allow_professional_view_others
  );

  useEffect(() => {
    setRegistrationMode(settings.registration_mode);
    setPublicSignupDefaultStatus(settings.public_signup_default_status);
    setLinkPolicy(settings.link_policy);
    setAllowCreateUserFromProfessional(settings.allow_create_user_from_professional);
    setBlockDuplicateEmail(settings.block_duplicate_email);
    setAllowProfessionalViewOthers(settings.allow_professional_view_others);
  }, [
    settings.registration_mode,
    settings.public_signup_default_status,
    settings.link_policy,
    settings.allow_create_user_from_professional,
    settings.block_duplicate_email,
    settings.allow_professional_view_others,
  ]);

  const selectedRegistration = useMemo(
    () => REGISTRATION_OPTIONS.find((option) => option.value === registrationMode),
    [registrationMode]
  );
  const selectedLinkPolicy = useMemo(
    () => LINK_POLICY_OPTIONS.find((option) => option.value === linkPolicy),
    [linkPolicy]
  );
  const selectedPublicStatus = useMemo(
    () => PUBLIC_STATUS_OPTIONS.find((option) => option.value === publicSignupDefaultStatus),
    [publicSignupDefaultStatus]
  );

  function resetDraft() {
    setRegistrationMode(settings.registration_mode);
    setPublicSignupDefaultStatus(settings.public_signup_default_status);
    setLinkPolicy(settings.link_policy);
    setAllowCreateUserFromProfessional(settings.allow_create_user_from_professional);
    setBlockDuplicateEmail(settings.block_duplicate_email);
    setAllowProfessionalViewOthers(settings.allow_professional_view_others);
  }

  async function handleSave() {
    try {
      setSaving(true);

      const allowPublicRegistration = registrationMode === "PUBLIC_SIGNUP";
      await saveSettings({
        registration_mode: registrationMode,
        public_signup_default_status: publicSignupDefaultStatus,
        link_policy: linkPolicy,
        allow_create_user_from_professional: allowCreateUserFromProfessional,
        block_duplicate_email: blockDuplicateEmail,
        allow_professional_view_others: allowProfessionalViewOthers,
        allow_public_registration: allowPublicRegistration,
      });

      toast({
        title: "Configuracoes salvas",
        description: "Politicas de acesso e cadastro atualizadas com sucesso.",
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
        <CardTitle className="text-base">Acesso e Cadastros</CardTitle>
        <CardDescription className="text-xs">
          Define como contas sao criadas e como ocorre o vinculo Usuario {"<->"} Profissional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="registration_mode" className="text-sm">
            Modo de cadastro
          </Label>
          <Select
            value={registrationMode}
            onValueChange={(value: "ADMIN_ONLY" | "PUBLIC_SIGNUP" | "INVITE_ONLY") =>
              setRegistrationMode(value)
            }
            disabled={!canEdit || !isEditing || saving}
          >
            <SelectTrigger id="registration_mode">
              <SelectValue placeholder="Selecione o modo de cadastro" />
            </SelectTrigger>
            <SelectContent>
              {REGISTRATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{selectedRegistration?.description}</p>
        </div>

        {registrationMode === "PUBLIC_SIGNUP" && (
          <div className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Aviso: cadastros publicos podem gerar volume. Recomenda-se usar status padrao "Pendente".
          </div>
        )}

        {registrationMode === "PUBLIC_SIGNUP" && (
          <div className="space-y-1">
            <Label htmlFor="public_signup_default_status" className="text-sm">
              Status padrao do cadastro publico
            </Label>
            <Select
              value={publicSignupDefaultStatus}
              onValueChange={(value: "pendente" | "ativo") => setPublicSignupDefaultStatus(value)}
              disabled={!canEdit || !isEditing || saving}
            >
              <SelectTrigger id="public_signup_default_status">
                <SelectValue placeholder="Selecione o status padrao" />
              </SelectTrigger>
              <SelectContent>
                {PUBLIC_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selectedPublicStatus?.description}</p>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="link_policy" className="text-sm">
            Politica de vinculo Usuario {"<->"} Profissional
          </Label>
          <Select
            value={linkPolicy}
            onValueChange={(value: "MANUAL_LINK_ADMIN" | "AUTO_LINK_BY_EMAIL" | "SELF_CLAIM_WITH_APPROVAL") =>
              setLinkPolicy(value)
            }
            disabled={!canEdit || !isEditing || saving}
          >
            <SelectTrigger id="link_policy">
              <SelectValue placeholder="Selecione a politica de vinculo" />
            </SelectTrigger>
            <SelectContent>
              {LINK_POLICY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{selectedLinkPolicy?.description}</p>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-1 pr-3">
            <Label htmlFor="allow_create_user_from_professional" className="text-sm">
              Permitir criar acesso em Profissionais
            </Label>
            <p className="text-xs text-muted-foreground">
              Exibe o fluxo para criar usuario junto do cadastro profissional.
            </p>
          </div>
          <Switch
            id="allow_create_user_from_professional"
            checked={allowCreateUserFromProfessional}
            onCheckedChange={setAllowCreateUserFromProfessional}
            disabled={!canEdit || !isEditing || saving}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-1 pr-3">
            <Label htmlFor="block_duplicate_email" className="text-sm">
              Bloquear e-mail duplicado
            </Label>
            <p className="text-xs text-muted-foreground">
              Impede cadastro/edicao de usuarios e profissionais com e-mail repetido.
            </p>
          </div>
          <Switch
            id="block_duplicate_email"
            checked={blockDuplicateEmail}
            onCheckedChange={setBlockDuplicateEmail}
            disabled={!canEdit || !isEditing || saving}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-1 pr-3">
            <Label htmlFor="allow_professional_view_others" className="text-sm">
              Permitir profissional ver agenda de outros
            </Label>
            <p className="text-xs text-muted-foreground">
              Funciona apenas quando o usuario tambem possui a permissao agenda:view_all_professionals.
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
                  resetDraft();
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
