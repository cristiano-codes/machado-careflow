import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LAB_NAV_ITEMS = [
  { path: "/agenda-teste", label: "Agenda Teste" },
  { path: "/salas-teste", label: "Salas Teste" },
  { path: "/atividades-teste", label: "Atividades Teste" },
  { path: "/turmas-teste", label: "Turmas Teste" },
  { path: "/grade-teste", label: "Grade Teste" },
  { path: "/matriculas-teste", label: "Matriculas Teste" },
];

type AgendaLabHeaderProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export function AgendaLabHeader({ title, subtitle, actions }: AgendaLabHeaderProps) {
  const navigate = useNavigate();

  return (
    <Card className="border-slate-300 bg-gradient-to-r from-slate-100 to-slate-50">
      <CardContent className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 rounded-full border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              <FlaskConical className="h-3 w-3" />
              Laboratorio de Agenda da Unidade
            </p>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/agenda")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para Agenda oficial
            </Button>
            {actions}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {LAB_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition",
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
      </CardContent>
    </Card>
  );
}
