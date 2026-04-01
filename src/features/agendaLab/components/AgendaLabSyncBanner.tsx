import { AlertTriangle, Database, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAgendaLab } from "@/features/agendaLab/context/AgendaLabContext";

export function AgendaLabSyncBanner() {
  const {
    isLoading,
    syncError,
    dataSource,
    isWriteEnabled,
    devFallbackEnabled,
    refreshFromServer,
  } = useAgendaLab();

  const isDevFallback = dataSource === "dev_fallback";
  const showBanner = isLoading || Boolean(syncError) || isDevFallback;

  if (!showBanner) return null;

  const state = isLoading ? "loading" : isDevFallback ? "dev_fallback" : "error";

  return (
    <Alert
      data-testid="unit-ops-sync-banner"
      data-state={state}
      variant={syncError && !isDevFallback ? "destructive" : "default"}
      className={isDevFallback ? "border-amber-200 bg-amber-50 text-amber-900" : ""}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
      <AlertTitle>
        {isLoading ? "Sincronizando dados operacionais" : "Estado de sincronizacao da API"}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        {isLoading ? (
          <p>Carregando dados oficiais do dominio de operacao da unidade.</p>
        ) : (
          <p>{syncError || "Modo de contingencia ativado."}</p>
        )}

        {isDevFallback ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 font-medium">
              <Database className="h-3 w-3" />
              Fallback de desenvolvimento
            </span>
            <span>Escrita bloqueada: dados exibidos nao sao oficiais.</span>
          </div>
        ) : null}

        {!isWriteEnabled && !isDevFallback ? (
          <p className="text-xs">Operacoes de escrita estao temporariamente indisponiveis.</p>
        ) : null}

        {!isLoading ? (
          <div>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void refreshFromServer()}>
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              Tentar sincronizar novamente
            </Button>
            {devFallbackEnabled ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Flag de fallback dev: <code>VITE_UNIT_OPS_DEV_LOCAL_FALLBACK</code>
              </p>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
