import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";
import {
  UNIT_OPERATIONS_ACTIVITIES_REQUIRED_SCOPES,
  UNIT_OPERATIONS_AGENDA_REQUIRED_SCOPES,
  UNIT_OPERATIONS_CLASSES_REQUIRED_SCOPES,
  UNIT_OPERATIONS_ENROLLMENTS_REQUIRED_SCOPES,
  UNIT_OPERATIONS_GRADE_REQUIRED_SCOPES,
  UNIT_OPERATIONS_REQUIRED_SCOPES,
  UNIT_OPERATIONS_ROOMS_REQUIRED_SCOPES,
} from "@/permissions/permissionMap";
import { cn } from "@/lib/utils";

const LAB_NAV_ITEMS = [
  { path: "/agenda-teste", label: "Agenda Teste", requiredAnyScopes: [] as string[] },
  { path: "/salas-teste", label: "Salas Teste", requiredAnyScopes: [] as string[] },
  { path: "/atividades-teste", label: "Atividades Teste", requiredAnyScopes: [] as string[] },
  { path: "/turmas-teste", label: "Turmas Teste", requiredAnyScopes: [] as string[] },
  { path: "/grade-teste", label: "Grade Semanal Teste", requiredAnyScopes: [] as string[] },
  { path: "/matriculas-teste", label: "Matriculas Teste", requiredAnyScopes: [] as string[] },
];
const OFFICIAL_UNIT_NAV_ITEMS = [
  {
    path: "/operacao-unidade/grade",
    label: "Grade Semanal",
    requiredAnyScopes: UNIT_OPERATIONS_GRADE_REQUIRED_SCOPES,
  },
  {
    path: "/operacao-unidade/salas",
    label: "Salas",
    requiredAnyScopes: UNIT_OPERATIONS_ROOMS_REQUIRED_SCOPES,
  },
  {
    path: "/operacao-unidade/atividades",
    label: "Atividades",
    requiredAnyScopes: UNIT_OPERATIONS_ACTIVITIES_REQUIRED_SCOPES,
  },
  {
    path: "/operacao-unidade/turmas",
    label: "Turmas",
    requiredAnyScopes: UNIT_OPERATIONS_CLASSES_REQUIRED_SCOPES,
  },
  {
    path: "/operacao-unidade/matriculas",
    label: "Matriculas",
    requiredAnyScopes: UNIT_OPERATIONS_ENROLLMENTS_REQUIRED_SCOPES,
  },
];

type AgendaLabHeaderProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export function AgendaLabHeader({ title, subtitle, actions }: AgendaLabHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasAnyScope } = usePermissions();
  const isOfficialAgendaRoute = location.pathname === "/agenda" || location.pathname === "/agenda/";
  const isOfficialUnitRoute = location.pathname.startsWith("/operacao-unidade");
  const isOfficialContext = isOfficialAgendaRoute || isOfficialUnitRoute;
  const navItems = (
    isOfficialUnitRoute
      ? OFFICIAL_UNIT_NAV_ITEMS
      : isOfficialContext
        ? []
        : LAB_NAV_ITEMS
  ).filter((item) => item.requiredAnyScopes.length === 0 || hasAnyScope(item.requiredAnyScopes));
  const canOpenOfficialAgenda = hasAnyScope(UNIT_OPERATIONS_AGENDA_REQUIRED_SCOPES);
  const canOpenUnitManagement = hasAnyScope(UNIT_OPERATIONS_REQUIRED_SCOPES);
  const titleLabel = isOfficialContext ? title.replace(/\s*Teste\b/gi, "").trim() : title;
  const subtitleLabel = isOfficialContext
    ? subtitle
        .replace(/ambiente de homologacao/gi, "Gestao da Unidade")
        .replace(/laboratorio/gi, "operacao")
    : subtitle;
  const badgeLabel = isOfficialAgendaRoute
    ? "Agenda Oficial"
    : isOfficialUnitRoute
      ? "Gestao da Unidade"
      : "Laboratorio da Agenda da Unidade";
  const BackBadgeIcon = isOfficialContext ? Building2 : FlaskConical;
  const showReturnAction = isOfficialAgendaRoute
    ? canOpenUnitManagement
    : isOfficialUnitRoute
      ? canOpenOfficialAgenda
      : true;
  const returnActionLabel = isOfficialAgendaRoute
    ? "Abrir Gestao da Unidade"
    : isOfficialUnitRoute
      ? "Abrir Agenda"
      : "Voltar para Agenda oficial";
  const returnActionPath = isOfficialAgendaRoute ? "/operacao-unidade" : "/agenda";

  return (
    <Card className="border-slate-200 bg-gradient-to-r from-slate-50 to-white shadow-sm">
      <CardContent className="space-y-4 p-4 md:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="inline-flex h-6 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              <BackBadgeIcon className="h-3 w-3" />
              {badgeLabel}
            </p>
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 md:text-2xl">{titleLabel}</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{subtitleLabel}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            {showReturnAction ? (
              <Button variant="outline" size="sm" className="h-9" onClick={() => navigate(returnActionPath)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {returnActionLabel}
              </Button>
            ) : null}
            {actions ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end [&>button]:h-9">
                {actions}
              </div>
            ) : null}
          </div>
        </div>

        {navItems.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/80 p-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition",
                    isActive
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
