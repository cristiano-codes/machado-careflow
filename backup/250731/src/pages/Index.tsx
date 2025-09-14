import { useState } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "./Dashboard";
import { useToast } from "@/hooks/use-toast";

// Mock user for demonstration
const mockUser = {
  name: "Dr. João Silva",
  email: "joao.silva@institutolauir.com.br",
  role: "Coordenador Geral",
  avatar: "/placeholder.svg"
};

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(mockUser);
  const { toast } = useToast();

  const handleLogin = async (credentials: { username: string; password: string }) => {
    // Simulate API call to your backend
    // Replace this with actual API call to your Node.js/Express backend
    try {
      console.log("Attempting login with:", credentials);
      
      // Simulate successful login for demo
      if (credentials.username && credentials.password) {
        setIsAuthenticated(true);
        setUser(mockUser);
        
        toast({
          title: "Login realizado com sucesso!",
          description: `Bem-vindo, ${mockUser.name}`,
          variant: "default",
        });
      }
    } catch (error) {
      throw new Error("Falha na autenticação");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(mockUser);
    
    toast({
      title: "Logout realizado",
      description: "Até logo!",
      variant: "default",
    });
  };

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Dashboard />
    </Layout>
  );
};

export default Index;
