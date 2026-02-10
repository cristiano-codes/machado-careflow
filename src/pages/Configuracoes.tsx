// src/pages/Configuracoes.tsx
import { useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import InstitutionSettingsSection from "@/components/settings/InstitutionSettingsSection";
import OperationalSettingsSection from "@/components/settings/OperationalSettingsSection";
import SystemSettingsSection from "@/components/settings/SystemSettingsSection";
import { ProtectedRoute, useModulePermissions } from "@/components/common/ProtectedRoute";
import { Building2, Cog, Shield, Wrench } from "lucide-react";

export default function Configuracoes() {
  const { canEdit } = useModulePermissions("configuracoes");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <ProtectedRoute module="configuracoes" permission="view" fallback={
      <div className="relative z-0 mx-auto max-w-7xl space-y-2 pb-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Configuracoes do Sistema</h1>
          <p className="text-muted-foreground text-xs">Configuracoes gerais da aplicacao</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Shield className="w-5 h-5" />
              <p>Voce nao possui permissao para acessar esta pagina.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <div className="relative z-0 mx-auto max-w-7xl space-y-2 pb-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Configuracoes do Sistema</h1>
          <p className="text-muted-foreground text-xs">Painel mestre com pilares de configuracao</p>
        </div>

        {!canEdit && (
          <Card>
            <CardContent className="pt-4 text-xs text-muted-foreground">
              Perfil com acesso de consulta: alteracoes estao bloqueadas.
            </CardContent>
          </Card>
        )}

        <Accordion type="single" collapsible className="space-y-2">
          <AccordionItem value="instituicao" className="rounded-lg border bg-card px-1.5">
            <AccordionTrigger className="py-1.5 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4" />
                Instituicao
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <InstitutionSettingsSection canEdit={canEdit} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="operacional" className="rounded-lg border bg-card px-1.5">
            <AccordionTrigger className="py-1.5 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Wrench className="h-4 w-4" />
                Operacional
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <OperationalSettingsSection canEdit={canEdit} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sistema" className="rounded-lg border bg-card px-1.5">
            <AccordionTrigger className="py-1.5 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Cog className="h-4 w-4" />
                Sistema
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <SystemSettingsSection />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ProtectedRoute>
  );
}

