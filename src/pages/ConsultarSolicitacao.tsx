import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { Search } from "lucide-react";

type SearchResult = {
  name: string;
  status: string;
  created_at: string;
};

type SearchResponse = {
  success?: boolean;
  found?: boolean;
  preAppointment?: SearchResult | null;
  message?: string;
};

function formatStatus(status: string) {
  if (!status) return "-";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

export default function ConsultarSolicitacao() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { toast } = useToast();

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hasPhoneFlow = phone.trim().length > 0 && dateOfBirth.trim().length > 0;
    const hasNameFlow = name.trim().length > 0 && dateOfBirth.trim().length > 0;

    if (!hasPhoneFlow && !hasNameFlow) {
      toast({
        title: "Consulta",
        description: "Informe Telefone + Data de nascimento ou Nome + Data de nascimento.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      setNotFound(false);

      const params = new URLSearchParams();
      if (hasPhoneFlow) {
        params.set("phone", phone.trim());
      } else {
        params.set("name", name.trim());
      }
      params.set("date_of_birth", dateOfBirth);

      const response = await fetch(
        `${API_BASE_URL}/pre-appointments/public-search?${params.toString()}`
      );
      const data = (await response.json().catch(() => ({}))) as SearchResponse;

      if (!response.ok || data.success !== true) {
        throw new Error(data?.message || "Não foi possível consultar a solicitação.");
      }

      if (data.found && data.preAppointment) {
        setResult(data.preAppointment);
        return;
      }

      setNotFound(true);
    } catch (error) {
      console.error("Erro ao consultar solicitação:", error);
      toast({
        title: "Consulta",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar a solicitação no momento.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout onLogout={handleLogout}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consultar Solicitação</h1>
          <p className="text-sm text-muted-foreground">
            Consulte sua posição no fluxo institucional com dados básicos.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Localizar solicitação
            </CardTitle>
            <CardDescription>
              Opção 1: Telefone + Data de nascimento ou Opção 2: Nome + Data de nascimento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="date_of_birth">Data de nascimento</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={loading}>
                  {loading ? "Consultando..." : "Consultar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {result ? (
          <Card>
            <CardHeader>
              <CardTitle>Resultado da Solicitação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <strong>Nome:</strong> {result.name}
              </p>
              <p>
                <strong>Status:</strong> {formatStatus(result.status)}
              </p>
              <p>
                <strong>Data da Solicitação:</strong> {formatDate(result.created_at)}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {notFound ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Não encontramos uma solicitação com os dados informados. Revise os campos ou entre em
              contato com a instituição para apoio.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Layout>
  );
}
