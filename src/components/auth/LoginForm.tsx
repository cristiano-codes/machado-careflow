import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/SettingsContext";
import { InstitutionLogo } from "@/components/branding/InstitutionLogo";

interface LoginFormProps {
  onLogin: (credentials: { email: string; password: string }) => Promise<void>;
  onRegister: () => void;
}

export function LoginForm({ onLogin, onRegister }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { settings } = useSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await onLogin({ email, password });
    } catch (error) {
      // Erro já é tratado no Index.tsx, não precisa duplicar aqui
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 px-4 py-6">
      <Card className="w-full max-w-md shadow-lg border-0" style={{ boxShadow: 'var(--shadow-medium)' }}>
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="flex justify-center">
            <InstitutionLogo size={64} className="justify-center" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
              {settings.instituicao_nome}
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Sistema de Gestão Institucional
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Usuário ou e-mail
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="text"
                  placeholder="Digite seu usuário ou e-mail (demo: demo@demo.com)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <Button
              type="submit"
              className="w-full mt-6 bg-gradient-to-r from-primary to-accent hover:from-primary-hover hover:to-accent-hover text-white font-medium py-2.5 transition-all duration-300"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Conta demo: <span className="font-medium">demo@demo.com</span> / senha <span className="font-medium">demo123</span>
            </p>
          </form>
          
          <div className="mt-6 text-center">
            <Button 
              variant="link" 
              onClick={onRegister}
              className="text-primary hover:text-primary-hover font-medium"
            >
              Primeiro Acesso? Crie sua conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
